// Inventory configuration
// unit: 'beds'  → count guests booked (each person = 1 bed)
// unit: 'rooms' → count bookings (each booking = 1 room)
// gender_rule:
//   'any'         → no gender restriction (mixed dorm, private rooms)
//   'female_only' → only females allowed
//   'same_gender' → males with males, females with females (split across rooms)

const INVENTORY = [
  // Bhakti Kutir
  { venue: 'Bhakti Kutir', room_type: 'Double Sharing', unit: 'beds',  capacity: 22, rooms: 11, room_size: 2, gender_rule: 'same_gender', label: '11 rooms × 2' },
  { venue: 'Bhakti Kutir', room_type: 'Triple Sharing', unit: 'beds',  capacity: 24, rooms: 8,  room_size: 3, gender_rule: 'same_gender', label: '8 rooms × 3' },
  { venue: 'Bhakti Kutir', room_type: 'Private Room',   unit: 'rooms', capacity: 4,  rooms: 4,  room_size: 1, gender_rule: 'any',         label: '4 rooms' },
  { venue: 'Bhakti Kutir', room_type: '4 Bed Dorm',     unit: 'beds',  capacity: 4,  rooms: 1,  room_size: 4, gender_rule: 'female_only', label: '4 beds' },
  { venue: 'Bhakti Kutir', room_type: '6 Bed Dorm',     unit: 'beds',  capacity: 6,  rooms: 1,  room_size: 6, gender_rule: 'any',         label: '6 beds' },
  // Marron · Sea View (combined pool of 11 rooms: 6 FF + 5 GF)
  { venue: 'Marron · Sea View', room_type: 'Double Sharing', unit: 'beds',  capacity: 16, rooms: 8,  room_size: 2, gender_rule: 'same_gender', label: '8 rooms × 2 beds' },
  { venue: 'Marron · Sea View', room_type: 'Triple Sharing', unit: 'beds',  capacity: 3,  rooms: 1,  room_size: 3, gender_rule: 'same_gender', label: '1 room × 3 beds' },
  { venue: 'Marron · Sea View', room_type: 'Private Room',   unit: 'rooms', capacity: 2,  rooms: 2,  room_size: 1, gender_rule: 'any',         label: '2 rooms' },
  // Marron · Garden (combined pool of 11 rooms)
  { venue: 'Marron · Garden', room_type: 'Double Sharing', unit: 'beds',  capacity: 16, rooms: 8,  room_size: 2, gender_rule: 'same_gender', label: '8 rooms × 2 beds' },
  { venue: 'Marron · Garden', room_type: 'Triple Sharing', unit: 'beds',  capacity: 3,  rooms: 1,  room_size: 3, gender_rule: 'same_gender', label: '1 room × 3 beds' },
  { venue: 'Marron · Garden', room_type: 'Private Room',   unit: 'rooms', capacity: 2,  rooms: 2,  room_size: 1, gender_rule: 'any',         label: '2 rooms' },
  // Destiny (combined pool of 5 rooms)
  { venue: 'Destiny', room_type: 'Double Sharing', unit: 'beds',  capacity: 6,  rooms: 3, room_size: 2, gender_rule: 'same_gender', label: '3 rooms × 2 beds' },
  { venue: 'Destiny', room_type: 'Triple Sharing', unit: 'beds',  capacity: 3,  rooms: 1, room_size: 3, gender_rule: 'same_gender', label: '1 room × 3 beds' },
  { venue: 'Destiny', room_type: 'Private Room',   unit: 'rooms', capacity: 1,  rooms: 1, room_size: 1, gender_rule: 'any',         label: '1 room' },
  // Ourem Palace (combined pool of 14 rooms: 4 Brown private + 10 White)
  { venue: 'Ourem Palace', room_type: 'Double Sharing', unit: 'beds',  capacity: 18, rooms: 9,  room_size: 2, gender_rule: 'same_gender', label: '9 rooms × 2 beds' },
  { venue: 'Ourem Palace', room_type: 'Triple Sharing', unit: 'beds',  capacity: 3,  rooms: 1,  room_size: 3, gender_rule: 'same_gender', label: '1 room × 3 beds' },
  { venue: 'Ourem Palace', room_type: 'Private Room',   unit: 'rooms', capacity: 4,  rooms: 4,  room_size: 1, gender_rule: 'any',         label: '4 rooms' },
  // Teraria (combined pool of 5 rooms)
  { venue: 'Teraria', room_type: 'Double Sharing', unit: 'beds',  capacity: 4,  rooms: 2, room_size: 2, gender_rule: 'same_gender', label: '2 rooms × 2 beds' },
  { venue: 'Teraria', room_type: 'Triple Sharing', unit: 'beds',  capacity: 3,  rooms: 1, room_size: 3, gender_rule: 'same_gender', label: '1 room × 3 beds' },
  { venue: 'Teraria', room_type: 'Private Room',   unit: 'rooms', capacity: 2,  rooms: 2, room_size: 1, gender_rule: 'any',         label: '2 rooms' },
  { venue: 'Festival Access', room_type: '3-Day Pass',        unit: 'beds', capacity: 100, room_size: 1, gender_rule: 'any', label: '100 passes' },
  { venue: 'Festival Access', room_type: 'Day Pass · 27 Nov', unit: 'beds', capacity: 100, room_size: 1, gender_rule: 'any', label: '100 passes' },
  { venue: 'Festival Access', room_type: 'Day Pass · 28 Nov', unit: 'beds', capacity: 100, room_size: 1, gender_rule: 'any', label: '100 passes' },
  { venue: 'Festival Access', room_type: 'Day Pass · 29 Nov', unit: 'beds', capacity: 100, room_size: 1, gender_rule: 'any', label: '100 passes' },
];

