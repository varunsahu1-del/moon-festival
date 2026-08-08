# Moon Festival 2026 — Full Code Audit

**Date:** 2026-08-05  
**Scope:** Static code audit — no server started. Files read: `server/routes/admin.js`, `server/routes/bookings.js`, `server/email.js`, `server/inventory.js`, `server/index.js`, `server/db.js`, `server/views/dashboard.html`

---

## Bugs Found (with file + line + fix)

### BUG-1 — CRITICAL · Wrong `sendConfirmation` call signature in admin booking
**File:** `server/routes/admin.js` **Line 219**

The `POST /api/bookings` route (admin-created bookings with `send_email=true`) calls:
```js
sendConfirmation(booking, guestRows).catch(...)
```
But `sendConfirmation` is declared as:
```js
async function sendConfirmation({ booking, guests }) { ... }
```
When called with two positional arguments, the first argument (the booking row) is destructured — `booking` and `guests` are both `undefined` inside the function. Execution crashes at `guests[0]` with a TypeError, which is silently swallowed by `.catch`. **The admin confirmation email is never sent.**

**Fix:**
```js
sendConfirmation({ booking, guests: guestRows }).catch(err => console.error('[admin-booking email]', err));
```

---

### BUG-2 — HIGH · Admin paylink INSERT missing `arrival_date`, `addons`, `payment_method`
**File:** `server/routes/admin.js` **Lines 126–129**

The `POST /api/bookings/paylink` INSERT statement is:
```sql
INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number)
VALUES (?, ?, ?, ?, ?, 'pending', ?)
```
`arrival_date`, `addons`, and `payment_method` are never set. The `payment_method` column defaults to `'razorpay'` (from the migration default), but there is no mechanism to pass `addons` or `arrival_date` through the paylink flow, so the rooming report and confirmation email will always show `27 Nov` and no add-ons for paylink bookings.

**Fix:** Accept `addons` and `arrival_date` in the request body and include them in the INSERT:
```sql
INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number, addons, arrival_date, payment_method)
VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'razorpay')
```

---

### BUG-3 — HIGH · Admin direct booking INSERT missing `arrival_date` and `addons`
**File:** `server/routes/admin.js` **Lines 193–196**

The `POST /api/bookings` INSERT is:
```sql
INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number, paid_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```
`arrival_date` and `addons` are never saved. Admin-created bookings will never appear in the pre-arrival report (which filters on `arrival_date = '26 Nov'`) and add-ons will not appear on the confirmation email.

