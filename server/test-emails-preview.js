// Run: node server/test-emails-preview.js
// Generates HTML previews of every email type + verifies all key amounts.
// Does NOT send any real emails.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');

// ── Patch Resend so nothing actually sends ───────────────────────────────────
const captured = [];
const ResendMock = class {
  constructor() {}
  get emails() {
    return {
      send: async (opts) => {
        captured.push({ subject: opts.subject, html: opts.html || '', attachments: opts.attachments });
        return { id: 'preview-' + captured.length };
      }
    };
  }
};
require.cache[require.resolve('resend')] = {
  id: require.resolve('resend'),
  filename: require.resolve('resend'),
  loaded: true,
  exports: { Resend: ResendMock },
};

process.env.RESEND_API_KEY = 'preview-mode';

const {
  sendConfirmation, sendFailedPaymentAlert, sendModificationEmail,
  sendPaymentPendingEmail, sendAddonPaymentEmail, sendSplitPaymentEmail,
  sendUpiAlert, sendUpiPendingGuest, sendQuote, sendAddonQuoteEmail,
} = require('./email');

// ── Test booking fixture ─────────────────────────────────────────────────────
// total_price = 40250 (pre-GST base)
// GST-inclusive = 40250 × 1.05 = 42263
// Razorpay total = 42263 × 1.0236 = 43260 (approx)
const BASE = 40250;
const WITH_GST = Math.round(BASE * 1.05);         // 42263
const WITH_RZP  = Math.round(WITH_GST * 1.0236);  // 43260

const booking = {
  booking_ref:    'MF-0042',
  venue:          'Bhakti Kutir',
  room_type:      'Double Sharing',
  total_price:    String(BASE),
  guest_count:    2,
  payment_method: 'razorpay',
  status:         'paid',
  room_number:    '7',
  arrival_date:   '26 Nov',
  addons:         '2750:Extra Day (26 Nov)|3200:Tribal Lunch (28 Nov)',
  extra_addons:   '4500:Ayurvedic Massage',
  addons_collected: 0,
  discount:       0,
  gst_number:     null,
  gst_name:       null,
  paid_at:        new Date().toISOString(),
  razorpay_payment_id: 'pay_TEST123',
};

const guests = [
  { full_name: 'Varun Sahu',  email: 'varunsahu1@gmail.com',        whatsapp: '+91 98207 91100', city: 'Mumbai',    age: 30, gender: 'Male', address: '12 Marine Lines', state: 'Maharashtra', pin: '400020' },
  { full_name: 'Karan Mehta', email: 'karan@example.com',           whatsapp: '+91 99309 20313', city: 'Bangalore', age: 28, gender: 'Male', address: '5 MG Road',       state: 'Karnataka',   pin: '560001' },
];

const modBooking = {
  ...booking,
  venue:       'Destiny',
  room_type:   'Private Room',
  total_price: '55000',
};

