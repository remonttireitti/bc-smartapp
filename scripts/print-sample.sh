#!/usr/bin/env bash
# Esimerkkituloste: scripts/print-sample.sh [out.pdf] [rich]  → PDF + PNG-sivut (pdftoppm) + HTML
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/workspace/print_sample_new.pdf}"
npx esbuild scripts/print-sample.mjs --bundle --platform=node --format=esm --log-level=error \
  --define:import.meta.env='{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"x","DEV":false,"PROD":true,"MODE":"test","BASE_URL":"/"}' \
  --external:/workspace/pw/node_modules/playwright/index.mjs --outfile=/tmp/print-sample.bundle.mjs
node /tmp/print-sample.bundle.mjs "$OUT" "${2:-}"
rm -f "${OUT%.pdf}"-p-*.png
pdftoppm -r 90 -png "$OUT" "${OUT%.pdf}-p"
