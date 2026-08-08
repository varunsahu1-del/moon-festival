// Run: node server/preview-emails.js
// Generates HTML previews of all email templates in /tmp/email-previews/

const fs   = require('fs');
const path = require('path');

// ── Sample data ──────────────────────────────────────────────────────────────
const booking = {
  booking_ref:    'MF-0042',
  venue:          'Bhakti Kutir',
  room_type:      'Double Sharing',
  total_price:    '40250',
  guest_count:    2,
  payment_method: 'upi',
  status:         'upi_pending',
  room_number:    '7',
  arrival_date:   '26 Nov',
  addons:         '2750:Extra Day (26 Nov)|3200:Tribal Lunch (28 Nov)|2500:Ayurvedic Massage',
};

const guests = [
  { full_name: 'Varun Sahu',  email: 'varunsahu1@gmail.com', whatsapp: '+91 98207 91100', city: 'Mumbai',    age: 30, gender: 'Male',   address: '12 Marine Lines', state: 'Maharashtra', pin: '400020' },
  { full_name: 'Karan Mehta', email: 'karan@example.com',    whatsapp: '+91 99309 20313', city: 'Bangalore', age: 28, gender: 'Male',   address: '5 MG Road',       state: 'Karnataka',   pin: '560001' },
];

const modBooking = {
  ...booking,
  venue:      'Destiny',
  room_type:  'Private Room',
  total_price: '55000',
  room_number: '12',
};

// ── Inline email.js HTML builders (copied logic, no nodemailer) ──────────────
// We just need the HTML strings — import the helpers from email.js
// but skip the transporter / send calls.

process.env.GMAIL_USER         = 'preview@moonfestival.in';
process.env.GMAIL_APP_PASSWORD = 'dummy';   // prevents early-return guard

// Patch transporter so sendMail never fires
const nodemailer = require('nodemailer');
const _createTransport = nodemailer.createTransport.bind(nodemailer);
nodemailer.createTransport = (...args) => {
  const t = _createTransport(...args);
  t.sendMail = async (opts) => { return { messageId: 'preview' }; };
  return t;
};

const { sendConfirmation, sendFailedPaymentAlert, sendModificationEmail, sendUpiAlert, sendUpiPendingGuest } = require('./email');

// ── Capture HTML by monkey-patching sendMail per call ───────────────────────
const outDir = path.join(__dirname, '..', 'email-previews');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

let _captured = [];
nodemailer.createTransport = (...args) => {
  const t = _createTransport(...args);
  t.sendMail = async (opts) => {
    _captured.push({ subject: opts.subject, html: opts.html || '' });
    return { messageId: 'preview' };
  };
  return t;
};

async function run() {
  _captured = [];

  await sendConfirmation({ booking, guests });
  save('01-confirmation-guest.html',    _captured[0]);
  save('02-confirmation-admin.html',    _captured[1]);
  _captured = [];

  await sendFailedPaymentAlert({ booking, guests });
  save('03-failed-payment-admin.html',  _captured[0]);
  _captured = [];

  await sendModificationEmail({
    booking: modBooking, guests,
    oldVenue: booking.venue, oldRoomType: booking.room_type,
    oldPrice: booking.total_price,
    extraAmount: 14750,
    paymentLink: 'https://moonfestival.in/pay?ref=MF-0042',
  });
  save('04-modification-guest.html', _captured[0]);
  _captured = [];

  await sendUpiAlert({ booking, guests });
  save('05-upi-alert-admin.html', _captured[0]);
  _captured = [];

  await sendUpiPendingGuest({ booking, guests });
  save('06-upi-pending-guest.html', _captured[0]);

  console.log('\n✓ Email previews written to email-previews/');
  console.log('  Open them in your browser:');
  fs.readdirSync(outDir).sort().forEach(f =>
    console.log('  file://' + path.join(outDir, f))
  );
}

function save(filename, captured) {
  if (!captured) { console.warn('⚠ No output for', filename); return; }
  const wrapper = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${captured.subject || filename}</title>
<style>body{margin:0;padding:0;}</style>
</head><body>${captured.html}</body></html>`;
  fs.writeFileSync(path.join(outDir, filename), wrapper);
  console.log('✓', filename, '—', captured.subject || '(no subject)');
}

run().catch(e => { console.error(e); process.exit(1); });
