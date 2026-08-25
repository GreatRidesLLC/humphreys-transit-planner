#!/usr/bin/env bash
# Rasterize public/icon.svg + public/icon-maskable.svg into PWA PNG icons.
# Requires: librsvg2-bin (rsvg-convert). Blocked on `sharp` under WSL2 kernel
# (bus error on library load) — see docs/wsl_image_tooling notes.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC_ANY="public/icons/icon.svg"
SRC_MASK="public/icons/icon-maskable.svg"

command -v rsvg-convert >/dev/null || {
  echo "rsvg-convert not found. Install: sudo apt install -y librsvg2-bin" >&2
  exit 1
}

render() { # $1=src $2=size $3=out
  rsvg-convert -w "$2" -h "$2" "$1" -o "$3"
  printf "  %s  (%s)\n" "$3" "$2px"
}

echo "Rendering PWA icons →"
render "$SRC_ANY"  192 public/icons/icon-192.png
render "$SRC_ANY"  512 public/icons/icon-512.png
render "$SRC_MASK" 512 public/icons/icon-maskable-512.png
render "$SRC_ANY"  180 public/icons/apple-touch-icon.png
echo "Done."
