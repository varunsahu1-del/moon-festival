/**
 * Inventory logic test suite
 * Run: node test-inventory.js
 * Uses an in-memory SQLite DB — never touches your real data.
 *
 * Room counts come from INVENTORY (server/inventory.js), so the tests follow the
 * live configuration instead of hard-coded numbers.
 *
 * Rules these tests check (current):
 *  - Same-gender rooms: a partial booking (fewer guests than beds) may only join a room
 *    holding the same gender. A full-room booking (guests >= beds) takes a whole room.
 *  - Mixed-gender dorm rooms accept any gender.
 *  - Combined venues (Destiny, Teraria, Ourem Palace): private and double-sharing bookings
 *    draw from one pool of physical rooms. A private booking takes one free room.
 *  - Pending bookings hold beds just like paid ones.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { DatabaseSync } = require('node:sqlite');
const { checkAvailability, INVENTORY } = require('./inventory');

// ── In-memory DB setup ────────────────────────────────────────────────────────
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref TEXT, venue TEXT, room_type TEXT,
    total_price INTEGER, guest_count INTEGER,
    status TEXT DEFAULT 'paid', room_number TEXT,
    razorpay_order_id TEXT, paid_at TEXT,
    payment_method TEXT, arrival_date TEXT,
    addons TEXT, gst_number TEXT, gst_name TEXT, organizer_note TEXT,
    deleted_at TEXT
  );
  CREATE TABLE guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER, guest_number INTEGER,
    full_name TEXT, whatsapp TEXT, email TEXT,
    city TEXT, age INTEGER, gender TEXT,
    room_number TEXT, notes TEXT
  );
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
let bookingId = 0;
function seed(venue, room_type, guestGenders, status = 'paid') {
  bookingId++;
  db.prepare(`INSERT INTO bookings (id, booking_ref, venue, room_type, total_price, guest_count, status)
    VALUES (?, ?, ?, ?, 0, ?, ?)`).run(bookingId, 'MF-' + bookingId, venue, room_type, guestGenders.length, status);
  guestGenders.forEach((g, i) => {
    db.prepare(`INSERT INTO guests (booking_id, guest_number, full_name, gender) VALUES (?, ?, ?, ?)`).run(bookingId, i + 1, 'Guest', g);
  });
  return bookingId;
}

function reset() {
  db.exec('DELETE FROM bookings; DELETE FROM guests;');
  bookingId = 0;
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(label, expectAvailable, venue, room_type, guests) {
  const result = checkAvailability(db, venue, room_type, guests.length, guests);
  const ok = result.available === expectAvailable;
  if (ok) {
    passed++;
    console.log(`  ✓  ${label}`);
  } else {
    failed++;
    console.log(`  ✗  ${label}`);
    console.log(`     Expected available=${expectAvailable}, got available=${result.available}`);
    if (result.reason) console.log(`     Reason: ${result.reason}`);
  }
}
function section(title) { console.log(`\n── ${title}`); }

const M = g => ({ gender: 'Male',   full_name: g });
const F = g => ({ gender: 'Female', full_name: g });

// Room counts from the live inventory
function cfg(venue, room_type) {
  const c = INVENTORY.find(i => i.venue === venue && i.room_type === room_type);
  if (!c) throw new Error(`No inventory entry for ${venue} ${room_type}`);
  return c;
}
const BK_DS = cfg('Bhakti Kutir', 'Double Sharing').rooms;   // 2 beds each
const BK_TR = cfg('Bhakti Kutir', 'Triple Sharing').rooms;   // 3 beds each
const BK_DORM = 'Bhakti Kutir';
const DORM = '4 Bed Mixed Dorm';

// ══════════════════════════════════════════════════════════════════════════════
// 1. BHAKTI KUTIR — DOUBLE SHARING (same gender)
// ══════════════════════════════════════════════════════════════════════════════
section(`BK Double Sharing (${BK_DS} rooms × 2) — last room holds a male`);
reset();
for (let i = 0; i < BK_DS - 1; i++) seed('Bhakti Kutir', 'Double Sharing', ['Female', 'Female']);
seed('Bhakti Kutir', 'Double Sharing', ['Female']); // partial female in the last room
test('Female single joins the partial room',            true,  'Bhakti Kutir', 'Double Sharing', [F('A')]);
test('Male single blocked — Bhakti Double is women only', false, 'Bhakti Kutir', 'Double Sharing', [M('A')]);
test('Mixed couple blocked — no free room left',        false, 'Bhakti Kutir', 'Double Sharing', [M('A'), F('B')]);

section(`BK Double Sharing (${BK_DS} rooms × 2) — last room empty`);
reset();
for (let i = 0; i < BK_DS - 1; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);
test('Female single takes the empty last room',           true,  'Bhakti Kutir', 'Double Sharing', [F('A')]);
test('Mixed couple blocked — Bhakti Double is women only', false, 'Bhakti Kutir', 'Double Sharing', [M('A'), F('B')]);
test('Male single blocked — Bhakti Double is women only', false, 'Bhakti Kutir', 'Double Sharing', [M('A')]);

section(`BK Double Sharing (${BK_DS} rooms × 2) — sold out`);
reset();
for (let i = 0; i < BK_DS; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);
test('Male blocked — sold out',                         false, 'Bhakti Kutir', 'Double Sharing', [M('A')]);
test('Female blocked — sold out',                       false, 'Bhakti Kutir', 'Double Sharing', [F('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// 2. BHAKTI KUTIR — TRIPLE SHARING (same gender)
// ══════════════════════════════════════════════════════════════════════════════
section(`BK Triple Sharing (${BK_TR} rooms × 3) — last room holds a female`);
reset();
for (let i = 0; i < BK_TR - 1; i++) seed('Bhakti Kutir', 'Triple Sharing', ['Female', 'Female', 'Female']);
seed('Bhakti Kutir', 'Triple Sharing', ['Female']); // partial female in the last room
test('Male single blocked — last room holds a female',  false, 'Bhakti Kutir', 'Triple Sharing', [M('A')]);
test('Female single joins the partial room',            true,  'Bhakti Kutir', 'Triple Sharing', [F('A')]);
test('Two-person mixed partial blocked',                false, 'Bhakti Kutir', 'Triple Sharing', [M('A'), F('B')]);

section(`BK Triple Sharing (${BK_TR} rooms × 3) — 3-person mixed fills the empty last room`);
reset();
for (let i = 0; i < BK_TR - 1; i++) seed('Bhakti Kutir', 'Triple Sharing', ['Female', 'Female', 'Female']);
test('3-person mixed group fills the last room (allowed)', true, 'Bhakti Kutir', 'Triple Sharing', [M('A'), F('B'), F('C')]);

section(`BK Triple Sharing (${BK_TR} rooms × 3) — sold out`);
reset();
for (let i = 0; i < BK_TR; i++) seed('Bhakti Kutir', 'Triple Sharing', ['Male', 'Male', 'Male']);
test('Male blocked — sold out',                         false, 'Bhakti Kutir', 'Triple Sharing', [M('A')]);
test('Female blocked — sold out',                       false, 'Bhakti Kutir', 'Triple Sharing', [F('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// 3. BHAKTI KUTIR — 4 BED MIXED DORM (any gender)
// ══════════════════════════════════════════════════════════════════════════════
section('BK 4 Bed Mixed Dorm — any gender, 4 beds');
reset();
seed(BK_DORM, DORM, ['Male', 'Female']);
test('Male single allowed (2 beds left)',               true,  BK_DORM, DORM, [M('A')]);
test('Female single allowed (2 beds left)',             true,  BK_DORM, DORM, [F('A')]);
test('Mixed pair allowed (2 beds left)',                true,  BK_DORM, DORM, [M('A'), F('B')]);
seed(BK_DORM, DORM, ['Female', 'Male']);
test('Female single blocked — dorm full',               false, BK_DORM, DORM, [F('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// 4. DESTINY — private and double share one pool of 5 rooms
// ══════════════════════════════════════════════════════════════════════════════
section('Destiny — 3 privates booked, pool has 2 free rooms');
reset();
seed('Destiny', 'Private Room', ['Male']);
seed('Destiny', 'Private Room', ['Female']);
seed('Destiny', 'Private Room', ['Male']);
test('Male double (partial) allowed',                   true,  'Destiny', 'Double Sharing', [M('A')]);
test('Female double (partial) allowed',                 true,  'Destiny', 'Double Sharing', [F('A')]);
test('Private room allowed (4th of 5)',                 true,  'Destiny', 'Private Room',   [M('A')]);

section('Destiny — last room holds a male double');
reset();
for (let i = 0; i < 4; i++) seed('Destiny', 'Private Room', ['Male']);
seed('Destiny', 'Double Sharing', ['Male']); // partial male in the 5th room
test('Female double blocked — last room holds a male',  false, 'Destiny', 'Double Sharing', [F('A')]);
test('Male double joins the partial room',              true,  'Destiny', 'Double Sharing', [M('A')]);
test('Private blocked — no free room',                  false, 'Destiny', 'Private Room',   [M('A')]);

section('Destiny — no triple room offered');
reset();
test('Triple sharing at Destiny not offered',           false, 'Destiny', 'Triple Sharing', [M('A')]);
test('Triple sharing at Destiny not offered (female)',  false, 'Destiny', 'Triple Sharing', [F('A')]);

section('Destiny — 2 full male doubles and 3 privates');
reset();
seed('Destiny', 'Private Room', ['Male']);
seed('Destiny', 'Private Room', ['Female']);
seed('Destiny', 'Private Room', ['Male']);
seed('Destiny', 'Double Sharing', ['Male', 'Male']);
seed('Destiny', 'Double Sharing', ['Male', 'Male']);
test('Male double blocked — pool full',                 false, 'Destiny', 'Double Sharing', [M('A')]);
test('Mixed couple blocked — pool full',                false, 'Destiny', 'Double Sharing', [M('A'), F('B')]);
test('Private blocked — pool full',                     false, 'Destiny', 'Private Room',   [F('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// 5. OUREM PALACE — 9 rooms in one pool (5 private + 4 double)
// ══════════════════════════════════════════════════════════════════════════════
const OUREM_POOL = 9;
section(`Ourem Palace — ${OUREM_POOL} rooms, privates fill the pool`);
reset();
for (let i = 0; i < OUREM_POOL - 1; i++) seed('Ourem Palace', 'Private Room', ['Male']);
test('Last room as private allowed',                    true,  'Ourem Palace', 'Private Room',   [M('A')]);
seed('Ourem Palace', 'Private Room', ['Male']);
test('Private blocked — pool full',                     false, 'Ourem Palace', 'Private Room',   [M('A')]);
test('Double blocked — pool full',                      false, 'Ourem Palace', 'Double Sharing', [M('A')]);

section('Ourem Palace — 5 privates and 4 full female doubles');
reset();
for (let i = 0; i < 5; i++) seed('Ourem Palace', 'Private Room', ['Female']);
for (let i = 0; i < 4; i++) seed('Ourem Palace', 'Double Sharing', ['Female', 'Female']);
test('Male double blocked — all rooms taken',           false, 'Ourem Palace', 'Double Sharing', [M('A')]);
test('Female double blocked — all rooms taken',         false, 'Ourem Palace', 'Double Sharing', [F('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// 6. TERARIA — 5 rooms in one pool
// ══════════════════════════════════════════════════════════════════════════════
section('Teraria — last room open to either gender');
reset();
for (let i = 0; i < 4; i++) seed('Teraria', 'Double Sharing', ['Female', 'Female']);
test('Male single takes the empty last room',           true,  'Teraria', 'Double Sharing', [M('A')]);
seed('Teraria', 'Double Sharing', ['Female']); // partial female in the last room
test('Male single blocked — last room holds a female',  false, 'Teraria', 'Double Sharing', [M('A')]);
test('Female single joins the partial room',            true,  'Teraria', 'Double Sharing', [F('A')]);

section('Teraria — sold out');
reset();
for (let i = 0; i < 5; i++) seed('Teraria', 'Double Sharing', ['Male', 'Male']);
test('Male blocked — sold out',                         false, 'Teraria', 'Double Sharing', [M('A')]);
test('Female blocked — sold out',                       false, 'Teraria', 'Double Sharing', [F('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// 7. PENDING BOOKINGS COUNT AS OCCUPIED
// ══════════════════════════════════════════════════════════════════════════════
section('Pending bookings hold beds');
reset();
for (let i = 0; i < BK_DS - 1; i++) seed('Bhakti Kutir', 'Double Sharing', ['Female', 'Female'], 'paid');
seed('Bhakti Kutir', 'Double Sharing', ['Female'], 'pending'); // pending female in the last room
test('Female joins the pending female\'s room',          true,  'Bhakti Kutir', 'Double Sharing', [F('A')]);
test('Male blocked — Bhakti Double is women only',      false, 'Bhakti Kutir', 'Double Sharing', [M('A')]);

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed + failed} tests  ·  ${passed} passed  ·  ${failed} failed`);
if (failed === 0) console.log('  All good — no overselling possible.\n');
else console.log('  ⚠ Fix the failures above before going live.\n');
process.exit(failed > 0 ? 1 : 0);
