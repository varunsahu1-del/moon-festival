#!/bin/bash
# Run this on the server: bash compress-images.sh
# Requires: apt install -y imagemagick

set -e
SITE_ROOT="/root/moon-festival"
QUALITY=82
MIN_SIZE_KB=100  # only compress files larger than this

echo "Starting image compression (quality=$QUALITY, skipping files under ${MIN_SIZE_KB}KB)..."
TOTAL=0; SAVED=0

compress_dir() {
  local DIR="$1"
  [ -d "$DIR" ] || return
  find "$DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) | while read -r FILE; do
    SIZE_KB=$(du -k "$FILE" | cut -f1)
    if [ "$SIZE_KB" -gt "$MIN_SIZE_KB" ]; then
      BEFORE=$(du -k "$FILE" | cut -f1)
      mogrify -quality $QUALITY -sampling-factor 4:2:0 -strip "$FILE"
      AFTER=$(du -k "$FILE" | cut -f1)
      DIFF=$((BEFORE - AFTER))
      echo "  $FILE: ${BEFORE}KB → ${AFTER}KB (saved ${DIFF}KB)"
    fi
  done
}

# Compress all image directories
for DIR in \
  "$SITE_ROOT/Home Page Images" \
  "$SITE_ROOT/Gallery Page Images" \
  "$SITE_ROOT/Stay Page Images" \
  "$SITE_ROOT/Meals Page Images" \
  "$SITE_ROOT/Schedule Page Images" \
  "$SITE_ROOT/Venue Page Images" \
  "$SITE_ROOT/About Page Images"; do
  echo "→ $DIR"
  compress_dir "$DIR"
done

# Also compress PNGs (losslessly)
find "$SITE_ROOT" -type f -iname "*.png" -size +${MIN_SIZE_KB}k \
  -not -path "*/node_modules/*" \
  -not -path "*/data/*" | while read -r FILE; do
  mogrify -strip "$FILE"
  echo "  PNG strip: $FILE"
done

echo "Compression complete."
