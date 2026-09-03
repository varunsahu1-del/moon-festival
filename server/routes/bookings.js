const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
// express is used for raw body parsing on the webhook route
const { db, nextRef } = require('../db');
const { sendConfirmation, sendFailedPaymentAlert, sendUpiAlert, sendUpiPendingGuest, sendCustomPaymentAlert, sendNewBookingAlert } = require('../email');
const { checkAvailability, autoAssignRoom, PRICING } = require('../inventory');

const { resolvePhase } = require('../settings');

const AREA_TO_CITY = {
  thane:"Mumbai",kalyan:"Mumbai",dombivli:"Mumbai","mira road":"Mumbai",vasai:"Mumbai",virar:"Mumbai",
  andheri:"Mumbai",bandra:"Mumbai",borivali:"Mumbai",malad:"Mumbai",goregaon:"Mumbai",kandivali:"Mumbai",
  powai:"Mumbai",kurla:"Mumbai",mulund:"Mumbai",ghatkopar:"Mumbai","navi mumbai":"Mumbai",
  gurugram:"Gurgaon",gurgaon:"Gurgaon",faridabad:"Delhi",ghaziabad:"Delhi",noida:"Delhi",
  "dona paula":"Goa",panaji:"Goa",panjim:"Goa",palolem:"Goa","margao":"Goa",vasco:"Goa",
  baner:"Pune",wakad:"Pune",hinjewadi:"Pune","kothrud":"Pune",aundh:"Pune",hadapsar:"Pune",
  whitefield:"Bengaluru","electronic city":"Bengaluru","koramangala":"Bengaluru",indiranagar:"Bengaluru",
  "hsr layout":"Bengaluru","jp nagar":"Bengaluru",jayanagar:"Bengaluru",yelahanka:"Bengaluru"
};
function normalizeCity(raw){
  if(!raw)return null;
  const t=raw.trim();if(!t)return null;
  const k=t.toLowerCase();
  if(AREA_TO_CITY[k])return AREA_TO_CITY[k];
  return t.replace(/\b\w/g,c=>c.toUpperCase());
}

