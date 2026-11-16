# Change log

One line per change, newest first. Add a line after every deploy, and for anything left undeployed.

| Date (IST) | Asked for | Files changed | Version | Live? |
|---|---|---|---|---|
| 2026-11-16 | La Rocha room count corrected from 18 to 9: each category (Sea View, Upper Sea View, Deluxe) is now 2 double sharing rooms + 1 private, with room labels cut to match (D01, D02, P01). Doubles and privates were listed as 3 + 3 per category | server/inventory.js | commit "La Rocha: 9 rooms, 2 doubles + 1 private per category" | Yes |
| 2026-11-16 | La Rocha · Deluxe Double Sharing extra night (26 Nov) corrected from 6,000 to 3,000; the page's own 3,000 was being replaced by the server's figure | server/inventory.js | commit "La Rocha Deluxe double: extra night 3000" | Yes |
| 2026-11-16 | Bhakti Kutir Double Sharing raised from 16 rooms to 17 (32 to 34 beds), matching the room list and the budget sheet | server/inventory.js | commit "Bhakti doubles 16 -> 17" | Yes |
| 2026-11-15 | Rules file: sidebar group renamed to "moon-festival" | CLAUDE.md | commit "Rules: sidebar group is moon-festival" | Yes |
| 2026-11-15 | Rules file: this folder is the home for website chats; how to add new photos (stay-photos/); demo on the Mac before publishing | CLAUDE.md | commit "Rules: home folder, photos, local demo" | Yes |
| 2026-11-15 | Room for 4 card cover photo changed to the verandah photo (same as first carousel photo) | tickets.html | commit "Room for 4: verandah photo as card cover" | Yes |
| 2026-11-15 | New "Bhakti Kutir · Room for 4" card on the tickets page (4 beds, mixed, same price as the 4 Bed Dorm: 26,900 in Phase 4, extra day 800) with 9 optimised photos; Bhakti Kutir solo rooms reduced from 3 to 2 (third room converted into the Room for 4), so Solo shows sold out | tickets.html, book.html, server/inventory.js, stay-photos/ | commit "Add Bhakti Kutir Room for 4; solo rooms 3 -> 2" | Yes |
| 2026-11-15 | Remove button (with confirmation) for admin-added add-ons that are not yet collected; removal is logged | server/views/dashboard.html | commit "Dashboard: Remove button for admin-added add-ons" | Yes |
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