// Predefined room labels for each venue/type
// Used to render a fixed grid — every slot always visible (occupied or Available)
const ROOM_LABELS = {
  'Marron · Sea View': [
    'MR-SV-01','MR-SV-02','MR-SV-03','MR-SV-04','MR-SV-05',
    'MR-SV-06','MR-SV-07','MR-SV-08','MR-SV-09','MR-SV-10','MR-SV-11',
  ],
  'Marron · Garden': [
    'MR-GC-01','MR-GC-02','MR-GC-03','MR-GC-04','MR-GC-05',
    'MR-GC-06','MR-GC-07','MR-GC-08','MR-GC-09','MR-GC-10','MR-GC-11',
  ],
  'Destiny': [
    'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5',
  ],
  'Teraria': [
    'T-1', 'T-2', 'T-3', 'T-4', 'T-5',
  ],
  'Ourem Palace': [
    'OP-01', 'OP-02', 'OP-03', 'OP-04', 'OP-05',
    'OP-06', 'OP-07', 'OP-08', 'OP-09', 'OP-10',
    'OP-11', 'OP-12', 'OP-13', 'OP-14',
  ],
  'Bhakti Kutir': {
    'Double Sharing': ['BK-D01','BK-D02','BK-D03','BK-D04','BK-D05','BK-D06','BK-D07','BK-D08','BK-D09','BK-D10','BK-D11'],
    'Triple Sharing': ['BK-T01','BK-T02','BK-T03','BK-T04','BK-T05','BK-T06','BK-T07','BK-T08'],
    'Private Room':    ['BK-S01','BK-S02','BK-S03','BK-S04'],
    '4 Bed Dorm':     ['DORM-F4'],
    '6 Bed Dorm':     ['DORM-M6'],
  },
};

