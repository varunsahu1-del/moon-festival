/**
 * One-time migration: assign existing Ourem Palace bookings to new OW-D / OW-P room labels.
 * Run once on the server: node server/migrate-ourem-rooms.js
 */
const { db } = require('./db');

const DOUBLE_SLOTS = ['OW-D01','OW-D02','OW-D03','OW-D04','OW-D05'];
const PRIVATE_SLOTS = ['OW-P01','OW-P02','OW-P03','OW-P04'];

const bookings = db.prepare(`
  SELECT id, booking_ref, room_type, room_number, guest_count
  FROM bookings
  WHERE venue = 'Ourem Palace'
    AND deleted_at IS NULL
    AND status IN ('paid','pending','upi_pending')
  ORDER BY id
`).all();

console.log(`Found ${bookings.length} Ourem Palace bookings`);

// Track how many beds used per slot
const slotUsed = {}; // slot -> beds used
[...DOUBLE_SLOTS, ...PRIVATE_SLOTS].forEach(s => slotUsed[s] = 0);

// Already assigned to new-style slots — mark them used
bookings.forEach(b => {
  if (b.room_number && (b.room_number.startsWith('OW-D') || b.room_number.startsWith('OW-P'))) {
    const size = b.room_number.startsWith('OW-D') ? 2 : 1;
    slotUsed[b.room_number] = (slotUsed[b.room_number] || 0) + (b.guest_count || 1);
  }
});

const update = db.prepare(`UPDATE bookings SET room_number = ? WHERE id = ?`);

let assigned = 0;
bookings.forEach(b => {
  // Skip if already on a new-style label
  if (b.room_number && (b.room_number.startsWith('OW-D') || b.room_number.startsWith('OW-P'))) {
    console.log(`  ${b.booking_ref} (${b.room_type}) — already at ${b.room_number}, skipping`);
    return;
  }

  const slots = b.room_type === 'Private Room' ? PRIVATE_SLOTS : DOUBLE_SLOTS;
  const capacity = b.room_type === 'Private Room' ? 1 : 2;
  const guestCount = b.guest_count || 1;

  // Find a slot with enough space
  const slot = slots.find(s => (slotUsed[s] || 0) + guestCount <= capacity);
  if (!slot) {
    console.log(`  ${b.booking_ref} (${b.room_type}) — NO SLOT AVAILABLE, skipping`);
    return;
  }

  update.run(slot, b.id);
  slotUsed[slot] = (slotUsed[slot] || 0) + guestCount;
  console.log(`  ${b.booking_ref} (${b.room_type}) — assigned to ${slot}`);
  assigned++;
});

console.log(`\nDone. Assigned ${assigned} bookings.`);
