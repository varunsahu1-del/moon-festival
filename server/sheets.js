const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = '1yNFa9GphvXZbUEhqXQUAcDGU1MJq3yNGchdSdwh1RX4';
const KEY_PATH = path.join(__dirname, 'sheets-key.json');

// Matches admin panel BOOKING_COLS order (excluding UI-only cols like chk, screenshot, mail)
const HEADERS = [
  'Name', 'Date', 'Booking Ref', 'Status', 'Payment Method',
  'Venue', 'Room Type', 'System Room No.', 'Hotel Room No.', 'Arrival',
  'Room Cost', 'Add-ons', 'Discount', 'GST 5%', 'Final Total',
  'Guest Note', 'Organizer Note',
  'WhatsApp', 'City', 'Gender', 'Age', 'Email', 'Phase',
  // Guest 2 (for double/triple bookings)
  'Guest 2 Name', 'Guest 2 WhatsApp', 'Guest 2 City', 'Guest 2 Gender', 'Guest 2 Age', 'Guest 2 Email', 'Guest 2 Note',
  'GST Number', 'GST Name', 'Guest Count'
];

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
}

function formatPhase(p) {
  if (!p) return '';
  return p.replace('earlyBird', 'Early Bird').replace('phase1', 'Phase 1').replace('phase2', 'Phase 2');
}

function formatAddons(addons) {
  if (!addons) return '';
  return addons.split('|').map(a => {
    const parts = a.split(':');
    return parts.slice(1).join(':').trim();
  }).filter(Boolean).join('; ');
}

function formatStatus(s) {
  if (!s) return '';
  if (s === 'paid') return 'Paid';
  if (s === 'pending') return 'Pending';
  if (s === 'upi_pending') return 'UPI Pending';
  if (s === 'expired') return 'Expired';
  return s;
}

function bookingToRow(booking, guests) {
  const g1 = guests && guests[0];
  const g2 = guests && guests[1];

  const row = [
    g1 ? (g1.full_name || '') : '',
    booking.created_at || '',
    booking.booking_ref || '',
    formatStatus(booking.status),
    booking.payment_method || '',
    booking.venue || '',
    booking.room_type || '',
    booking.room_number || '',
    booking.property_room_number || '',
    booking.arrival_date || '',
    booking.total_price || '',
    formatAddons(booking.addons),
    booking.discount || '',
    '',  // GST 5% — calculated field, left blank
    booking.total_price || '',  // Final Total = total_price (already incl GST)
    g1 ? (g1.notes || '') : '',   // Guest Note
    booking.organizer_note || '', // Organizer Note (separate!)
    g1 ? (g1.whatsapp || '') : '',
    g1 ? (g1.city || '') : '',
    g1 ? (g1.gender || '') : '',
    g1 ? (g1.age || '') : '',
    g1 ? (g1.email || '') : '',
    formatPhase(booking.phase),
    // Guest 2
    g2 ? (g2.full_name || '') : '',
    g2 ? (g2.whatsapp || '') : '',
    g2 ? (g2.city || '') : '',
    g2 ? (g2.gender || '') : '',
    g2 ? (g2.age || '') : '',
    g2 ? (g2.email || '') : '',
    g2 ? (g2.notes || '') : '',
    booking.gst_number || '',
    booking.gst_name || '',
    booking.guest_count || '',
  ];
  return row;
}

async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Untitled!A1:A1' });
  const existing = res.data.values;
  if (!existing || !existing[0] || existing[0][0] !== 'Name') {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Untitled!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

async function appendBookingRow(booking, guests) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureHeader(sheets);
    const row = bookingToRow(booking, guests);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Untitled!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    console.log('[sheets] appended row for', booking.booking_ref);
  } catch (err) {
    console.error('[sheets] failed to append row:', err.message);
  }
}

async function syncAllBookings(db) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'Untitled' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Untitled!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    const bookings = db.prepare('SELECT * FROM bookings WHERE deleted_at IS NULL ORDER BY id ASC').all();
    const rows = bookings.map(b => {
      const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY id ASC').all(b.id);
      return bookingToRow(b, guests);
    });
    if (rows.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Untitled!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      });
    }
    console.log('[sheets] full sync complete —', rows.length, 'bookings');
  } catch (err) {
    console.error('[sheets] full sync failed:', err.message);
  }
}

// Find the row number for a booking_ref (returns 1-based row index, or null if not found)
async function findRowByRef(sheets, bookingRef) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Untitled!C:C', // Booking Ref is column C
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === bookingRef) return i + 1; // 1-based
  }
  return null;
}

