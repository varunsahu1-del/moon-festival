const { Resend } = require('resend');
const { generateInvoice } = require('./invoice');
const { computeBreakdown } = require('./breakdown');

// Pre-render alien SVG → PNG base64 at startup (SVG is stripped by Gmail)
const ALIEN_SVG = Buffer.from(`<svg width="88" height="104" viewBox="0 0 52 62" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="18" y1="8" x2="13" y2="2" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round"/>
  <circle cx="12.5" cy="1.5" r="1.5" fill="#C47D52" opacity="0.8"/>
  <line x1="34" y1="8" x2="39" y2="2" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round"/>
  <circle cx="39.5" cy="1.5" r="1.5" fill="#C47D52" opacity="0.8"/>
  <ellipse cx="26" cy="18" rx="16" ry="14" stroke="#C47D52" stroke-width="1" fill="rgba(196,125,82,0.07)"/>
  <ellipse cx="19" cy="16" rx="4.5" ry="5.5" stroke="#C47D52" stroke-width="0.9" fill="rgba(196,125,82,0.12)"/>
  <ellipse cx="19" cy="17" rx="2" ry="3" fill="#C47D52" opacity="0.5"/>
  <circle cx="20" cy="15.5" r="0.8" fill="rgba(107,79,56,0.4)"/>
  <ellipse cx="33" cy="16" rx="4.5" ry="5.5" stroke="#C47D52" stroke-width="0.9" fill="rgba(196,125,82,0.12)"/>
  <ellipse cx="33" cy="17" rx="2" ry="3" fill="#C47D52" opacity="0.5"/>
  <circle cx="34" cy="15.5" r="0.8" fill="rgba(107,79,56,0.4)"/>
  <path d="M20 24 Q26 28 32 24" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round" fill="none"/>
  <path d="M18 31 Q12 33 12 40 Q12 46 18 47 L34 47 Q40 46 40 40 Q40 33 34 31 Z" stroke="#C47D52" stroke-width="1" fill="rgba(196,125,82,0.07)"/>
  <path d="M14 35 Q6 30 4 25" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round" fill="none"/>
  <circle cx="3.5" cy="24" r="2" stroke="#C47D52" stroke-width="0.8" fill="rgba(196,125,82,0.1)"/>
  <path d="M38 35 Q46 32 48 28" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round" fill="none"/>
  <circle cx="48.5" cy="27" r="2" stroke="#C47D52" stroke-width="0.8" fill="rgba(196,125,82,0.1)"/>
  <line x1="20" y1="47" x2="17" y2="56" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round"/>
  <path d="M13 56 L21 56" stroke="#C47D52" stroke-width="1" stroke-linecap="round"/>
  <line x1="32" y1="47" x2="35" y2="56" stroke="#C47D52" stroke-width="0.9" stroke-linecap="round"/>
  <path d="M31 56 L39 56" stroke="#C47D52" stroke-width="1" stroke-linecap="round"/>
</svg>`);

let ALIEN_IMG_TAG = ''; // filled async at startup
let HERO_IMG_TAG  = ''; // filled async at startup
try {
  const sharp = require('sharp');
  const path  = require('path');
  sharp(ALIEN_SVG).png().toBuffer().then(buf => {
    ALIEN_IMG_TAG = '<img src="data:image/png;base64,' + buf.toString('base64') + '" width="44" height="52" alt="" style="display:block;margin:0 auto 20px;opacity:0.8;"/>';
  }).catch(() => {});
  sharp(path.join(__dirname, '..', 'Home Page Images', '1.jpg'))
    .resize(600).jpeg({ quality: 82 }).toBuffer().then(buf => {
      HERO_IMG_TAG = '<img src="data:image/jpeg;base64,' + buf.toString('base64') + '" width="600" alt="Moon Festival 2026" style="display:block;width:100%;max-width:600px;height:auto;"/>';
    }).catch(() => {});
} catch (_) {}

const FROM = 'Moon Festival <bookings@moonfestival.in>';
const ADMIN_BCC = 'moonyogaadventures@gmail.com';

async function sendEmail(opts) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const payload = {
    from: opts.from || FROM,
    to: Array.isArray(opts.to) ? opts.to : opts.to.split(',').map(s => s.trim()),
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.bcc) payload.bcc = Array.isArray(opts.bcc) ? opts.bcc : opts.bcc.split(',').map(s => s.trim());
  if (opts.attachments) {
    payload.attachments = opts.attachments.map(a => ({
      filename: a.filename,
      content: a.content || (a.path ? require('fs').readFileSync(a.path) : undefined),
    })).filter(a => a.content);
  }
  return resend.emails.send(payload);
}

// ── Update when domain is live ───────────────────────────────────────────────
const SITE_URL          = 'https://moonfestival.in';
const ADMIN_URL         = SITE_URL + '/admin.html';
const crypto            = require('crypto');
function confirmToken(ref) {
  const secret = process.env.SESSION_SECRET || 'mf2026-secret';
  return crypto.createHmac('sha256', secret).update(ref).digest('hex').slice(0, 16);
}
const GETTING_THERE_URL = 'https://moonfestival.in/getting-there.html';
const FAQ_URL           = 'https://moonfestival.in/faq.html';
const IG_URL            = 'https://www.instagram.com/moon.holisticfestival';
const CONTACT_VARUN     = '+91 98207 91100';
const CONTACT_KARAN     = '+91 99309 20313';
const CONTACT_EMAIL     = 'moonyogaadventures@gmail.com';
// ────────────────────────────────────────────────────────────────────────────

const OPEN = "'Lato','Open Sans',Helvetica,Arial,sans-serif";
const MONO = "'Courier New',monospace";

// Palette — warm, low contrast, no black
const C = {
  bg:     '#f0e8dc',        // outer background
  card:   '#ffffff',        // white card
  border: '#e8dfd5',        // dividers
  terra:  '#C47D52',        // terracotta accent
  gold:   '#B06030',        // deeper terracotta for refs
  text:   '#6b4f38',        // warm brown — main text
  sub:    '#8a6e58',        // secondary text
  muted:  '#a89080',        // labels, captions
};

// Shared styles
const SEC  = 'font-family:' + OPEN + ';font-size:13px;font-weight:300;letter-spacing:0.28em;text-transform:uppercase;color:' + C.terra + ';margin:0 0 18px;';
const LBL  = 'font-family:' + OPEN + ';font-size:10px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:' + C.muted + ';white-space:nowrap;padding:22px 0 5px;';
const LBL0 = LBL;
const VAL  = 'font-family:' + OPEN + ';font-size:15px;font-weight:500;color:' + C.text + ';padding:5px 0 22px;border-bottom:1px solid ' + C.border + ';line-height:1.5;';
const VAL0 = 'font-family:' + OPEN + ';font-size:15px;font-weight:500;color:' + C.text + ';padding:5px 0 22px;line-height:1.5;';
const DIV  = '<tr><td style="padding:32px 0 0;"><div style="height:1px;background:' + C.terra + ';opacity:0.55;"></div></td></tr>';

