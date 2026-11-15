#!/bin/bash
# Nightly database backup. Run by cron on the server (20:30 UTC = 02:00 IST).
# Uses SQLite's own backup command, which gives a complete, consistent copy even
# while the site is taking bookings (a plain file copy can miss recent ones).
# Read-only on the live database.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$APP_DIR/data/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(TZ="Asia/Kolkata" date +"%Y-%m-%d-%Hh%MIST")
OUT="$BACKUP_DIR/moonfestival-$TIMESTAMP.db"

if ! sqlite3 "$APP_DIR/data/moonfestival.db" ".backup '$OUT'"; then
  echo "BACKUP FAILED ($TIMESTAMP): could not copy the database"; rm -f "$OUT"; exit 1
fi
if [ "$(sqlite3 "$OUT" 'pragma integrity_check;')" != "ok" ]; then
  echo "BACKUP FAILED ($TIMESTAMP): copy did not pass its integrity check"; rm -f "$OUT"; exit 1
fi

# Keep the last 30 nightly copies and the last 10 pre-deploy safety copies.
ls -t "$BACKUP_DIR"/moonfestival-20*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
ls -t "$BACKUP_DIR"/moonfestival-PRE-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f

echo "Backup done: moonfestival-$TIMESTAMP.db ($(sqlite3 "$OUT" 'select count(*) from bookings;') bookings)"