// Per-person base prices (excl. GST) — 3 phases + extra day add-on
// earlyBird → phase1 → phase2
// extraDay = optional 26 Nov early check-in add-on (per person)
// food add-on is flat ₹3000/day (brunch + dinner), handled client-side
const PRICING = {
  'Bhakti Kutir': {
    'Double Sharing': { earlyBird: 34500, phase1: 37900, phase2: 40000, extraDay: 2500 },
    'Triple Sharing': { earlyBird: 29500, phase1: 32000, phase2: 34000, extraDay: 1500 },
    'Private Room':    { earlyBird: 46500, phase1: 51000, phase2: 54500, extraDay: 3000 },
    '4 Bed Dorm':     { earlyBird: 25500, phase1: 28000, phase2: 29500, extraDay: 800  },
    '6 Bed Dorm':     { earlyBird: 24000, phase1: 26500, phase2: 27900, extraDay: 700  },
  },
  'Marron · Sea View': {
    'Double Sharing': { earlyBird: 49900, phase1: 54900, phase2: 57900, extraDay: 4500 },
    'Triple Sharing': { earlyBird: 39900, phase1: 43900, phase2: 46000, extraDay: 3000 },
    'Private Room':   { earlyBird: 71900, phase1: 79000, phase2: 83900, extraDay: 8500 },
  },
  'Marron · Garden': {
    'Double Sharing': { earlyBird: 39500, phase1: 43500, phase2: 45900, extraDay: 3500 },
    'Triple Sharing': { earlyBird: 32500, phase1: 36000, phase2: 38000, extraDay: 2500 },
    'Private Room':   { earlyBird: 54900, phase1: 60000, phase2: 63500, extraDay: 6500 },
  },
  'Destiny': {
    'Double Sharing': { earlyBird: 55000, phase1: 60500, phase2: 63900, extraDay: 7000  },
    'Triple Sharing': { earlyBird: 47500, phase1: 52000, phase2: 55000, extraDay: 4500  },
    'Private Room':   { earlyBird: 81900, phase1: 90000, phase2: 95000, extraDay: 12000 },
  },
  'Ourem Palace': {
    'Double Sharing': { earlyBird: 44500, phase1: 49000, phase2: 51900, extraDay: 3500 },
    'Triple Sharing': { earlyBird: 36000, phase1: 39900, phase2: 41500, extraDay: 2100 },
    'Private Room':   { earlyBird: 58900, phase1: 64500, phase2: 68500, extraDay: 6000 },
  },
  'Teraria': {
    'Double Sharing': { earlyBird: 32000, phase1: 33500, phase2: 37500, extraDay: 3000 },
    'Triple Sharing': { earlyBird: 29500, phase1: 32500, phase2: 34000, extraDay: 1500 },
    'Private Room':   { earlyBird: 45100, phase1: 49500, phase2: 52500, extraDay: 4500 },
  },
  'Festival Access': {
    '3-Day Pass':        { earlyBird: 15500, phase1: 18500, phase2: 21000, extraDay: 0 },
    'Day Pass · 27 Nov': { earlyBird: 5500,  phase1: 6500,  phase2: 7500,  extraDay: 0 },
    'Day Pass · 28 Nov': { earlyBird: 5500,  phase1: 6500,  phase2: 7500,  extraDay: 0 },
    'Day Pass · 29 Nov': { earlyBird: 5500,  phase1: 6500,  phase2: 7500,  extraDay: 0 },
  },
};

// GST rate applied to all accommodation bookings
const GST_RATE = 0.05;

// Food add-on: brunch + dinner, 3 days × ₹1000/day per person
const FOOD_PRICE_TOTAL = 3600;

// Helper: get per-person price for a given phase
function getPrice(venue, roomType, phase) {
  const tiers = PRICING[venue]?.[roomType];
  if (!tiers) return 0;
  return tiers[phase] ?? tiers.phase2;
}

// Venue → room types (computed from INVENTORY so new entries auto-appear)
const VENUE_ROOMS = {};
for (const item of INVENTORY) {
  if (!VENUE_ROOMS[item.venue]) VENUE_ROOMS[item.venue] = [];
  if (!VENUE_ROOMS[item.venue].includes(item.room_type)) VENUE_ROOMS[item.venue].push(item.room_type);
}

// Venues where all room types share a combined room pool
const COMBINED_CAPACITY = {
  'Marron · Sea View': 11,
  'Marron · Garden':   11,
  'Destiny':           5,
  'Teraria':           5,
  'Ourem Palace':      14,
};


