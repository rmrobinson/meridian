#!/usr/bin/env bash
# Assembles a static deploy bundle from app/ for serving via nginx — no Vite
# or Node required at runtime. See README.md in this directory for the full
# deployment walkthrough.
#
# Usage: ./build.sh <output-dir>

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <output-dir>" >&2
  exit 1
fi

out="$1"
src="$(cd "$(dirname "$0")/../app" && pwd)"

rm -rf "$out"
mkdir -p "$out"

# Copy the app, excluding dev/test-only files that don't belong in production.
rsync -a \
  --exclude tests \
  --exclude .DS_Store \
  --exclude serve.json \
  "$src"/ "$out"/

# Vite mounts public/'s contents at the docroot root (e.g. public/icons/ ->
# /icons/) both in `npm run serve` and `vite build` output. Replicate that by
# merging public/ into the bundle root and removing the now-empty directory —
# otherwise the /icons/*.png fetches in app/js/icons.js 404.
rsync -a "$src"/public/ "$out"/
rm -rf "$out"/public

echo "Static bundle written to $out"
