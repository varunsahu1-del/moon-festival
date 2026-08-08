const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new DatabaseSync(path.join(dataDir, 'moonfestival.db'));

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref         TEXT UNIQUE,
    venue               TEXT NOT NULL,
    room_type           TEXT NOT NULL,
    total_price         TEXT NOT NULL,
    guest_count         INTEGER NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'pending',
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    gst_number          TEXT,
    gst_name            TEXT,
    email_sent          INTEGER DEFAULT 0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at             DATETIME
  );

  CREATE TABLE IF NOT EXISTS guests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    guest_number INTEGER NOT NULL,
    full_name    TEXT NOT NULL,
    whatsapp     TEXT NOT NULL,
    email        TEXT NOT NULL,
    city         TEXT NOT NULL,
    age          INTEGER NOT NULL,
    gender       TEXT
  );
`);

// Migrate existing DBs — add columns if they don't exist yet
const existingBookingCols = db.prepare("PRAGMA table_info(bookings)").all().map(r => r.name);
if (!existingBookingCols.includes('gst_number'))  db.exec("ALTER TABLE bookings ADD COLUMN gst_number TEXT");
if (!existingBookingCols.includes('gst_name'))    db.exec("ALTER TABLE bookings ADD COLUMN gst_name TEXT");
if (!existingBookingCols.includes('email_sent'))  db.exec("ALTER TABLE bookings ADD COLUMN email_sent INTEGER DEFAULT 0");
if (!existingBookingCols.includes('addons'))        db.exec("ALTER TABLE bookings ADD COLUMN addons TEXT");
if (!existingBookingCols.includes('payment_method')) db.exec("ALTER TABLE bookings ADD COLUMN payment_method TEXT DEFAULT 'razorpay'");
if (!existingBookingCols.includes('upi_screenshot')) db.exec("ALTER TABLE bookings ADD COLUMN upi_screenshot TEXT");
if (!existingBookingCols.includes('arrival_date'))   db.exec("ALTER TABLE bookings ADD COLUMN arrival_date TEXT");
if (!existingBookingCols.includes('organizer_note')) db.exec("ALTER TABLE bookings ADD COLUMN organizer_note TEXT");
if (!existingBookingCols.includes('addons_collected')) db.exec("ALTER TABLE bookings ADD COLUMN addons_collected INTEGER DEFAULT 0");
if (!existingBookingCols.includes('payment_link_url')) db.exec("ALTER TABLE bookings ADD COLUMN payment_link_url TEXT");
if (!existingBookingCols.includes('extra_addons')) db.exec("ALTER TABLE bookings ADD COLUMN extra_addons TEXT");
if (!existingBookingCols.includes('addons_collection_method')) db.exec("ALTER TABLE bookings ADD COLUMN addons_collection_method TEXT");
if (!existingBookingCols.includes('addons_collected_at')) db.exec("ALTER TABLE bookings ADD COLUMN addons_collected_at TEXT");
if (!existingBookingCols.includes('deleted_at')) db.exec("ALTER TABLE bookings ADD COLUMN deleted_at TEXT");
if (!existingBookingCols.includes('transfer_email_pending')) db.exec("ALTER TABLE bookings ADD COLUMN transfer_email_pending INTEGER DEFAULT 0");
if (!existingBookingCols.includes('discount')) db.exec("ALTER TABLE bookings ADD COLUMN discount INTEGER DEFAULT 0");
if (!existingBookingCols.includes('discount_reason')) db.exec("ALTER TABLE bookings ADD COLUMN discount_reason TEXT");
if (!existingBookingCols.includes('phase')) db.exec("ALTER TABLE bookings ADD COLUMN phase TEXT");
if (!existingBookingCols.includes('source')) db.exec("ALTER TABLE bookings ADD COLUMN source TEXT DEFAULT 'public'");

// Backfill phase for any existing bookings that don't have it set yet.
// All bookings created before the phase-tracking fix are Early Bird (Aug 2026 window).
db.exec("UPDATE bookings SET phase = 'earlyBird' WHERE phase IS NULL AND deleted_at IS NULL");

db.exec(`CREATE TABLE IF NOT EXISTS addon_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS booking_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)`);


const existingGuestCols = db.prepare("PRAGMA table_info(guests)").all().map(r => r.name);
if (!existingGuestCols.includes('address')) db.exec("ALTER TABLE guests ADD COLUMN address TEXT");
if (!existingGuestCols.includes('state'))   db.exec("ALTER TABLE guests ADD COLUMN state TEXT");
if (!existingGuestCols.includes('pin'))     db.exec("ALTER TABLE guests ADD COLUMN pin TEXT");

// Make city and age nullable if they aren't already
try { db.exec("ALTER TABLE guests ADD COLUMN _tmp TEXT"); db.exec("ALTER TABLE guests DROP COLUMN _tmp"); } catch(_) {}
const guestCityInfo = db.prepare("PRAGMA table_info(guests)").all().find(r => r.name === 'city');
if (guestCityInfo && guestCityInfo.notnull) {
  const guestColNames = db.prepare("PRAGMA table_info(guests)").all().map(r => r.name).join(', ');
  db.exec(`
    CREATE TABLE IF NOT EXISTS guests_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      guest_number INTEGER NOT NULL,
      full_name    TEXT NOT NULL,
      whatsapp     TEXT NOT NULL,
      email        TEXT NOT NULL,
      city         TEXT,
      age          INTEGER,
      gender       TEXT,
      address      TEXT,
      state        TEXT,
      pin          TEXT
    );
    INSERT INTO guests_new (${guestColNames}) SELECT ${guestColNames} FROM guests;
    DROP TABLE guests;
    ALTER TABLE guests_new RENAME TO guests;
  `);
}

const existingGuestCols2 = db.prepare("PRAGMA table_info(guests)").all().map(r => r.name);
if (!existingGuestCols2.includes('gender'))      db.exec("ALTER TABLE guests ADD COLUMN gender TEXT");
if (!existingGuestCols2.includes('room_number')) db.exec("ALTER TABLE guests ADD COLUMN room_number TEXT");
if (!existingGuestCols2.includes('notes'))       db.exec("ALTER TABLE guests ADD COLUMN notes TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    form_type    TEXT NOT NULL,
    form_label   TEXT NOT NULL,
    applicant    TEXT,
    email        TEXT,
    whatsapp     TEXT,
    fields_json  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'new',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS room_label_overrides (
    venue     TEXT NOT NULL,
    old_label TEXT NOT NULL,
    new_label TEXT NOT NULL,
    PRIMARY KEY (venue, old_label)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS room_hotel_numbers (
    venue        TEXT NOT NULL,
    label        TEXT NOT NULL,
    hotel_number TEXT NOT NULL,
    PRIMARY KEY (venue, label)
  );
`);

function nextRef() {
  const row = db.prepare('SELECT COUNT(*) as c FROM bookings').get();
  return 'MF-' + String(row.c + 1).padStart(4, '0');
}

module.exports = { db, nextRef };