async function updateBookingRow(booking, guests) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const rowNum = await findRowByRef(sheets, booking.booking_ref);
    if (!rowNum) {
      // Not in sheet yet — append instead
      await appendBookingRow(booking, guests);
      return;
    }
    const row = bookingToRow(booking, guests);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Untitled!A${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
    console.log('[sheets] updated row for', booking.booking_ref);
  } catch (err) {
    console.error('[sheets] failed to update row:', err.message);
  }
}

// ── Applications sheet (tab: "Applications") ──────────────────────────────

const APP_TAB = 'Applications';
const APP_HEADERS = [
  'ID', 'Submitted At', 'Form Type', 'Applicant', 'Email', 'WhatsApp', 'Status',
  'Location', 'Offer Type', 'About', 'Video 1', 'Video 2', 'Video 3', 'Photo Link',
  // performance-specific
  'Performance Type', 'Genre', 'Set Length',
  // retail-specific
  'Brand Name', 'Product Type',
  // volunteer-specific
  'Skills', 'Availability',
  // installation-specific
  'Installation Type', 'Space Needed',
];

async function ensureAppTab(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === APP_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: APP_TAB } } }] },
    });
  }
}

function appToRow(app) {
  let fields = {};
  try { fields = JSON.parse(app.fields_json || '{}'); } catch (_) {}
  return [
    app.id || '',
    app.created_at || '',
    (app.form_label || app.form_type || '').replace('apply-', '').replace(/-/g, ' '),
    app.applicant || fields.fullName || '',
    app.email || fields.email || '',
    app.whatsapp || fields.phoneNumber || '',
    app.status || '',
    fields.location || '',
    fields.offerType || fields.performanceType || fields.productType || '',
    fields.about || fields.description || '',
    fields.videoLink1 || '',
    fields.videoLink2 || '',
    fields.videoLink3 || '',
    fields.photoLink || '',
    fields.performanceType || '',
    fields.genre || '',
    fields.setLength || '',
    fields.brandName || '',
    fields.productType || '',
    fields.skills || '',
    fields.availability || '',
    fields.installationType || '',
    fields.spaceNeeded || '',
  ];
}

async function appendApplicationRow(app) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureAppTab(sheets);
    // ensure header
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${APP_TAB}!A1:A1` });
    if (!res.data.values || !res.data.values[0] || res.data.values[0][0] !== 'ID') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${APP_TAB}!A1`,
        valueInputOption: 'RAW', requestBody: { values: [APP_HEADERS] },
      });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${APP_TAB}!A1`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [appToRow(app)] },
    });
    console.log('[sheets] application appended:', app.id, app.applicant);
  } catch (err) {
    console.error('[sheets] application append failed:', err.message);
  }
}

async function syncAllApplications(db) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureAppTab(sheets);
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: APP_TAB });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${APP_TAB}!A1`,
      valueInputOption: 'RAW', requestBody: { values: [APP_HEADERS] },
    });
    const apps = db.prepare('SELECT * FROM applications ORDER BY id ASC').all();
    if (apps.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `${APP_TAB}!A1`,
        valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: apps.map(appToRow) },
      });
    }
    console.log('[sheets] applications sync complete —', apps.length, 'rows');
  } catch (err) {
    console.error('[sheets] applications sync failed:', err.message);
  }
}


// Upload a DB backup file to Google Drive, keep last 30 files in the folder
async function uploadBackupToDrive(filePath) {
  const fs = require('fs');
  const FOLDER_NAME = 'Moon Festival DB Backups';
  try {
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    // Hardcoded folder shared with service account
    const folderId = '1Vf2UqDS94ikoZYaoq0T-TbpDd3AQ9dev';

    // Upload the backup file
    const fileName = require('path').basename(filePath);
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/x-sqlite3', body: fs.createReadStream(filePath) },
      fields: 'id',
    });
    console.log('[drive] Backup uploaded:', fileName);

    // Prune: keep only last 30 files in the folder
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      orderBy: 'createdTime asc',
      fields: 'files(id,name,createdTime)',
      pageSize: 200,
    });
    const files = list.data.files;
    if (files.length > 30) {
      const toDelete = files.slice(0, files.length - 30);
      for (const f of toDelete) {
        await drive.files.delete({ fileId: f.id });
        console.log('[drive] Pruned old backup:', f.name);
      }
    }
  } catch (err) {
    console.error('[drive] Backup upload failed:', err.message);
    throw err;
  }
}

module.exports = { appendBookingRow, updateBookingRow, syncAllBookings, appendApplicationRow, syncAllApplications, uploadBackupToDrive };