async function sendConfirmation({ booking, guests }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping email');
    return;
  }

  
  const primary  = guests[0];
  const firstName = primary.full_name.split(' ')[0];

  let guestRows = '';
  guests.forEach(function(g, i) {
    if (guests.length > 1) {
      guestRows += '<tr><td style="' + LBL + '">Guest ' + (i + 1) + '</td></tr>';
    }
    guestRows += '<tr><td style="' + VAL0 + '">' + g.full_name + '</td></tr>'
              +  (i < guests.length - 1 ? '<tr><td style="padding:8px 0 0;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>' : '');
  });

  // Dynamic arrival date from booking, fallback to 27 Nov
  const arrivalDate = booking.arrival_date === '26 Nov' ? '26th November 2026' : '27th November 2026';

  // Parse add-ons (exclude the extra day entry — that's reflected in arrival date already)
  const addonItems = booking.addons
    ? booking.addons.split('|').map(function(a) {
        var idx = a.indexOf(':');
        return { price: parseInt(a.slice(0, idx), 10) || 0, name: a.slice(idx + 1).trim() };
      }).filter(function(a) { return a.name; })
    : [];

  // Parse admin add-ons (extra_addons) — always include regardless of collected status
  const extraAddonItems = booking.extra_addons
    ? booking.extra_addons.split('|').map(function(a) {
        var idx = a.indexOf(':');
        return { price: parseInt(a.slice(0, idx), 10) || 0, name: a.slice(idx + 1).trim() };
      }).filter(function(a) { return a.name; })
    : [];

  const allAddonItems = addonItems.concat(extraAddonItems);
  var addonRows = '';
  if (allAddonItems.length) {
    addonRows = DIV
      + '<tr><td class="mob-pad" style="padding:32px 52px 0;">'
      + '<p style="' + SEC + '">Add-ons</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0">';
    allAddonItems.forEach(function(a, i) {
      var isLast = i === allAddonItems.length - 1;
      var isFlat = a.name.toLowerCase().includes('scooter');
      var priceLabel = isFlat ? 'flat fee' : 'per person';
      addonRows += '<tr><td style="' + LBL + '">' + a.name + '</td></tr>'
        + '<tr><td style="' + (isLast ? VAL0 : VAL) + '">₹' + a.price.toLocaleString('en-IN') + ' <span style="font-size:12px;color:' + C.muted + ';">' + priceLabel + '</span></td></tr>';
    });
    addonRows += '</table></td></tr>';
  }

  const html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + '<title>Moon Festival 2026 — Booking Confirmed</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap" rel="stylesheet"/>'
    + '<style>@import url(\'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap\');'
    + '@media only screen and (max-width:480px){'
    + '.mob-stack td{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important;}'
    + '.mob-stack td:first-child{padding-bottom:2px!important;border-bottom:none!important;}'
    + '.mob-stack td:last-child{padding-top:2px!important;}'
    + '.mob-pad{padding-left:24px!important;padding-right:24px!important;}'
    + '}'
    + '</style>'
    + '</head>'
    + '<body style="margin:0;padding:0;background:' + C.bg + ';">'

    + '<div style="display:none;max-height:0;overflow:hidden;color:' + C.bg + ';">Ref: ' + booking.booking_ref + ' · ' + booking.venue + ' · ' + booking.room_type + '</div>'

    // Outer wrapper
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + C.bg + ';">'
    + '<tr><td align="center" style="padding:40px 16px 56px;">'

    // Card — white, 3px terracotta top rule
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">'

    // Top accent rule
    + '<tr><td style="background:' + C.terra + ';height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>'

    // White card body
    + '<tr><td style="background:' + C.card + ';border-left:1px solid ' + C.border + ';border-right:1px solid ' + C.border + ';border-bottom:1px solid ' + C.border + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'

    // ── HEADER — alien PNG (data URI) + event identity ────────────────────
    + '<tr><td style="padding:52px 52px 44px;text-align:left;border-bottom:1px solid ' + C.border + ';">'
    + '<p style="margin:0 0 3px;font-family:' + OPEN + ';font-size:28px;font-weight:700;letter-spacing:0.1em;color:' + C.text + ';line-height:1.2;">MOON 2026</p>'
    + '<p style="margin:10px 0 0;font-family:' + OPEN + ';font-size:9px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:' + C.muted + ';">27 – 30 Nov 2026 &nbsp;|&nbsp; South Goa</p>'
    + '</td></tr>'

    // ── GREETING ──────────────────────────────────────────────────────────
    + '<tr><td style="padding:44px 52px 0;">'
    + '<p style="margin:0 0 24px;font-family:' + OPEN + ';font-size:14px;font-weight:300;letter-spacing:0.08em;color:' + C.sub + ';">Dear <strong style="font-weight:600;color:' + C.text + ';">' + firstName + '</strong>,</p>'
    + '<p style="margin:0 0 16px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.5;color:' + C.sub + ';">We are so thrilled to have you with us at <strong style="font-weight:600;color:' + C.text + ';">Moon Festival 2026</strong>. You are now part of a <strong style="font-weight:600;color:' + C.text + ';">beautiful community</strong> coming together in <strong style="font-weight:600;color:' + C.text + ';">love, music, healing, art, fitness, movement, stillness and magic</strong> — this is going to be something truly extraordinary.</p>'
    + '<p style="margin:0 0 28px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.5;color:' + C.sub + ';">Your invoice is <strong style="font-weight:600;color:' + C.text + ';">attached to this email</strong>.</p>'
    + '<a href="' + SITE_URL + '/my-booking.html?ref=' + booking.booking_ref + '" style="display:inline-block;font-family:' + OPEN + ';font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;background:' + C.terra + ';text-decoration:none;padding:14px 28px;border-radius:2px;">View Your Booking</a>'
    + '</td></tr>'

    + DIV

    // ── BOOKING DETAILS ───────────────────────────────────────────────────
    + '<tr><td class="mob-pad" style="padding:32px 52px 0;">'
    + '<p style="' + SEC + '">Booking Details</p>'
    + '<p style="margin:0 0 24px;font-family:' + MONO + ';font-size:22px;font-weight:700;color:' + C.gold + ';letter-spacing:0.12em;">' + booking.booking_ref + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + guestRows
    + '<tr><td style="padding:8px 0 0;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="' + LBL + '">Accommodation</td></tr>'
    + '<tr><td style="' + VAL + '">' + booking.venue + ' &nbsp;·&nbsp; ' + booking.room_type + '</td></tr>'
    + '<tr><td style="' + LBL + '">Amount Paid</td></tr>'
    + '<tr><td style="' + VAL0 + '">₹' + Math.round(parseInt(String(booking.total_price).replace(/[^\d]/g,''),10) * 1.05).toLocaleString('en-IN') + '<span style="font-size:12px;color:' + C.muted + ';font-weight:300;"> (incl. 5% GST)</span></td></tr>'
    + '</table>'
    + '</td></tr>'

    + addonRows

    + DIV

    // ── YOUR ARRIVAL ──────────────────────────────────────────────────────
    + '<tr><td class="mob-pad" style="padding:32px 52px 0;">'
    + '<p style="' + SEC + '">Your Arrival</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="' + LBL + '">Arrive</td></tr>'
    + '<tr><td style="' + VAL + '">' + arrivalDate + '</td></tr>'
    + '<tr><td style="' + LBL + '">Check-In</td></tr>'
    + '<tr><td style="' + VAL + '">2:30 PM onwards</td></tr>'
    + '<tr><td style="' + LBL + '">Opening Ceremony</td></tr>'
    + '<tr><td style="' + VAL + '">26th November, 7:00 PM</td></tr>'
    + '<tr><td style="' + LBL + '">Check-Out</td></tr>'
    + '<tr><td style="' + VAL0 + '">30th November 2026, 11:00 AM</td></tr>'
    + '</table>'
    + '</td></tr>'

    + DIV

    // ── STAY CONNECTED ────────────────────────────────────────────────────
    + '<tr><td class="mob-pad" style="padding:32px 52px 0;">'
    + '<p style="' + SEC + '">Stay Connected</p>'
    + '<p style="margin:0 0 22px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.5;color:' + C.sub + ';">The <strong style="font-weight:600;color:' + C.text + ';">2026 Facilitators &amp; Workshop Schedule</strong> will be announced on <strong style="font-weight:600;color:' + C.text + ';">Instagram</strong> — follow us for updates. We will also add you to our <strong style="font-weight:600;color:' + C.text + ';">WhatsApp group</strong> <strong style="font-weight:600;color:' + C.text + ';">closer to the date</strong> with everything you need for arrival.</p>'
    + '<a href="' + IG_URL + '" style="display:inline-block;font-family:' + OPEN + ';font-size:10px;font-weight:400;letter-spacing:0.22em;text-transform:uppercase;color:' + C.terra + ';text-decoration:none;border-bottom:1px solid ' + C.terra + ';padding-bottom:2px;">@moon.holisticfestival</a>'
    + '</td></tr>'

    + DIV

    // ── NEED HELP ────────────────────────────────────────────────────────
    + '<tr><td class="mob-pad" style="padding:32px 52px 0;">'
    + '<p style="' + SEC + '">Need Help?</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" class="mob-stack">'
    + '<tr><td style="' + LBL  + '">Varun</td><td style="' + VAL  + '"><a href="tel:' + CONTACT_VARUN.replace(/\s/g,'') + '" style="color:' + C.text + ';text-decoration:none;">' + CONTACT_VARUN + '</a></td></tr>'
    + '<tr><td style="' + LBL  + '">Karan</td><td style="' + VAL  + '"><a href="tel:' + CONTACT_KARAN.replace(/\s/g,'') + '" style="color:' + C.text + ';text-decoration:none;">' + CONTACT_KARAN + '</a></td></tr>'
    + '<tr><td style="' + LBL0 + '">Email</td><td style="' + VAL0 + '"><a href="mailto:' + CONTACT_EMAIL + '" style="color:' + C.gold + ';text-decoration:none;">' + CONTACT_EMAIL + '</a></td></tr>'
    + '</table>'
    + '</td></tr>'

    // ── CLOSING ───────────────────────────────────────────────────────────
    + '<tr><td style="padding:44px 52px 48px;">'
    + '<p style="margin:0 0 4px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.muted + ';">With love and light,</p>'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:12px;font-weight:400;letter-spacing:0.2em;text-transform:uppercase;color:' + C.sub + ';">Team Moon</p>'
    + '</td></tr>'

    + '</table>'
    + '</td></tr>'  // end white card inner

    // ── FOOTER ───────────────────────────────────────────────────────────
    + '<tr><td style="padding:24px 0;text-align:center;">'
    + '<p style="margin:0 0 8px;">'
    + '<a href="' + SITE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">moonfestival.in</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + FAQ_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">FAQs</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + GETTING_THERE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">Getting There</a>'
    + '</p>'
    + '</td></tr>'

    + '</table>'       // end outer card table
    + '</td></tr></table>'  // end outer wrapper
    + '</body></html>';

  const subject = booking.booking_ref + ' · You\'re confirmed for Moon Festival 2026 🌙';

  const mailOptions = {
    from: FROM,
    to: primary.email,
    bcc: ADMIN_BCC,
    subject: subject,
    html: html,
  };

  let invoiceBuffer = null;
  try {
    invoiceBuffer = await generateInvoice({ booking, guests });
  } catch (e) { console.error('[invoice]', e.message); }

  if (invoiceBuffer) {
    mailOptions.attachments = [{
      filename: 'Moon-Invoice-' + booking.booking_ref + '.pdf',
      content: invoiceBuffer,
      contentType: 'application/pdf',
    }];
  }

  await sendEmail(mailOptions);
  console.log('[email] Sent to ' + primary.email + ' — ' + subject);

  // Admin notification
  const ADMIN_EMAILS = ['moonyogaadventures@gmail.com'];
  const guestLines = guests.map(function(g, i) {
    return '<tr style="background:' + (i % 2 === 0 ? '#f8f3ee' : '#fff') + ';">'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b4f38;">' + g.full_name + '</td>'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:12px;color:#8a6e58;word-break:break-all;">' + g.email + '</td>'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#8a6e58;white-space:nowrap;">' + g.whatsapp + '</td>'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#8a6e58;">' + (g.city || '—') + '</td>'
      + '</tr>';
  }).join('');

  const baseAmt = parseInt(String(booking.total_price).replace(/[^\d]/g,''), 10) || 0;
  const totalWithGst = Math.round(baseAmt * 1.05);

  const paymentLabel = { upi: 'UPI', bank_transfer: 'Bank Transfer', razorpay: 'Razorpay', cash: 'Cash' };
  const statusLabel  = { paid: 'Paid', upi_pending: 'Pending', pending: 'Pending', failed: 'Failed' };
  const isPending    = booking.status === 'upi_pending' || booking.status === 'pending';


  // Embed screenshot if present
  const fs = require('fs');
  const screenshotsDir = require('path').join(__dirname, '..', 'data', 'screenshots');
  let screenshotCid = null;
  let screenshotAttachment = null;
  if (booking.upi_screenshot) {
    const screenshotPath = require('path').join(screenshotsDir, booking.upi_screenshot);
    if (fs.existsSync(screenshotPath)) {
      screenshotCid = 'payment_proof';
      screenshotAttachment = {
        filename: booking.upi_screenshot,
        path: screenshotPath,
        cid: screenshotCid,
      };
    }
  }

  const adminHtml = '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0e8dc;font-family:Arial,sans-serif;">'
    + '<div style="max-width:520px;background:#fff;border:1px solid #e8dfd5;border-top:3px solid #C47D52;padding:28px 32px;">'
    + '<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a89080;">New Booking</p>'
    + '<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#6b4f38;">' + booking.booking_ref + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;">Venue</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.venue + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Room</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.room_type + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Arrival</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + (booking.arrival_date === '26 Nov' ? '26 Nov 2026' : '27 Nov 2026') + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Guests</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.guest_count + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Payment</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + (paymentLabel[booking.payment_method] || (booking.payment_method || '—').toUpperCase()) + ' &nbsp;·&nbsp; <span style="color:' + (isPending ? '#e67e22' : '#27ae60') + ';font-weight:600;">' + (statusLabel[booking.status] || booking.status || '—') + '</span></td></tr>'
    + (booking.addons ? '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;vertical-align:top;">Add-ons</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.addons.split('|').map(a => '<span style="display:block;padding:3px 0;">' + a.slice(a.indexOf(':') + 1).trim() + '</span>').join('') + '</td></tr>' : '')
    + '<tr><td style="padding:7px 0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Amount</td><td style="padding:7px 0;font-size:14px;font-weight:700;color:#C47D52;">₹' + totalWithGst.toLocaleString('en-IN') + ' (incl. 5% GST)</td></tr>'
    + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8dfd5;margin-bottom:20px;">'
    + '<tr style="background:#f0e8dc;"><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">Name</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">Email</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">Number</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">City</th></tr>'
    + guestLines
    + '</table>'
    + (screenshotCid ? '<div style="margin-top:20px;border-top:1px solid #e8dfd5;padding-top:16px;"><p style="margin:0 0 10px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#a89080;">Payment Screenshot</p><img src="cid:' + screenshotCid + '" style="max-width:100%;border:1px solid #e8dfd5;border-radius:2px;" /></div>' : '')
    + (isPending ? '<div style="margin-top:20px;"><a href="' + ADMIN_URL + '?ref=' + booking.booking_ref + '" style="display:inline-block;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#fff;background:#C47D52;text-decoration:none;padding:12px 24px;border-radius:2px;">Confirm Booking</a></div>' : '')
    + '</div></body></html>';

  try {
    const adminMailOptions = {
      from: FROM,
      to: ADMIN_EMAILS.join(', '),
      subject: '🌙 New Booking — ' + booking.booking_ref + ' · ' + primary.full_name,
      html: adminHtml,
    };
    if (screenshotAttachment) adminMailOptions.attachments = [screenshotAttachment];
    await sendEmail(adminMailOptions);
    console.log('[email] Admin notification sent');
  } catch (e) { console.error('[email] Admin notification failed:', e.message); }
}

