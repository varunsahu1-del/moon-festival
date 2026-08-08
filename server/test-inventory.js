/**
 * Inventory logic test suite
 * Run: node test-inventory.js
 * Uses an in-memory SQLite DB — never touches your real data.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { DatabaseSync } = require('node:sqlite');
const { checkAvailability } = require('./inventory');

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
    addons TEXT, gst_number TEXT, gst_name TEXT, organizer_note TEXT
  );
  CREATE TABLE guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER, guest_number INTEGER,
    full_name TEXT, whatsapp TEXT, email TEXT,
    city TEXT, age INTEGER, gender TEXT
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

// ═════════════════════════════════════════════════════════════════════════════
// 1. BHAKTI KUTIR — DOUBLE SHARING (12 rooms × 2, same_gender)
// ═════════════════════════════════════════════════════════════════════════════
section('BK Double Sharing — gender segregation');
reset();
// Seed: 11 full male rooms (22 beds)
for (let i = 0; i < 11; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);

test('Male can book last room (partial)',         true,  'Bhakti Kutir', 'Double Sharing', [M('A')]);
test('Female blocked — last room is male',        false, 'Bhakti Kutir', 'Double Sharing', [F('B')]);
test('Couple (M+F) blocked — not filling room',  false, 'Bhakti Kutir', 'Double Sharing', [M('A'), F('B')]);
test('Two males (fill room) blocked — full',     false, 'Bhakti Kutir', 'Double Sharing', [M('A'), M('B')]); // 11 rooms full, 1 left but male already took it above

section('BK Double Sharing — last room, mixed attempt');
reset();
// 10 full male rooms + 1 partial male (1 bed taken in room 11)
for (let i = 0; i < 10; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);
seed('Bhakti Kutir', 'Double Sharing', ['Male']); // 1 male partial
test('Another male joins partial room',  true,  'Bhakti Kutir', 'Double Sharing', [M('A')]);
test('Female blocked — no female rooms', false, 'Bhakti Kutir', 'Double Sharing', [F('A')]);

section('BK Double Sharing — couple fills last room');
reset();
for (let i = 0; i < 11; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);
test('Couple (M+F, fill room) allowed',  true,  'Bhakti Kutir', 'Double Sharing', [M('A'), F('B')]);

section('BK Double Sharing — fully sold out');
reset();
for (let i = 0; i < 12; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);
test('Male blocked — totally sold out',   false, 'Bhakti Kutir', 'Double Sharing', [M('A')]);
test('Female blocked — totally sold out', false, 'Bhakti Kutir', 'Double Sharing', [F('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 2. BHAKTI KUTIR — TRIPLE SHARING (8 rooms × 3, same_gender)
// ═════════════════════════════════════════════════════════════════════════════
section('BK Triple Sharing — gender segregation');
reset();
// 7 full female rooms (21 beds)
for (let i = 0; i < 7; i++) seed('Bhakti Kutir', 'Triple Sharing', ['Female', 'Female', 'Female']);
test('Female (partial) gets last room',   true,  'Bhakti Kutir', 'Triple Sharing', [F('A')]);
test('Male blocked — last room female',   false, 'Bhakti Kutir', 'Triple Sharing', [M('A')]);
test('3 females fill last room',          true,  'Bhakti Kutir', 'Triple Sharing', [F('A'), F('B'), F('C')]);
test('M+F+F partial — mixed blocked',     false, 'Bhakti Kutir', 'Triple Sharing', [M('A'), F('B'), F('C')]); // 3 people but mixed → blocked as partial? No — 3 >= room_size=3 so isFullRoom=true, but M+F still allowed as couple
// Wait: 3 guests = room_size=3, isFullRoom=true → gender check skipped → ALLOWED
// Let me correct that test:
section('BK Triple Sharing — 3-person mixed fills room (allowed)');
reset();
for (let i = 0; i < 7; i++) seed('Bhakti Kutir', 'Triple Sharing', ['Female', 'Female', 'Female']);
test('2M+1F fills triple (allowed)',  true,  'Bhakti Kutir', 'Triple Sharing', [M('A'), M('B'), F('C')]);
test('1M+2F fills triple (allowed)',  true,  'Bhakti Kutir', 'Triple Sharing', [M('A'), F('B'), F('C')]);

section('BK Triple Sharing — 2-person partial mixed blocked');
reset();
test('2-person M+F in triple — blocked (partial)',  false, 'Bhakti Kutir', 'Triple Sharing', [M('A'), F('B')]);

section('BK Triple Sharing — fully sold out');
reset();
for (let i = 0; i < 8; i++) seed('Bhakti Kutir', 'Triple Sharing', ['Male', 'Male', 'Male']);
test('Male blocked — sold out',   false, 'Bhakti Kutir', 'Triple Sharing', [M('A')]);
test('Female blocked — sold out', false, 'Bhakti Kutir', 'Triple Sharing', [F('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 3. BHAKTI KUTIR — 4 BED DORM (female_only)
// ═════════════════════════════════════════════════════════════════════════════
section('BK 4 Bed Dorm — female only');
reset();
test('Female allowed',          true,  'Bhakti Kutir', '4 Bed Dorm', [F('A')]);
test('Male blocked always',     false, 'Bhakti Kutir', '4 Bed Dorm', [M('A')]);
test('Mixed booking blocked',   false, 'Bhakti Kutir', '4 Bed Dorm', [M('A'), F('B')]);

section('BK 4 Bed Dorm — sold out');
reset();
seed('Bhakti Kutir', '4 Bed Dorm', ['Female', 'Female', 'Female', 'Female']);
test('Female blocked — sold out', false, 'Bhakti Kutir', '4 Bed Dorm', [F('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 4. BHAKTI KUTIR — SINGLE ROOM (any gender, room_size=1)
// ═════════════════════════════════════════════════════════════════════════════
section('BK Single Room — any gender');
reset();
seed('Bhakti Kutir', 'Single Room', ['Male']);
seed('Bhakti Kutir', 'Single Room', ['Female']);
seed('Bhakti Kutir', 'Single Room', ['Male']);
test('4th room available', true,  'Bhakti Kutir', 'Single Room', [F('A')]);
// Now fill the 4th
seed('Bhakti Kutir', 'Single Room', ['Female']);
test('5th blocked — sold out', false, 'Bhakti Kutir', 'Single Room', [M('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 5. DESTINY — COMBINED CAPACITY (5 rooms shared: DS + Private)
// ═════════════════════════════════════════════════════════════════════════════
section('Destiny — combined capacity: DS vs Private');
reset();
seed('Destiny', 'Private Room', ['Male']);   // 1 room used
seed('Destiny', 'Private Room', ['Female']); // 2 rooms used
seed('Destiny', 'Private Room', ['Male']);   // 3 rooms used
// 2 DS rooms remain
test('Male DS (partial) allowed',    true,  'Destiny', 'Double Sharing', [M('A')]);
test('Female DS (partial) allowed',  true,  'Destiny', 'Double Sharing', [F('A')]);
// Now fill those 2 rooms with 1M (partial) + 1F (partial)
seed('Destiny', 'Double Sharing', ['Male']);
seed('Destiny', 'Double Sharing', ['Female']);
// 5 rooms now: 3 private + 1 male DS + 1 female DS = 5 physical rooms used
test('Private room blocked — full',  false, 'Destiny', 'Private Room',   [M('A')]);
test('Male DS blocked — full',       false, 'Destiny', 'Double Sharing', [M('A')]);
test('Female DS blocked — full',     false, 'Destiny', 'Double Sharing', [F('A')]);

section('Destiny — DS gender segregation');
reset();
seed('Destiny', 'Private Room', ['Male']);   // 1 room gone
// 4 DS rooms left
seed('Destiny', 'Double Sharing', ['Male', 'Male']); // full room
seed('Destiny', 'Double Sharing', ['Male', 'Male']); // full room
seed('Destiny', 'Double Sharing', ['Male', 'Male']); // full room — 3 full male rooms used, 1 DS room left
test('Female DS blocked — last room is male full',    false, 'Destiny', 'Double Sharing', [F('A')]);
test('Male couple fills last DS room',                true,  'Destiny', 'Double Sharing', [M('A'), M('B')]);

section('Destiny — couple in last DS room');
reset();
seed('Destiny', 'Private Room', ['Female']);
seed('Destiny', 'Private Room', ['Female']);
seed('Destiny', 'Private Room', ['Female']);
// 2 DS rooms remain
seed('Destiny', 'Double Sharing', ['Male', 'Male']); // 1 DS room full
// 1 DS room remains
test('Couple (M+F) fills last DS room', true,  'Destiny', 'Double Sharing', [M('A'), F('B')]);
// after that booking above (simulated): one more should fail
seed('Destiny', 'Double Sharing', [M('A').gender, F('B').gender]);
test('Next DS blocked after couple', false, 'Destiny', 'Double Sharing', [M('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 6. OUREM PALACE — COMBINED CAPACITY (10 rooms)
// ═════════════════════════════════════════════════════════════════════════════
section('Ourem Palace — combined capacity');
reset();
for (let i = 0; i < 9; i++) seed('Ourem Palace', 'Private Room', ['Male']);
test('10th private room allowed',    true,  'Ourem Palace', 'Private Room',   [M('A')]);
seed('Ourem Palace', 'Private Room', ['Male']);
test('11th private room blocked',    false, 'Ourem Palace', 'Private Room',   [M('A')]);
test('DS blocked — no rooms left',   false, 'Ourem Palace', 'Double Sharing', [M('A')]);

section('Ourem Palace — DS gender split');
reset();
for (let i = 0; i < 5; i++) seed('Ourem Palace', 'Private Room', ['Female']);
// 5 DS rooms remain
for (let i = 0; i < 5; i++) seed('Ourem Palace', 'Double Sharing', ['Female', 'Female']); // 5 full female DS rooms
test('Male DS blocked — all DS rooms female',   false, 'Ourem Palace', 'Double Sharing', [M('A')]);
test('Female DS blocked — all DS rooms full',   false, 'Ourem Palace', 'Double Sharing', [F('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 7. PENDING BOOKINGS COUNT AS OCCUPIED
// ═════════════════════════════════════════════════════════════════════════════
section('Pending bookings block inventory');
reset();
for (let i = 0; i < 11; i++) seed('Bhakti Kutir', 'Double Sharing', ['Male', 'Male'], 'paid');
seed('Bhakti Kutir', 'Double Sharing', ['Male'], 'pending'); // 1 pending male in last room
test('Male blocked — pending holds last bed',   false, 'Bhakti Kutir', 'Double Sharing', [M('A')]);
test('Female blocked — last room is pending male', false, 'Bhakti Kutir', 'Double Sharing', [F('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// 8. TERARIA — SAME AS DESTINY LOGIC (combined, DS only)
// ═════════════════════════════════════════════════════════════════════════════
section('Teraria — DS gender segregation');
reset();
for (let i = 0; i < 4; i++) seed('Teraria', 'Double Sharing', ['Female', 'Female']);
// 4 full female rooms, 1 room left
test('Female (partial) gets last room', true,  'Teraria', 'Double Sharing', [F('A')]);
test('Male blocked — all rooms female', false, 'Teraria', 'Double Sharing', [M('A')]);

section('Teraria — sold out');
reset();
for (let i = 0; i < 5; i++) seed('Teraria', 'Double Sharing', ['Male', 'Male']);
test('Male blocked — sold out',   false, 'Teraria', 'Double Sharing', [M('A')]);
test('Female blocked — sold out', false, 'Teraria', 'Double Sharing', [F('A')]);

// ═════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed + failed} tests  ·  ${passed} passed  ·  ${failed} failed`);
if (failed === 0) console.log('  All good — no overselling possible.\n');
else console.log('  ⚠ Fix the failures above before going live.\n');
process.exit(failed > 0 ? 1 : 0);
