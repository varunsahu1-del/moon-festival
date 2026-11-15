# Change log

One line per change, newest first. Add a line after every deploy, and for anything left undeployed.

| Date (IST) | Asked for | Files changed | Version | Live? |
|---|---|---|---|---|
| 2026-11-15 | Failed add-on saves (signed out, error, offline) no longer show as saved; after a successful save the booking reloads so the amount to collect shows at once | server/views/dashboard.html | commit "Dashboard: never show a failed add-on save as saved" | Yes |
| 2026-11-15 | GST 5% on add-ons added by admin (from now on; extras collected before 15 Nov unchanged); "mark as collected" no longer alters the booking amount; list room-cost column no longer subtracts collected extras | server/breakdown.js, server/routes/admin.js, server/views/dashboard.html, server/email.js, server/invoice.js | commit "Charge GST on admin-added add-ons" | Yes |
| 2026-11-15 | Checkpoint script false alarm fixed | scripts/checkpoint.sh | 414f1b1 | Yes |
| 2026-11-15 | Nightly backup uses SQLite's backup command with an integrity check; daily backup email fixed and sends a consistent copy | scripts/backup.sh, server/email.js | commit "Untrack settings.json; safer backups" | Yes |
| 2026-11-15 | Settings file no longer tracked in git; missing settings fall back to Phase 4 instead of Early Bird | .gitignore, server/settings.js, server/settings.example.json | commit "Untrack settings.json; safer backups" | Yes |
| 2026-11-15 | Save Martin Dubois facilitator photo to GitHub (already on server) | Facilitator Photos/ | 07b2de0 | Yes |
| 2026-11-15 | Lock amount and guest add-ons on paid bookings; saves change only the fields sent; edit log records real changes | server/routes/admin.js, server/views/dashboard.html | commit "Lock amount and add-ons on paid bookings" | Yes |
| 2026-11-15 | Rules file, change log, checkpoint and deploy scripts | CLAUDE.md, CHANGELOG.md, scripts/ | f64c812 | Yes |
| 2026-11-15 | Block public download of the database, server code and project files | server/index.js, server/private-guard.js | ac21b4f | Yes |
| 2026-11-15 | Price check for Bhakti Kutir 4 Bed Mixed Dorm (was skipped; page showed 25,500 instead of 26,900) | server/inventory.js | d85b902 | Yes |
| 2026-11-15 | Bring server git back in line with GitHub after hand-copied files (no file changed) | none | 396264d | Yes |
| 2026-11-14 | Lock pricing to Phase 4, remove admin phase switch; meals add-on, promo prices, referral dropdown | book.html, tickets.html, server/routes/admin.js, server/views/dashboard.html | 396264d | Yes |
