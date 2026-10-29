#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx esbuild scripts/test-print-redesign.ts --bundle --platform=node --format=esm --log-level=error \
  --define:import.meta.env='{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"x","DEV":false,"PROD":true,"MODE":"test","BASE_URL":"/"}' \
  --outfile=/tmp/test-print-redesign.mjs
node /tmp/test-print-redesign.mjs
