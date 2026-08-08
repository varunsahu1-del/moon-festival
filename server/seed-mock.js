/**
 * Mock seed — near-sold-out scenario
 * Run: node seed-mock.js
 * Clears all bookings and guests, then seeds realistic almost-full inventory.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '../data/moonfestival.db'));

// ── Clear ─────────────────────────────────────────────────────────────────────
db.exec('DELETE FROM guests; DELETE FROM bookings;');
console.log('Cleared all bookings and guests.\n');

// ── Helpers ───────────────────────────────────────────────────────────────────
let id = 0;
const names = {
  M: ['Arjun Mehta','Rohan Sharma','Kabir Nair','Vikram Iyer','Siddharth Rao',
      'Aditya Kumar','Nikhil Verma','Rahul Gupta','Karan Singh','Dev Patel',
      'Ishaan Joshi','Tarun Das','Ankit Bose','Varun Sahu','Manav Pillai',
      'Rishi Chandra','Sameer Ahuja','Akash Reddy','Neil Shah','Pranav Menon',
      'Gaurav Tiwari','Harsh Sinha','Abhishek Malhotra'],
  F: ['Priya Sharma','Ananya Nair','Meera Iyer','Kavya Pillai','Rhea Kapoor',
      'Divya Menon','Anika Rao','Sana Qureshi','Tara Bose','Isha Verma',
      'Neha Joshi','Simran Kaur','Pooja Gupta','Aditi Das','Riya Patel',
      'Kritika Sinha','Mahi Reddy','Natasha Shah','Shreya Kumar','Avni Singh'],
};
let mIdx = 0, fIdx = 0;
const nm = g => g === 'Male' ? names.M[mIdx++ % names.M.length] : names.F[fIdx++ % names.F.length];
const ph = () => '+91 ' + (9000000000 + Math.floor(Math.random() * 999999999)).toString().replace(/(\d{5})(\d{5})/, '$1 $2');

function book(venue, roomType, guests, status = 'paid') {
  id++;
  const ref = `MF-${String(id).padStart(4, '0')}`;
  db.prepare(`
    INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, arrival_date)
    VALUES (?, ?, ?, ?, ?, ?, '27 Nov')
  `).run(ref, venue, roomType, 29900 * guests.length, guests.length, status);
  const bookingId = db.prepare('SELECT last_insert_rowid() as id').get().id;
  guests.forEach((g, i) => {
    db.prepare(`
      INSERT INTO guests (booking_id, guest_number, full_name, whatsapp, email, gender)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(bookingId, i + 1, nm(g), ph(), 'guest@example.com', g);
  });
  return ref;
}

// ── Bhakti Kutir — Double Sharing (24 beds, 12 rooms×2, same_gender) ──────────
// Leave 1 male bed: 11 full male rooms + 1 partial male room = 23 beds
console.log('Bhakti Kutir — Double Sharing');
for (let i = 0; i < 11; i++) book('Bhakti Kutir', 'Double Sharing', ['Male', 'Male']);
book('Bhakti Kutir', 'Double Sharing', ['Male']); // 1 male in last room → 1 male bed remains
console.log('  → 23/24 beds used · 1 male bed left\n');

// ── Bhakti Kutir — Triple Sharing (24 beds, 8 rooms×3, same_gender) ───────────
// Leave 1 female bed: 7 full female rooms + 1 partial female room (2F) = 23 beds
console.log('Bhakti Kutir — Triple Sharing');
for (let i = 0; i < 7; i++) book('Bhakti Kutir', 'Triple Sharing', ['Female', 'Female', 'Female']);
book('Bhakti Kutir', 'Triple Sharing', ['Female', 'Female']); // 2 females in last room → 1 female bed remains
console.log('  → 23/24 beds used · 1 female bed left\n');

// ── Bhakti Kutir — Single Room (4 rooms, any) ─────────────────────────────────
// Leave 1 room: 3 booked
console.log('Bhakti Kutir — Single Room');
book('Bhakti Kutir', 'Single Room', ['Male']);
book('Bhakti Kutir', 'Single Room', ['Female']);
book('Bhakti Kutir', 'Single Room', ['Male']);
console.log('  → 3/4 rooms used · 1 room left\n');

// ── Bhakti Kutir — 4 Bed Dorm (4 beds, female_only) ──────────────────────────
// Leave 1 female bed
console.log('Bhakti Kutir — 4 Bed Dorm');
book('Bhakti Kutir', '4 Bed Dorm', ['Female', 'Female', 'Female']);
console.log('  → 3/4 beds used · 1 female bed left\n');

// ── Bhakti Kutir — 6 Bed Dorm (6 beds, any) ──────────────────────────────────
// Leave 1 bed: 5 booked
console.log('Bhakti Kutir — 6 Bed Dorm');
book('Bhakti Kutir', '6 Bed Dorm', ['Male', 'Male', 'Male']);
book('Bhakti Kutir', '6 Bed Dorm', ['Female', 'Female']);
console.log('  → 5/6 beds used · 1 bed left\n');

// ── Destiny (5 rooms combined — DS + Private) ─────────────────────────────────
// 4 private rooms + 1 partial male DS = 5 rooms (full)
// Private: sold out. DS: 1 male bed left (female DS = no room available).
console.log('Destiny');
book('Destiny', 'Private Room', ['Male']);
book('Destiny', 'Private Room', ['Female']);
book('Destiny', 'Private Room', ['Male']);
book('Destiny', 'Private Room', ['Female']);
book('Destiny', 'Double Sharing', ['Male']); // 1 male in DS room → 1 male DS bed remains
console.log('  → 5/5 rooms used · DS: 1 male bed left · Private: sold out\n');

// ── Teraria (5 rooms DS, same_gender) ────────────────────────────────────────
// 4 full male rooms + 1 partial female room = 5 rooms (full)
// Men: sold out. Women: 1 bed left.
console.log('Teraria');
for (let i = 0; i < 4; i++) book('Teraria', 'Double Sharing', ['Male', 'Male']);
book('Teraria', 'Double Sharing', ['Female']); // 1 female in last room → 1 female bed remains
console.log('  → 5/5 rooms used · Men: sold out · Women: 1 bed left\n');

// ── Ourem Palace (10 rooms combined — DS + Private) ───────────────────────────
// 9 private rooms + 1 partial male DS = 10 rooms (full)
// Private: sold out. DS: 1 male bed left.
console.log('Ourem Palace');
for (let i = 0; i < 9; i++) {
  const g = i % 2 === 0 ? 'Male' : 'Female';
  book('Ourem Palace', 'Private Room', [g]);
}
book('Ourem Palace', 'Double Sharing', ['Male']); // 1 male in DS room → 1 male DS bed remains
console.log('  → 10/10 rooms used · DS: 1 male bed left · Private: sold out\n');

console.log(`─────────────────────────────`);
console.log(`Seeded ${id} bookings. Run the server and check tickets.html.\n`);