async function sendFailedPaymentAlert({ booking, guests }) {
  if (!process.env.RESEND_API_KEY) return;

  const primary = guests[0] || {};

  const paymentLabel = { upi: 'UPI', bank_transfer: 'Bank Transfer', razorpay: 'Razorpay', cash: 'Cash' };
  const paymentDisplay = paymentLabel[booking.payment_method] || booking.payment_method || '—';

  // Parse add-ons
  const addonItems = booking.addons
    ? booking.addons.split('|').map(function(a) {
        const idx = a.indexOf(':');
        return { price: parseInt(a.slice(0, idx), 10) || 0, name: a.slice(idx + 1).trim() };
      }).filter(function(a) { return a.name && a.price; })
    : [];

  const guestLines = guests.map(function(g, i) {
    const waNum = (g.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91');
    const waLink = waNum ? 'https://wa.me/' + waNum : null;
    return '<tr style="background:' + (i % 2 === 0 ? '#f8f3ee' : '#fff') + ';">'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b4f38;">' + g.full_name + '</td>'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:12px;color:#8a6e58;word-break:break-all;">' + (g.email || '—') + '</td>'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#8a6e58;white-space:nowrap;">'
        + (waLink ? '<a href="' + waLink + '" style="color:#25d366;text-decoration:none;">' + g.whatsapp + '</a>' : (g.whatsapp || '—'))
      + '</td>'
      + '<td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#8a6e58;">' + (g.city || '—') + '</td>'
      + '</tr>';
  }).join('');

  const baseAmt = parseInt(String(booking.total_price).replace(/[^\d]/g,''), 10) || 0;
  const totalWithGst = Math.round(baseAmt * 1.05);

  const addonsRow = addonItems.length
    ? '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;vertical-align:top;">Add-ons</td>'
      + '<td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">'
      + addonItems.map(function(a) { return '<span style="display:block;padding:3px 0;">' + a.name + '</span>'; }).join('')
      + '</td></tr>'
    : '';

  const arrivalRow = booking.arrival_date
    ? '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;">Arrival</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.arrival_date + '</td></tr>'
    : '';

  const html = '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0e8dc;font-family:Arial,sans-serif;">'
    + '<div style="max-width:560px;background:#fff;border:1px solid #e8dfd5;border-top:3px solid #c0392b;padding:28px 32px;">'
    + '<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a89080;">Failed Payment</p>'
    + '<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#c0392b;">' + booking.booking_ref + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;">Venue</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.venue + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Room</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.room_type + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Payment</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + paymentDisplay + '</td></tr>'
    + arrivalRow
    + addonsRow
    + '<tr><td style="padding:7px 0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Amount</td><td style="padding:7px 0;font-size:14px;font-weight:700;color:#c0392b;">₹' + totalWithGst.toLocaleString('en-IN') + ' (incl. 5% GST)</td></tr>'
    + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8dfd5;margin-bottom:20px;">'
    + '<tr style="background:#f0e8dc;"><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">Name</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">Email</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">Number</th><th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;font-weight:400;">City</th></tr>'
    + guestLines
    + '</table>'
    + '<a href="https://moonfestival.in/admin.html" style="display:inline-block;background:#c0392b;color:#fff;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:10px 22px;text-decoration:none;border-radius:2px;">Open Dashboard →</a>'
    + '<p style="margin:10px 0 0;font-size:12px;color:#a89080;">Log in to resend a payment link to the guest.</p>'
    + '</div></body></html>';

  
  const ADMIN_EMAILS = ['moonyogaadventures@gmail.com'];
  try {
    await sendEmail({
      from: FROM,
      to: ADMIN_EMAILS.join(', '),
      subject: booking.booking_ref + ' · Failed Payment · ' + paymentDisplay + ' · ' + (primary.full_name || ''),
      html,
    });
    console.log('[email] Failed payment alert sent for', booking.booking_ref);
  } catch (e) { console.error('[email] Failed payment alert error:', e.message); }
}

async function sendModificationEmail({ booking, guests, oldVenue, oldRoomType, oldPrice, extraAmount, paymentLink }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping modification email');
    return;
  }
  
  const primary  = guests[0];
  const firstName = primary.full_name.split(' ')[0];

  const newAmtFmt  = '₹' + Number(String(booking.total_price).replace(/[^\d]/g,'')).toLocaleString('en-IN');
  const oldAmtFmt  = '₹' + Number(String(oldPrice).replace(/[^\d]/g,'')).toLocaleString('en-IN');
  const extraFmt   = extraAmount > 0 ? '₹' + Math.round(extraAmount * 1.05).toLocaleString('en-IN') : null;

  const paymentRow = extraFmt
    ? `<tr><td colspan="2" style="padding:24px 52px;">
        <div style="background:#fff8f3;border:1px solid #e8c8a0;border-radius:4px;padding:16px 20px;">
          <p style="margin:0 0 8px;font-family:${OPEN};font-size:13px;color:${C.gold};font-weight:700;">Additional payment required</p>
          <p style="margin:0 0 12px;font-family:${OPEN};font-size:13px;color:${C.text};">A payment of <strong>${extraFmt}</strong> (incl. 5% GST) is due for this upgrade.</p>
          ${paymentLink ? `<a href="${paymentLink}" style="display:inline-block;background:${C.terra};color:#fff;font-family:${OPEN};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:10px 22px;text-decoration:none;border-radius:2px;">Pay Now →</a>` : ''}
        </div>
      </td></tr>`
    : '';

  const html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + '<title>Booking Updated — Moon Festival 2026</title>'
    + '</head>'
    + `<body style="margin:0;padding:0;background:${C.bg};">`
    + `<div style="max-width:600px;margin:0 auto;padding:32px 16px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};">`
    // Header
    + `<tr><td style="padding:32px 52px 24px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 4px;font-family:${OPEN};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.terra};">Booking Updated</p>`
    + `<p style="margin:0 0 2px;font-family:${OPEN};font-size:22px;font-weight:700;color:${C.gold};">${booking.booking_ref}</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:12px;color:${C.muted};letter-spacing:0.06em;">Moon Festival 2026 &nbsp;·&nbsp; 27–30 Nov &nbsp;·&nbsp; South Goa</p>`
    + '</td></tr>'
    // Greeting
    + `<tr><td style="padding:28px 52px 0;"><p style="margin:0;font-family:${OPEN};font-size:15px;color:${C.text};line-height:1.7;">Hi ${firstName},</p>`
    + `<p style="margin:12px 0 0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">Your booking has been updated by the Moon Festival team. Here are the new details:</p></td></tr>`
    // Change summary
    + `<tr><td style="padding:24px 52px 0;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};">`
    + `<tr><td style="padding:14px 20px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 4px;font-family:${OPEN};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};">Was</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:14px;color:${C.sub};">${oldVenue} — ${oldRoomType}</p>`
    + `<p style="margin:4px 0 0;font-family:${OPEN};font-size:13px;color:${C.muted};">${oldAmtFmt}</p>`
    + `</td></tr>`
    + `<tr><td style="padding:14px 20px;">`
    + `<p style="margin:0 0 4px;font-family:${OPEN};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${C.terra};">Now</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:15px;font-weight:700;color:${C.text};">${booking.venue} — ${booking.room_type}</p>`
    + `<p style="margin:4px 0 0;font-family:${OPEN};font-size:14px;font-weight:700;color:${C.gold};">${newAmtFmt}${booking.room_number ? `<span style="font-size:12px;font-weight:400;color:${C.muted};"> &nbsp;·&nbsp; Room ${booking.room_number}</span>` : ''}</p>`
    + `</td></tr>`
    + '</table></td></tr>'
    + paymentRow
    // Contact
    + `<tr><td style="padding:24px 52px 32px;border-top:1px solid ${C.border};">`
    + `<p style="margin:0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">Questions? Reach us on WhatsApp: <a href="https://wa.me/91${CONTACT_VARUN.replace(/\D/g,'')}" style="color:${C.terra};">${CONTACT_VARUN}</a> or email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.terra};">${CONTACT_EMAIL}</a>.</p>`
    + '</td></tr>'
    + '</table></div></body></html>';

  const toAddresses = guests.map(g => g.email).filter(Boolean).join(', ');
  if (!toAddresses) { console.log('[email] No email addresses — skipping modification email'); return; }

  await sendEmail({
    from: FROM,
    to: toAddresses,
    bcc: ADMIN_BCC,
    subject: `${booking.booking_ref} · Booking Updated · ${primary.full_name || ''}`,
    html,
  });
  console.log('[email] Modification email sent for', booking.booking_ref);
}