// ── Count used beds/rooms by status and gender ────────────────────────────────
// Separates full-room bookings (guest_count >= room_size → may be mixed gender, own room)
// from partial bookings (share with strangers → must be same gender).
function getUsed(db, venue, room_type, unit, room_size) {
  if (unit === 'beds') {
    const paid    = db.prepare(`SELECT COALESCE(SUM(b.guest_count),0) as n FROM bookings b WHERE b.venue=? AND b.room_type=? AND b.status='paid'`).get(venue, room_type).n;
    const pending = db.prepare(`SELECT COALESCE(SUM(b.guest_count),0) as n FROM bookings b WHERE b.venue=? AND b.room_type=? AND b.status IN ('pending','upi_pending')`).get(venue, room_type).n;

    const fullRooms = room_size
      ? db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status IN ('paid','pending','upi_pending') AND guest_count >= ?`).get(venue, room_type, room_size).n
      : 0;

    // All beds for display
    const maleBeds   = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Male'`).get(venue, room_type).n;
    const femaleBeds = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Female'`).get(venue, room_type).n;

    // Partial-only beds (share with strangers — these are the ones that consume gender-segregated space)
    const partialMaleBeds = room_size
      ? db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND b.guest_count < ? AND g.gender='Male'`).get(venue, room_type, room_size).n
      : maleBeds;
    const partialFemaleBeds = room_size
      ? db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND b.guest_count < ? AND g.gender='Female'`).get(venue, room_type, room_size).n
      : femaleBeds;

    return { paid, pending, total: paid + pending, fullRooms, maleBeds, femaleBeds, partialMaleBeds, partialFemaleBeds };
  } else {
    if (COMBINED_CAPACITY[venue] !== undefined) {
      const paid    = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND status='paid'`).get(venue).n;
      const pending = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND status IN ('pending','upi_pending')`).get(venue).n;
      const venueItems = INVENTORY.filter(i => i.venue === venue);
      let fullPaid = 0, partialPaid = 0;
      for (const vi of venueItems) {
        if (!vi.room_size || vi.room_size === 1) {
          fullPaid += db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid'`).get(venue, vi.room_type).n;
        } else {
          fullPaid    += db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid' AND guest_count >= ?`).get(venue, vi.room_type, vi.room_size).n;
          partialPaid += db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid' AND guest_count < ?`).get(venue, vi.room_type, vi.room_size).n;
        }
      }
      const maleBeds   = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Male'`).get(venue).n;
      const femaleBeds = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Female'`).get(venue).n;
      return { paid, pending, total: paid + pending, fullRooms: fullPaid, partialRooms: partialPaid, maleBeds, femaleBeds, partialMaleBeds: maleBeds, partialFemaleBeds: femaleBeds };
    }
    const paid    = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid'`).get(venue, room_type).n;
    const pending = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status IN ('pending','upi_pending')`).get(venue, room_type).n;
    const fullPaid    = room_size && room_size > 1 ? db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid' AND guest_count >= ?`).get(venue, room_type, room_size).n : paid;
    const partialPaid = room_size && room_size > 1 ? db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid' AND guest_count < ?`).get(venue, room_type, room_size).n : 0;
    const maleBeds   = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Male'`).get(venue, room_type).n;
    const femaleBeds = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Female'`).get(venue, room_type).n;
    return { paid, pending, total: paid + pending, fullRooms: fullPaid, partialRooms: partialPaid, maleBeds, femaleBeds, partialMaleBeds: maleBeds, partialFemaleBeds: femaleBeds };
  }
}

