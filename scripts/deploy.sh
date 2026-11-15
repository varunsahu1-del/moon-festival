#!/bin/bash
# The only way changes reach the live site.
# Requires: change committed and pushed to GitHub (main). Then it:
#   1. backs up the live database
#   2. refuses if the server has file changes outside git (except settings.json)
#   3. pulls with --ff-only (never overwrites anything)
#   4. restarts the app and health-checks it
# It never edits bookings and never uses reset --hard.

set -u
SERVER="${MOON_SERVER:-root@64.227.165.136}"
APP_DIR="/root/moon-festival"
cd "$(dirname "$0")/.." || exit 1

git fetch -q origin || { echo "STOP: cannot reach GitHub"; exit 1; }
[ -n "$(git status --porcelain --untracked-files=no)" ] && { echo "STOP: unsaved edits on the Mac. Commit or discard them first."; git status -s --untracked-files=no; exit 1; }
[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && { echo "STOP: Mac and GitHub differ. Push (or pull) first."; exit 1; }
target=$(git rev-parse --short HEAD)
echo "Deploying version $target: $(git log -1 --pretty=%s)"

ssh -o BatchMode=yes -o ConnectTimeout=25 "$SERVER" "TARGET=$target APP_DIR=$APP_DIR bash -s" <<'REMOTE'
set -e
cd "$APP_DIR"
changed=$(git status --porcelain --untracked-files=no | grep -v 'server/settings.json' || true)
if [ -n "$changed" ]; then echo "STOP: files changed on the server outside git:"; echo "$changed"; exit 1; fi
before=$(git rev-parse --short HEAD)
ts=$(date -u +%Y%m%d-%H%M%S)
sqlite3 data/moonfestival.db ".backup data/backups/moonfestival-PRE-DEPLOY-$ts.db"
[ "$(sqlite3 data/backups/moonfestival-PRE-DEPLOY-$ts.db 'pragma integrity_check;')" = "ok" ] || { echo "STOP: database backup failed its check"; exit 1; }
n_before=$(sqlite3 data/moonfestival.db 'select count(*) from bookings;')
echo "Backup taken: moonfestival-PRE-DEPLOY-$ts.db ($n_before bookings)"
git fetch -q origin
if [ "$before" = "$(git rev-parse --short origin/main)" ]; then echo "Server already on $before. Nothing to deploy."; exit 0; fi
echo "Files in this deploy:"; git diff --stat HEAD origin/main | sed 's/^/  /'
git merge -q --ff-only origin/main
pm2 restart moonfestival >/dev/null
sleep 5
after=$(git rev-parse --short HEAD)
n_after=$(sqlite3 data/moonfestival.db 'select count(*) from bookings;')
fail=0
for p in / /tickets.html /book.html /api/public/pricing; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000$p")
  echo "  $p -> $code"; [ "$code" = 200 ] || fail=1
done
code=$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/data/moonfestival.db)
echo "  database by URL -> $code (must be 404)"; [ "$code" = 404 ] || fail=1
echo "Server: $before -> $after   bookings: $n_before -> $n_after"
[ "$after" = "$TARGET" ] || { echo "PROBLEM: server is not on $TARGET"; fail=1; }
[ "$n_after" -ge "$n_before" ] || { echo "PROBLEM: booking count went down"; fail=1; }
if [ "$fail" = 1 ]; then echo "DEPLOY NEEDS ATTENTION. Nothing is rolled back automatically. The previous version was $before; the database backup is moonfestival-PRE-DEPLOY-$ts.db."; exit 1; fi
echo "DEPLOY OK"
REMOTE