async function sendPaymentPendingEmail({ booking, guests, paymentLink, amountWithGst }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping pending payment email');
    return;
  }
  
  const primary = guests[0] || {};
  const firstName = primary.full_name.split(' ')[0];
  const razorpayTotal = Math.round(amountWithGst * 1.0236);
  const gatewayFee = razorpayTotal - amountWithGst;
  const totalFmt = '₹' + razorpayTotal.toLocaleString('en-IN');

  const html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + '<title>Complete Your Payment — Moon Festival 2026</title>'
    + '</head>'
    + `<body style="margin:0;padding:0;background:${C.bg};">`
    + `<div style="max-width:600px;margin:0 auto;padding:32px 16px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};">`
    + `<tr><td style="background:${C.terra};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>`
    + `<tr><td style="padding:32px 52px 24px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 4px;font-family:${OPEN};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.terra};">Complete Your Payment</p>`
    + `<p style="margin:0 0 2px;font-family:${OPEN};font-size:22px;font-weight:700;color:${C.gold};">${booking.booking_ref}</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:12px;color:${C.muted};letter-spacing:0.06em;">Moon Festival 2026 &nbsp;·&nbsp; 27–30 Nov &nbsp;·&nbsp; South Goa</p>`
    + '</td></tr>'
    + `<tr><td style="padding:28px 52px 0;">`
    + `<p style="margin:0;font-family:${OPEN};font-size:15px;color:${C.text};line-height:1.7;">Hi ${firstName},</p>`
    + `<p style="margin:12px 0 0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">Your spot at Moon Festival 2026 is reserved. Please complete your payment to confirm your booking.</p>`
    + '</td></tr>'
    + `<tr><td style="padding:24px 52px 0;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};">`
    + `<tr><td style="padding:16px 20px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 3px;font-family:${OPEN};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};">Accommodation</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:15px;font-weight:600;color:${C.text};">${booking.venue} — ${booking.room_type}</p>`
    + '</td></tr>'
    + `<tr><td style="padding:16px 20px;">`
    + `<p style="margin:0 0 10px;font-family:${OPEN};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};">Payment Breakdown</p>`
    + `<table width="100%" cellpadding="0" cellspacing="0">`
    + `<tr><td style="font-family:${OPEN};font-size:12px;color:${C.sub};padding-bottom:4px;">Accommodation + Add-ons</td><td align="right" style="font-family:${OPEN};font-size:12px;color:${C.sub};padding-bottom:4px;">₹${Math.round(amountWithGst / 1.05).toLocaleString('en-IN')}</td></tr>`
    + `<tr><td style="font-family:${OPEN};font-size:12px;color:${C.sub};padding-bottom:4px;">GST (5%)</td><td align="right" style="font-family:${OPEN};font-size:12px;color:${C.sub};padding-bottom:4px;">₹${(amountWithGst - Math.round(amountWithGst / 1.05)).toLocaleString('en-IN')}</td></tr>`
    + `<tr><td style="font-family:${OPEN};font-size:12px;color:${C.sub};padding-bottom:8px;">Razorpay gateway fee (2.36%)</td><td align="right" style="font-family:${OPEN};font-size:12px;color:${C.sub};padding-bottom:8px;">₹${gatewayFee.toLocaleString('en-IN')}</td></tr>`
    + `<tr><td style="font-family:${OPEN};font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};border-top:1px solid ${C.border};padding-top:8px;">Total Due</td><td align="right" style="border-top:1px solid ${C.border};padding-top:8px;"><span style="font-family:${OPEN};font-size:18px;font-weight:700;color:${C.gold};">${totalFmt}</span></td></tr>`
    + `</table>`
    + '</td></tr></table></td></tr>'
    + `<tr><td style="padding:24px 52px;">`
    + `<a href="${paymentLink}" style="display:inline-block;background:${C.terra};color:#fff;font-family:${OPEN};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:14px 28px;text-decoration:none;border-radius:2px;">Complete Payment →</a>`
    + `<p style="margin:16px 0 0;font-family:${OPEN};font-size:11px;color:${C.muted};">This link expires in 30 days. If you have any questions, reach us on WhatsApp: <a href="https://wa.me/91${CONTACT_VARUN.replace(/\D/g,'')}" style="color:${C.terra};">${CONTACT_VARUN}</a>.</p>`
    + '</td></tr>'
    + `<tr><td style="padding:0 52px 32px;border-top:1px solid ${C.border};">`
    + `<p style="margin:0;font-family:${OPEN};font-size:12px;color:${C.muted};line-height:1.7;">If you have already completed your payment, please ignore this email.</p>`
    + '</td></tr>'
    + '</table></div></body></html>';

  const toAddresses = guests.map(g => g.email).filter(Boolean).join(', ');
  if (!toAddresses) return;

  await sendEmail({
    from: FROM,
    to: toAddresses,
    bcc: ADMIN_BCC,
    subject: `${booking.booking_ref} · Complete Your Payment · Moon Festival 2026`,
    html,
  });
  console.log('[email] Payment pending email sent for', booking.booking_ref);
}