// ── Helper: rooms consumed by private bookings at a combined venue ────────────
function privateRoomsUsed(db, venue) {
  const venueItems = INVENTORY.filter(i => i.venue === venue && i.room_size === 1);
  let count = 0;
  for (const vi of venueItems) {
    count += db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status IN ('paid','pending','upi_pending')`).get(venue, vi.room_type).n;
  }
  return count;
}

// ── Helper: physical rooms consumed by DS bookings at a combined venue ────────
// Full-room bookings (guest_count >= room_size) occupy exactly 1 room each regardless of gender mix.
// Partial bookings share with same-gender strangers — counted separately per gender.
function dsRoomsUsed(db, venue, room_type, room_size) {
  // All beds for display purposes
  const maleBeds   = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Male'`).get(venue, room_type).n;
  const femaleBeds = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND g.gender='Female'`).get(venue, room_type).n;

  // Full-room bookings — 1 physical room each (may be mixed gender, own room)
  const fullRoomBookings = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status IN ('paid','pending','upi_pending') AND guest_count >= ?`).get(venue, room_type, room_size).n;

  // Partial booking beds only — these consume gender-segregated space
  const partialMaleBeds   = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND b.guest_count < ? AND g.gender='Male'`).get(venue, room_type, room_size).n;
  const partialFemaleBeds = db.prepare(`SELECT COUNT(*) as n FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE b.venue=? AND b.room_type=? AND b.status IN ('paid','pending','upi_pending') AND b.guest_count < ? AND g.gender='Female'`).get(venue, room_type, room_size).n;

  const partialMaleRooms   = Math.ceil(partialMaleBeds / room_size);
  const partialFemaleRooms = Math.ceil(partialFemaleBeds / room_size);
  const totalRooms = fullRoomBookings + partialMaleRooms + partialFemaleRooms;

  return { maleBeds, femaleBeds, partialMaleBeds, partialFemaleBeds, fullRoomBookings, partialMaleRooms, partialFemaleRooms, totalRooms };
}

// ── Main availability check ───────────────────────────────────────────────────
// guests = [{ gender: 'Male'|'Female'|'' }, ...]
function checkAvailability(db, venue, room_type, guestCount, guests = []) {
  const config = INVENTORY.find(i => i.venue === venue && i.room_type === room_type);
  if (!config) return { available: false, reason: `Unknown venue or room type: ${venue} · ${room_type}` };

  const newMales   = guests.filter(g => g.gender === 'Male').length;
  const newFemales = guests.filter(g => g.gender === 'Female').length;
  const newUnknown = guestCount - newMales - newFemales;
  const isFullRoom = config.room_size && guestCount >= config.room_size;

  // Any guest with an unrecognised gender blocks gender-restricted rooms
  if (newUnknown > 0 && config.gender_rule !== 'any') {
    return { available: false, reason: `All guests must have a valid gender (Male or Female) for ${venue} ${room_type}.` };
  }

  // Female-only check (universal)
  if (config.gender_rule === 'female_only' && newMales > 0) {
    return { available: false, reason: `${venue} ${room_type} is for females only.` };
  }

  // ── Combined-capacity venues (Destiny, Teraria, Ourem Palace) ────────────────
  if (COMBINED_CAPACITY[venue] !== undefined) {
    const totalRooms = COMBINED_CAPACITY[venue];
    const privRooms  = privateRoomsUsed(db, venue);

    if (config.room_size === 1) {
      // Booking a private room: need 1 free physical room
      // Count all DS room types at this venue for room consumption
      const dsItems = INVENTORY.filter(i => i.venue === venue && i.room_size > 1);
      let dsTotal = 0;
      for (const di of dsItems) {
        dsTotal += dsRoomsUsed(db, venue, di.room_type, di.room_size).totalRooms;
      }
      if (privRooms + dsTotal + 1 > totalRooms) {
        return { available: false, reason: `${venue} ${room_type} is fully booked.` };
      }
      return { available: true, remaining: totalRooms - privRooms - dsTotal - 1 };
    }

    // Booking a Double Sharing bed
    const roomsAvailForDS = totalRooms - privRooms;
    const { maleBeds, femaleBeds, partialMaleBeds, partialFemaleBeds, fullRoomBookings, totalRooms: usedRooms } = dsRoomsUsed(db, venue, room_type, config.room_size);

    // Same-gender rule for partial (stranger-sharing) bookings
    if (config.gender_rule === 'same_gender' && !isFullRoom) {
      if (newMales > 0 && newFemales > 0) {
        return { available: false, reason: `${venue} ${room_type} requires all guests in a booking to be the same gender when sharing with others. Please make separate bookings for male and female guests, or book the entire room.` };
      }
      const newPartialMale   = partialMaleBeds + newMales;
      const newPartialFemale = partialFemaleBeds + newFemales;
      const roomsNeeded = fullRoomBookings + Math.ceil(newPartialMale / config.room_size) + Math.ceil(newPartialFemale / config.room_size);
      if (roomsNeeded > roomsAvailForDS) {
        const genderLabel = newMales > 0 ? 'male' : 'female';
        const otherGender = newMales > 0 ? 'female' : 'male';
        return { available: false, reason: `Not enough ${genderLabel} beds available in ${venue} ${room_type}. The remaining beds are reserved for ${otherGender} guests.` };
      }
      return { available: true };
    }

    // Full-room booking (couple/group fills the whole room) — needs exactly 1 free room
    if (usedRooms + 1 > roomsAvailForDS) {
      return { available: false, reason: `${venue} ${room_type} is fully booked.` };
    }
    return { available: true };
  }

  // ── Standalone venues (Bhakti Kutir, etc.) ───────────────────────────────────
  const { total, fullRooms, maleBeds, femaleBeds, partialMaleBeds, partialFemaleBeds } = getUsed(db, venue, room_type, config.unit, config.room_size);
  const need = config.unit === 'beds' ? guestCount : 1;
  const remaining = config.capacity - total;

  // Hard capacity cap — never oversell regardless of gender
  if (remaining < need) {
    return {
      available: false,
      reason: config.unit === 'beds'
        ? `Only ${remaining} bed${remaining !== 1 ? 's' : ''} left in ${venue} ${room_type}.`
        : `${venue} ${room_type} is fully booked.`,
    };
  }

  if (config.gender_rule === 'same_gender' && !isFullRoom) {
    if (newMales > 0 && newFemales > 0) {
      return { available: false, reason: `${venue} ${room_type} requires all guests in a booking to be the same gender when sharing with others. Please make separate bookings for male and female guests, or book the entire room.` };
    }
    if (config.unit === 'beds' && config.room_size && config.rooms) {
      // Only count partial-booking beds in gender-room math.
      // Full-room bookings already have their own room; adding them again would double-count.
      const newPartialMale   = partialMaleBeds + newMales;
      const newPartialFemale = partialFemaleBeds + newFemales;
      const roomsNeeded = fullRooms + Math.ceil(newPartialMale / config.room_size) + Math.ceil(newPartialFemale / config.room_size);
      if (roomsNeeded > config.rooms) {
        const genderLabel = newMales > 0 ? 'male' : 'female';
        const otherGender = newMales > 0 ? 'female' : 'male';
        return { available: false, reason: `Not enough ${genderLabel} beds available in ${venue} ${room_type}. The remaining beds are reserved for ${otherGender} guests.` };
      }
    }
  }

  return { available: true, remaining: remaining - need };
}

// ── Inventory stats for dashboard ─────────────────────────────────────────────
function getInventoryStats(db) {
  const seen = new Set();
  const stats = [];

  for (const item of INVENTORY) {
    const key = `${item.venue}::${item.room_type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (item.venue in COMBINED_CAPACITY) {
      const totalRooms = COMBINED_CAPACITY[item.venue];
      const privRooms  = privateRoomsUsed(db, item.venue);

      if (item.room_size === 1) {
        // Private room stats
        const dsItems = INVENTORY.filter(i => i.venue === item.venue && i.room_size > 1);
        let dsTotalRooms = 0;
        for (const di of dsItems) {
          dsTotalRooms += dsRoomsUsed(db, item.venue, di.room_type, di.room_size).totalRooms;
        }
        const available = Math.max(0, totalRooms - privRooms - dsTotalRooms);
        const pct = Math.round(((totalRooms - available) / totalRooms) * 100);
        const paid    = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid'`).get(item.venue, item.room_type).n;
        const pending = db.prepare(`SELECT COUNT(*) as n FROM bookings WHERE venue=? AND room_type=? AND status IN ('pending','upi_pending')`).get(item.venue, item.room_type).n;
        stats.push({ venue: item.venue, room_type: item.room_type, label: item.label, gender_rule: item.gender_rule, room_size: item.room_size, unit: 'rooms', capacity: totalRooms, occupied: privRooms, pending, available, maleBeds: 0, femaleBeds: 0, percent: pct, sold_out: available === 0 });
      } else {
        // Double sharing stats (beds-based within combined pool)
        const roomsAvailForDS = Math.max(0, totalRooms - privRooms);
        const { maleBeds, femaleBeds, totalRooms: dsRoomsCount } = dsRoomsUsed(db, item.venue, item.room_type, item.room_size);
        const bedsUsed = maleBeds + femaleBeds;
        const bedsAvail = Math.max(0, roomsAvailForDS * item.room_size - bedsUsed);
        const pct = Math.round((bedsUsed / (roomsAvailForDS * item.room_size || 1)) * 100);
        const paid    = db.prepare(`SELECT COALESCE(SUM(guest_count),0) as n FROM bookings WHERE venue=? AND room_type=? AND status='paid'`).get(item.venue, item.room_type).n;
        const pending = db.prepare(`SELECT COALESCE(SUM(guest_count),0) as n FROM bookings WHERE venue=? AND room_type=? AND status IN ('pending','upi_pending')`).get(item.venue, item.room_type).n;
        stats.push({ venue: item.venue, room_type: item.room_type, label: item.label, gender_rule: item.gender_rule, room_size: item.room_size, unit: 'beds', capacity: roomsAvailForDS * item.room_size, occupied: paid, pending, available: bedsAvail, maleBeds, femaleBeds, percent: Math.min(100, pct), sold_out: bedsAvail === 0 });
      }
      continue;
    }

    // Standalone venues (Bhakti Kutir, Festival Access, etc.)
    const { paid, pending, total, fullRooms, partialRooms, maleBeds, femaleBeds } = getUsed(db, item.venue, item.room_type, item.unit, item.room_size);
    const available = Math.max(0, item.capacity - total);
    const pct = Math.round((total / item.capacity) * 100);
    stats.push({
      venue: item.venue,
      room_type: item.room_type,
      label: item.label,
      gender_rule: item.gender_rule,
      room_size: item.room_size,
      unit: item.unit,
      capacity: item.capacity,
      occupied: paid,
      fullRooms: fullRooms || 0,
      partialRooms: partialRooms || 0,
      pending,
      available,
      maleBeds,
      femaleBeds,
      percent: Math.min(100, pct),
      sold_out: available === 0,
    });
  }

  return stats;
}

