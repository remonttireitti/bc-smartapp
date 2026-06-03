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
    return normalize_for_pdf(text.strip())


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
        elif line.startswith("| ") and "---" not in line:
            blocks.append(("table_row", line))
        elif line.startswith("- "):
            blocks.append(("li", strip_md(line[2:])))
        else:
            blocks.append(("p", strip_md(line)))
    return blocks


def render_table_rows(rows: list[str], pdf, font: str) -> None:
    if not rows:
        return
    headers = [normalize_for_pdf(c.strip()) for c in rows[0].strip("|").split("|")]
    pdf.set_font(font, "B", 10)
    col_w = max(20, (pdf.epw / len(headers)) - 2)
    for header in headers:
        pdf.cell(col_w, 7, header[:40], border=1)
    pdf.ln()
    pdf.set_font(font, "", 10)
    for row in rows[1:]:
        cells = [normalize_for_pdf(c.strip()) for c in row.strip("|").split("|")]
        for cell in cells:
            pdf.cell(col_w, 7, cell[:60], border=1)
        pdf.ln()
    pdf.ln(2)


def main() -> None:
    ensure_fpdf2()
    from fpdf import FPDF

    if not MD_PATH.exists():
        raise SystemExit(f"Puuttuu: {MD_PATH}")

    blocks = parse_markdown(MD_PATH)
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
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

        if kind == "h1":
            pdf.set_font(font, "B", 18)
            pdf.multi_cell(pdf.epw, 10, text)
            pdf.ln(2)
        elif kind == "h2":
            pdf.ln(4)
            pdf.set_font(font, "B", 14)
            pdf.multi_cell(pdf.epw, 8, text)
            pdf.ln(1)
        elif kind == "h3":
            pdf.set_font(font, "B", 12)
            pdf.multi_cell(pdf.epw, 7, text)
        elif kind == "li":
            pdf.set_font(font, "", 10)
            pdf.multi_cell(pdf.epw, 6, f"  - {text}")
        else:
            pdf.set_font(font, "", 10)
            pdf.multi_cell(pdf.epw, 6, text)

    flush_table()

    OUT_DOCS.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT_DOCS))
    OUT_PUBLIC.write_bytes(OUT_DOCS.read_bytes())
    print(f"Valmis: {OUT_PUBLIC}")


if __name__ == "__main__":
    main()
