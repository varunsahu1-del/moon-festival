# Moon Festival website — rules for Claude

This is a LIVE production site (www.moonfestival.in) taking real bookings and payments.
The festival runs 26–30 Nov 2026. Until it ends, stability beats everything else.

The CLAUDE.md in the parent folder is about DaVinci video editing. Ignore it for website work.

## Hard rules (never break these)

1. **Never edit existing bookings.** No UPDATE/DELETE on bookings, guests or logs in the live
   database, no edits through the admin dashboard, no migrations or clean-ups over existing rows,
   no recalculating stored amounts or add-ons. Reading (SELECT, backups) is fine. Fixes apply to
   bookings made from now on only.
2. **Change only what was asked.** One change per request. No refactors, restyling, renames,
   "while I'm here" fixes or dependency updates. If you spot another problem, report it; don't fix it.
3. **Nothing reaches the server except through `scripts/deploy.sh`.** No scp/rsync of files, no
   editing files over SSH, no `git reset --hard`, no `git stash`/`checkout` on the server.
4. **Never deploy without the user's explicit yes** for that specific change.
5. **Never touch on the server:** `data/` (database, backups, screenshots), `.env`,
   `server/settings.json`.
6. **Prices and the price phase change only when the user gives the exact figures.** Pricing is
   locked to Phase 4 until the festival. Prices live in `server/inventory.js` (PRICING).
7. **No secrets in the repo, in CLAUDE.md, in the change log or in chat.** They live in `.env`.

## Every session, in this order

1. **Checkpoint.** Run `scripts/checkpoint.sh`. Mac, GitHub and server must be on the same version
   with no unsaved changes. If not, stop and report; settle that before any new work.
2. **Restate the request** in one line and list the files you will touch and what guests or the
   admin dashboard will see differently. Wait for a yes.
3. **Make the one change** on the Mac.
4. **Test on the Mac.** For anything touching prices, bookings, payments or emails, test the logic
   with node against the local database, never the live one. Say plainly what was and wasn't tested.
5. **Show the diff summary** and ask before deploying.
6. **Deploy** with `scripts/deploy.sh` (commits must already be pushed). It backs up the database,
   pulls with `--ff-only`, restarts, and health-checks.
7. **Verify live**: the changed page or endpoint, and that booking count is unchanged.
   Every deploy restarts the app, which signs the admin out of the dashboard (sessions are in memory).
   Tell the user to refresh the dashboard and log in again before using it.
8. **Log it**: add one line to `CHANGELOG.md`.
9. **End with a list** of every change made this session and what is / isn't live.

## Things that must be changed together

- **Payment modal** exists in both `book.html` and `tickets.html`. Change both or neither.
- **Room names** must match in three places: `INVENTORY` and `PRICING` in `server/inventory.js`,
  and `data-room-type` / `ROOM_MAP` in `tickets.html`. A room with no PRICING entry silently skips
  the server's price check and shows a stale hardcoded price.
- **Schedule**: any planning-grid change also updates `schedule.html`.
- **Referral dropdown** exists in `book.html` and `tickets.html`.

## Amounts (get this wrong and payments fail)

- `total_price` in the database is the pre-GST base (room + add-ons − discount).
- Shown to guest: `total_price × 1.05`. Charged via Razorpay: `round(total_price × 1.05 × 1.0236)`.
- `sendPaymentPendingEmail` takes the GST-inclusive, pre-Razorpay amount and adds the fee itself.
- `extra_addons` (admin-added) are never part of `total_price`. They carry 5% GST on top, except extras
  collected before 2026-11-15 (see `EXTRAS_GST_FROM` in `server/breakdown.js`). Marking them collected
  only sets the collected flag; it must not change `total_price`.

## Map

- Public pages: `*.html` in the root, `main.js`, `styles.css`, `partials/` (nav + footer injected by the server).
- Server: `server/index.js` (entry), `server/routes/bookings.js` (public booking + payment),
  `server/routes/admin.js` + `server/views/dashboard.html` (admin), `server/inventory.js`
  (rooms, prices, availability), `server/email.js`, `server/breakdown.js` (bill breakdown),
  `server/private-guard.js` (blocks database/code/docs from being served as files).
- The project root is served as static files. Anything new that is not public site content must
  be covered by `server/private-guard.js`.
- Stack: Node 24 + Express, `node:sqlite` (no `.transaction()`; use BEGIN/COMMIT), pm2 process `moonfestival`.
- Database: `data/moonfestival.db` on the server only (gitignored). Daily copy at 02:00 IST in `data/backups/`.

## Design is final

Palette, fonts, hero styles and spacing are approved and locked. Do not adjust them unless the
request is specifically about design.

## Settings and backups

- `server/settings.json` is NOT in git. It lives on each machine and holds the phase, the festival
  pass toggle and contact numbers. `server/settings.example.json` shows its shape. If it is missing
  or unreadable the code falls back to Phase 4.
- Nightly backup: `scripts/backup.sh` via cron at 02:00 IST (SQLite `.backup`, integrity-checked,
  keeps 30 nightly + 10 pre-deploy copies). A consistent copy is also emailed daily to the admin inbox.

## Known open items (do not fix unasked)

- The GitHub repository is public and its history contains early payment screenshots. Making it
  private needs a deploy key on the server first.
- Stored amounts and phase names are in mixed formats. Leave them (hard rule 1).
- Some admin-made bookings list add-ons once per guest, so the dashboard shows their room cost too
  low. Display only; stored totals are correct. Leave them (hard rule 1).