// ── Auto-assign a room number to a booking ────────────────────────────────────
// Works for venues with predefined ROOM_LABELS.
// For same_gender venues (Double Sharing): tries to pair people of the same gender
// in the same room before opening a new one. Private rooms always get their own slot.
function autoAssignRoom(db, bookingId) {
  const booking = db.prepare(`
    SELECT b.venue, b.room_type, b.guest_count,
      GROUP_CONCAT(g.gender) as genders
    FROM bookings b
    LEFT JOIN guests g ON g.booking_id = b.id
    WHERE b.id = ?
    GROUP BY b.id
  `).get(bookingId);
  if (!booking) return;

  const { venue, room_type } = booking;
  const newGuestCount = booking.guest_count || 1;
  const labels = ROOM_LABELS[venue];
  if (!labels) return; // no predefined rooms for this venue

  // Flat label list (combined-capacity venues) or per-type (beds venues)
  const roomList = Array.isArray(labels) ? labels : (labels[room_type] || []);
  if (!roomList.length) return;

  const config = INVENTORY.find(i => i.venue === venue && i.room_type === room_type);
  if (!config) return;

  const isPrivate = config.room_size === 1;
  const roomSize  = config.room_size || 1;
  const sameGender = config.gender_rule === 'same_gender';

  // Build current occupancy using effective room (COALESCE of guest override and booking room)
  const occupied = db.prepare(`
    SELECT COALESCE(g.room_number, b.room_number) as effective_room, b.room_type,
      g.gender
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    WHERE b.venue = ? AND b.status IN ('paid','pending','upi_pending')
      AND COALESCE(g.room_number, b.room_number) IS NOT NULL AND b.id != ?
  `).all(venue, bookingId);

  // Map: label → { count, genders, room_type }
  const roomGuests = {};
  occupied.forEach(row => {
    const lbl = row.effective_room;
    if (!roomList.includes(lbl)) return;
    if (!roomGuests[lbl]) roomGuests[lbl] = { count: 0, genders: [], room_type: row.room_type };
    roomGuests[lbl].count += 1;
    if (row.gender) roomGuests[lbl].genders.push(row.gender);
  });

  const allGenders = booking.genders ? [...new Set(booking.genders.split(',').filter(Boolean))] : [];
  const isMixedGenderBooking = allGenders.length > 1;
  const bookingGender = allGenders.length === 1 ? allGenders[0] : null;

  let assigned = null;

  if (isPrivate) {
    // Need a completely empty room (no other booking of any type)
    assigned = roomList.find(r => !roomGuests[r]);
  } else {
    // Shared room: slot must be empty OR already used by the same room_type
    const compatibleSlot = r => {
      const rm = roomGuests[r];
      if (rm && rm.room_type !== room_type) return false; // slot claimed by different room type
      return true;
    };
    // Double/Triple sharing: prefer a partially-filled room of the right gender
    // Mixed-gender bookings (couples etc.) go to an empty room only — can't share with strangers
    const genderRestricted = config.gender_rule === 'same_gender' || config.gender_rule === 'female_only';
    if (genderRestricted && bookingGender && !isMixedGenderBooking) {
      assigned = roomList.find(r => {
        const rm = roomGuests[r];
        if (!rm) return false;
        if (!compatibleSlot(r)) return false;
        if (rm.count + newGuestCount > roomSize) return false;
        return rm.genders.every(g => g === bookingGender);
      });
    }
    // Fallback: empty compatible room that can fit all guests
    // For same_gender rooms, skip rooms that already contain a different gender
    if (!assigned) assigned = roomList.find(r => {
      if (!compatibleSlot(r)) return false;
      const rm = roomGuests[r];
      if (sameGender && rm && rm.genders.length > 0 && bookingGender && !isMixedGenderBooking) {
        if (!rm.genders.every(g => g === bookingGender)) return false;
      }
      const occupancy = rm ? rm.count : 0;
      return occupancy + newGuestCount <= roomSize;
    });
  }

  if (assigned) {
    db.prepare('UPDATE bookings SET room_number = ? WHERE id = ?').run(assigned, bookingId);
    return assigned;
  }
  return null;
}

