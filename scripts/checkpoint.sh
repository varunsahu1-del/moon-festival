#!/bin/bash
# Read-only status check. Run before any work on the website.
# Shows whether the Mac, GitHub and the live server are on the same version.
# Changes nothing anywhere.

SERVER="${MOON_SERVER:-root@64.227.165.136}"
APP_DIR="/root/moon-festival"
cd "$(dirname "$0")/.." || exit 1
problems=0

echo "== Mac =="
git fetch -q origin || { echo "  ! could not reach GitHub"; problems=1; }
mac=$(git rev-parse --short HEAD)
hub=$(git rev-parse --short origin/main)
unsaved=$(git status --porcelain --untracked-files=no)
untracked=$(git status --porcelain | grep '^??')
echo "  version: $mac  ($(git log -1 --pretty='%ad %s' --date=short))"
if [ -n "$unsaved" ]; then echo "  ! unsaved edits:"; echo "$unsaved" | sed 's/^/      /'; problems=1; else echo "  no unsaved edits"; fi
[ -n "$untracked" ] && { echo "  note: new files not in git:"; echo "$untracked" | sed 's/^/      /'; }

echo "== GitHub =="
echo "  version: $hub"
ahead=$(git rev-list --count origin/main..HEAD)
behind=$(git rev-list --count HEAD..origin/main)
[ "$ahead" != 0 ] && { echo "  ! Mac has $ahead commit(s) not pushed"; problems=1; }
[ "$behind" != 0 ] && { echo "  ! GitHub has $behind commit(s) the Mac lacks"; problems=1; }

echo "== Live server =="
out=$(ssh -o BatchMode=yes -o ConnectTimeout=25 "$SERVER" "cd $APP_DIR && git rev-parse --short HEAD && git status --porcelain --untracked-files=no && echo ---- && pm2 jlist 2>/dev/null | grep -o '\"status\":\"[a-z]*\"' | head -1 && sqlite3 data/moonfestival.db 'select count(*) from bookings;'" 2>&1)
if [ $? -ne 0 ]; then
  echo "  ! could not reach the server: $(echo "$out" | tail -1)"; problems=1
else
  srv=$(echo "$out" | sed -n 1p)
  changed=$(echo "$out" | sed -n '2,/^----$/p' | grep -v '^----$' | grep -v 'server/settings.json')
  echo "  version: $srv"
  echo "  app: $(echo "$out" | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4)"
  echo "  bookings in database: $(echo "$out" | tail -1)"
  [ "$srv" != "$hub" ] && { echo "  ! server is not on the GitHub version"; problems=1; }
  [ -n "$changed" ] && { echo "  ! files changed on the server outside git:"; echo "$changed" | sed 's/^/      /'; problems=1; }
fi

echo
if [ "$problems" = 0 ]; then echo "CHECKPOINT OK: Mac, GitHub and server are in sync."; else echo "CHECKPOINT FAILED: settle the items marked ! before any new work."; exit 1; fi