const outDir = path.join(__dirname, '..', 'email-previews');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function save(filename, emailObj) {
  if (!emailObj) { console.warn('⚠  No output for', filename); return; }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${emailObj.subject || filename}</title>
<style>body{margin:0;padding:0;background:#f0e8dc;}</style>
</head><body>${emailObj.html || '<p>No HTML</p>'}</body></html>`;
  fs.writeFileSync(path.join(outDir, filename), html);
  console.log('✓', filename.padEnd(38), '|', emailObj.subject || '(no subject)');
}

// ── Amount assertions ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log('  ✅', label, '=', actual);
    passed++;
  } else {
    console.error('  ❌', label, '— expected', expected, 'got', actual);
    failed++;
  }
}

async function run() {
  console.log('\n━━━ AMOUNT VERIFICATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Base (pre-GST)          :', BASE);
  console.log('  With GST (×1.05)        :', WITH_GST);
  console.log('  With Razorpay (×1.0236) :', WITH_RZP);

  const { computeBreakdown } = require('./breakdown');
  const bd = computeBreakdown(booking);
  console.log('\n  computeBreakdown →');
  console.log('    accomBase    :', bd.accomBase);   // 40250 - 2750 - 3200 + 0 = 34300
  console.log('    addonTotal   :', bd.addonTotal);  // 2750+3200 = 5950
  console.log('    extraAddonTotal:', bd.extraAddonTotal); // 4500
  console.log('    subtotal     :', bd.subtotal);    // 40250 + 4500 = 44750
  console.log('    gst          :', bd.gst);         // round(44750 * 0.05) = 2238
  console.log('    grandTotal   :', bd.grandTotal);  // 44750 + 2238 = 46988

  assert('Invoice grandTotal = subtotal+GST', bd.grandTotal, bd.subtotal + bd.gst);
  assert('accomBase = total_price - addons + discount', bd.accomBase, BASE - bd.addonTotal + (booking.discount || 0));

  console.log('\n━━━ GENERATING EMAIL PREVIEWS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Confirmation (guest + admin)
  let idx = captured.length;
  await sendConfirmation({ booking, guests });
  save('01-confirmation-guest.html', captured[idx]);
  save('02-confirmation-admin.html', captured[idx + 1]);

  // 2. Failed payment alert (admin only)
  idx = captured.length;
  await sendFailedPaymentAlert({ booking, guests });
  save('03-failed-payment-admin.html', captured[idx]);

  // 3. Modification email (with extra amount due)
  idx = captured.length;
  await sendModificationEmail({
    booking: modBooking, guests,
    oldVenue: booking.venue, oldRoomType: booking.room_type,
    oldPrice: booking.total_price,
    extraAmount: 14750,
    paymentLink: 'https://rzp.io/pay/test-upgrade',
  });
  save('04-modification-guest.html', captured[idx]);

  // 4. Payment pending / Razorpay link email
  idx = captured.length;
  await sendPaymentPendingEmail({ booking, guests, paymentLink: 'https://rzp.io/pay/testlink', amountWithGst: WITH_GST });
  save('05-payment-pending-guest.html', captured[idx]);

  // 5. Addon payment email
  const addonTotal = 4500;
  const gstAmount  = Math.round(addonTotal * 0.05);
  const afterGst   = addonTotal + gstAmount;
  const razorpayFee = Math.round(afterGst * 0.0236);
  const addonCharged = afterGst + razorpayFee;
  idx = captured.length;
  await sendAddonPaymentEmail({
    booking, guests,
    addonLines:   [{ name: 'Ayurvedic Massage', price: 4500 }],
    addonTotal,
    gstAmount,
    razorpayFee,
    amountWithGst: addonCharged,
    paymentLink: 'https://rzp.io/pay/addon-test',
    addedItems: [{ name: 'Ayurvedic Massage', price: 4500 }],
  });
  save('06-addon-payment-guest.html', captured[idx]);

  // 6. Split payment email
  idx = captured.length;
  await sendSplitPaymentEmail({ booking, guests, part1: 21500, part2: 21500, total: 43000, link1: 'https://rzp.io/l/part1', link2: 'https://rzp.io/l/part2' });
  save('07-split-payment-guest.html', captured[idx]);

  // 7. UPI alert (admin)
  idx = captured.length;
  await sendUpiAlert({ booking: { ...booking, payment_method: 'upi', upi_screenshot: null }, guests });
  save('08-upi-alert-admin.html', captured[idx]);

  // 8. UPI pending guest
  idx = captured.length;
  await sendUpiPendingGuest({ booking: { ...booking, payment_method: 'upi', status: 'upi_pending' }, guests });
  save('09-upi-pending-guest.html', captured[idx]);

  // 9. Quote (offline payment)
  idx = captured.length;
  await sendQuote({ booking, guests });
  save('10-quote-guest.html', captured[idx]);

  // 10. Addon quote email
  idx = captured.length;
  await sendAddonQuoteEmail({ booking, guests, addedItems: [{ name: 'Ayurvedic Massage', price: 4500 }] });
  save('11-addon-quote-guest.html', captured[idx]);

  // ── Key amount checks on generated HTML ─────────────────────────────────────
  console.log('\n━━━ HTML AMOUNT CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Confirmation guest email — "Amount Paid" should be WITH_GST (no Razorpay fee on the label)
  const confHtml = captured[0]?.html || '';
  assert('Confirmation shows GST-inclusive amount', confHtml.includes(WITH_GST.toLocaleString('en-IN')), true);

  // Payment pending email — total should be WITH_RZP
  const pendHtml = captured[4]?.html || '';
  assert('Pending email shows Razorpay total', pendHtml.includes(WITH_RZP.toLocaleString('en-IN')), true);

  // Addon payment email — total should include Razorpay fee
  const addonHtml = captured[5]?.html || '';
  assert('Addon email shows correct total (incl. fee)', addonHtml.includes(addonCharged.toLocaleString('en-IN')), true);

  // Modification email — should show GST-inclusive amounts
  const modHtml = captured[2]?.html || '';
  const modNewGst = Math.round(55000 * 1.05);
  const modOldGst = Math.round(40250 * 1.05);
  assert('Modification email shows new GST-inclusive amount', modHtml.includes(modNewGst.toLocaleString('en-IN')), true);
  assert('Modification email shows old GST-inclusive amount', modHtml.includes(modOldGst.toLocaleString('en-IN')), true);
  assert('Modification extra due has GST', modHtml.includes(Math.round(14750 * 1.05).toLocaleString('en-IN')), true);

  console.log('\n━━━ INVOICE CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // Invoice is generated but is a PDF — just check it doesn't throw
  try {
    const { generateInvoice } = require('./invoice');
    const buf = await generateInvoice({ booking, guests });
    assert('Invoice PDF generated without error', Buffer.isBuffer(buf) && buf.length > 1000, true);
    console.log('  Invoice size:', buf.length, 'bytes');
    // Write PDF for manual inspection
    const pdfPath = path.join(outDir, '00-invoice-MF-0042.pdf');
    fs.writeFileSync(pdfPath, buf);
    console.log('  PDF saved:', pdfPath);
  } catch (e) {
    console.error('  ❌ Invoice generation failed:', e.message);
    failed++;
  }

  console.log('\n━━━ RESULT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('\n  Open previews in browser:');
  fs.readdirSync(outDir).sort().forEach(f =>
    console.log('  file://' + path.join(outDir, f))
  );
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