// Apply any persisted label overrides from the DB on startup
function applyStoredLabelOverrides() {
  try {
    const { db } = require('./db');
    const rows = db.prepare('SELECT venue, old_label, new_label FROM room_label_overrides').all();
    for (const { venue, old_label, new_label } of rows) {
      const section = ROOM_LABELS[venue];
      if (!section) continue;
      if (Array.isArray(section)) {
        const i = section.indexOf(old_label);
        if (i !== -1) section[i] = new_label;
      } else {
        for (const rt of Object.keys(section)) {
          const arr = section[rt];
          const i = arr.indexOf(old_label);
          if (i !== -1) { arr[i] = new_label; break; }
        }
      }
    }
  } catch (e) { /* db may not be ready yet */ }
}
applyStoredLabelOverrides();

function renameRoomLabel(venue, oldLabel, newLabel) {
  const { db } = require('./db');

  // Update in-memory ROOM_LABELS
  const section = ROOM_LABELS[venue];
  if (section) {
    if (Array.isArray(section)) {
      const i = section.indexOf(oldLabel);
      if (i !== -1) section[i] = newLabel;
    } else {
      for (const rt of Object.keys(section)) {
        const arr = section[rt];
        const i = arr.indexOf(oldLabel);
        if (i !== -1) { arr[i] = newLabel; break; }
      }
    }
  }

  // Persist override (upsert)
  db.prepare(`
    INSERT INTO room_label_overrides (venue, old_label, new_label) VALUES (?, ?, ?)
    ON CONFLICT(venue, old_label) DO UPDATE SET new_label = excluded.new_label
  `).run(venue, oldLabel, newLabel);

  // Update all bookings and guests that have the old label
  db.prepare(`UPDATE bookings SET room_number = ? WHERE room_number = ? AND venue = ?`).run(newLabel, oldLabel, venue);
  db.prepare(`UPDATE guests SET room_number = ? WHERE room_number = ?`).run(newLabel, oldLabel);
}