async function sendSplitPaymentEmail({ booking, guests, part1, part2, total, link1, link2 }) {
  if (!process.env.RESEND_API_KEY) return;
  
  const primary = guests[0] || {};
  const firstName = primary.full_name.split(' ')[0];
  const fmt = n => '₹' + Number(n).toLocaleString('en-IN');

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>'
    + `<body style="margin:0;padding:0;background:${C.bg};">`
    + `<div style="max-width:600px;margin:0 auto;padding:32px 16px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};">`
    + `<tr><td style="background:${C.terra};height:3px;font-size:0;">&nbsp;</td></tr>`
    + `<tr><td style="padding:32px 52px 24px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 4px;font-family:${OPEN};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.terra};">Payment — Two Parts</p>`
    + `<p style="margin:0 0 2px;font-family:${OPEN};font-size:22px;font-weight:700;color:${C.gold};">${booking.booking_ref}</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:12px;color:${C.muted};">Moon Festival 2026 &nbsp;·&nbsp; 27–30 Nov &nbsp;·&nbsp; South Goa</p>`
    + '</td></tr>'
    + `<tr><td style="padding:28px 52px 0;">`
    + `<p style="margin:0;font-family:${OPEN};font-size:15px;color:${C.text};">Hi ${firstName},</p>`
    + `<p style="margin:12px 0 0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">Your booking total of <strong>${fmt(total)}</strong> has been split into two payments. Complete Part 1 now to secure your spot, and Part 2 when you're ready.</p>`
    + '</td></tr>'
    // Part 1
    + `<tr><td style="padding:24px 52px 0;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};margin-bottom:16px;">`
    + `<tr><td style="padding:16px 20px;border-bottom:1px solid ${C.border};background:#fff8f3;">`
    + `<p style="margin:0 0 3px;font-family:${OPEN};font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${C.terra};">Part 1 — Pay now</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:24px;font-weight:700;color:${C.gold};">${fmt(part1)}</p>`
    + '</td></tr>'
    + `<tr><td style="padding:16px 20px;">`
    + `<a href="${link1}" style="display:inline-block;background:${C.terra};color:#fff;font-family:${OPEN};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:12px 24px;text-decoration:none;border-radius:2px;">Pay ${fmt(part1)} →</a>`
    + '</td></tr></table>'
    // Part 2
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};">`
    + `<tr><td style="padding:16px 20px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 3px;font-family:${OPEN};font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${C.muted};">Part 2 — Balance</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:24px;font-weight:700;color:${C.text};">${fmt(part2)}</p>`
    + '</td></tr>'
    + `<tr><td style="padding:16px 20px;">`
    + `<a href="${link2}" style="display:inline-block;background:rgba(176,96,48,0.1);color:${C.terra};font-family:${OPEN};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:12px 24px;text-decoration:none;border-radius:2px;border:1px solid rgba(176,96,48,0.3);">Pay ${fmt(part2)} →</a>`
    + '</td></tr></table>'
    + '</td></tr>'
    + `<tr><td style="padding:24px 52px 32px;border-top:1px solid ${C.border};margin-top:24px;">`
    + `<p style="margin:0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">Questions? WhatsApp: <a href="https://wa.me/91${CONTACT_VARUN.replace(/\D/g,'')}" style="color:${C.terra};">${CONTACT_VARUN}</a></p>`
    + '</td></tr></table></div></body></html>';

  const to = guests.map(g => g.email).filter(Boolean).join(', ');
  if (!to) return;
  await sendEmail({
    from: FROM,
    to, bcc: ADMIN_BCC,
    subject: `${booking.booking_ref} · Payment in Two Parts · Moon Festival 2026`,
    html,
  });
  console.log('[email] Split payment email sent for', booking.booking_ref);
}

async function sendAddonPaymentEmail({ booking, guests, addonLines, addonTotal, paymentLink }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping addon payment email');
    return;
  }
  
  const primary = guests[0] || {};
  const firstName = primary.full_name.split(' ')[0];
  const totalFmt = '₹' + Math.round(addonTotal * 1.05).toLocaleString('en-IN');

  const addonRows = addonLines.map(({ name, price }) =>
    `<tr>
      <td style="padding:10px 20px;font-family:${OPEN};font-size:13px;color:${C.text};border-bottom:1px solid ${C.border};">${name}</td>
      <td style="padding:10px 20px;font-family:${OPEN};font-size:13px;color:${C.gold};font-weight:700;text-align:right;border-bottom:1px solid ${C.border};">₹${Number(price).toLocaleString('en-IN')}</td>
    </tr>`
  ).join('');

  const html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + '<title>Add-ons Payment — Moon Festival 2026</title>'
    + '</head>'
    + `<body style="margin:0;padding:0;background:${C.bg};">`
    + `<div style="max-width:600px;margin:0 auto;padding:32px 16px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};">`
    + `<tr><td style="background:${C.terra};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>`
    + `<tr><td style="padding:32px 52px 24px;border-bottom:1px solid ${C.border};">`
    + `<p style="margin:0 0 4px;font-family:${OPEN};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.terra};">Add-ons Payment</p>`
    + `<p style="margin:0 0 2px;font-family:${OPEN};font-size:22px;font-weight:700;color:${C.gold};">${booking.booking_ref}</p>`
    + `<p style="margin:0;font-family:${OPEN};font-size:12px;color:${C.muted};letter-spacing:0.06em;">Moon Festival 2026 &nbsp;·&nbsp; 27–30 Nov &nbsp;·&nbsp; South Goa</p>`
    + '</td></tr>'
    + `<tr><td style="padding:28px 52px 0;"><p style="margin:0;font-family:${OPEN};font-size:15px;color:${C.text};line-height:1.7;">Hi ${firstName},</p>`
    + `<p style="margin:12px 0 0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">The following add-ons have been added to your booking. Please complete the payment at your earliest convenience.</p></td></tr>`
    + `<tr><td style="padding:24px 52px 0;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};">`
    + addonRows
    + `<tr><td colspan="2" style="padding:12px 20px;background:#fff8f3;">`
    + `<p style="margin:0;font-family:${OPEN};font-size:11px;color:${C.muted};">Total incl. 5% GST</p>`
    + `<p style="margin:4px 0 0;font-family:${OPEN};font-size:18px;font-weight:700;color:${C.gold};">${totalFmt}</p>`
    + '</td></tr></table></td></tr>'
    + `<tr><td style="padding:24px 52px;">`
    + `<a href="${paymentLink}" style="display:inline-block;background:${C.terra};color:#fff;font-family:${OPEN};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:12px 26px;text-decoration:none;border-radius:2px;">Pay Now →</a>`
    + '</td></tr>'
    + `<tr><td style="padding:0 52px 32px;border-top:1px solid ${C.border};">`
    + `<p style="margin:0;font-family:${OPEN};font-size:13px;color:${C.sub};line-height:1.7;">Questions? Reach us on WhatsApp: <a href="https://wa.me/91${CONTACT_VARUN.replace(/\D/g,'')}" style="color:${C.terra};">${CONTACT_VARUN}</a> or email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.terra};">${CONTACT_EMAIL}</a>.</p>`
    + '</td></tr>'
    + '</table></div></body></html>';

  const toAddresses = guests.map(g => g.email).filter(Boolean).join(', ');
  if (!toAddresses) { console.log('[email] No email addresses — skipping addon payment email'); return; }

  await sendEmail({
    from: FROM,
    to: toAddresses,
    bcc: ADMIN_BCC,
    subject: `${booking.booking_ref} · Add-ons Payment · ${primary.full_name || ''}`,
    html,
  });
  console.log('[email] Addon payment email sent for', booking.booking_ref);
}

async function sendUpiAlert({ booking, guests }) {
  if (!process.env.RESEND_API_KEY) return;
  
  const primary = guests[0] || {};
  const baseAmt = parseInt(String(booking.total_price).replace(/[^\d]/g,''), 10) || 0;
  const totalWithGst = Math.round(baseAmt * 1.05);
  const ADMIN_EMAILS = ['moonyogaadventures@gmail.com'];

  const paymentLabel = { upi: 'UPI', bank_transfer: 'Bank Transfer', razorpay: 'Razorpay', cash: 'Cash' };
  const paymentDisplay = paymentLabel[booking.payment_method] || booking.payment_method || 'UPI';

  // Embed screenshot if present
  let screenshotCid = null, screenshotAttachment = null;
  if (booking.upi_screenshot) {
    const screenshotPath = require('path').join(__dirname, '..', 'data', 'screenshots', booking.upi_screenshot);
    if (require('fs').existsSync(screenshotPath)) {
      screenshotCid = 'payment_proof_alert';
      screenshotAttachment = { filename: booking.upi_screenshot, path: screenshotPath, cid: screenshotCid };
    }
  }

  const screenshotBlock = screenshotCid
    ? '<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#a89080;">Payment Screenshot</p>'
      + '<img src="cid:' + screenshotCid + '" style="max-width:100%;border:1px solid #e8dfd5;border-radius:3px;display:block;margin-bottom:24px;" />'
    : '';

  const html = '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0e8dc;font-family:Arial,sans-serif;">'
    + '<div style="max-width:520px;background:#fff;border:1px solid #e8dfd5;border-top:3px solid #e6b800;padding:28px 32px;">'
    + '<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a89080;">Action Required</p>'
    + '<p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#6b4f38;">' + paymentDisplay + ' Payment to Verify</p>'
    + '<p style="margin:0 0 24px;font-size:13px;color:#8a6e58;">' + primary.full_name + ' has submitted a ' + paymentDisplay + ' payment and uploaded a screenshot. Please verify and confirm.</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;">Booking</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;font-weight:700;color:#6b4f38;">' + booking.booking_ref + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Guest</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + primary.full_name + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Venue</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.venue + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Room</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.room_type + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Payment</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + paymentDisplay + '</td></tr>'
    + '<tr><td style="padding:7px 0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Amount</td><td style="padding:7px 0;font-size:14px;font-weight:700;color:#C47D52;">₹' + totalWithGst.toLocaleString('en-IN') + ' incl. GST</td></tr>'
    + '</table>'
    + screenshotBlock
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
    + '<a href="' + SITE_URL + '/admin/confirm/' + booking.booking_ref + '/' + confirmToken(booking.booking_ref) + '" style="display:inline-block;padding:12px 24px;background:#6b7c3a;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;border-radius:2px;">Confirm Booking ✓</a>'
    + '<a href="' + SITE_URL + '/admin" style="display:inline-block;padding:12px 24px;background:#C47D52;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;border-radius:2px;">Open Dashboard →</a>'
    + '</div>'
    + '</div></body></html>';

  const mailOptions = {
    from: FROM,
    to: ADMIN_EMAILS.join(', '),
    subject: '⚡ Action Required · ' + booking.booking_ref + ' · Payment Received · ' + primary.full_name + ' ⚡',
    html,
  };
  if (screenshotAttachment) mailOptions.attachments = [screenshotAttachment];

  try {
    await sendEmail(mailOptions);
    console.log('[email] UPI alert sent for', booking.booking_ref);
  } catch (e) { console.error('[email] UPI alert failed:', e.message); }
}

