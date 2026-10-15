# -*- coding: utf-8 -*-
"""Splice tools/portal_snippet.cpp into src/main.cpp after portalFiName, before handlePortalSave."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "src" / "main.cpp"
SNIP = ROOT / "tools" / "portal_snippet.cpp"

text = MAIN.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

head_end = None
for i, ln in enumerate(lines):
    if ln.strip() == "return key;":
        j = i + 1
        if j < len(lines) and lines[j].strip() == "}":
            head_end = j + 1
            break

if head_end is None:
    raise SystemExit("could not find portalFiName end")

tail_start = None
for i, ln in enumerate(lines):
    if ln.startswith("void handlePortalSave()"):
        tail_start = i
        break

if tail_start is None:
    raise SystemExit("could not find handlePortalSave")

snippet = SNIP.read_text(encoding="utf-8")
if not snippet.endswith("\n"):
    snippet += "\n"

out = "".join(lines[:head_end]) + snippet + "".join(lines[tail_start:])
MAIN.write_text(out, encoding="utf-8")
print(f"spliced: head lines 1..{head_end}, tail from line {tail_start+1}")