**Fix:** Accept and insert `addons` and `arrival_date` (derived from addons, same logic as `bookings.js /create`):
```sql
INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number, paid_at, addons, arrival_date)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

---

### BUG-4 — MEDIUM · `transfer-paylink` hard-fails with 503 if Razorpay is not configured — no fallback for cash/UPI modifications
**File:** `server/routes/admin.js` **Lines 485–487**

```js
if (!Razorpay || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  return res.status(503).json({ error: 'Razorpay not configured' });
}
```
If the venue difference requires a top-up but Razorpay is not configured (or keys are missing), the admin cannot trigger either a payment link OR the modification email — there is no fallback path. The modification email is only reachable through "Send Payment Link" + "Email Guests about Change" buttons, not independently.

**Fix:** When `diff_amount > 0` but Razorpay is not configured, fall through and call `sendModificationEmail` with `paymentLink: null` and instructions for the guest to pay manually (UPI/cash). Return a success response with `payment_link: null`.

---

### BUG-5 — LOW · Dead local variable `oldVenue` in transfer function
**File:** `server/views/dashboard.html` **Line 2079**

```js
const oldVenue = document.querySelector('#drawerContent [data-old-venue]')?.dataset?.oldVenue || currentPrice;
```
This reads a `data-old-venue` attribute that doesn't exist in the DOM (the actual old venue is stored in `window._modOldVenue`). The fallback is `currentPrice` (a number string, not a venue name). This variable is declared but never used — the actual POST bodies correctly use `window._modOldVenue`. Not a runtime bug, but the code is misleading.

**Fix:** Remove the line. If it was intended as a DOM-based fallback, add a `data-old-venue` attribute to the drawer header element when the drawer opens.

---

## Grouped Audit Results

---

### 1. Booking Flows

| Flow | Finding |
|------|---------|
| `POST /api/bookings` (admin, status=paid, send_email) | ❌ **BUG-1**: `sendConfirmation` called with wrong signature — email silently drops. ❌ **BUG-3**: `arrival_date` and `addons` not saved. |
| `POST /api/bookings/paylink` (admin Razorpay link) | ❌ **BUG-2**: `arrival_date`, `addons`, `payment_method` not in INSERT. |
| `POST /api/bookings/create` (public checkout) | ✅ Saves `arrival_date` (derived from addons), `addons`, `payment_method` defaults correctly. Availability check runs before insert. `autoAssignRoom` called after commit. |
| `insertBooking` column audit | ❌ Admin routes missing `arrival_date` and `addons` (see BUG-2, BUG-3). Public route correct. |
| `insertGuest` column audit | ✅ All guest fields saved correctly in all three paths. |
| `guest_count` vs actual guests | ✅ Always set to `guests.length`, matches the loop that inserts guest rows. |

---

### 2. Payment Gateway Flows

| Flow | Finding |
|------|---------|
| Razorpay Checkout (`/create` → `/verify`) | ✅ HMAC signature verified. Booking marked paid. `sendConfirmation` called with correct shape. `email_sent` flag set. |
| Razorpay Payment Link (`/paylink` → webhook) | ✅ `POST /api/bookings/paylink-webhook` exists in `bookings.js`. Handles both `payment_link.paid` and `payment.failed`. Booking found by `notes.booking_ref` or link id. `sendConfirmation` called correctly. |
| Razorpay `payment.failed` webhook | ✅ Handled — sets status to `'failed'`, calls `sendFailedPaymentAlert`. |
| UPI/Bank Transfer path | ✅ `POST /api/bookings/upi-pending` saves `payment_method` and status `upi_pending`. `POST /api/bookings/upi-screenshot` saves `upi_screenshot`. Both `sendUpiAlert` (admin) and `sendUpiPendingGuest` (guest) fire. |
| Cash booking path | ✅ Same `/upi-pending` endpoint with `payment_method='cash'`. Both emails fire. |
| One-click confirm (`GET /admin/confirm/:ref/:token`) | ✅ HMAC token checked **before** any DB write (line 579 → 590). Uses same secret as token generator. `sendConfirmation` called with correct `{ booking, guests }` shape. |
| Webhook secret not in `.env.example` | ⚠️ `RAZORPAY_WEBHOOK_SECRET` is used in `bookings.js:175` but is not documented in `.env.example`. If unset, webhook signature is **not verified** (silent passthrough). |

---

### 3. Email Triggers

| Email | Trigger | Finding |
|-------|---------|---------|
| `sendConfirmation` (guest) | `/verify`, `/confirm-free`, `/paylink-webhook`, `/confirm/:ref/:token`, `/api/bookings/:ref/confirm-upi` | ✅ All correct `{ booking, guests }` shape — **except** admin `/api/bookings` with `send_email=true` (❌ BUG-1). |
| Admin notification (email 02, inside `sendConfirmation`) | Always fires after guest email | ✅ Fires unconditionally in `sendConfirmation`. Includes screenshot if `booking.upi_screenshot` is set. |
| `sendFailedPaymentAlert` | `paylink-webhook` on `payment.failed` | ✅ Triggered. ⚠️ Not triggered for Razorpay Checkout failures (no `/verify` failure path calls it). |
| `sendModificationEmail` | `transfer-paylink` (auto) and `modification-email` (manual) | ✅ Both paths call it. ⚠️ Auto-send in `transfer-paylink` wrapped in try/catch that logs but doesn't fail the response — email error is silent. |
| `sendUpiAlert` (admin alert) | `upi-pending` | ✅ Fires with screenshot attachment if uploaded. Includes one-click confirm link. |
| `sendUpiPendingGuest` | `upi-pending` | ✅ Fires. Shows booking ref, accommodation, arrival date, add-ons, amount. |

---

### 4. Dashboard Functionality

| Check | Finding |
|-------|---------|
| `editBooking()` parameters | ✅ Called with all 5 params: `(ref, price, status, roomNumber, addons)` — line 1711. |
| `saveBooking()` sends addons | ✅ Reads `#eb-addons` and includes `addons` in PUT body — lines 1818, 1822. |
| Confirm-UPI button | ✅ Exists for `upi_pending` rows. Calls `confirmUpi()` → `POST /api/bookings/:ref/confirm-upi`. |
| Modify/transfer sends old fields | ✅ `window._modOldVenue`, `_modOldRoomType`, `_modOldPrice` set when drawer opens (lines 2001–2003) and sent in both `transfer-paylink` and `modification-email` POSTs. |
| Dead local var `oldVenue` | ⚠️ BUG-5 (cosmetic/misleading, not a runtime bug). |

---

### 5. Modification Flow

| Step | Finding |
|------|---------|
| `POST /api/bookings/:ref/transfer` | ✅ Updates venue, room_type, total_price, room_number, status. Status logic: goes to `pending` only when upgrade > old price; stays/restores `paid` on downgrade/same price. |
| `POST /api/bookings/:ref/transfer-paylink` | ✅ Creates Razorpay diff link, auto-sends `sendModificationEmail`. ❌ **BUG-4**: Returns 503 if Razorpay not configured — no fallback for cash/UPI modifications. |
| `POST /api/bookings/:ref/modification-email` | ✅ Standalone endpoint; admin can send without creating a payment link. Accepts `old_venue`, `old_room_type`, `old_price`, `extra_amount`, `payment_link`. |
| Email always sent? | ⚠️ Only if admin explicitly clicks "Send Payment Link" (which auto-sends email) OR separately clicks "Email Guests about Change". Not automatic on save. |