async function sendUpiPendingGuest({ booking, guests }) {
  if (!process.env.RESEND_API_KEY) return;
  
  const primary = guests[0] || {};
  const firstName = (primary.full_name || 'there').split(' ')[0];
  const baseAmt = parseInt(String(booking.total_price).replace(/[^\d]/g,''), 10) || 0;
  const totalWithGst = Math.round(baseAmt * 1.05);

  const addonItems = booking.addons
    ? booking.addons.split('|').map(function(a) {
        const idx = a.indexOf(':');
        return { price: parseInt(a.slice(0, idx), 10) || 0, name: a.slice(idx + 1).trim() };
      }).filter(function(a) { return a.name && a.price; })
    : [];

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>'
    + '<body style="margin:0;padding:0;background:' + C.bg + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + C.bg + ';">'
    + '<tr><td align="center" style="padding:40px 16px 56px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">'
    + '<tr><td style="background:' + C.terra + ';height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>'
    + '<tr><td style="background:' + C.card + ';border-left:1px solid ' + C.border + ';border-right:1px solid ' + C.border + ';border-bottom:1px solid ' + C.border + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    // Header
    + '<tr><td style="padding:44px 52px 36px;border-bottom:1px solid ' + C.border + ';">'
    + '<p style="margin:0 0 3px;font-family:' + OPEN + ';font-size:28px;font-weight:700;letter-spacing:0.1em;color:' + C.text + ';">MOON 2026</p>'
    + '<p style="margin:8px 0 0;font-family:' + OPEN + ';font-size:9px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:' + C.muted + ';">27 – 30 Nov 2026 &nbsp;|&nbsp; South Goa</p>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:40px 52px 0;">'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.sub + ';">Dear <strong style="font-weight:600;color:' + C.text + ';">' + firstName + '</strong>,</p>'
    + '<p style="margin:0 0 28px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.6;color:' + C.sub + ';">We\'ve received your booking reservation for <strong style="font-weight:600;color:' + C.gold + ';">' + booking.booking_ref + '</strong> — once we confirm your payment, you\'ll receive a <strong style="font-weight:600;color:' + C.text + ';">confirmation email within 24 hours</strong>.</p>'
    + '</td></tr>'
    // Booking ref prominent
    + '<tr><td style="padding:0 52px;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:28px 52px 28px;">'
    + '<p style="margin:0 0 6px;font-family:' + OPEN + ';font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';">Booking Reference</p>'
    + '<p style="margin:0;font-family:' + MONO + ';font-size:22px;font-weight:700;color:' + C.gold + ';letter-spacing:0.12em;">' + booking.booking_ref + '</p>'
    + '</td></tr>'
    + '<tr><td style="padding:0 52px 28px;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    // Details table — label above value, single column
    + '<tr><td style="padding:0 52px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="' + LBL + '">Accommodation</td></tr>'
    + '<tr><td style="' + VAL + '">' + booking.venue + ' &nbsp;·&nbsp; ' + booking.room_type + '</td></tr>'
    + (booking.arrival_date ? '<tr><td style="' + LBL + '">Arrival</td></tr><tr><td style="' + VAL + '">' + booking.arrival_date + '</td></tr>' : '')
    + (addonItems.length
        ? '<tr><td style="' + LBL + '">Add-ons</td></tr>'
          + '<tr><td style="' + VAL + '">' + addonItems.map(function(a) { return '<span style="display:block;padding:2px 0;">' + a.name + '</span>'; }).join('') + '</td></tr>'
        : '')
    + '<tr><td style="' + LBL + '">Amount Due</td></tr>'
    + '<tr><td style="' + VAL0 + '">₹' + totalWithGst.toLocaleString('en-IN') + ' <span style="font-size:12px;color:' + C.muted + ';font-weight:300;">(incl. 5% GST)</span></td></tr>'
    + '</table>'
    + '</td></tr>'
    // Divider
    + '<tr><td style="padding:28px 52px 0;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    // Help
    + '<tr><td style="padding:28px 52px 0;">'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:13px;font-weight:300;color:' + C.sub + ';line-height:1.7;">Questions? WhatsApp us at <a href="https://wa.me/91' + CONTACT_VARUN.replace(/\D/g,'') + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_VARUN + '</a> or email <a href="mailto:' + CONTACT_EMAIL + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_EMAIL + '</a>.</p>'
    + '</td></tr>'
    // Closing
    + '<tr><td style="padding:36px 52px 44px;">'
    + '<p style="margin:0 0 4px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.muted + ';">With love and light,</p>'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:12px;font-weight:400;letter-spacing:0.2em;text-transform:uppercase;color:' + C.sub + ';">Team Moon</p>'
    + '</td></tr>'
    + '<tr><td style="padding:0 52px;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:24px 0;text-align:center;">'
    + '<p style="margin:0 0 8px;">'
    + '<a href="' + SITE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">moonfestival.in</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + FAQ_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">FAQs</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + GETTING_THERE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">Getting There</a>'
    + '</p>'
    + '</td></tr>'
    + '</table></td></tr></table>'
    + '</td></tr></table></body></html>';

  try {
    await sendEmail({
      from: FROM,
      to: primary.email,
      subject: booking.booking_ref + ' · Your spot is reserved — confirmation within 24 hours 🌙',
      html,
    });
    console.log('[email] UPI pending guest email sent to', primary.email);
  } catch (e) { console.error('[email] UPI pending guest email failed:', e.message); }
}

// ── Email 07: Application received (to applicant) ────────────────────────────
async function sendApplicationReceived({ applicantName, applicantEmail, formLabel }) {
  if (!process.env.RESEND_API_KEY || !applicantEmail) return;
  
  const C = { text: '#EDD4B2', sub: 'rgba(237,212,178,0.75)', muted: 'rgba(237,212,178,0.4)', terra: '#C47D52', gold: '#C4972F', border: 'rgba(176,96,48,0.18)', bg: '#191406' };
  const firstName = applicantName ? applicantName.split(' ')[0] : 'there';

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>'
    + '<body style="margin:0;padding:0;background:' + C.bg + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' + C.bg + ';border:1px solid ' + C.border + ';">'
    // Header
    + '<tr><td style="padding:44px 52px 36px;border-bottom:1px solid ' + C.border + ';">'
    + '<p style="margin:0 0 3px;font-family:' + OPEN + ';font-size:28px;font-weight:700;letter-spacing:0.1em;color:' + C.text + ';">MOON 2026</p>'
    + '<p style="margin:8px 0 0;font-family:' + OPEN + ';font-size:9px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:' + C.muted + ';">27 – 30 Nov 2026 &nbsp;|&nbsp; South Goa</p>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:40px 52px 0;">'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.sub + ';">Dear <strong style="font-weight:600;color:' + C.text + ';">' + firstName + '</strong>,</p>'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.6;color:' + C.sub + ';">We\'ve received your <strong style="font-weight:600;color:' + C.text + ';">' + formLabel + '</strong> for Moon Festival 2026. We review all applications personally and will be in touch once we\'ve had a chance to go through yours.</p>'
    + '<p style="margin:0 0 0;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.6;color:' + C.sub + ';">Thank you for wanting to be part of this.</p>'
    + '</td></tr>'
    // Divider
    + '<tr><td style="padding:32px 52px 0;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    // Contact
    + '<tr><td style="padding:28px 52px 0;">'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:13px;font-weight:300;color:' + C.sub + ';line-height:1.7;">Questions? WhatsApp us at <a href="https://wa.me/91' + CONTACT_VARUN.replace(/\D/g,'') + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_VARUN + '</a> or email <a href="mailto:' + CONTACT_EMAIL + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_EMAIL + '</a>.</p>'
    + '</td></tr>'
    // Closing
    + '<tr><td style="padding:36px 52px 44px;">'
    + '<p style="margin:0 0 4px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.muted + ';">With love and light,</p>'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:12px;font-weight:400;letter-spacing:0.2em;text-transform:uppercase;color:' + C.sub + ';">Team Moon</p>'
    + '</td></tr>'
    // Footer
    + '<tr><td style="padding:24px 0;text-align:center;">'
    + '<p style="margin:0;">'
    + '<a href="' + SITE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">moonfestival.in</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + FAQ_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">FAQs</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + GETTING_THERE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">Getting There</a>'
    + '</p></td></tr>'
    + '</table></td></tr></table></body></html>';

  await sendEmail({
    from: FROM,
    to: applicantEmail,
    subject: formLabel + ' · Received · Moon Festival 2026 🌙',
    html,
  });
  console.log('[email] Application received sent to', applicantEmail);
}

