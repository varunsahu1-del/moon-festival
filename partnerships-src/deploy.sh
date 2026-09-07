#!/bin/bash
# Build the partnerships deck and push it live to moonfestival.in/partnerships
#
#   ./partnerships-src/deploy.sh
#
# Rebuilds partnerships.html + assets/partnerships/*.webp, copies both to the
# server, and restarts the app. Deploys by rsync (not git), so nothing here
# enters the repo.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$(dirname "$HERE")"
SERVER="root@64.227.165.136"
REMOTE="/root/moon-festival"

echo "→ building…"
python3 "$HERE/build_sponsor.py"

echo "→ uploading…"
rsync -az "$SITE/partnerships.html" "$SERVER:$REMOTE/"
ssh "$SERVER" "mkdir -p $REMOTE/assets/partnerships"
rsync -az --delete "$SITE/assets/partnerships/" "$SERVER:$REMOTE/assets/partnerships/"

echo "→ restarting…"
ssh "$SERVER" "pm2 restart moonfestival --update-env >/dev/null 2>&1"
sleep 3

CODE=$(curl -sL -o /dev/null -w "%{http_code}" https://moonfestival.in/partnerships)
echo "→ https://moonfestival.in/partnerships  [$CODE]"
[ "$CODE" = "200" ] && echo "✓ live" || { echo "✗ check the server"; exit 1; }