---

### 6. Data Integrity

| Field | Public (`/create`) | Admin direct (`/api/bookings`) | Admin paylink (`/api/bookings/paylink`) |
|-------|--------------------|-------------------------------|----------------------------------------|
| `arrival_date` | ✅ Derived from addons | ❌ Never saved (BUG-3) | ❌ Never saved (BUG-2) |
| `addons` | ✅ Saved | ❌ Never saved (BUG-3) | ❌ Never saved (BUG-2) |
| `payment_method` | ✅ Defaults to `'razorpay'`; set to `'upi'`/`'cash'` on `/upi-pending` | ⚠️ Not in INSERT; gets DB default `'razorpay'` (incorrect for cash bookings) | ⚠️ Not in INSERT; gets DB default `'razorpay'` |
| `guest_count` | ✅ `guests.length` | ✅ `guests.length` | ✅ `guests.length` |
| `room_number` | ✅ Auto-assigned after insert | ✅ Auto-assigned if not specified | ✅ Passed from request or null |

---

### 7. Reports

| Endpoint | Present | Notes |
|----------|---------|-------|
| `GET /admin/reports` (page route) | ✅ | Serves `reports.html` |
| `GET /admin/api/reports/rooming` | ✅ | Joins guests + bookings, excludes Festival Access, includes roommates lookup, `arrival_date`, `addons`. |
| `GET /admin/api/reports/tribal-lunch` | ✅ | Parses day from addons string `Tribal Lunch (DD Nov)`. Falls back to all days for legacy format. |
| `GET /admin/api/reports/massage` | ✅ | Filters on `addons LIKE '%Ayurvedic Massage%'`. |
| `GET /admin/api/reports/pre-arrival` | ✅ | Filters on `arrival_date = '26 Nov'`. ⚠️ Will miss any admin-created bookings with 26 Nov arrival because BUG-3 means `arrival_date` is never saved for those bookings. |

---

### 8. Security

| Check | Finding |
|-------|---------|
| `requireAdmin` on all `/api/*` in admin.js | ✅ Every API route has `requireAdmin` except two intentionally public routes (`/api/public/pricing`, `/api/public/tribal-lunch`) and the token-protected confirm endpoint. |
| One-click confirm token checked before DB write | ✅ HMAC verified at line 579; first DB write is at line 590. |
| `SESSION_SECRET` set in `.env` | ✅ Set to a non-default value: `mf2026-kd92ks-pqr77x-8snel2-secret`. |
| `RAZORPAY_WEBHOOK_SECRET` documented | ⚠️ Used in code but missing from `.env.example`. If not set, webhook payloads are accepted **without signature verification**. Anyone who knows the webhook URL can mark any booking as paid. |
| UPI screenshot directory | ✅ Behind `/data/screenshots` which uses `requireAdmin` middleware (index.js line 32). |
| Multer file filter | ✅ Only accepts `image/*` MIME types for screenshot uploads. |
| Session cookie | ✅ `httpOnly: true`, `secure` set to `true` in production, 8-hour maxAge. |
| Admin password | ✅ Stored as a hash (generated by `npm run setup`); never stored in plain text. |

---

## Priority Fix List

| Priority | Bug | File | Line | Impact |
|----------|-----|------|------|--------|
| 🔴 CRITICAL | BUG-1: `sendConfirmation` wrong call signature | `server/routes/admin.js` | 219 | Admin `send_email=true` bookings never send confirmation email |
| 🔴 HIGH | BUG-2: Paylink INSERT missing `arrival_date`, `addons` | `server/routes/admin.js` | 127 | Rooming report wrong; confirmation email shows no add-ons |
| 🔴 HIGH | BUG-3: Admin booking INSERT missing `arrival_date`, `addons` | `server/routes/admin.js` | 194 | Pre-arrival report misses admin bookings; email shows no add-ons |
| 🟠 MEDIUM | BUG-4: `transfer-paylink` no cash/UPI fallback | `server/routes/admin.js` | 485 | Modification flow breaks if Razorpay is unconfigured |
| 🟡 MEDIUM | `RAZORPAY_WEBHOOK_SECRET` not in `.env.example` | `.env.example` | — | Webhook signature not verified if key not set; any caller can confirm payments |
| 🟡 LOW | BUG-5: Dead `oldVenue` local var with wrong fallback | `server/views/dashboard.html` | 2079 | Misleading code; no runtime impact |