// ── Email 08: Application accepted (to applicant) ────────────────────────────
async function sendApplicationAccepted({ applicantName, applicantEmail, formLabel }) {
  if (!process.env.RESEND_API_KEY || !applicantEmail) return;
  
  const C = { text: '#EDD4B2', sub: 'rgba(237,212,178,0.75)', muted: 'rgba(237,212,178,0.4)', terra: '#C47D52', gold: '#C4972F', border: 'rgba(176,96,48,0.18)', bg: '#191406' };
  const firstName = applicantName ? applicantName.split(' ')[0] : 'there';

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>'
    + '<body style="margin:0;padding:0;background:' + C.bg + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' + C.bg + ';border:1px solid ' + C.border + ';">'
    // Header
    + '<tr><td style="padding:44px 52px 36px;border-bottom:1px solid ' + C.border + ';">'
    + '<p style="margin:0 0 3px;font-family:' + OPEN + ';font-size:28px;font-weight:700;letter-spacing:0.1em;color:' + C.text + ';">MOON 2026</p>'
    + '<p style="margin:8px 0 0;font-family:' + OPEN + ';font-size:9px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:' + C.muted + ';">27 – 30 Nov 2026 &nbsp;|&nbsp; South Goa</p>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:40px 52px 0;">'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.sub + ';">Dear <strong style="font-weight:600;color:' + C.text + ';">' + firstName + '</strong>,</p>'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.6;color:' + C.sub + ';">We\'re delighted to tell you — your <strong style="font-weight:600;color:' + C.text + ';">' + formLabel + '</strong> has been <strong style="font-weight:600;color:' + C.gold + ';">accepted</strong> for Moon Festival 2026.</p>'
    + '<p style="margin:0 0 0;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.6;color:' + C.sub + ';">We\'ll be in touch shortly with everything you need to know before the festival. We can\'t wait to create this with you.</p>'
    + '</td></tr>'
    // Divider
    + '<tr><td style="padding:32px 52px 0;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    // Contact
    + '<tr><td style="padding:28px 52px 0;">'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:13px;font-weight:300;color:' + C.sub + ';line-height:1.7;">Questions? WhatsApp us at <a href="https://wa.me/91' + CONTACT_VARUN.replace(/\D/g,'') + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_VARUN + '</a> or email <a href="mailto:' + CONTACT_EMAIL + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_EMAIL + '</a>.</p>'
    + '</td></tr>'
    // Closing
    + '<tr><td style="padding:36px 52px 44px;">'
    + '<p style="margin:0 0 4px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.muted + ';">With love and light,</p>'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:12px;font-weight:400;letter-spacing:0.2em;text-transform:uppercase;color:' + C.sub + ';">Team Moon</p>'
    + '</td></tr>'
    // Footer
    + '<tr><td style="padding:24px 0;text-align:center;">'
    + '<p style="margin:0;">'
    + '<a href="' + SITE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">moonfestival.in</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + FAQ_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">FAQs</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + GETTING_THERE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">Getting There</a>'
    + '</p></td></tr>'
    + '</table></td></tr></table></body></html>';

  await sendEmail({
    from: FROM,
    to: applicantEmail,
    subject: formLabel + ' · You\'re in · Moon Festival 2026 🌙',
    html,
  });
  console.log('[email] Application accepted sent to', applicantEmail);
}

async function sendCustomPaymentAlert({ ref, name, phone, email, note, handled_by, amount }) {
  if (!process.env.RESEND_API_KEY) return;
  const ADMIN_EMAILS = ['moonyogaadventures@gmail.com'];
  const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
  const waNum = (phone || '').replace(/\D/g, '').replace(/^0/, '91');
  const waLink = waNum ? 'https://wa.me/' + waNum : null;

  const rows = [
    ['Ref', ref],
    ['Name', name],
    ['Mobile', waLink ? '<a href="' + waLink + '" style="color:#25d366;text-decoration:none;">' + phone + '</a>' : (phone || '—')],
    ['Email', email || '—'],
    ['Note', note || '—'],
    ['Coordinated by', handled_by || '—'],
    ['Amount', '<strong>' + fmt(amount) + '</strong>'],
  ].map(([k, v]) =>
    '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;">' + k + '</td>'
    + '<td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + v + '</td></tr>'
  ).join('');

  const html = '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0e8dc;font-family:Arial,sans-serif;">'
    + '<div style="max-width:520px;background:#fff;border:1px solid #e8dfd5;border-top:3px solid #2A6050;padding:28px 32px;">'
    + '<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a89080;">Custom Payment Received</p>'
    + '<p style="margin:0 0 24px;font-size:24px;font-weight:700;color:#2A6050;">' + fmt(amount) + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' + rows + '</table>'
    + '<a href="https://moonfestival.in/admin" style="display:inline-block;background:#B06030;color:#fff;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;padding:10px 22px;text-decoration:none;border-radius:2px;">Open Admin →</a>'
    + '</div></body></html>';

  
  try {
    await sendEmail({
      from: FROM,
      to: ADMIN_EMAILS.join(', '),
      subject: ref + ' · Custom Payment · ' + fmt(amount) + ' · ' + name,
      html,
    });
    console.log('[email] Custom payment alert sent for', ref);
  } catch (e) { console.error('[email] Custom payment alert error:', e.message); }
}

async function sendDailyBackup(dbPath) {
  if (!process.env.RESEND_API_KEY) { console.log('[backup] RESEND_API_KEY not set — skipping backup email'); return; }
  const fs = require('fs');
  const date = new Date().toISOString().slice(0, 10);
  
  await sendEmail({
    from: FROM,
    to: 'moonyogaadventures@gmail.com',
    subject: 'Moon Festival · Daily DB Backup · ' + date,
    text: 'Automated daily backup of moonfestival.db attached.',
    attachments: [{ filename: 'moonfestival-backup-' + date + '.db', content: fs.readFileSync(dbPath) }],
  });
  console.log('[backup] Daily backup emailed for', date);
}

async function sendNewBookingAlert({ booking, guests, amountWithGst }) {
  if (!process.env.RESEND_API_KEY) return;
  
  const primary = guests[0] || {};
  const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
  const guestLines = guests.map((g, i) =>
    `<tr><td style="padding:5px 0;border-bottom:1px solid #e8dfd5;font-size:12px;color:#a89080;width:38%;">Guest ${i + 1}</td>`
    + `<td style="padding:5px 0;border-bottom:1px solid #e8dfd5;font-size:13px;color:#6b4f38;">${g.full_name} · ${g.gender || '—'} · ${g.city || '—'}</td></tr>`
  ).join('');

  const html = '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0e8dc;font-family:Arial,sans-serif;">'
    + '<div style="max-width:520px;background:#fff;border:1px solid #e8dfd5;border-top:3px solid #B06030;padding:28px 32px;">'
    + '<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a89080;">New Booking — Awaiting Payment</p>'
    + '<p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#6b4f38;">' + booking.booking_ref + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;width:38%;">Venue</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.venue + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Room</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + booking.room_type + '</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Amount</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;font-weight:700;color:#C47D52;">' + fmt(amountWithGst) + ' incl. GST</td></tr>'
    + '<tr><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a89080;">Contact</td><td style="padding:7px 0;border-bottom:1px solid #e8dfd5;font-size:14px;color:#6b4f38;">' + (primary.whatsapp || '—') + ' · ' + (primary.email || '—') + '</td></tr>'
    + guestLines
    + '</table>'
    + '<a href="https://moonfestival.in/admin" style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#fff;background:#B06030;text-decoration:none;padding:12px 24px;">View in Admin →</a>'
    + '</div></body></html>';

  await sendEmail({
    from: FROM,
    to: 'moonyogaadventures@gmail.com',
    subject: '🌙 New booking: ' + booking.booking_ref + ' · ' + booking.venue + ' · ' + fmt(amountWithGst),
    html,
  });
}

// ── Email 11: Booking quote / summary (offline payment — cash or UPI) ─────────
// Sent when admin saves as pending and wants guest to transfer offline.
// Language: "here's your summary, please transfer ₹X" — NOT confirmed.
const UPI_ID      = 'varunsahu1@okhdfcbank';
const BANK_NAME   = 'HDFC Bank';
const BANK_ACCT   = '50200053890710';
const BANK_IFSC   = 'HDFC0000016';
const BANK_HOLDER = 'Bharat Varun Sahu';

