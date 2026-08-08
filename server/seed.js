// Run: node server/seed.js
// Clears all bookings/guests and inserts clean test data covering every venue/scenario
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db } = require('./db');

db.exec('DELETE FROM guests');
db.exec('DELETE FROM bookings');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('bookings','guests')");

const ins = db.prepare(`
  INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number, paid_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);
const insG = db.prepare(`
  INSERT INTO guests (booking_id, guest_number, full_name, whatsapp, email, city, age, gender)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function booking(ref, venue, rt, price, guests, status, room) {
  const { lastInsertRowid } = ins.run(ref, venue, rt, price, guests.length, status, room);
  guests.forEach((g, i) => insG.run(lastInsertRowid, i+1, g.n, g.w, g.e, g.c, g.a, g.g));
}

const G = (n, g='Female') => ({ n, g, w:'+91 98201 ' + Math.floor(10000+Math.random()*90000), e: n.toLowerCase().replace(' ','.')+`@gmail.com`, c:'Mumbai', a: 24+Math.floor(Math.random()*12) });
const M = (n) => G(n, 'Male');
const F = (n) => G(n, 'Female');

// ── Bhakti Kutir Double Sharing (beds, same_gender) ─────────────────────────
booking('MF-0001','Bhakti Kutir','Double Sharing','₹50,000',  [F('Priya Sharma'), F('Kavya Nair')],  'paid',    'BK-D01');
booking('MF-0002','Bhakti Kutir','Double Sharing','₹50,000',  [M('Rahul Mehta'),  M('Arjun Singh')], 'paid',    'BK-D02');
booking('MF-0003','Bhakti Kutir','Double Sharing','₹25,000',  [F('Sneha Joshi')],                    'paid',    'BK-D03');
// BK-D03 has 1 of 2 beds occupied — second bed open

// ── Bhakti Kutir Triple Sharing (beds, same_gender) ─────────────────────────
booking('MF-0004','Bhakti Kutir','Triple Sharing','₹63,000',  [F('Meera Patel'), F('Riya Desai'), F('Pooja Kumar')], 'paid', 'BK-T01');
booking('MF-0005','Bhakti Kutir','Triple Sharing','₹21,000',  [M('Rohan Verma')],                                   'pending','BK-T02');

// ── Destiny (combined capacity, 5 rooms) ────────────────────────────────────
booking('MF-0006','Destiny','Double Sharing','₹64,000',  [F('Deepika Menon'), F('Aisha Khan')], 'paid',    'D-1');
booking('MF-0007','Destiny','Private Room',  '₹45,000',  [M('Kabir Malhotra')],                'paid',    'D-2');

// ── Teraria (combined, 5 rooms) ──────────────────────────────────────────────
booking('MF-0008','Teraria','Double Sharing','₹67,000',  [M('Ishaan Kapoor'), M('Nikhil Sharma')], 'paid',    'T-1');
booking('MF-0009','Teraria','Private Room',  '₹49,000',  [F('Nidhi Gupta')],                      'pending', 'T-2');

// ── Lala Land (combined, 10 rooms) ───────────────────────────────────────────
booking('MF-0010','Lala Land','Private Room',  '₹42,000',  [M('Varun Sahu')],                   'paid',    'LL-01');
booking('MF-0011','Lala Land','Double Sharing','₹56,000',  [F('Zara Ahmed'), F('Tara Mehta')],  'paid',    'LL-02');

// ── Ourem Palace (combined, 10 rooms) ────────────────────────────────────────
booking('MF-0012','Ourem Palace','Double Sharing','₹60,000', [M('Sanjay Iyer'), M('Karan Patel')], 'paid',    'OP-01');
booking('MF-0013','Ourem Palace','Private Room',  '₹48,000', [F('Ananya Roy')],                   'paid',    'OP-02');
booking('MF-0014','Ourem Palace','Private Room',  '₹48,000', [M('Dev Khanna')],                   'pending', 'OP-03');

// ── Dormitory ────────────────────────────────────────────────────────────────
booking('MF-0015','Dormitory','4 Bed Female Dorm',  '₹36,000', [F('Shruti Kaur'),  F('Divya Nair')],                           'paid',    'DORM-F4');
booking('MF-0016','Dormitory','6 Bed Mixed Dorm',   '₹48,000', [M('Amit Tiwari'), M('Dev Malhotra'), M('Raj Kumar')],          'paid',    'DORM-M6');
booking('MF-0017','Dormitory','10 Bed Female Dorm', '₹56,000', [F('Pallavi Singh'), F('Rhea Pillai'), F('Natasha Verma'), F('Simran Bedi')], 'paid', 'DORM-F10');

// ── Festival Access ───────────────────────────────────────────────────────────
booking('MF-0018','Festival Access','3-Day Pass',        '₹5,500',  [M('Aarav Gupta')],   'paid',    null);
booking('MF-0019','Festival Access','3-Day Pass',        '₹5,500',  [F('Kavita Sharma')], 'paid',    null);
booking('MF-0020','Festival Access','3-Day Pass',        '₹5,500',  [M('Ravi Nair')],     'pending', null);
booking('MF-0021','Festival Access','Day Pass · 27 Nov', '₹2,500',  [F('Lisa Fernandes')],'paid',    null);
booking('MF-0022','Festival Access','Day Pass · 28 Nov', '₹2,500',  [M('Sam D\'Souza')],  'paid',    null);

console.log('✓ Seed complete — 22 bookings across all venues');
process.exit(0);