const screenshotsDir = path.join(__dirname, '../../data/screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: screenshotsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${req.body.booking_ref || 'unknown'}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

let Razorpay;
try { Razorpay = require('razorpay'); } catch (_) {}

function getRazorpay() {
  if (!Razorpay || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

// POST /api/bookings/create
// Body: { venue, roomType, totalPrice, guests: [{full_name, whatsapp, email, city, age}] }
router.post('/create', async (req, res) => {
  try {
    const { venue, roomType, totalPrice, guests, gstNumber, gstName, addons, organizerNote } = req.body;

    // Derive arrival date from addons — extra day add-on means 26 Nov, otherwise 27 Nov
    const addonNames = addons ? addons.split('|').map(a => a.split(':').slice(1).join(':').trim().toLowerCase()) : [];
    const hasExtraDay = addonNames.some(n => n.includes('extra day') || n.includes('26 nov'));
    const arrival_date = hasExtraDay ? '26 Nov' : '27 Nov';
    if (!venue || !roomType || !totalPrice || !Array.isArray(guests) || !guests.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate every guest has a recognised gender — prevents gender-rule bypass
    const VALID_GENDERS = new Set(['Male', 'Female']);
    for (const g of guests) {
      if (!VALID_GENDERS.has(g.gender)) {
        return res.status(400).json({ error: `Guest "${g.full_name || '?'}" has an invalid or missing gender. Please select Male or Female for every guest.` });
      }
    }

    // Deduplication: if a non-deleted booking was created in the last 15 minutes
    // with the same venue + room type and the same primary guest email or phone,
    // return the existing booking instead of creating a duplicate.
    const primaryEmail = (guests[0]?.email || '').trim().toLowerCase();
    if (primaryEmail) {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
      const existing = db.prepare(`
        SELECT b.booking_ref, b.id
        FROM bookings b
        JOIN guests g ON g.booking_id = b.id AND g.guest_number = 1
        WHERE b.deleted_at IS NULL
          AND b.venue = ? AND b.room_type = ?
          AND b.created_at >= ?
          AND LOWER(g.email) = ?
        ORDER BY b.created_at DESC LIMIT 1
      `).get(venue, roomType, cutoff, primaryEmail);
      if (existing) {
        const existingGuests = db.prepare('SELECT * FROM guests WHERE booking_id = ? ORDER BY guest_number').all(existing.id);
        return res.json({ booking_ref: existing.booking_ref, guests: existingGuests, _deduplicated: true });
      }
    }

    // Fast pre-check (outside transaction) — rejects obviously unavailable rooms
    // before hitting Razorpay. The definitive check happens inside the transaction below.
    const preCheck = checkAvailability(db, venue, roomType, guests.length, guests);
    if (!preCheck.available) {
      return res.status(409).json({ error: preCheck.reason, sold_out: true });
    }

    const booking_ref = nextRef();

    // Extract numeric price (e.g. "₹45,500" → 45500), then add 5% GST for Razorpay
    const amountRaw = String(totalPrice).replace(/[^\d]/g, '');
    const baseAmount = parseInt(amountRaw, 10);

    // Server-side price floor: client cannot submit less than the active phase price × guest count
    const priceTiers = PRICING[venue]?.[roomType];
    if (priceTiers) {
      const activePhase = resolvePhase();
      const minExpected = (priceTiers.flat ?? priceTiers[activePhase] ?? priceTiers.earlyBird ?? 0) * guests.length;
      if (baseAmount < minExpected) {
        return res.status(400).json({ error: `Invalid price submitted. Minimum for ${venue} ${roomType} is ₹${minExpected.toLocaleString('en-IN')} for ${guests.length} guest(s).` });
      }
    }

    const amountWithGst = Math.round(baseAmount * 1.05);
    const amountWithSurcharge = Math.round(amountWithGst * 1.0236);
    const amountPaise = amountWithSurcharge * 100;

    let razorpay_order_id = null;
    const rzp = getRazorpay();
    if (rzp) {
      const order = await rzp.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: booking_ref,
        notes: { venue, room_type: roomType, booking_ref },
      });
      razorpay_order_id = order.id;
    }

    const insertBooking = db.prepare(`
      INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, razorpay_order_id, gst_number, gst_name, addons, arrival_date, organizer_note, phase)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertGuest = db.prepare(`
      INSERT INTO guests (booking_id, guest_number, full_name, whatsapp, email, city, age, gender, address, state, pin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Also create a Razorpay payment link for email/fallback
    let payment_link_url = null;
    if (rzp) {
      try {
        const gst = amountWithGst - baseAmount;
        const plink = await rzp.paymentLink.create({
          amount: amountPaise,
          currency: 'INR',
          accept_partial: false,
          description: `Moon Festival 2026 — ${venue} · ${roomType}. Base ₹${baseAmount.toLocaleString('en-IN')} + GST ₹${gst.toLocaleString('en-IN')} + Gateway fee ₹${(amountWithSurcharge - amountWithGst).toLocaleString('en-IN')} = ₹${amountWithSurcharge.toLocaleString('en-IN')}.`,
          customer: {
            name:    guests[0]?.full_name || '',
            email:   guests[0]?.email || '',
            contact: (guests[0]?.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91'),
          },
          notify: { sms: false, email: false },
          reminder_enable: false,
          notes: { booking_ref, type: 'new_booking' },
          callback_url: `${process.env.SITE_URL || 'https://moonfestival.in'}/booking-confirmed.html`,
          callback_method: 'get',
        });
        payment_link_url = plink.short_url;
      } catch (plinkErr) {
        console.error('[bookings/create] payment link creation failed:', plinkErr.message);
      }
    }

    // BEGIN IMMEDIATE acquires a write lock so no other request can slip in
    // between the availability re-check and the insert.
    db.exec('BEGIN IMMEDIATE');
    let bookingId;
    try {
      const finalCheck = checkAvailability(db, venue, roomType, guests.length, guests);
      if (!finalCheck.available) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: finalCheck.reason, sold_out: true });
      }
      const { lastInsertRowid } = insertBooking.run(booking_ref, venue, roomType, totalPrice, guests.length, razorpay_order_id, gstNumber || null, gstName || null, addons || null, arrival_date, organizerNote || null, resolvePhase());
      bookingId = lastInsertRowid;
      guests.forEach((g, i) => {
        const normCity = normalizeCity(g.city);
        insertGuest.run(lastInsertRowid, i + 1, g.full_name, g.whatsapp, g.email, normCity, g.age ? Number(g.age) : null, g.gender || null, g.address || null, g.state || null, g.pin || null);
      });
      db.exec('COMMIT');
      autoAssignRoom(db, lastInsertRowid);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    if (payment_link_url) {
      db.prepare('UPDATE bookings SET payment_link_url=? WHERE booking_ref=?').run(payment_link_url, booking_ref);
    }

    // Alert admin of every new booking so drop-offs are visible
    try {
      const guestRows = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(bookingId);
      const newBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
      sendNewBookingAlert({ booking: newBooking, guests: guestRows, amountWithGst }).catch(() => {});
    } catch (_) {}

    res.json({
      booking_ref,
      razorpay_order_id,
      razorpay_key: process.env.RAZORPAY_KEY_ID || null,
      amount: amountPaise,
      currency: 'INR',
      razorpay_enabled: !!rzp,
      payment_link_url,
    });
  } catch (err) {
    console.error('[bookings/create]', err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// POST /api/bookings/verify  — called after Razorpay payment success
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return res.status(503).json({ error: 'Payment verification unavailable — server misconfiguration' });
    const expected = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    db.prepare(`
      UPDATE bookings SET status='paid', razorpay_payment_id=?, paid_at=CURRENT_TIMESTAMP
      WHERE razorpay_order_id=?
    `).run(razorpay_payment_id, razorpay_order_id);

    const booking = db.prepare('SELECT * FROM bookings WHERE razorpay_order_id=?').get(razorpay_order_id);
    const guests  = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);

    try {
      await sendConfirmation({ booking, guests });
      db.prepare('UPDATE bookings SET email_sent=1 WHERE id=?').run(booking.id);
      db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent')").run(booking.booking_ref);
    } catch (e) { console.error('[email]', e.message); }

    res.json({ ok: true, booking_ref: booking.booking_ref });
  } catch (err) {
    console.error('[bookings/verify]', err);
    res.status(500).json({ error: 'Verification error' });
  }
});

// POST /api/bookings/confirm-free — admin-only fallback when Razorpay is not yet active
router.post('/confirm-free', (req, res, next) => {
  if (!req.session?.admin) return res.status(403).json({ error: 'Admin only' });
  next();
}, async (req, res) => {
  try {
    const { booking_ref } = req.body;
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    db.prepare("UPDATE bookings SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE booking_ref=?").run(booking_ref);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);

    try {
      await sendConfirmation({ booking: updatedBooking, guests });
      db.prepare('UPDATE bookings SET email_sent=1 WHERE booking_ref=?').run(booking_ref);
    } catch (e) { console.error('[email]', e.message); }

    res.json({ ok: true, booking_ref });
  } catch (err) {
    console.error('[bookings/confirm-free]', err);
    res.status(500).json({ error: 'Error confirming booking' });
  }
});

// POST /api/bookings/paylink-webhook — Razorpay Payment Link paid event
router.post('/paylink-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) return res.status(503).json({ error: 'Webhook not configured — server misconfiguration' });
    if (!signature) return res.status(400).json({ error: 'Missing webhook signature' });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;

    // payment.captured — safety net for Razorpay Checkout (client-side /verify may have been missed)
    if (payload.event === 'payment.captured') {
      const pay = payload.payload?.payment?.entity;
      if (pay?.order_id) {
        const booking = db.prepare('SELECT * FROM bookings WHERE razorpay_order_id=? AND deleted_at IS NULL').get(pay.order_id);
        if (booking && booking.status !== 'paid') {
          db.prepare(`UPDATE bookings SET status='paid', razorpay_payment_id=?, paid_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(pay.id, booking.id);
          db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'edit', 'Marked paid via payment.captured webhook')").run(booking.booking_ref);
          const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id=?').get(booking.id);
          const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
          if (!booking.email_sent) {
            sendConfirmation({ booking: updatedBooking, guests }).then(() => {
              db.prepare('UPDATE bookings SET email_sent=1 WHERE id=?').run(booking.id);
              db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent via payment.captured')").run(booking.booking_ref);
            }).catch(e => console.error('[webhook payment.captured email]', e.message));
          }
          console.log('[webhook] payment.captured confirmed:', booking.booking_ref);
        }
      }
      return res.json({ ok: true });
    }

    // Handle failed payments
    if (payload.event === 'payment.failed') {
      const pay = payload.payload?.payment?.entity;
      if (pay?.order_id) {
        const booking = db.prepare('SELECT * FROM bookings WHERE razorpay_order_id=?').get(pay.order_id);
        if (booking && booking.status === 'pending') {
          db.prepare("UPDATE bookings SET status='failed' WHERE id=?").run(booking.id);
          const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
          sendFailedPaymentAlert({ booking: { ...booking, status: 'failed' }, guests }).catch(() => {});
          console.log('[paylink-webhook] payment failed for', booking.booking_ref);
        }
      }
      return res.json({ ok: true });
    }

    if (payload.event === 'payment_link.expired' || payload.event === 'payment_link.cancelled') {
      const pl = payload.payload?.payment_link?.entity;
      const ref = pl?.notes?.booking_ref;
      if (ref) {
        const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(ref);
        if (booking && booking.status === 'pending') {
          db.prepare("UPDATE bookings SET status='expired' WHERE id=?").run(booking.id);
          db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(ref, 'edit', `Payment link ${payload.event} — booking auto-marked expired`);
          console.log(`[paylink-webhook] ${payload.event} for`, ref);
        }
      }
      return res.json({ ok: true });
    }

    if (payload.event !== 'payment_link.paid') return res.json({ ok: true, skipped: true });

    const pl = payload.payload?.payment_link?.entity;
    const pay = payload.payload?.payment?.entity;
    if (!pl) return res.status(400).json({ error: 'Missing payment_link entity' });

    const booking_ref  = pl.notes?.booking_ref;
    const linkType     = pl.notes?.type || '';
    const custom_ref   = pl.notes?.custom_ref;
    const payment_id   = pay?.id || null;

    // Custom payment (from /pay page) — mark paid in custom_payments table
    if (linkType === 'custom' && custom_ref) {
      db.prepare(`UPDATE custom_payments SET status='paid', razorpay_payment_id=?, paid_at=CURRENT_TIMESTAMP WHERE ref=?`)
        .run(payment_id, custom_ref);
      console.log('[paylink-webhook] custom payment paid:', custom_ref, payment_id);
      const cp = db.prepare('SELECT * FROM custom_payments WHERE ref=?').get(custom_ref);
      if (cp) sendCustomPaymentAlert(cp).catch(() => {});
      return res.json({ ok: true, custom_paid: true });
    }

    const booking = booking_ref
      ? db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref)
      : db.prepare('SELECT * FROM bookings WHERE razorpay_order_id=?').get(pl.id);

    if (!booking) {
      console.warn('[paylink-webhook] no booking found for ref:', booking_ref, '/ link id:', pl.id);
      return res.json({ ok: true });
    }

    // Add-on payment link paid → mark addons_collected
    if (linkType === 'addon') {
      db.prepare(`UPDATE bookings SET addons_collected=1 WHERE id=?`).run(booking.id);
      db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(
        booking.booking_ref, 'edit', `Add-on payment received online (${payment_id || 'unknown ID'})`
      );
      console.log('[paylink-webhook] addon payment confirmed for', booking.booking_ref);
      return res.json({ ok: true, addon_paid: true });
    }

    // Split Part 1 paid
    if (linkType === 'split_part1') {
      db.prepare(`UPDATE bookings SET split_part1_paid=1 WHERE id=?`).run(booking.id);
      db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(
        booking.booking_ref, 'edit', `Split Part 1 received (${payment_id || 'unknown ID'})`
      );
      console.log('[paylink-webhook] split part 1 paid for', booking.booking_ref);
      return res.json({ ok: true, split_part1: true });
    }

    // Split Part 2 paid — mark fully paid and send confirmation
    if (linkType === 'split_part2') {
      db.prepare(`UPDATE bookings SET split_part2_paid=1, status='paid', razorpay_payment_id=?, paid_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(payment_id, booking.id);
      db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(
        booking.booking_ref, 'edit', `Split Part 2 received — booking fully paid (${payment_id || 'unknown ID'})`
      );
      console.log('[paylink-webhook] split part 2 paid, fully confirmed:', booking.booking_ref);
      const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id=?').get(booking.id);
      const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
      try {
        await sendConfirmation({ booking: updatedBooking, guests });
        db.prepare('UPDATE bookings SET email_sent=1 WHERE id=?').run(booking.id);
        db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent')").run(booking.booking_ref);
      } catch (e) { console.error('[paylink-webhook split email]', e.message); }
      return res.json({ ok: true, split_part2: true, booking_ref: booking.booking_ref });
    }

    if (booking.status === 'paid') return res.json({ ok: true, already_paid: true });

    db.prepare(`UPDATE bookings SET status='paid', razorpay_payment_id=?, paid_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(payment_id, booking.id);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id=?').get(booking.id);
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);

    try {
      await sendConfirmation({ booking: updatedBooking, guests });
      db.prepare('UPDATE bookings SET email_sent=1 WHERE id=?').run(booking.id);
      db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent')").run(updatedBooking.booking_ref);
      console.log('[paylink-webhook] confirmed & emailed:', updatedBooking.booking_ref);
    } catch (e) {
      console.error('[paylink-webhook email]', e.message);
    }

    res.json({ ok: true, booking_ref: updatedBooking.booking_ref });
  } catch (err) {
    console.error('[paylink-webhook]', err);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// POST /api/bookings/upi-collect — send Razorpay UPI collect request to customer's VPA
router.post('/upi-collect', async (req, res) => {
  try {
    const { booking_ref, customer_vpa } = req.body;
    if (!booking_ref || !customer_vpa) return res.status(400).json({ error: 'Missing fields' });

    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const rzp = getRazorpay();
    if (!rzp) return res.status(503).json({ error: 'razorpay_not_configured' });

    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    const primaryGuest = guests[0];

    // Amount in paise (booking total_price is base; add 5% GST)
    const amountRaw = String(booking.total_price).replace(/[^\d]/g, '');
    const amountWithGst = Math.round(parseInt(amountRaw, 10) * 1.05);

    // Create Razorpay UPI collect payment
    const payment = await rzp.payments.createUpi({
      amount: amountWithGst * 100,
      currency: 'INR',
      order_id: booking.razorpay_order_id,
      email: primaryGuest?.email || 'guest@moonfestival.in',
      contact: (primaryGuest?.whatsapp || '9999999999').replace(/\D/g, ''),
      description: `Moon Festival 2026 · ${booking.venue} · ${booking.room_type}`,
      vpa: customer_vpa,
      callback_url: `${req.protocol}://${req.get('host')}/booking-confirmed.html?ref=${booking_ref}&method=upi`,
    });

    db.prepare("UPDATE bookings SET status='upi_pending', payment_method='upi' WHERE booking_ref=?").run(booking_ref);
    res.json({ ok: true, payment_id: payment.id });
  } catch (err) {
    console.error('[bookings/upi-collect]', err);
    res.status(500).json({ error: err.message || 'upi_collect_failed' });
  }
});

// POST /api/bookings/upi-screenshot — upload payment screenshot
router.post('/upi-screenshot', upload.single('screenshot'), (req, res) => {
  try {
    const { booking_ref } = req.body;
    if (!booking_ref || !req.file) return res.status(400).json({ error: 'Missing booking_ref or file' });
    const booking = db.prepare('SELECT id FROM bookings WHERE booking_ref=?').get(booking_ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    db.prepare('UPDATE bookings SET upi_screenshot=? WHERE booking_ref=?').run(req.file.filename, booking_ref);
    res.json({ ok: true, filename: req.file.filename });
  } catch (err) {
    console.error('[upi-screenshot]', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/bookings/public-config — UPI VPA and WhatsApp for frontend (no auth required)
router.get('/public-config', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    res.json({
      upi_vpa: settings.upi_vpa || 'moonholisticfestival@upi',
      admin_whatsapp:  settings.admin_whatsapp  || '919820791100',
      admin_whatsapp2: settings.admin_whatsapp2 || '919930920313',
    });
  } catch {
    res.json({ upi_vpa: 'moonholisticfestival@upi', admin_whatsapp: '919820791100', admin_whatsapp2: '919930920313' });
  }
});

// POST /api/bookings/upi-pending — customer has chosen UPI or cash, awaiting manual confirmation
router.post('/upi-pending', async (req, res) => {
  try {
    const { booking_ref, payment_method } = req.body; // payment_method: 'upi' or 'cash'
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    db.prepare("UPDATE bookings SET status='upi_pending', payment_method=? WHERE booking_ref=?")
      .run(payment_method || 'upi', booking_ref);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(updatedBooking.id);
    sendUpiAlert({ booking: updatedBooking, guests }).catch(() => {});
    sendUpiPendingGuest({ booking: updatedBooking, guests }).catch(() => {});

    res.json({ ok: true, booking_ref });
  } catch (err) {
    console.error('[bookings/upi-pending]', err);
    res.status(500).json({ error: 'Error' });
  }
});

// GET /api/bookings/lookup?ref=MF-0042 — public, no auth
// Create a fresh Razorpay order for checkout (called each time user clicks Pay via Razorpay)
router.post('/razorpay-order', async (req, res) => {
  const { ref } = req.body;
  if (!ref) return res.status(400).json({ error: 'Missing ref' });
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (booking.status === 'paid') return res.status(400).json({ error: 'Already paid' });
  const rzp = getRazorpay();
  if (!rzp) return res.status(503).json({ error: 'Razorpay not configured' });
  const baseInr = parseInt(String(booking.total_price).replace(/[^\d]/g, ''), 10) || 0;
  const withGst = Math.round(baseInr * 1.05);
  const amountPaise = Math.round(withGst * 1.0236) * 100;
  try {
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: ref,
      notes: { booking_ref: ref },
    });
    db.prepare('UPDATE bookings SET razorpay_order_id=? WHERE booking_ref=?').run(order.id, ref);
    res.json({ order_id: order.id, amount: amountPaise, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[razorpay-order]', err);
    res.status(500).json({ error: err.message });
  }
});

// Public cancel — only works on pending bookings (not paid)
router.post('/cancel', (req, res) => {
  const { ref } = req.body;
  if (!ref) return res.status(400).json({ error: 'Missing ref' });
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (booking.status === 'paid') return res.status(403).json({ error: 'Cannot cancel a paid booking' });
  db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_ref=?").run(ref);
  res.json({ ok: true });
});

router.get('/lookup', (req, res) => {
  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'Missing ref' });
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const guests = db.prepare('SELECT full_name, email, whatsapp, gender FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
  const baseAmt = parseInt(String(booking.total_price).replace(/[^\d]/g, ''), 10) || 0;
  res.json({
    booking_ref:       booking.booking_ref,
    venue:             booking.venue,
    room_type:         booking.room_type,
    status:            booking.status,
    payment_method:    booking.payment_method,
    arrival_date:      booking.arrival_date,
    addons:            booking.addons,
    amount_paid:       Math.round(baseAmt * 1.05),
    created_at:        booking.created_at,
    payment_link_url:  booking.payment_link_url || null,
    guests,
  });
});

// Public endpoint — no auth required
router.get('/availability', (req, res) => {
  const { getInventoryStats, checkAvailability } = require('../inventory');
  const stats = getInventoryStats(db);
  res.json(stats.map(s => {
    const femaleOnly = s.gender_rule === 'female_only';
    const maleAvail  = femaleOnly ? false
      : checkAvailability(db, s.venue, s.room_type, 1, [{ gender: 'Male' }]).available;
    const femaleAvail = checkAvailability(db, s.venue, s.room_type, 1, [{ gender: 'Female' }]).available;

    // For same_gender rooms compute gender-specific remaining so the badge
    // shows the right count (not total beds, which overstates when one gender's
    // slots are absorbed by partial rooms of the other gender).
    let remaining = s.available;
    if (s.gender_rule === 'same_gender' && s.room_size && s.capacity) {
      const totalRooms      = s.capacity / s.room_size;
      const maleRoomsUsed   = Math.ceil((s.maleBeds || 0) / s.room_size);
      const femaleRoomsUsed = Math.ceil((s.femaleBeds || 0) / s.room_size);
      const emptyRooms      = Math.max(0, totalRooms - maleRoomsUsed - femaleRoomsUsed);
      const maleSpare       = (s.maleBeds || 0) % s.room_size === 0 ? 0 : s.room_size - (s.maleBeds || 0) % s.room_size;
      const femaleSpare     = (s.femaleBeds || 0) % s.room_size === 0 ? 0 : s.room_size - (s.femaleBeds || 0) % s.room_size;
      const maleBedsLeft    = maleSpare + emptyRooms * s.room_size;
      const femaleBedsLeft  = femaleSpare + emptyRooms * s.room_size;
      if (!maleAvail && femaleAvail)  remaining = femaleBedsLeft;
      else if (maleAvail && !femaleAvail) remaining = maleBedsLeft;
      // both available: show the smaller of the two so the badge is conservative
      else if (maleAvail && femaleAvail) remaining = Math.min(maleBedsLeft, femaleBedsLeft);
    }

    const lowThreshold = Math.ceil((s.capacity || 1) * 0.2);
    return {
      venue: s.venue,
      room_type: s.room_type,
      available: s.available,
      sold_out: s.sold_out,
      remaining,
      capacity: s.capacity,
      low: remaining <= lowThreshold,
      female_only: femaleOnly,
      male_available: maleAvail,
      female_available: femaleAvail,
    };
  }));
});

module.exports = router;