async function sendQuote({ booking, guests }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping quote email');
    return;
  }
  
  const primary   = guests[0] || {};
  const firstName = (primary.full_name || 'there').split(' ')[0];

  // ── Price breakdown ──────────────────────────────────────────────────────
  const numGuests = guests.length || 1;
  const bd = computeBreakdown(booking);
  const { accomBase, addonLines, extraAddonLines, addonTotal, extraAddonTotal,
          discount: discountTotal, subtotal, gst, grandTotal: total } = bd;

  function row(label, value, color) {
    var c = color || C.sub;
    return '<tr>'
      + '<td style="font-family:' + OPEN + ';font-size:12px;font-weight:300;color:' + C.muted + ';padding:7px 0 2px;letter-spacing:0.06em;">' + label + '</td>'
      + '<td style="font-family:' + OPEN + ';font-size:13px;font-weight:500;color:' + c + ';padding:7px 0 2px;text-align:right;" align="right">' + value + '</td>'
      + '</tr>';
  }
  function divRow() {
    return '<tr><td colspan="2" style="padding:4px 0;"><div style="height:0.5px;background:' + C.border + ';"></div></td></tr>';
  }

  var breakdownRows = '';
  breakdownRows += row('Accommodation' + (numGuests > 1 ? ' (₹' + Math.round(accomBase / numGuests).toLocaleString('en-IN') + ' × ' + numGuests + ')' : ''), '₹' + accomBase.toLocaleString('en-IN'));

  addonLines.concat(extraAddonLines).forEach(function(g) {
    var isFlat = g.name.toLowerCase().includes('scooter');
    var suffix = (!isFlat && g.count > 1) ? ' (₹' + g.unitPrice.toLocaleString('en-IN') + ' × ' + g.count + ')' : '';
    breakdownRows += row(g.name + suffix, '₹' + g.total.toLocaleString('en-IN'));
  });

  if (discountTotal > 0) {
    breakdownRows += row('Discount', '−₹' + discountTotal.toLocaleString('en-IN'), '#c0392b');
  }
  breakdownRows += row('GST 5%', '₹' + gst.toLocaleString('en-IN'), C.muted);
  breakdownRows += divRow();
  breakdownRows += '<tr>'
    + '<td style="font-family:' + OPEN + ';font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:' + C.text + ';padding:8px 0 4px;">Total</td>'
    + '<td style="font-family:' + OPEN + ';font-size:20px;font-weight:700;color:' + C.terra + ';padding:8px 0 4px;text-align:right;" align="right">₹' + total.toLocaleString('en-IN') + '</td>'
    + '</tr>';

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>'
    + '<body style="margin:0;padding:0;background:' + C.bg + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + C.bg + ';">'
    + '<tr><td align="center" style="padding:40px 16px 56px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">'
    + '<tr><td style="background:' + C.terra + ';height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>'
    + '<tr><td style="background:' + C.card + ';border-left:1px solid ' + C.border + ';border-right:1px solid ' + C.border + ';border-bottom:1px solid ' + C.border + ';">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'

    // Header
    + '<tr><td style="padding:44px 52px 36px;border-bottom:1px solid ' + C.border + ';">'
    + '<p style="margin:0 0 3px;font-family:' + OPEN + ';font-size:28px;font-weight:700;letter-spacing:0.1em;color:' + C.text + ';">MOON 2026</p>'
    + '<p style="margin:8px 0 0;font-family:' + OPEN + ';font-size:9px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:' + C.muted + ';">27 – 30 Nov 2026 &nbsp;|&nbsp; South Goa</p>'
    + '</td></tr>'

    // Greeting + intent
    + '<tr><td style="padding:40px 52px 0;">'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.sub + ';">Dear <strong style="font-weight:600;color:' + C.text + ';">' + firstName + '</strong>,</p>'
    + '<p style="margin:0 0 10px;font-family:' + OPEN + ';font-size:15px;font-weight:300;line-height:1.6;color:' + C.sub + ';">Here is your booking summary for <strong style="font-weight:600;color:' + C.text + ';">Moon Festival 2026</strong>. Once we receive your payment, we\'ll send you a confirmation.</p>'
    + '</td></tr>'

    // Booking ref
    + '<tr><td style="padding:28px 52px 0;"><div style="height:0.5px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:20px 52px;">'
    + '<p style="margin:0 0 5px;font-family:' + OPEN + ';font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';">Booking Reference</p>'
    + '<p style="margin:0;font-family:' + MONO + ';font-size:22px;font-weight:700;color:' + C.gold + ';letter-spacing:0.12em;">' + booking.booking_ref + '</p>'
    + '</td></tr>'
    + '<tr><td style="padding:0 52px;"><div style="height:0.5px;background:' + C.border + ';"></div></td></tr>'

    // Stay details
    + '<tr><td style="padding:28px 52px 0;">'
    + '<p style="' + SEC + '">Stay Details</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="' + LBL + '">Venue</td></tr>'
    + '<tr><td style="' + VAL + '">' + booking.venue + '</td></tr>'
    + '<tr><td style="' + LBL + '">Room Type</td></tr>'
    + '<tr><td style="' + (booking.arrival_date ? VAL : VAL0) + '">' + booking.room_type + '</td></tr>'
    + (booking.arrival_date ? '<tr><td style="' + LBL + '">Arrival</td></tr><tr><td style="' + VAL0 + '">' + booking.arrival_date + '</td></tr>' : '')
    + '</table>'
    + '</td></tr>'

    // Price breakdown
    + '<tr><td style="padding:28px 52px 0;"><div style="height:0.5px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:24px 52px;">'
    + '<p style="' + SEC + '">Price Breakdown</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0">' + breakdownRows + '</table>'
    + '</td></tr>'

    // Payment instructions
    + '<tr><td style="padding:0 52px 0;"><div style="height:0.5px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:28px 52px;">'
    + '<p style="' + SEC + '">How to Pay</p>'
    + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:14px;font-weight:300;line-height:1.6;color:' + C.sub + ';">Please transfer <strong style="font-weight:700;color:' + C.terra + ';">₹' + total.toLocaleString('en-IN') + '</strong> using any of the options below and share the screenshot with us on WhatsApp.</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="' + LBL + '">UPI ID</td></tr>'
    + '<tr><td style="font-family:' + MONO + ';font-size:15px;font-weight:500;color:' + C.text + ';padding:4px 0 18px;border-bottom:1px solid ' + C.border + ';">' + UPI_ID + '</td></tr>'
    + '<tr><td style="' + LBL + '">Bank Transfer</td></tr>'
    + '<tr><td style="font-family:' + OPEN + ';font-size:13px;font-weight:300;line-height:1.8;color:' + C.sub + ';padding:4px 0 18px;">'
    + '<strong style="color:' + C.text + ';">' + BANK_HOLDER + '</strong><br/>'
    + BANK_NAME + '<br/>'
    + 'Account: <strong style="color:' + C.text + ';">' + BANK_ACCT + '</strong><br/>'
    + 'IFSC: <strong style="color:' + C.text + ';">' + BANK_IFSC + '</strong>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr>'

    // Contact
    + '<tr><td style="padding:0 52px 0;"><div style="height:0.5px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:28px 52px 0;">'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:13px;font-weight:300;color:' + C.sub + ';line-height:1.7;">Questions? WhatsApp us at <a href="https://wa.me/91' + CONTACT_VARUN.replace(/\D/g,'') + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_VARUN + '</a> or email <a href="mailto:' + CONTACT_EMAIL + '" style="color:' + C.terra + ';text-decoration:none;">' + CONTACT_EMAIL + '</a>.</p>'
    + '</td></tr>'

    // Closing
    + '<tr><td style="padding:32px 52px 44px;">'
    + '<p style="margin:0 0 4px;font-family:' + OPEN + ';font-size:14px;font-weight:300;color:' + C.muted + ';">With love and light,</p>'
    + '<p style="margin:0;font-family:' + OPEN + ';font-size:12px;font-weight:400;letter-spacing:0.2em;text-transform:uppercase;color:' + C.sub + ';">Team Moon</p>'
    + '</td></tr>'

    // Footer
    + '<tr><td style="padding:0 52px;"><div style="height:1px;background:' + C.border + ';"></div></td></tr>'
    + '<tr><td style="padding:24px 0;text-align:center;">'
    + '<a href="' + SITE_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">moonfestival.in</a>'
    + '<span style="color:' + C.muted + ';font-size:9px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>'
    + '<a href="' + FAQ_URL + '" style="font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + C.muted + ';text-decoration:none;">FAQs</a>'
    + '</td></tr>'

    + '</table></td></tr></table></td></tr></table></body></html>';

  const toEmail = (primary.email || '').trim();
  if (!toEmail || !toEmail.includes('@')) {
    throw new Error('Guest email is missing or invalid: ' + JSON.stringify(primary.email));
  }
  console.log('[email] Sending quote to:', toEmail, 'for', booking.booking_ref);
  try {
    await sendEmail({
      from: FROM,
      to: toEmail,
      subject: booking.booking_ref + ' · Moon 2026 — Payment details for your booking',
      html,
    });
    console.log('[email] Quote sent to', toEmail, 'for', booking.booking_ref);
  } catch (e) {
    console.error('[email] Quote send failed:', e.message, '| to:', toEmail, '| from:', FROM);
    throw e;
  }
}

module.exports = { sendConfirmation, sendFailedPaymentAlert, sendModificationEmail, sendAddonPaymentEmail, sendPaymentPendingEmail, sendSplitPaymentEmail, sendUpiAlert, sendUpiPendingGuest, sendApplicationReceived, sendApplicationAccepted, sendCustomPaymentAlert, sendDailyBackup, sendNewBookingAlert, sendQuote };
