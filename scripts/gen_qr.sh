#!/usr/bin/env bash
# Generate QR codes for print (posters, stickers, handouts) that link to
# humphreysbus.app. Uses the `qrcode` npm package via `npx --yes` so no
# devDep is added. Outputs land in public/qr/ (SVG for print scaling +
# high-density PNG for social / preview use).
#
# Error correction level H (~30% recovery) is chosen because printed QR
# codes get creased, splashed, and partially covered — poster corners
# take damage and a stop shelter sticker will not stay pristine.
#
# Usage:
#   scripts/gen_qr.sh                       # default: humphreysbus.app
#   scripts/gen_qr.sh <url> [slug]          # custom URL + output slug
set -euo pipefail

cd "$(dirname "$0")/.."

URL="${1:-https://humphreysbus.app}"
SLUG="${2:-humphreysbus-app}"
OUT_DIR="public/qr"
mkdir -p "$OUT_DIR"

echo "Rendering QR codes for $URL →"

# SVG — vector, ideal for print at any size. Quiet zone 4 modules per spec.
npx --yes qrcode -t svg -e H -q 4 -o "$OUT_DIR/$SLUG.svg" "$URL" >/dev/null
printf "  %s  (svg)\n" "$OUT_DIR/$SLUG.svg"

# PNG @ 1024px — social share previews and quick visual QA.
npx --yes qrcode -t png -e H -q 4 -w 1024 -o "$OUT_DIR/$SLUG-1024.png" "$URL" >/dev/null
printf "  %s  (1024px png)\n" "$OUT_DIR/$SLUG-1024.png"

echo "Done. Encoded: $URL"
