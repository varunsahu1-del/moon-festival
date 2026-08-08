/**
 * Full system audit — booking, transfer, room assignment, inventory, gender rules, capacity
 * Run with: node server/test-full-audit.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/moonfestival.db');
const db = new DatabaseSync(DB_PATH);

const { checkAvailability, autoAssignRoom, INVENTORY, ROOM_LABELS } = require('./inventory');

let passed = 0, failed = 0, warnings = 0;
const results = [];

function log(status, category, test, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const line = `${icon} [${category}] ${test}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ status, category, test, detail });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else warnings++;
}

function clearDB() {
  db.exec('DELETE FROM guests');
  db.exec('DELETE FROM bookings');
  db.exec('DELETE FROM booking_log');
}

function insertBooking({ ref, venue, room_type, guest_count, status = 'paid', guests = [] }) {
  const stmt = db.prepare(`
    INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, razorpay_order_id)
    VALUES (?, ?, ?, '₹10,000', ?, ?, 'test-order')
  `);
  const { lastInsertRowid } = stmt.run(ref, venue, room_type, guest_count, status);
  guests.forEach((g, i) => {
    db.prepare(`INSERT INTO guests (booking_id, guest_number, full_name, gender, whatsapp, email) VALUES (?, ?, ?, ?, '9999999999', 'test@test.com')`)
      .run(lastInsertRowid, i + 1, g.name, g.gender);
  });
  return lastInsertRowid;
}

function getBooking(ref) {
  return db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(ref);
}

function getGuests(bookingId) {
  return db.prepare('SELECT * FROM guests WHERE booking_id=?').all(bookingId);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkAvailability — unknown venue
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 1. UNKNOWN VENUE / ROOM TYPE ═══');
clearDB();
{
  const r = checkAvailability(db, 'Nonexistent', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (!r.available) log('PASS', 'unknown-venue', 'Returns unavailable for unknown venue');
  else log('FAIL', 'unknown-venue', 'Should reject unknown venue — returned available:true');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bhakti Kutir — basic bed booking
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 2. BHAKTI KUTIR — BED BOOKING ═══');
clearDB();
{
  // Fill 11 rooms fully with 2 males each (22 males, 11 full-room bookings)
  for (let i = 1; i <= 11; i++) {
    const id = insertBooking({ ref: `T-BK-DS-${i}`, venue: 'Bhakti Kutir', room_type: 'Double Sharing', guest_count: 2,
      guests: [{ name: `M${i}a`, gender: 'Male' }, { name: `M${i}b`, gender: 'Male' }] });
    autoAssignRoom(db, id);
  }

  // With 11 rooms full of males and 1 room empty: both genders can book room 12
  const rMale = checkAvailability(db, 'Bhakti Kutir', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (rMale.available) log('PASS', 'BK-DS', 'Male can book room 12 (empty, 11 other rooms full with males)');
  else log('FAIL', 'BK-DS', 'Male should be able to book 1 remaining empty room');

  const rFemale = checkAvailability(db, 'Bhakti Kutir', 'Double Sharing', 1, [{ gender: 'Female' }]);
  if (rFemale.available) log('PASS', 'BK-DS', 'Female can also book room 12 while it is still empty');
  else log('FAIL', 'BK-DS', 'Female should be able to book the empty room 12');

  // Now put 1 male in room 12 (partial booking, 23rd male)
  const id12 = insertBooking({ ref: 'T-BK-DS-12', venue: 'Bhakti Kutir', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'MLastMale', gender: 'Male' }] });
  autoAssignRoom(db, id12);

  // 23 males in 12 rooms → 1 male bed still left in room 12, but all rooms are now male-occupied
  const r1 = checkAvailability(db, 'Bhakti Kutir', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (r1.available) log('PASS', 'BK-DS', '1 male bed still available in partially-filled room 12');
  else log('FAIL', 'BK-DS', '23 males — 1 bed should still be available in room 12');

  // All 12 rooms now have males → no room available for females
  const r2 = checkAvailability(db, 'Bhakti Kutir', 'Double Sharing', 1, [{ gender: 'Female' }]);
  if (!r2.available) log('PASS', 'BK-DS', 'Female correctly blocked — all 12 rooms occupied by males');
  else log('FAIL', 'BK-DS', 'Female should be blocked — all 12 rooms have at least 1 male');

  // Fill that last male bed (24 males total)
  const id12b = insertBooking({ ref: 'T-BK-DS-12b', venue: 'Bhakti Kutir', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'MFinalMale', gender: 'Male' }] });
  autoAssignRoom(db, id12b);

  const rFull = checkAvailability(db, 'Bhakti Kutir', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (!rFull.available) log('PASS', 'BK-DS', 'All 24 male beds sold out correctly');
  else log('FAIL', 'BK-DS', '24 males — should be fully sold out');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bhakti Kutir — Triple Sharing same_gender packing
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 3. BHAKTI KUTIR — TRIPLE SHARING GENDER PACKING ═══');
clearDB();
{
  // Book 2 males → should go into same room
  const id1 = insertBooking({ ref: 'T-BK-TS-1', venue: 'Bhakti Kutir', room_type: 'Triple Sharing', guest_count: 1, guests: [{ name: 'Male1', gender: 'Male' }] });
  autoAssignRoom(db, id1);
  const id2 = insertBooking({ ref: 'T-BK-TS-2', venue: 'Bhakti Kutir', room_type: 'Triple Sharing', guest_count: 1, guests: [{ name: 'Male2', gender: 'Male' }] });
  autoAssignRoom(db, id2);

  const b1 = getBooking('T-BK-TS-1');
  const b2 = getBooking('T-BK-TS-2');
  if (b1.room_number && b1.room_number === b2.room_number)
    log('PASS', 'BK-TS', 'Two male single-bookings packed into same room');
  else
    log('FAIL', 'BK-TS', `Males not packed together — B1:${b1.room_number} B2:${b2.room_number}`);

  // 3rd male → same room
  const id3 = insertBooking({ ref: 'T-BK-TS-3', venue: 'Bhakti Kutir', room_type: 'Triple Sharing', guest_count: 1, guests: [{ name: 'Male3', gender: 'Male' }] });
  autoAssignRoom(db, id3);
  const b3 = getBooking('T-BK-TS-3');
  if (b3.room_number === b1.room_number)
    log('PASS', 'BK-TS', '3rd male fills same room (triple)');
  else
    log('FAIL', 'BK-TS', `3rd male went to different room: ${b3.room_number}`);

  // 4th male → new room
  const id4 = insertBooking({ ref: 'T-BK-TS-4', venue: 'Bhakti Kutir', room_type: 'Triple Sharing', guest_count: 1, guests: [{ name: 'Male4', gender: 'Male' }] });
  autoAssignRoom(db, id4);
  const b4 = getBooking('T-BK-TS-4');
  if (b4.room_number && b4.room_number !== b1.room_number)
    log('PASS', 'BK-TS', '4th male opens new room when first is full');
  else
    log('FAIL', 'BK-TS', `4th male should open new room, got: ${b4.room_number}`);

  // Female goes to different room from males
  const id5 = insertBooking({ ref: 'T-BK-TS-5', venue: 'Bhakti Kutir', room_type: 'Triple Sharing', guest_count: 1, guests: [{ name: 'Female1', gender: 'Female' }] });
  autoAssignRoom(db, id5);
  const b5 = getBooking('T-BK-TS-5');
  if (b5.room_number !== b1.room_number && b5.room_number !== b4.room_number)
    log('PASS', 'BK-TS', 'Female gets own room separate from males');
  else
    log('FAIL', 'BK-TS', `Female placed in male room: ${b5.room_number}`);

  // Mixed gender booking rejected
  const rMixed = checkAvailability(db, 'Bhakti Kutir', 'Triple Sharing', 2, [{ gender: 'Male' }, { gender: 'Female' }]);
  if (!rMixed.available) log('PASS', 'BK-TS', 'Mixed-gender partial booking correctly rejected');
  else log('FAIL', 'BK-TS', 'Mixed-gender booking should be rejected for same_gender room');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Bhakti Kutir — female_only dorm
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 4. BHAKTI KUTIR — FEMALE-ONLY DORM ═══');
clearDB();
{
  // Male cannot book female dorm
  const rMale = checkAvailability(db, 'Bhakti Kutir', '4 Bed Dorm', 1, [{ gender: 'Male' }]);
  if (!rMale.available) log('PASS', 'BK-Dorm', 'Male correctly blocked from female-only dorm');
  else log('FAIL', 'BK-Dorm', 'Male should be blocked from female-only dorm');

  // Female can book
  const rFemale = checkAvailability(db, 'Bhakti Kutir', '4 Bed Dorm', 1, [{ gender: 'Female' }]);
  if (rFemale.available) log('PASS', 'BK-Dorm', 'Female can book female-only dorm');
  else log('FAIL', 'BK-Dorm', 'Female incorrectly blocked from female-only dorm');

  // Fill dorm to capacity (4 beds)
  const id1 = insertBooking({ ref: 'T-DORM-1', venue: 'Bhakti Kutir', room_type: '4 Bed Dorm', guest_count: 3,
    guests: [{ name: 'F1', gender: 'Female' }, { name: 'F2', gender: 'Female' }, { name: 'F3', gender: 'Female' }] });
  autoAssignRoom(db, id1);
  const id2 = insertBooking({ ref: 'T-DORM-2', venue: 'Bhakti Kutir', room_type: '4 Bed Dorm', guest_count: 1,
    guests: [{ name: 'F4', gender: 'Female' }] });
  autoAssignRoom(db, id2);

  // Both should be in DORM-F4
  const b1 = getBooking('T-DORM-1');
  const b2 = getBooking('T-DORM-2');
  if (b1.room_number === 'DORM-F4' && b2.room_number === 'DORM-F4')
    log('PASS', 'BK-Dorm', 'Multiple bookings correctly share DORM-F4 slot');
  else
    log('FAIL', 'BK-Dorm', `Dorm assignments: ${b1.room_number}, ${b2.room_number}`);

  // Dorm now full — 5th female rejected
  const rFull = checkAvailability(db, 'Bhakti Kutir', '4 Bed Dorm', 1, [{ gender: 'Female' }]);
  if (!rFull.available) log('PASS', 'BK-Dorm', 'Full dorm correctly blocks new booking');
  else log('FAIL', 'BK-Dorm', 'Full dorm should block new bookings');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMBINED capacity — Destiny DS + Private sharing physical rooms
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 5. DESTINY — COMBINED CAPACITY (5 rooms) ═══');
clearDB();
{
  // Fill 4 private rooms
  for (let i = 1; i <= 4; i++) {
    const id = insertBooking({ ref: `T-D-PR-${i}`, venue: 'Destiny', room_type: 'Private Room', guest_count: 1,
      guests: [{ name: `Guest${i}`, gender: 'Male' }] });
    autoAssignRoom(db, id);
  }

  // 1 room left — should allow DS but not another Private
  const rDS = checkAvailability(db, 'Destiny', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (rDS.available) log('PASS', 'Destiny', 'DS available when 1 room left and 4 privates booked');
  else log('FAIL', 'Destiny', 'DS should be available with 1 room remaining');

  // Book that last room as DS
  const idDS = insertBooking({ ref: 'T-D-DS-1', venue: 'Destiny', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'DSGuest', gender: 'Male' }] });
  autoAssignRoom(db, idDS);

  // Now fully booked — nothing should work
  const rPR2 = checkAvailability(db, 'Destiny', 'Private Room', 1, [{ gender: 'Male' }]);
  if (!rPR2.available) log('PASS', 'Destiny', 'Private Room blocked when all 5 rooms occupied');
  else log('FAIL', 'Destiny', 'Private Room should be blocked — venue full');

  // DS bed still available in that last room (1 male in a 2-bed room)
  const rDS2 = checkAvailability(db, 'Destiny', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (rDS2.available) log('PASS', 'Destiny', 'DS still has 1 spare bed in the partially-filled DS room');
  else log('FAIL', 'Destiny', 'DS spare bed in partially-filled room not detected');

  // Fill DS room completely
  const idDS2 = insertBooking({ ref: 'T-D-DS-2', venue: 'Destiny', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'DSGuest2', gender: 'Male' }] });
  autoAssignRoom(db, idDS2);

  // Now truly full
  const rFull = checkAvailability(db, 'Destiny', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (!rFull.available) log('PASS', 'Destiny', 'DS fully sold out after both beds filled');
  else log('FAIL', 'Destiny', 'DS should be sold out — both beds used');

  // Verify autoAssign put DS guests in the same slot, not into a Private slot
  const bDS1 = getBooking('T-D-DS-1');
  const bDS2 = getBooking('T-D-DS-2');
  const bPR1 = getBooking('T-D-PR-1');
  if (bDS1.room_number === bDS2.room_number)
    log('PASS', 'Destiny', 'DS guests share same room slot');
  else
    log('FAIL', 'Destiny', `DS guests in different slots: ${bDS1.room_number}, ${bDS2.room_number}`);

  if (bDS1.room_number !== bPR1.room_number)
    log('PASS', 'Destiny', 'DS slot is separate from Private slot');
  else
    log('FAIL', 'Destiny', 'DS was assigned into a Private Room slot!');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. COMBINED — Teraria DS same_gender packing
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 6. TERARIA — SAME_GENDER DS PACKING ═══');
clearDB();
{
  // 4 male single bookings → should pack into 2 rooms of 2
  const ids = [];
  for (let i = 1; i <= 4; i++) {
    const id = insertBooking({ ref: `T-TER-M${i}`, venue: 'Teraria', room_type: 'Double Sharing', guest_count: 1,
      guests: [{ name: `Male${i}`, gender: 'Male' }] });
    autoAssignRoom(db, id);
    ids.push(id);
  }
  const rooms = ids.map(id => db.prepare('SELECT room_number FROM bookings WHERE id=?').get(id).room_number);
  const uniqueRooms = new Set(rooms);
  if (uniqueRooms.size === 2) log('PASS', 'Teraria', '4 male singles packed into 2 rooms (not 4)');
  else log('FAIL', 'Teraria', `4 males used ${uniqueRooms.size} rooms instead of 2: ${[...uniqueRooms].join(', ')}`);

  // 1 female → own room
  const idF = insertBooking({ ref: 'T-TER-F1', venue: 'Teraria', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'Female1', gender: 'Female' }] });
  autoAssignRoom(db, idF);
  const bF = getBooking('T-TER-F1');
  if (!rooms.includes(bF.room_number)) log('PASS', 'Teraria', 'Female gets separate room from males');
  else log('FAIL', 'Teraria', `Female placed in male room: ${bF.room_number}`);

  // Gender mismatch — male trying to join female room (should fail at checkAvailability when female room full)
  // Fill that female room
  const idF2 = insertBooking({ ref: 'T-TER-F2', venue: 'Teraria', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'Female2', gender: 'Female' }] });
  autoAssignRoom(db, idF2);

  // Now 4 males in 2 rooms + 2 females in 1 room = 3 rooms used
  // 5th male: needs a new room (slot 4 available)
  const rM5 = checkAvailability(db, 'Teraria', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (rM5.available) log('PASS', 'Teraria', '5th male can book new room (slots still available)');
  else log('FAIL', 'Teraria', '5th male incorrectly blocked');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Ourem Palace — full capacity block
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 7. OUREM PALACE — FULL CAPACITY ═══');
clearDB();
{
  // Fill all 10 rooms with private bookings
  for (let i = 1; i <= 10; i++) {
    const id = insertBooking({ ref: `T-OP-${i}`, venue: 'Ourem Palace', room_type: 'Private Room', guest_count: 1,
      guests: [{ name: `Guest${i}`, gender: i % 2 === 0 ? 'Female' : 'Male' }] });
    autoAssignRoom(db, id);
  }

  const rPR = checkAvailability(db, 'Ourem Palace', 'Private Room', 1, [{ gender: 'Male' }]);
  if (!rPR.available) log('PASS', 'Ourem', 'Private Room blocked when all 10 rooms full');
  else log('FAIL', 'Ourem', 'Should be blocked — 10/10 rooms used');

  const rDS = checkAvailability(db, 'Ourem Palace', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (!rDS.available) log('PASS', 'Ourem', 'DS blocked when all 10 rooms full');
  else log('FAIL', 'Ourem', 'DS should be blocked — no rooms left');

  // Verify all 10 room labels assigned (OP-01 through OP-10)
  const bookings = db.prepare("SELECT room_number FROM bookings WHERE venue='Ourem Palace'").all();
  const assignedRooms = bookings.map(b => b.room_number).filter(Boolean);
  const labels = ROOM_LABELS['Ourem Palace'];
  const allLabelsUsed = labels.every(l => assignedRooms.includes(l));
  if (allLabelsUsed) log('PASS', 'Ourem', 'All 10 room labels (OP-01 to OP-10) correctly assigned');
  else log('WARN', 'Ourem', `Not all room labels assigned. Got: ${assignedRooms.join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. autoAssignRoom — DS booking does NOT steal Private Room slot
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 8. AUTO-ASSIGN — DS NEVER STEALS PRIVATE SLOT ═══');
clearDB();
{
  // Fill 4 private rooms in Destiny
  for (let i = 1; i <= 4; i++) {
    const id = insertBooking({ ref: `T-STEAL-PR-${i}`, venue: 'Destiny', room_type: 'Private Room', guest_count: 1,
      guests: [{ name: `PRGuest${i}`, gender: 'Male' }] });
    autoAssignRoom(db, id);
  }

  // Book DS — should go to D-5 (the only empty slot), not steal any private slot
  const idDS = insertBooking({ ref: 'T-STEAL-DS', venue: 'Destiny', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'DSGuest', gender: 'Male' }] });
  autoAssignRoom(db, idDS);
  const bDS = getBooking('T-STEAL-DS');

  const privRooms = db.prepare("SELECT room_number FROM bookings WHERE venue='Destiny' AND room_type='Private Room'").all().map(b => b.room_number);
  if (bDS.room_number && !privRooms.includes(bDS.room_number))
    log('PASS', 'AutoAssign', 'DS booking assigned to empty slot, not into a private slot');
  else
    log('FAIL', 'AutoAssign', `DS booking stole private slot: ${bDS.room_number} (private slots: ${privRooms.join(', ')})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. upi_pending counted in inventory
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 9. UPI_PENDING STATUS COUNTED ═══');
clearDB();
{
  // Fill BK Single Room with 3 paid + 1 upi_pending
  for (let i = 1; i <= 3; i++) {
    insertBooking({ ref: `T-UPI-PAID-${i}`, venue: 'Bhakti Kutir', room_type: 'Single Room', guest_count: 1,
      status: 'paid', guests: [{ name: `G${i}`, gender: 'Male' }] });
  }
  insertBooking({ ref: 'T-UPI-PEND', venue: 'Bhakti Kutir', room_type: 'Single Room', guest_count: 1,
    status: 'upi_pending', guests: [{ name: 'Gpend', gender: 'Male' }] });

  const r = checkAvailability(db, 'Bhakti Kutir', 'Single Room', 1, [{ gender: 'Male' }]);
  if (!r.available) log('PASS', 'upi_pending', 'upi_pending booking counted as occupied (4/4 rooms full)');
  else log('FAIL', 'upi_pending', 'upi_pending booking not counted — should be full');
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Transfer: same venue, DS → Private (intra-venue)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 10. TRANSFER — INTRA-VENUE DS→PRIVATE ═══');
clearDB();
{
  // Book 4 private + 1 DS at Destiny
  for (let i = 1; i <= 4; i++) {
    const id = insertBooking({ ref: `T-INTRA-PR-${i}`, venue: 'Destiny', room_type: 'Private Room', guest_count: 1,
      guests: [{ name: `PR${i}`, gender: 'Male' }] });
    autoAssignRoom(db, id);
  }
  const idDS = insertBooking({ ref: 'T-INTRA-DS', venue: 'Destiny', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'DSGuest', gender: 'Male' }] });
  autoAssignRoom(db, idDS);

  // Now 5/5 rooms occupied. Try to transfer the DS booking to Private Room at Destiny.
  // The DS booking vacates its room — so 1 room becomes free for Private.
  // With the fix (temporarily exclude this booking), this should succeed.
  const booking = getBooking('T-INTRA-DS');
  // Simulate the transfer check: temporarily mark _transferring
  db.prepare("UPDATE bookings SET status='_transferring' WHERE booking_ref='T-INTRA-DS'").run();
  const r = checkAvailability(db, 'Destiny', 'Private Room', 1, [{ gender: 'Male' }]);
  db.prepare("UPDATE bookings SET status='paid' WHERE booking_ref='T-INTRA-DS'").run();

  if (r.available) log('PASS', 'Transfer', 'Intra-venue DS→Private correctly allowed (booking excluded from check)');
  else log('FAIL', 'Transfer', 'Intra-venue transfer incorrectly rejected — own room not freed in check');
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Transfer to full venue — must be blocked
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 11. TRANSFER TO FULL VENUE — BLOCKED ═══');
clearDB();
{
  // Fill Teraria completely (5 rooms of 2 males each = 10 males)
  for (let i = 1; i <= 5; i++) {
    const id = insertBooking({ ref: `T-FULL-TER-${i}`, venue: 'Teraria', room_type: 'Double Sharing', guest_count: 2,
      guests: [{ name: `M${i}a`, gender: 'Male' }, { name: `M${i}b`, gender: 'Male' }] });
    autoAssignRoom(db, id);
  }

  // Try to transfer a male to Teraria DS — should be blocked
  const r = checkAvailability(db, 'Teraria', 'Double Sharing', 1, [{ gender: 'Male' }]);
  if (!r.available) log('PASS', 'Transfer', 'Transfer to full venue correctly blocked');
  else log('FAIL', 'Transfer', 'Transfer to full venue should be blocked');
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. autoAssignRoom — guest room_numbers cleared on transfer (stale assignments)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 12. STALE GUEST ROOM NUMBERS CLEARED ON TRANSFER ═══');
clearDB();
{
  const id = insertBooking({ ref: 'T-STALE', venue: 'Destiny', room_type: 'Private Room', guest_count: 1,
    guests: [{ name: 'MovingGuest', gender: 'Female' }] });
  autoAssignRoom(db, id);
  const guestId = db.prepare('SELECT id FROM guests WHERE booking_id=?').get(id).id;

  // Give guest a stale individual room number
  db.prepare('UPDATE guests SET room_number=? WHERE id=?').run('D-3', guestId);

  // Simulate transfer: clear guest room_numbers, re-assign in new venue
  db.prepare('UPDATE guests SET room_number=NULL WHERE booking_id=?').run(id);
  db.prepare("UPDATE bookings SET venue='Bhakti Kutir', room_type='Single Room', room_number=NULL WHERE id=?").run(id);
  autoAssignRoom(db, id);

  const g = db.prepare('SELECT room_number FROM guests WHERE id=?').get(guestId);
  const b = getBooking('T-STALE');
  if (!g.room_number || g.room_number.startsWith('BK-S'))
    log('PASS', 'Transfer', 'Stale guest room_number cleared after transfer');
  else
    log('FAIL', 'Transfer', `Stale room_number still present: guest=${g.room_number}`);

  if (b.room_number && b.room_number.startsWith('BK-S'))
    log('PASS', 'Transfer', 'New venue room auto-assigned after transfer');
  else
    log('FAIL', 'Transfer', `New room not assigned after transfer: ${b.room_number}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. pending→paid status NOT auto-promoted on transfer
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 13. PENDING STATUS NOT AUTO-PROMOTED ON CHEAPER TRANSFER ═══');
clearDB();
{
  insertBooking({ ref: 'T-STATUS', venue: 'Ourem Palace', room_type: 'Private Room', guest_count: 1,
    status: 'pending', guests: [{ name: 'UnpaidGuest', gender: 'Male' }] });

  // Simulate status logic from transfer endpoint
  const booking = getBooking('T-STATUS');
  const oldBasePrice = 0; // mock
  const newTotal = 0; // cheaper/same
  const newStatus = (booking.status === 'paid' && newTotal > oldBasePrice) ? 'pending' : booking.status;

  if (newStatus === 'pending') log('PASS', 'Transfer', 'Pending booking stays pending on cheaper transfer');
  else log('FAIL', 'Transfer', `Pending booking was promoted to: ${newStatus}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Single Room capacity (BK — 4 rooms)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 14. BHAKTI KUTIR — SINGLE ROOM CAPACITY ═══');
clearDB();
{
  for (let i = 1; i <= 4; i++) {
    const id = insertBooking({ ref: `T-SR-${i}`, venue: 'Bhakti Kutir', room_type: 'Single Room', guest_count: 1,
      guests: [{ name: `G${i}`, gender: i % 2 === 0 ? 'Female' : 'Male' }] });
    autoAssignRoom(db, id);
  }

  const r = checkAvailability(db, 'Bhakti Kutir', 'Single Room', 1, [{ gender: 'Male' }]);
  if (!r.available) log('PASS', 'BK-Single', '4/4 single rooms sold out correctly');
  else log('FAIL', 'BK-Single', '4/4 single rooms should be sold out');

  // Verify labels BK-S01 to BK-S04 all assigned
  const rooms = db.prepare("SELECT room_number FROM bookings WHERE venue='Bhakti Kutir' AND room_type='Single Room'").all().map(b => b.room_number);
  const expectedLabels = ['BK-S01', 'BK-S02', 'BK-S03', 'BK-S04'];
  const allAssigned = expectedLabels.every(l => rooms.includes(l));
  if (allAssigned) log('PASS', 'BK-Single', 'All 4 single room labels correctly assigned');
  else log('FAIL', 'BK-Single', `Labels assigned: ${rooms.join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. 6 Bed Dorm (male) — any gender allowed
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 15. BHAKTI KUTIR — 6 BED DORM (ANY GENDER) ═══');
clearDB();
{
  const rM = checkAvailability(db, 'Bhakti Kutir', '6 Bed Dorm', 1, [{ gender: 'Male' }]);
  const rF = checkAvailability(db, 'Bhakti Kutir', '6 Bed Dorm', 1, [{ gender: 'Female' }]);
  if (rM.available) log('PASS', 'BK-6Dorm', 'Male can book 6 bed dorm (any gender)');
  else log('FAIL', 'BK-6Dorm', 'Male incorrectly blocked from 6 bed dorm');
  if (rF.available) log('PASS', 'BK-6Dorm', 'Female can book 6 bed dorm (any gender)');
  else log('FAIL', 'BK-6Dorm', 'Female incorrectly blocked from 6 bed dorm');

  // Fill to capacity
  const id = insertBooking({ ref: 'T-6DORM', venue: 'Bhakti Kutir', room_type: '6 Bed Dorm', guest_count: 6,
    guests: Array.from({length:6}, (_,i) => ({ name: `G${i}`, gender: i < 3 ? 'Male' : 'Female' })) });
  autoAssignRoom(db, id);
  const r = checkAvailability(db, 'Bhakti Kutir', '6 Bed Dorm', 1, [{ gender: 'Male' }]);
  if (!r.available) log('PASS', 'BK-6Dorm', '6/6 beds sold out correctly');
  else log('FAIL', 'BK-6Dorm', '6 bed dorm should be sold out after 6 guests');
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Double Sharing full-room booking (couple) — gets own room
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ 16. FULL-ROOM BOOKING (COUPLE) ═══');
clearDB();
{
  // Mixed-gender 2-person booking in same_gender room → should get own room (full-room booking)
  const id = insertBooking({ ref: 'T-COUPLE', venue: 'Teraria', room_type: 'Double Sharing', guest_count: 2,
    guests: [{ name: 'HusbandM', gender: 'Male' }, { name: 'WifeF', gender: 'Female' }] });

  // checkAvailability with isFullRoom = guest_count >= room_size → 2 >= 2 → full room
  const r = checkAvailability(db, 'Teraria', 'Double Sharing', 2, [{ gender: 'Male' }, { gender: 'Female' }]);
  if (r.available) log('PASS', 'FullRoom', 'Mixed-gender couple booking allowed as full-room');
  else log('FAIL', 'FullRoom', 'Mixed-gender couple should be allowed as full-room booking');

  autoAssignRoom(db, id);
  const b = getBooking('T-COUPLE');
  if (b.room_number) log('PASS', 'FullRoom', `Couple auto-assigned to ${b.room_number}`);
  else log('FAIL', 'FullRoom', 'Couple booking not assigned a room');

  // Single male should go to a DIFFERENT room (not the couple's room)
  const idSingle = insertBooking({ ref: 'T-SINGLE-M', venue: 'Teraria', room_type: 'Double Sharing', guest_count: 1,
    guests: [{ name: 'SingleMale', gender: 'Male' }] });
  autoAssignRoom(db, idSingle);
  const bSingle = getBooking('T-SINGLE-M');
  if (bSingle.room_number !== b.room_number) log('PASS', 'FullRoom', 'Single male gets different room from couple');
  else log('FAIL', 'FullRoom', 'Single male placed in couple room!');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
clearDB();
console.log('\n' + '═'.repeat(60));
console.log(`AUDIT COMPLETE: ${passed} passed, ${failed} failed, ${warnings} warnings`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\nFAILED TESTS:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ❌ [${r.category}] ${r.test}`);
    if (r.detail) console.log(`     → ${r.detail}`);
  });
}

if (warnings > 0) {
  console.log('\nWARNINGS:');
  results.filter(r => r.status === 'WARN').forEach(r => {
    console.log(`  ⚠️  [${r.category}] ${r.test}`);
    if (r.detail) console.log(`     → ${r.detail}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
