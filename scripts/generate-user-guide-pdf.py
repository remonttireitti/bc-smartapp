#!/usr/bin/env python3
"""Generoi BC Smartapp käyttöohje-PDF. Aja: npm run docs:pdf"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MD_PATH = ROOT / "docs" / "BC-Smartapp-kayttoohje.md"
OUT_DOCS = ROOT / "docs" / "BC-Smartapp-kayttoohje.pdf"
OUT_PUBLIC = ROOT / "public" / "BC-Smartapp-kayttoohje.pdf"

LINE_HEIGHT = 5
BODY_SIZE = 10
H1_SIZE = 18
H2_SIZE = 14
H3_SIZE = 12


def ensure_fpdf2():
    try:
        import fpdf  # noqa: F401
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2", "-q"])


def normalize_for_pdf(text: str) -> str:
    text = text.replace("\u2014", "-").replace("\u2013", "-").replace("\u2022", "-")
    text = text.replace(""", '"').replace(""", '"').replace("'", "'")
    return text


def setup_fonts(pdf) -> str:
    regular = Path(r"C:\Windows\Fonts\segoeui.ttf")
    bold = Path(r"C:\Windows\Fonts\segoeuib.ttf")
    if not regular.exists():
        regular = Path(r"C:\Windows\Fonts\arial.ttf")
        bold = Path(r"C:\Windows\Fonts\arialbd.ttf")
    if not regular.exists():
        regular = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        bold = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    if regular.exists():
        pdf.add_font("Body", "", str(regular))
        pdf.add_font("Body", "B", str(bold if bold.exists() else regular))
        return "Body"
    return "Helvetica"


def strip_md(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    return normalize_for_pdf(text.strip())


def is_table_separator(line: str) -> bool:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    return bool(re.match(r"^\|[\s\-:|]+\|$", stripped))


def parse_table_cells(line: str) -> list[str]:
    return [strip_md(cell.strip()) for cell in line.strip().strip("|").split("|")]


def parse_markdown(path: Path) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line or line == "---":
            continue
        if line.startswith("---") and line.endswith("---"):
            continue
        if line.startswith("# "):
            blocks.append(("h1", strip_md(line[2:])))
        elif line.startswith("## "):
            blocks.append(("h2", strip_md(line[3:])))
        elif line.startswith("### "):
            blocks.append(("h3", strip_md(line[4:])))
        elif line.startswith("|"):
            if is_table_separator(line):
                continue
            blocks.append(("table_row", line))
        elif line.startswith("- "):
            blocks.append(("li", strip_md(line[2:])))
        else:
            blocks.append(("p", strip_md(line)))
    return blocks


def column_widths(pdf, count: int) -> list[float]:
    if count <= 1:
        return [pdf.epw]
    if count == 2:
        return [pdf.epw * 0.32, pdf.epw * 0.68]
    return [pdf.epw / count] * count


def ensure_space(pdf, needed: float) -> None:
    if pdf.get_y() + needed > pdf.page_break_trigger:
        pdf.add_page()


def write_table_row(pdf, font: str, cells: list[str], widths: list[float], *, bold: bool = False) -> None:
    pdf.set_font(font, "B" if bold else "", BODY_SIZE)
    x_start = pdf.l_margin
    y_start = pdf.get_y()
    line_height = LINE_HEIGHT

    normalized = cells + [""] * max(0, len(widths) - len(cells))
    normalized = normalized[: len(widths)]

    wrapped: list[list[str]] = []
    row_height = line_height
    for cell, width in zip(normalized, widths):
        lines = pdf.multi_cell(width, line_height, cell or " ", border=0, split_only=True)
        wrapped.append(lines)
        row_height = max(row_height, len(lines) * line_height)

    ensure_space(pdf, row_height + 1)

    y_start = pdf.get_y()
    x = x_start
    for cell, width, lines in zip(normalized, widths, wrapped):
        pdf.set_xy(x, y_start)
        pdf.multi_cell(width, line_height, cell or " ", border=1)
        x += width
    pdf.set_y(y_start + row_height)


def render_table_rows(rows: list[str], pdf, font: str) -> None:
    if not rows:
        return

    parsed = [parse_table_cells(row) for row in rows]
    col_count = max(len(row) for row in parsed)
    widths = column_widths(pdf, col_count)

    write_table_row(pdf, font, parsed[0], widths, bold=True)
    for row in parsed[1:]:
        write_table_row(pdf, font, row, widths)
    pdf.ln(2)


def write_paragraph(pdf, font: str, text: str, *, size: int = BODY_SIZE, bold: bool = False, indent: float = 0) -> None:
    pdf.set_font(font, "B" if bold else "", size)
    x = pdf.l_margin + indent
    width = pdf.epw - indent
    pdf.set_x(x)
    pdf.multi_cell(width, LINE_HEIGHT, text)
    pdf.ln(1)


def write_heading(pdf, font: str, kind: str, text: str) -> None:
    if kind == "h1":
        ensure_space(pdf, 16)
        pdf.set_font(font, "B", H1_SIZE)
        pdf.multi_cell(pdf.epw, 9, text)
        pdf.ln(2)
    elif kind == "h2":
        ensure_space(pdf, 14)
        pdf.ln(3)
        pdf.set_font(font, "B", H2_SIZE)
        pdf.multi_cell(pdf.epw, 8, text)
        pdf.ln(2)
    elif kind == "h3":
        ensure_space(pdf, 12)
        pdf.ln(1)
        pdf.set_font(font, "B", H3_SIZE)
        pdf.multi_cell(pdf.epw, 7, text)
        pdf.ln(1)


def main() -> None:
    ensure_fpdf2()
    from fpdf import FPDF

    if not MD_PATH.exists():
        raise SystemExit(f"Puuttuu: {MD_PATH}")

    blocks = parse_markdown(MD_PATH)
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(18, 18, 18)
    font = setup_fonts(pdf)

    table_buffer: list[str] = []

    def flush_table() -> None:
        nonlocal table_buffer
        if table_buffer:
            render_table_rows(table_buffer, pdf, font)
            table_buffer = []

    for kind, text in blocks:
        if kind == "table_row":
            table_buffer.append(text)
            continue
        flush_table()

        if kind in {"h1", "h2", "h3"}:
            write_heading(pdf, font, kind, text)
        elif kind == "li":
            write_paragraph(pdf, font, f"- {text}", indent=2)
        else:
            write_paragraph(pdf, font, text)

    flush_table()

    OUT_DOCS.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT_DOCS))
    OUT_PUBLIC.write_bytes(OUT_DOCS.read_bytes())
    print(f"Valmis: {OUT_PUBLIC}")


if __name__ == "__main__":
    main()