// ── Server-side price validation ──────────────────────────────────────────────
// Recomputes expected total_price from config and compares against submitted value.
// Returns { valid: true } or { valid: false, expected, submitted, reason }.
// Allow ±1 rupee tolerance for rounding edge cases.
function validateBookingPrice({ venue, room_type, guest_count, addons, discount, total_price }, phase) {
  // Normalise room_type (admin UI may send display label)
  const rt = room_type === 'Triple Sharing (Special)' ? 'Triple Sharing' : room_type;

  const pricing = PRICING[venue]?.[rt];
  if (!pricing) {
    // Festival Access passes or unknown venue — skip validation
    return { valid: true, skipped: true };
  }

  const perPerson = pricing[phase] ?? pricing.phase2;
  const accomBase = perPerson * (guest_count || 1);

  const addonTotal = (addons || '').split('|').filter(Boolean).reduce((s, a) => {
    const ci = a.indexOf(':');
    return s + (ci >= 0 ? parseInt(a.slice(0, ci), 10) || 0 : 0);
  }, 0);

  const disc = parseInt(String(discount || '0').replace(/[^\d]/g, ''), 10) || 0;
  const net = accomBase - disc + addonTotal;
  const submitted = parseInt(String(total_price || '0').replace(/[^\d]/g, ''), 10) || 0;

  if (Math.abs(submitted - net) > 1) {
    return { valid: false, expected: net, submitted,
      reason: `Price mismatch: expected ₹${net.toLocaleString('en-IN')} (${phase}), got ₹${submitted.toLocaleString('en-IN')}` };
  }
  return { valid: true };
}

module.exports = { checkAvailability, getInventoryStats, autoAssignRoom, INVENTORY, ROOM_LABELS, PRICING, VENUE_ROOMS, getPrice, FOOD_PRICE_TOTAL, GST_RATE, renameRoomLabel, validateBookingPrice };
