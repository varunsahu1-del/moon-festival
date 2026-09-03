const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { db, nextRef } = require('../db');
const { getInventoryStats, autoAssignRoom, checkAvailability, ROOM_LABELS, validateBookingPrice, GST_RATE, FOOD_PRICE_TOTAL } = require('../inventory');
const { sendConfirmation, sendQuote } = require('../email');
const { computeBreakdown } = require('../breakdown');

const { readSettings, writeSettings, resolvePhase } = require('../settings');
const { appendBookingRow, updateBookingRow, syncAllBookings } = require('../sheets');

function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expired — please refresh the page and log in again.' });
  res.redirect('/admin/login');
}

router.get('/', requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile('dashboard.html', { root: __dirname + '/../views' });
});

// API: summary stats
router.get('/api/stats', requireAdmin, (req, res) => {
  const totalBookings    = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='paid' AND deleted_at IS NULL").get().c;
  const pendingCount     = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status IN ('pending','upi_pending') AND deleted_at IS NULL").get().c;
  const totalGuests      = db.prepare("SELECT COALESCE(SUM(guest_count),0) as s FROM bookings WHERE status='paid' AND venue != 'Festival Access' AND deleted_at IS NULL").get().s;
  const festivalOnlyCount= db.prepare("SELECT COALESCE(SUM(guest_count),0) as s FROM bookings WHERE status='paid' AND venue = 'Festival Access' AND deleted_at IS NULL").get().s;

  // Sum total_price — strip non-numeric chars and sum in JS (stored as formatted string)
  const priceRows = db.prepare("SELECT total_price FROM bookings WHERE status='paid' AND deleted_at IS NULL").all();
  const totalRevenue = priceRows.reduce((sum, r) => {
    const base = parseInt(String(r.total_price).replace(/[^\d]/g, ''), 10) || 0;
    return sum + Math.round(base * 1.05);
  }, 0);

  const pendingRows = db.prepare("SELECT total_price, extra_addons, addons_collected FROM bookings WHERE status IN ('pending','upi_pending') AND deleted_at IS NULL").all();
  const pendingAmount = pendingRows.reduce((sum, r) => {
    const accom = parseInt(String(r.total_price).replace(/[^\d]/g, ''), 10) || 0;
    const gst = Math.round(accom * GST_RATE);
    const extraAddonAmt = (!r.addons_collected && r.extra_addons)
      ? r.extra_addons.split('|').filter(Boolean).reduce((s, p) => { const ci = p.indexOf(':'); return s + (ci >= 0 ? parseInt(p.slice(0, ci)) || 0 : 0); }, 0)
      : 0;
    return sum + accom + gst + extraAddonAmt;
  }, 0);

  const venueBreakdown = db.prepare(`
    SELECT venue, room_type, COUNT(*) as bookings, SUM(guest_count) as guests
    FROM bookings WHERE status='paid' AND deleted_at IS NULL
    GROUP BY venue, room_type ORDER BY venue, room_type
  `).all();

  const avgBedRate = totalGuests > 0 ? Math.round(totalRevenue / totalGuests) : 0;

  // Extra add-on revenue: admin-added add-ons that have been collected (extra_addons column)
  const addonRows = db.prepare("SELECT extra_addons FROM bookings WHERE addons_collected=1 AND extra_addons IS NOT NULL AND extra_addons != '' AND deleted_at IS NULL").all();
  const addonRevenue = addonRows.reduce((sum, r) => {
    return sum + r.extra_addons.split('|').filter(Boolean).reduce((s, p) => {
      const price = parseInt(p.split(':')[0], 10);
      return s + (isNaN(price) ? 0 : price);
    }, 0);
  }, 0);

  // Pending extra add-ons: admin-added but not yet collected
  const pendingAddonRows = db.prepare("SELECT extra_addons FROM bookings WHERE (addons_collected IS NULL OR addons_collected=0) AND extra_addons IS NOT NULL AND extra_addons != '' AND status IN ('paid','upi_pending','pending') AND deleted_at IS NULL").all();
  const pendingAddonAmount = pendingAddonRows.reduce((sum, r) => {
    return sum + r.extra_addons.split('|').filter(Boolean).reduce((s, p) => {
      const price = parseInt(p.split(':')[0], 10);
      return s + (isNaN(price) ? 0 : price);
    }, 0);
  }, 0);

  const inventory = getInventoryStats(db);

  const phaseRows = db.prepare(`
    SELECT phase, COUNT(*) as c FROM bookings
    WHERE status='paid' AND deleted_at IS NULL AND phase IS NOT NULL
    GROUP BY phase
  `).all();
  const phaseStats = { earlyBird: 0, phase1: 0, phase2: 0, phase3: 0, phase4: 0 };
  phaseRows.forEach(r => { if (r.phase in phaseStats) phaseStats[r.phase] = r.c; });

  res.json({ totalBookings, pendingCount, pendingAmount, totalGuests, festivalOnlyCount, totalRevenue, addonRevenue, pendingAddonAmount, avgBedRate, venueBreakdown, inventory, phaseStats });
});

// API: all bookings + guests
router.get('/api/bookings', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.id as booking_id, b.booking_ref, b.venue, b.room_type, b.total_price,
           b.guest_count, b.status, b.payment_method, b.created_at, b.paid_at, b.room_number, b.email_sent,
           b.addons, b.extra_addons, b.addons_collected, b.addons_collection_method, b.addons_collected_at, b.upi_screenshot, b.razorpay_payment_id, b.transfer_email_pending,
           b.discount, b.discount_reason, b.phase, b.source, b.arrival_date, b.organizer_note, b.admin_verified,
           g.id as guest_id, g.guest_number, g.full_name, g.whatsapp, g.email, g.city, g.age, g.gender, g.notes,
           g.room_number as guest_room_number,
           COALESCE(g.room_number, b.room_number) as effective_room_number
    FROM bookings b
    LEFT JOIN guests g ON g.booking_id = b.id
    WHERE b.deleted_at IS NULL
    ORDER BY b.created_at DESC, g.guest_number ASC
  `).all();
  res.json(rows);
});

// API: trash — list deleted bookings
router.get('/api/trash', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.id as booking_id, b.booking_ref, b.venue, b.room_type, b.total_price,
           b.guest_count, b.status, b.payment_method, b.created_at, b.deleted_at,
           g.full_name, g.whatsapp, g.email
    FROM bookings b
    LEFT JOIN guests g ON g.booking_id = b.id AND g.guest_number = 1
    WHERE b.deleted_at IS NOT NULL
    ORDER BY b.deleted_at DESC
  `).all();
  res.json(rows);
});

// API: soft-delete (move to trash)
router.delete('/api/bookings/:ref', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=? AND deleted_at IS NULL').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE bookings SET deleted_at=datetime('now','localtime') WHERE booking_ref=?").run(req.params.ref);
  const { reason } = req.body || {};
  const note = reason ? `Moved to trash — ${reason}` : 'Moved to trash';
  db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'delete', ?)").run(req.params.ref, note);
  res.json({ ok: true });
});

// API: restore from trash
router.post('/api/trash/:ref/restore', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=? AND deleted_at IS NOT NULL').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Not in trash' });
  db.prepare('UPDATE bookings SET deleted_at=NULL WHERE booking_ref=?').run(req.params.ref);
  db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'restore', 'Restored from trash')").run(req.params.ref);
  res.json({ ok: true });
});

// API: single booking detail
router.get('/api/bookings/:ref', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
  const primaryGuest = guests[0];
  booking.effective_room_number = (primaryGuest && primaryGuest.room_number) || booking.room_number || null;
  res.json({ booking, guests, breakdown: computeBreakdown(booking) });
});

router.get('/api/bookings/:ref/breakdown', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(computeBreakdown(booking));
});

// API: update payment method for a booking
router.patch('/api/bookings/:ref/payment-method', requireAdmin, (req, res) => {
  const { payment_method } = req.body;
  db.prepare('UPDATE bookings SET payment_method=? WHERE booking_ref=?').run(payment_method || null, req.params.ref);
  res.json({ ok: true });
});

// API: update add-ons for a booking
router.patch('/api/bookings/:ref/addons', requireAdmin, (req, res) => {
  const { addons, note } = req.body;
  const ref = req.params.ref;
  db.prepare('UPDATE bookings SET extra_addons=? WHERE booking_ref=?').run(addons || null, ref);
  if (note) db.prepare('INSERT INTO addon_log (booking_ref, note) VALUES (?, ?)').run(ref, note);
  res.json({ ok: true });
});

router.get('/api/bookings/:ref/addon-log', requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT note, created_at FROM addon_log WHERE booking_ref=? ORDER BY created_at ASC').all(req.params.ref);
  res.json(logs);
});

router.get('/api/bookings/:ref/booking-log', requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT type, note, created_at FROM booking_log WHERE booking_ref=? ORDER BY created_at ASC').all(req.params.ref);
  res.json(logs);
});

router.patch('/api/bookings/:ref/addons-collected', requireAdmin, (req, res) => {
  const { collected, amount, method } = req.body;
  const addonAmt = Number(amount) || 0;
  const booking = db.prepare('SELECT total_price, addons_collected FROM bookings WHERE booking_ref=?').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });

  const baseNum = parseInt(String(booking.total_price).replace(/[^\d]/g, ''), 10) || 0;
  const wasCollected = !!booking.addons_collected;
  let newBase = baseNum;
  if (collected && !wasCollected) newBase = baseNum + addonAmt;
  if (!collected && wasCollected) newBase = Math.max(0, baseNum - addonAmt);
  const newTotal = '₹' + newBase.toLocaleString('en-IN');

  const collectedAt = collected ? new Date().toISOString() : null;
  db.prepare('UPDATE bookings SET addons_collected=?, addons_collection_method=?, addons_collected_at=?, total_price=? WHERE booking_ref=?')
    .run(collected ? 1 : 0, collected ? (method || 'cash') : null, collectedAt, newTotal, req.params.ref);

  const methodLabel = method || 'cash';
  const note = collected
    ? `Add-on payment collected via ${methodLabel} — ₹${addonAmt.toLocaleString('en-IN')} added to total (now ${newTotal})`
    : `Add-on payment collection undone — ₹${addonAmt.toLocaleString('en-IN')} removed from total (now ${newTotal})`;
  db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(req.params.ref, 'addon_payment', note);
  res.json({ ok: true, new_total: newTotal });
});

// API: resend payment link for pending bookings
router.post('/api/bookings/:ref/resend-paylink', requireAdmin, async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Not found' });
    if (booking.status === 'paid') return res.status(400).json({ error: 'Booking is already paid' });

    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    const primary = guests[0] || {};
    const baseAmt = parseInt(String(booking.total_price).replace(/[^\d]/g, ''), 10) || 0;
    const amountWithGst = Math.round(baseAmt * 1.05);
    const amountPaise   = Math.round(amountWithGst * 1.0236) * 100;

    let payment_link_url = booking.payment_link_url;

    let Razorpay;
    try { Razorpay = require('razorpay'); } catch (_) {}
    if (Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const plink = await rzp.paymentLink.create({
        amount: amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: `Moon Festival 2026 — ${booking.venue} · ${booking.room_type}. Total incl. 5% GST + 2.36% fee: ₹${Math.round(amountPaise / 100).toLocaleString('en-IN')}.`,
        customer: {
          name:    primary.full_name || '',
          email:   primary.email || '',
          contact: (primary.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91'),
        },
        notify: { sms: false, email: false },
        reminder_enable: true,
        notes: { booking_ref: booking.booking_ref, type: 'resend_paylink' },
        callback_url: `${process.env.SITE_URL || 'https://moonfestival.in'}/booking-confirmed.html`,
        callback_method: 'get',
      });
      payment_link_url = plink.short_url;
      db.prepare('UPDATE bookings SET payment_link_url=? WHERE booking_ref=?').run(payment_link_url, booking.booking_ref);
    }

    if (!payment_link_url) return res.status(503).json({ error: 'Razorpay not configured and no existing link' });

    const { sendPaymentPendingEmail } = require('../email');
    await sendPaymentPendingEmail({ booking, guests, paymentLink: payment_link_url, amountWithGst });

    db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(
      booking.booking_ref, 'edit', 'Payment link resent to guest'
    );

    res.json({ ok: true, payment_link: payment_link_url });
  } catch (err) {
    console.error('[resend-paylink]', err);
    res.status(500).json({ error: err.message || 'Failed' });
  }
});

// API: split payment link (two Razorpay links, one email)
router.post('/api/bookings/:ref/split-paylink', requireAdmin, async (req, res) => {
  try {
    const { part1, total } = req.body;
    if (!part1 || part1 <= 0 || part1 >= total) return res.status(400).json({ error: 'Invalid part1 amount' });
    const part2 = total - part1;

    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Not found' });
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    const primary = guests[0] || {};
    const contact = (primary.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91');

    let Razorpay;
    try { Razorpay = require('razorpay'); } catch (_) {}
    if (!Razorpay || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Razorpay not configured' });
    }
    const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const cb = `${process.env.SITE_URL || 'https://moonfestival.in'}/booking-confirmed.html`;

    const [link1, link2] = await Promise.all([
      rzp.paymentLink.create({
        amount: part1 * 100, currency: 'INR', accept_partial: false,
        description: `Moon Festival 2026 — ${booking.booking_ref} · Part 1 of 2 (₹${part1.toLocaleString('en-IN')} of ₹${total.toLocaleString('en-IN')})`,
        customer: { name: primary.full_name || '', email: primary.email || '', contact },
        notify: { sms: false, email: false }, reminder_enable: true,
        notes: { booking_ref: booking.booking_ref, type: 'split_part1' },
        callback_url: cb, callback_method: 'get',
      }),
      rzp.paymentLink.create({
        amount: part2 * 100, currency: 'INR', accept_partial: false,
        description: `Moon Festival 2026 — ${booking.booking_ref} · Part 2 of 2 (₹${part2.toLocaleString('en-IN')} balance)`,
        customer: { name: primary.full_name || '', email: primary.email || '', contact },
        notify: { sms: false, email: false }, reminder_enable: true,
        notes: { booking_ref: booking.booking_ref, type: 'split_part2' },
        callback_url: cb, callback_method: 'get',
      }),
    ]);

    db.prepare('UPDATE bookings SET payment_link_url=?, payment_link2_url=? WHERE booking_ref=?').run(link1.short_url, link2.short_url, booking.booking_ref);
    db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(
      booking.booking_ref, 'edit',
      `Split payment links sent — Part 1: ₹${part1.toLocaleString('en-IN')} · Part 2: ₹${part2.toLocaleString('en-IN')}`
    );

    const { sendSplitPaymentEmail } = require('../email');
    await sendSplitPaymentEmail({ booking, guests, part1, part2, total, link1: link1.short_url, link2: link2.short_url });

    res.json({ ok: true, link1: link1.short_url, link2: link2.short_url });
  } catch (err) {
    console.error('[split-paylink]', err);
    res.status(500).json({ error: err.message || 'Failed' });
  }
});

// API: create Razorpay payment link for add-ons + send email
router.post('/api/bookings/:ref/addon-paylink', requireAdmin, async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Parse admin-added extra add-ons (not guest's original already-paid add-ons)
    const addonParts = (booking.extra_addons || '').split('|').filter(Boolean);
    if (!addonParts.length) return res.status(400).json({ error: 'No admin add-ons on this booking' });

    const addonLines = addonParts.map(p => {
      const ci = p.indexOf(':');
      return { price: ci >= 0 ? parseInt(p.slice(0, ci)) || 0 : 0, name: ci >= 0 ? p.slice(ci + 1) : p };
    });
    const addonTotal = addonLines.reduce((s, a) => s + a.price, 0);
    if (addonTotal <= 0) return res.status(400).json({ error: 'Add-on total is zero' });

    const gstAmount      = Math.round(addonTotal * 0.05);
    const afterGst       = addonTotal + gstAmount;
    const razorpayFee    = Math.round(afterGst * 0.0236);
    const amountWithGst  = afterGst + razorpayFee;

    let Razorpay;
    try { Razorpay = require('razorpay'); } catch (_) {}
    if (!Razorpay || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Razorpay not configured' });
    }

    const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    const primary = guests[0] || {};

    const plink = await rzp.paymentLink.create({
      amount: amountWithGst * 100,
      currency: 'INR',
      accept_partial: false,
      description: `Moon Festival 2026 — Add-ons for ${booking.booking_ref}. Total incl. 5% GST + 2.36% fee: ₹${amountWithGst.toLocaleString('en-IN')}.`,
      customer: {
        name:    primary.full_name || '',
        email:   primary.email || '',
        contact: (primary.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91'),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { booking_ref: booking.booking_ref, type: 'addon' },
      callback_url: `${process.env.SITE_URL || 'https://moonfestival.in'}/booking-confirmed.html`,
      callback_method: 'get',
    });

    db.prepare('INSERT INTO addon_log (booking_ref, note) VALUES (?, ?)').run(
      booking.booking_ref,
      `Payment link sent — ₹${amountWithGst.toLocaleString('en-IN')} incl. 5% GST + 2.36% Razorpay fee`
    );
    db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(
      booking.booking_ref, 'addon', `Add-on payment link sent — ₹${amountWithGst.toLocaleString('en-IN')} incl. 5% GST + 2.36% Razorpay fee`
    );

    try {
      const { sendAddonPaymentEmail } = require('../email');
      const addedItems = Array.isArray(req.body.addedItems) ? req.body.addedItems : null;
      await sendAddonPaymentEmail({ booking, guests, addonLines, addonTotal, gstAmount, razorpayFee, amountWithGst, paymentLink: plink.short_url, addedItems });
    } catch (emailErr) {
      console.error('[addon-paylink email]', emailErr.message);
    }

    res.json({ ok: true, payment_link: plink.short_url });
  } catch (err) {
    console.error('[addon-paylink]', err);
    res.status(500).json({ error: err.message || 'Failed to create payment link' });
  }
});

// API: CSV export
router.get('/api/export', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.booking_ref, b.venue, b.room_type, b.room_number, b.total_price, b.guest_count,
           b.status, b.razorpay_payment_id, b.created_at, b.paid_at,
           g.guest_number, g.full_name, g.whatsapp, g.email, g.city, g.age, g.gender
    FROM bookings b
    JOIN guests g ON g.booking_id = b.id
    ORDER BY b.created_at DESC, g.guest_number
  `).all();

  function esc(v) {
    if (v == null) return '';
    const s = String(v).replace(/^₹/, '');
    return '"' + s.replace(/"/g, '""') + '"';
  }

  const headers = ['Booking Ref','Venue','Room Type','Room No.','Total Price (INR)','Guest Count','Status','Payment ID','Created At','Paid At','Guest #','Full Name','WhatsApp','Email','City','Age','Gender'];
  const csv = [headers.join(','), ...rows.map(r =>
    [esc(r.booking_ref), esc(r.venue), esc(r.room_type), esc(r.room_number), esc(r.total_price), esc(r.guest_count),
     esc(r.status), esc(r.razorpay_payment_id), esc(r.created_at), esc(r.paid_at),
     esc(r.guest_number), esc(r.full_name), esc(r.whatsapp), esc(r.email), esc(r.city), esc(r.age), esc(r.gender)].join(',')
  )].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="moon-festival-registrations.csv"');
  res.send('﻿' + csv); // BOM so Excel opens UTF-8 correctly
});

// API: create booking + Razorpay payment link, send to guest
router.post('/api/bookings/paylink', requireAdmin, async (req, res) => {
  let Razorpay;
  try { Razorpay = require('razorpay'); } catch (_) {}

  const { venue, room_type, total_price, total_with_gst, room_number, guests, admin_override, discount, discount_reason } = req.body;
  if (!venue || !room_type || !total_price || !Array.isArray(guests) || !guests.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!admin_override) {
    const avail = checkAvailability(db, venue, room_type, guests.length, guests);
    if (!avail.available) return res.status(409).json({ error: avail.reason, sold_out: true });
  }

  if (!admin_override) {
    const priceCheck = validateBookingPrice({ venue, room_type, guest_count: guests.length, addons: req.body.addons, discount, total_price }, resolvePhase());
    if (!priceCheck.valid) return res.status(400).json({ error: priceCheck.reason, price_mismatch: true, expected: priceCheck.expected });
  }

  const booking_ref = nextRef();
  // total_price is pre-GST base (venue + addons); apply GST then Razorpay fee
  const baseAmt = parseInt(String(total_price).replace(/[^\d]/g, ''), 10) || 0;
  const amountWithGst = Math.round(baseAmt * 1.05);
  const amountPaise = Math.round(amountWithGst * 1.0236) * 100;
  const guest = guests[0];

  const _phase1 = resolvePhase();
  const insertBooking = db.prepare(`
    INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number, payment_method, arrival_date, addons, discount, discount_reason, phase, source)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 'admin')
  `);
  const insertGuest = db.prepare(`
    INSERT INTO guests (booking_id, guest_number, full_name, whatsapp, email, city, age, gender)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  let bookingId;
  try {
    const { lastInsertRowid } = insertBooking.run(booking_ref, venue, room_type, total_price, guests.length, room_number || null, req.body.payment_method || null, req.body.arrival_date || null, req.body.addons || null, discount || null, discount_reason || null, _phase1);
    bookingId = lastInsertRowid;
    guests.forEach((g, i) => {
      const nc1 = g.city ? g.city.trim().replace(/\b\w/g, c => c.toUpperCase()) : null;
      insertGuest.run(lastInsertRowid, i + 1, g.full_name, g.whatsapp, g.email, nc1, g.age ? Number(g.age) : null, g.gender || null);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'DB error: ' + e.message });
  }

  // If caller just wants the booking created (e.g. will send split links next), return early
  if (req.body.skip_paylink) {
    return res.json({ ok: true, booking_ref, payment_link_url: null });
  }

  let payment_link_url = null;
  let payment_link_id = null;

  try {
    if (Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const link = await rzp.paymentLink.create({
        amount: amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: `Moon Festival 2026 — ${venue} · ${room_type}`,
        customer: {
          name:    guest.full_name,
          email:   guest.email,
          contact: guest.whatsapp.replace(/\D/g, '').replace(/^0/, '91'),
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { booking_ref, venue, room_type },
        callback_url: `${process.env.SITE_URL || 'https://moonfestival.in'}/booking-confirmed.html`,
        callback_method: 'get',
      });
      payment_link_url = link.short_url;
      payment_link_id  = link.id;
      db.prepare('UPDATE bookings SET razorpay_order_id=? WHERE id=?').run(payment_link_id, bookingId);
    }
  } catch (e) {
    console.error('[paylink] Razorpay error:', e.message);
  }

  // Send Moon Festival email with full breakdown incl. Razorpay fee
  if (payment_link_url) {
    const gstAmount   = amountWithGst - Math.round(amountWithGst / 1.05);
    const razorpayFee = Math.round(amountWithGst * 1.0236) - amountWithGst;
    const totalCharged = amountWithGst + razorpayFee;
    try {
      const { sendPaymentPendingEmail } = require('../email');
      const bookingRow = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
      const guestRows  = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(bookingId);
      await sendPaymentPendingEmail({ booking: bookingRow, guests: guestRows, paymentLink: payment_link_url, amountWithGst });
      db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', ?)").run(booking_ref, `Payment link email sent — ₹${totalCharged.toLocaleString('en-IN')} incl. GST + 2.36% fee`);
    } catch (emailErr) {
      console.error('[paylink email]', emailErr.message);
    }
  }

  console.log(`[paylink] ${booking_ref} created for ${guest.full_name} — ${payment_link_url || 'no link (Razorpay not configured)'}`);
  res.json({ ok: true, booking_ref, payment_link_url });
});

// API: admin-created booking (paid immediately, no Razorpay)
router.post('/api/bookings', requireAdmin, (req, res) => {
  const { venue, room_type, total_price, room_number, hotel_number, status, send_email, guests, payment_method, arrival_date, addons, gst_number, gst_name, organizerNote, admin_override, discount, discount_reason } = req.body;
  if (!venue || !room_type || !total_price || !Array.isArray(guests) || !guests.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!admin_override) {
    const avail = checkAvailability(db, venue, room_type, guests.length, guests);
    if (!avail.available) return res.status(409).json({ error: avail.reason, sold_out: true });
  }

  if (!admin_override) {
    const priceCheck2 = validateBookingPrice({ venue, room_type, guest_count: guests.length, addons, discount, total_price }, resolvePhase());
    if (!priceCheck2.valid) return res.status(400).json({ error: priceCheck2.reason, price_mismatch: true, expected: priceCheck2.expected });
  }

  const booking_ref = nextRef();
  const bookingStatus = status || 'paid';
  const paid_at = bookingStatus === 'paid' ? new Date().toISOString() : null;

  const _phase2 = resolvePhase();
  const insertBooking = db.prepare(`
    INSERT INTO bookings (booking_ref, venue, room_type, total_price, guest_count, status, room_number, paid_at, payment_method, arrival_date, addons, gst_number, gst_name, organizer_note, discount, discount_reason, phase, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')
  `);
  const insertGuest = db.prepare(`
    INSERT INTO guests (booking_id, guest_number, full_name, whatsapp, email, city, age, gender)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = insertBooking.run(booking_ref, venue, room_type, total_price, guests.length, bookingStatus, room_number || null, paid_at, payment_method || null, arrival_date || null, addons || null, gst_number || null, gst_name || null, organizerNote || null, discount || null, discount_reason || null, _phase2);
    guests.forEach((g, i) => {
      const nc2 = g.city ? g.city.trim().replace(/\b\w/g, c => c.toUpperCase()) : null;
      insertGuest.run(lastInsertRowid, i + 1, g.full_name, g.whatsapp, g.email, nc2, Number(g.age), g.gender || null);
    });
    db.exec('COMMIT');
    if (room_number && hotel_number) {
      db.prepare(`INSERT INTO room_hotel_numbers (venue, label, hotel_number) VALUES (?, ?, ?)
        ON CONFLICT(venue, label) DO UPDATE SET hotel_number = excluded.hotel_number`)
        .run(venue, room_number, hotel_number.trim());
    }
    // Only auto-assign if admin didn't manually specify a room number
    if (!room_number) autoAssignRoom(db, lastInsertRowid);
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'DB error: ' + e.message });
  }

  if (send_email) {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
    const guestRows = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    sendConfirmation({ booking, guests: guestRows })
      .then(() => {
        db.prepare('UPDATE bookings SET email_sent=1 WHERE booking_ref=?').run(booking_ref);
        db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent')").run(booking_ref);
      })
      .catch(err => console.error('[admin-booking email]', err));
  }

  // Sync to Google Sheet
  const newBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(booking_ref);
  const newGuests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(newBooking.id);
  appendBookingRow(newBooking, newGuests).catch(() => {});

  res.json({ ok: true, booking_ref });
});

// API: bulk auto-assign rooms to all unassigned bookings
router.post('/api/bookings/auto-assign-rooms', requireAdmin, (req, res) => {
  const unassigned = db.prepare(`
    SELECT id, venue, room_type FROM bookings
    WHERE room_number IS NULL AND status IN ('paid','pending','upi_pending')
  `).all();
  const results = unassigned.map(b => ({
    id: b.id, venue: b.venue, room_type: b.room_type,
    assigned: autoAssignRoom(db, b.id),
  }));
  const assigned = results.filter(r => r.assigned).length;
  res.json({ ok: true, total: unassigned.length, assigned });
});

// API: update booking fields
router.put('/api/bookings/:ref', requireAdmin, (req, res) => {
  const { total_price, status, room_number, addons } = req.body;

  if (room_number) {
    const thisBooking = db.prepare('SELECT id, venue, room_type, guest_count FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (thisBooking) {
      const { INVENTORY } = require('../inventory');
      const invItem = INVENTORY.find(i => i.venue === thisBooking.venue && i.room_type === thisBooking.room_type);

      // Cross-type check: room must not be occupied by a different room_type
      const crossType = db.prepare(`
        SELECT b.room_type FROM guests g JOIN bookings b ON b.id=g.booking_id
        WHERE b.venue=? AND b.room_type != ? AND b.status IN ('paid','pending','upi_pending')
          AND COALESCE(g.room_number, b.room_number) = ? LIMIT 1
      `).get(thisBooking.venue, thisBooking.room_type, room_number);
      if (crossType) return res.status(400).json({ error: `Room ${room_number} is used by a ${crossType.room_type} booking — cannot assign a ${thisBooking.room_type} booking there.` });

      // Gender rule check
      if (invItem && invItem.gender_rule !== 'any') {
        const bookingGenders = db.prepare(`SELECT DISTINCT gender FROM guests WHERE booking_id=?`).all(thisBooking.id).map(r => r.gender).filter(Boolean);
        const occupantGenders = db.prepare(`
          SELECT DISTINCT g.gender FROM guests g JOIN bookings b ON b.id=g.booking_id
          WHERE COALESCE(g.room_number, b.room_number)=? AND b.id != ? AND b.status IN ('paid','pending','upi_pending')
        `).all(room_number, thisBooking.id).map(r => r.gender).filter(Boolean);
        if (invItem.gender_rule === 'female_only' && bookingGenders.includes('Male')) {
          return res.status(400).json({ error: `Room ${room_number} is female-only — cannot assign a booking with male guests.` });
        }
        if (invItem.gender_rule === 'same_gender' && occupantGenders.length > 0) {
          const og = occupantGenders[0];
          if (bookingGenders.some(g => g !== og)) return res.status(400).json({ error: `Room ${room_number} is reserved for ${og} guests only.` });
        }
      }

      // Capacity check
      const roomSize = invItem?.room_size || 99;
      const occupants = db.prepare(`
        SELECT COUNT(*) as c FROM guests g JOIN bookings b ON b.id=g.booking_id
        WHERE COALESCE(g.room_number, b.room_number) = ? AND b.id != ? AND b.status IN ('paid','pending','upi_pending') AND b.deleted_at IS NULL
      `).get(room_number, thisBooking.id);
      if ((occupants?.c || 0) + thisBooking.guest_count > roomSize) {
        return res.status(409).json({ error: `Room ${room_number} is full — it has ${occupants?.c} of ${roomSize} beds occupied.` });
      }
    }
  }

  const old = db.prepare('SELECT total_price, status, room_number FROM bookings WHERE booking_ref=?').get(req.params.ref);
  const nowPaid = status === 'paid' && old?.status !== 'paid';
  db.prepare(`UPDATE bookings SET total_price=?, status=?, room_number=?, addons=?${nowPaid ? ", paid_at=CURRENT_TIMESTAMP" : ""} WHERE booking_ref=?`)
    .run(total_price, status, room_number || null, addons || null, req.params.ref);

  // Log meaningful changes
  if (old) {
    const changes = [];
    if (old.status !== status) changes.push(`Status: ${old.status} → ${status}`);
    if (old.total_price !== total_price) changes.push(`Amount: ${old.total_price} → ${total_price}`);
    if ((old.room_number || '') !== (room_number || '')) changes.push(`Room: ${old.room_number || '(none)'} → ${room_number || '(none)'}`);
    if (changes.length) db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(req.params.ref, 'edit', changes.join(' · '));
  }
  res.json({ ok: true });
});

// API: update room number only (used by drag-and-drop)
router.patch('/api/bookings/:ref/room', requireAdmin, (req, res) => {
  const { room_number } = req.body;

  if (room_number) {
    const booking = db.prepare('SELECT id, venue, room_type, guest_count FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (booking) {
      const { INVENTORY } = require('../inventory');
      const invItem = INVENTORY.find(i => i.venue === booking.venue && i.room_type === booking.room_type);

      // Cross-type check
      const roomOccupiedByOtherType = db.prepare(`
        SELECT b.room_type FROM guests g JOIN bookings b ON b.id=g.booking_id
        WHERE b.venue=? AND b.room_type != ? AND b.status IN ('paid','pending','upi_pending')
          AND COALESCE(g.room_number, b.room_number) = ?
        LIMIT 1
      `).get(booking.venue, booking.room_type, room_number);
      if (roomOccupiedByOtherType) {
        return res.status(400).json({ error: `Room ${room_number} is used by a ${roomOccupiedByOtherType.room_type} booking — cannot assign a ${booking.room_type} booking there.` });
      }

      // Gender rule check
      if (invItem && invItem.gender_rule !== 'any') {
        const bookingGenders = db.prepare(`SELECT DISTINCT gender FROM guests WHERE booking_id=?`).all(booking.id).map(r => r.gender).filter(Boolean);
        const occupantGenders = db.prepare(`
          SELECT DISTINCT g.gender FROM guests g JOIN bookings b ON b.id=g.booking_id
          WHERE COALESCE(g.room_number, b.room_number)=? AND b.id != ? AND b.status IN ('paid','pending','upi_pending')
        `).all(room_number, booking.id).map(r => r.gender).filter(Boolean);

        if (invItem.gender_rule === 'female_only' && bookingGenders.includes('Male')) {
          return res.status(400).json({ error: `Room ${room_number} is female-only — cannot assign a booking with male guests.` });
        }
        if (invItem.gender_rule === 'same_gender' && occupantGenders.length > 0) {
          const occupantGender = occupantGenders[0];
          if (bookingGenders.some(g => g !== occupantGender)) {
            return res.status(400).json({ error: `Room ${room_number} is reserved for ${occupantGender} guests only.` });
          }
        }
      }

      // Capacity check
      const roomSize = invItem?.room_size || 99;
      const currentOccupants = db.prepare(`
        SELECT COUNT(*) as c FROM guests g JOIN bookings b ON b.id=g.booking_id
        WHERE COALESCE(g.room_number, b.room_number) = ?
          AND b.id != ?
          AND b.status IN ('paid','pending','upi_pending')
          AND b.deleted_at IS NULL
      `).get(room_number, booking.id);
      if ((currentOccupants?.c || 0) + booking.guest_count > roomSize) {
        return res.status(409).json({ error: `Room ${room_number} is full — it has ${currentOccupants?.c} of ${roomSize} beds occupied.` });
      }
    }
  }

  db.prepare('UPDATE bookings SET room_number=? WHERE booking_ref=?').run(room_number || null, req.params.ref);
  res.json({ ok: true });
});

// API: update guest fields
router.put('/api/guests/:id', requireAdmin, (req, res) => {
  const { full_name, whatsapp, email, city, age, gender, state, pin } = req.body;
  db.prepare(`UPDATE guests SET full_name=?, whatsapp=?, email=?, city=?, age=?, gender=?, state=?, pin=? WHERE id=?`)
    .run(full_name, whatsapp, email, city, Number(age), gender || null, state || null, pin || null, req.params.id);
  res.json({ ok: true });
});

// API: update guest notes only
router.patch('/api/guests/:id/notes', requireAdmin, (req, res) => {
  const { notes } = req.body;
  db.prepare('UPDATE guests SET notes=? WHERE id=?').run(notes || null, Number(req.params.id));
  res.json({ ok: true });
});

// API: toggle admin verified
router.patch('/api/bookings/:ref/verify', requireAdmin, (req, res) => {
  const { verified } = req.body;
  db.prepare('UPDATE bookings SET admin_verified=?, admin_verified_at=? WHERE booking_ref=?')
    .run(verified ? 1 : 0, verified ? new Date().toISOString() : null, req.params.ref);
  res.json({ ok: true });
});

// API: predefined room labels
router.get('/api/inventory/rooms', requireAdmin, (req, res) => {
  res.json(ROOM_LABELS);
});

// API: full config (pricing + venue-rooms + room labels) — single source of truth
router.get('/api/config', requireAdmin, (req, res) => {
  const { PRICING, VENUE_ROOMS } = require('../inventory');
  const phase = resolvePhase();
  res.json({ pricing: PRICING, venueRooms: VENUE_ROOMS, roomLabels: ROOM_LABELS, phase, gst_rate: GST_RATE, food_price: FOOD_PRICE_TOTAL });
});

// API: toggle Festival Only Pass open/closed
router.post('/api/settings/festival-pass', requireAdmin, (req, res) => {
  const { open } = req.body;
  const settings = readSettings();
  settings.festival_pass_open = !!open;
  writeSettings(settings);
  res.json({ ok: true, festival_pass_open: settings.festival_pass_open });
});

// API: get/set active pricing phase (admin only)
router.get('/api/phase', requireAdmin, (req, res) => {
  res.json(readSettings());
});
router.post('/api/phase', requireAdmin, (req, res) => {
  const { phase } = req.body;
  if (!['earlyBird', 'phase1', 'phase2', 'phase3', 'phase4'].includes(phase)) return res.status(400).json({ error: 'Invalid phase' });
  const settings = readSettings();
  settings.phase = phase;
  writeSettings(settings);
  res.json({ ok: true, phase });
});

// Public: active prices for tickets page (no auth required)
router.get('/api/public/pricing', (req, res) => {
  const { PRICING } = require('../inventory');
  const phase = resolvePhase();
  // Build flat map: venue → roomType → { active, final }
  const prices = {};
  for (const [venue, rooms] of Object.entries(PRICING)) {
    prices[venue] = {};
    for (const [roomType, tiers] of Object.entries(rooms)) {
      prices[venue][roomType] = {
        active:    tiers[phase]       ?? tiers.phase2,
        earlyBird: tiers.earlyBird    ?? tiers.phase2,
        phase2:    tiers.phase2       ?? tiers.earlyBird,
        phase3:    tiers.phase3       ?? tiers.phase2,
        phase4:    tiers.phase4       ?? tiers.phase2,
        extraDay:  tiers.extraDay     ?? 0,
      };
    }
  }
  const { festival_pass_open } = readSettings();
  res.json({ phase, prices, festival_pass_open: !!festival_pass_open, gst_rate: GST_RATE, food_price: FOOD_PRICE_TOTAL });
});

// Public: tribal lunch availability per day (cap 30 per day)
router.get('/api/public/tribal-lunch', (req, res) => {
  const TRIBAL_CAP = 70;
  const days = ['27', '28', '29'];
  const byDay = {};
  days.forEach(d => {
    const row = db.prepare(`SELECT COALESCE(SUM(guest_count), 0) as total FROM bookings WHERE status IN ('paid','pending','upi_pending') AND addons LIKE '%Tribal Lunch (${d} Nov)%'`).get();
    const booked = row ? row.total : 0;
    byDay[d] = { booked, cap: TRIBAL_CAP, remaining: Math.max(0, TRIBAL_CAP - booked), soldOut: booked >= TRIBAL_CAP };
  });
  res.json({ cap: TRIBAL_CAP, byDay });
});

// API: inventory detail — who is in each room
router.get('/api/inventory/detail', requireAdmin, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.id, b.booking_ref, b.venue, b.room_type, b.room_number,
           b.guest_count, b.total_price, b.status,
           GROUP_CONCAT(g.id,          '|||') as guest_ids,
           GROUP_CONCAT(g.full_name,   '|||') as names,
           GROUP_CONCAT(g.gender,      '|||') as genders,
           GROUP_CONCAT(g.whatsapp,    '|||') as phones,
           GROUP_CONCAT(COALESCE(g.room_number,''), '|||') as guest_rooms
    FROM bookings b
    LEFT JOIN guests g ON g.booking_id = b.id
    WHERE b.status IN ('paid','pending','upi_pending') AND b.deleted_at IS NULL
    GROUP BY b.id
    ORDER BY b.venue, b.room_type, b.created_at
  `).all();
  res.json(bookings);
});

// API: move a single guest to a different room (with capacity check)
router.patch('/api/guests/:id/room', requireAdmin, (req, res) => {
  const { room_number, force } = req.body;
  const guestId = Number(req.params.id);

  const thisGuest = db.prepare(`
    SELECT b.id as booking_id, b.venue, b.room_type, b.guest_count
    FROM guests g JOIN bookings b ON b.id=g.booking_id WHERE g.id=?
  `).get(guestId);

  if (room_number) {
    if (!thisGuest) return res.status(404).json({ error: 'Guest not found' });

    // Cross-type check — always enforced, even with force (M-3)
    const roomOccupiedByOtherType = db.prepare(`
      SELECT b.room_type FROM guests g JOIN bookings b ON b.id=g.booking_id
      WHERE b.venue=? AND b.room_type != ? AND b.status IN ('paid','pending','upi_pending')
        AND b.deleted_at IS NULL
        AND COALESCE(g.room_number, b.room_number) = ?
        AND g.id != ?
      LIMIT 1
    `).get(thisGuest.venue, thisGuest.room_type, room_number, guestId);
    if (roomOccupiedByOtherType) {
      return res.status(400).json({ error: `Room ${room_number} is occupied by a ${roomOccupiedByOtherType.room_type} guest — cannot move a ${thisGuest.room_type} guest there.` });
    }

    // Gender rule check — always enforced, even with force
    const { INVENTORY } = require('../inventory');
    const invItem = INVENTORY.find(i => i.venue === thisGuest.venue && i.room_type === thisGuest.room_type);
    if (invItem && invItem.gender_rule !== 'any') {
      const movingGuest = db.prepare(`SELECT gender FROM guests WHERE id=?`).get(guestId);
      const movingGender = movingGuest?.gender;
      const occupantGenders = db.prepare(`
        SELECT DISTINCT g.gender FROM guests g JOIN bookings b ON b.id=g.booking_id
        WHERE COALESCE(g.room_number, b.room_number)=? AND g.id != ? AND b.status IN ('paid','pending','upi_pending')
      `).all(room_number, guestId).map(r => r.gender).filter(Boolean);

      if (invItem.gender_rule === 'female_only' && movingGender === 'Male') {
        return res.status(400).json({ error: `Room ${room_number} is female-only — cannot move a male guest there.` });
      }
      if (invItem.gender_rule === 'same_gender' && occupantGenders.length > 0 && movingGender && !occupantGenders.includes(movingGender)) {
        return res.status(400).json({ error: `Room ${room_number} is reserved for ${occupantGenders[0]} guests only.` });
      }
    }

    // Capacity check — skipped only when force:true (swap scenario)
    if (!force) {
      const roomSize = invItem?.room_size || 99;

      const occupants = db.prepare(`
        SELECT g.id, g.full_name,
               COALESCE(g.room_number, b.room_number) as effective_room
        FROM guests g
        JOIN bookings b ON b.id = g.booking_id
        WHERE COALESCE(g.room_number, b.room_number) = ?
          AND g.id != ?
          AND b.status IN ('paid','pending','upi_pending')
          AND b.deleted_at IS NULL
      `).all(room_number, guestId);

      if (occupants.length >= roomSize) {
        return res.status(409).json({
          error: `Room ${room_number} is full`,
          full: true,
          room_size: roomSize,
          occupants: occupants.map(o => ({ id: o.id, name: o.full_name, room: o.effective_room })),
        });
      }
    }
  } else if (!thisGuest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  db.prepare('UPDATE guests SET room_number=? WHERE id=?').run(room_number || null, guestId);

  res.json({ ok: true });
});

// API: transfer booking to a different venue/room_type
router.post('/api/bookings/:ref/transfer', requireAdmin, async (req, res) => {
  const { venue, room_type, new_total, room_number, override } = req.body;
  if (!venue || !room_type || !new_total) return res.status(400).json({ error: 'Missing fields' });
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Check availability at the new venue (skip if same venue+room_type or admin override)
  const isMoving = venue !== booking.venue || room_type !== booking.room_type;
  if (isMoving && !override) {
    const { checkAvailability } = require('../inventory');
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    // Temporarily exclude this booking from availability so same-venue transfers don't self-block
    db.prepare('UPDATE bookings SET status=? WHERE booking_ref=?').run('_transferring', req.params.ref);
    const avail = checkAvailability(db, venue, room_type, booking.guest_count, guests);
    db.prepare('UPDATE bookings SET status=? WHERE booking_ref=?').run(booking.status, req.params.ref);
    if (!avail.available) return res.status(409).json({ error: avail.reason });
  }

  const formatted = '₹' + Number(new_total).toLocaleString('en-IN');
  const oldBasePrice = parseInt(String(booking.total_price).replace(/[^\d]/g, ''), 10) || 0;
  const oldVenue = booking.venue, oldRoomType = booking.room_type, oldPrice = booking.total_price;
  // Only mark pending when upgrading to a more expensive option; never auto-promote pending→paid
  const newStatus = (booking.status === 'paid' && Number(new_total) > oldBasePrice) ? 'pending' : booking.status;

  db.prepare('UPDATE bookings SET venue=?, room_type=?, total_price=?, room_number=?, status=?, transfer_email_pending=1 WHERE booking_ref=?')
    .run(venue, room_type, formatted, room_number || null, newStatus, req.params.ref);
  if (isMoving) {
    db.prepare('UPDATE guests SET room_number=NULL WHERE booking_id=?').run(booking.id);
  }

  // Auto-assign runs outside the transaction (async-safe; worst case = no room, not data corruption)
  if (isMoving && !room_number) {
    const { autoAssignRoom } = require('../inventory');
    autoAssignRoom(db, booking.id);
  }

  // Log the change
  const diff = Number(new_total) - oldBasePrice;
  const diffText = diff > 0 ? ` (+₹${diff.toLocaleString('en-IN')} extra)` : diff < 0 ? ` (−₹${Math.abs(diff).toLocaleString('en-IN')} refund)` : '';
  const logNote = `Venue changed: ${oldVenue} · ${oldRoomType} (${oldPrice}) → ${venue} · ${room_type} (${formatted})${diffText} · Changed by admin`;
  db.prepare('INSERT INTO booking_log (booking_ref, type, note) VALUES (?, ?, ?)').run(req.params.ref, 'transfer', logNote);

  res.json({ ok: true });

  // Send modification email (non-blocking — skipped for admin override transfers)
  if (override) return;
  try {
    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(updatedBooking.id);
    const { sendModificationEmail } = require('../email');
    const emailTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000));
    await Promise.race([
      sendModificationEmail({ booking: updatedBooking, guests, oldVenue, oldRoomType, oldPrice, extraAmount: Math.max(0, diff), paymentLink: null }),
      emailTimeout,
    ]);
  } catch (emailErr) {
    console.error('[transfer email]', emailErr.message);
  }
});

// API: mark transfer difference as collected offline
router.post('/api/bookings/:ref/transfer-collected', requireAdmin, (req, res) => {
  const { method, amount } = req.body;
  const note = `Transfer difference ₹${Number(amount).toLocaleString('en-IN')} collected via ${method}`;
  db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'payment', ?)").run(req.params.ref, note);
  res.json({ ok: true });
});

// API: create a payment link for the DIFFERENCE amount after a transfer (not the full price)
router.post('/api/bookings/:ref/transfer-paylink', requireAdmin, async (req, res) => {
  try {
    const { diff_amount, old_venue, old_room_type, old_price } = req.body;
    if (!diff_amount || diff_amount <= 0) return res.status(400).json({ error: 'Invalid diff_amount' });

    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    let Razorpay;
    try { Razorpay = require('razorpay'); } catch (_) {}
    if (!Razorpay || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Razorpay not configured' });
    }

    const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const amountWithGst  = Math.round(diff_amount * 1.05);
    const gst            = amountWithGst - diff_amount;
    const razorpayFee    = Math.round(amountWithGst * 1.0236) - amountWithGst;
    const amountCharged  = amountWithGst + razorpayFee;

    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    const primary = guests[0] || {};

    const oldAmtFmt = old_price ? `₹${Number(String(old_price).replace(/[^\d]/g,'')).toLocaleString('en-IN')}` : '';
    const newAmtFmt = `₹${Number(String(booking.total_price).replace(/[^\d]/g,'')).toLocaleString('en-IN')}`;
    const description = old_venue && old_room_type
      ? `MF2026 Upgrade: ${old_venue} ${old_room_type} (${oldAmtFmt}) → ${booking.venue} ${booking.room_type} (${newAmtFmt}). Balance due: ₹${amountCharged.toLocaleString('en-IN')} incl. GST ₹${gst.toLocaleString('en-IN')} + 2.36% fee.`
      : `Moon Festival 2026 — ${booking.venue} · ${booking.room_type}. Balance due: ₹${amountCharged.toLocaleString('en-IN')} incl. 5% GST + 2.36% fee.`;

    const plink = await rzp.paymentLink.create({
      amount: amountCharged * 100,
      currency: 'INR',
      accept_partial: false,
      description,
      customer: {
        name:    primary.full_name || '',
        email:   primary.email || '',
        contact: (primary.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91'),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: {
        booking_ref:     booking.booking_ref,
        type:            'transfer_topup',
        old_venue:       old_venue || '',
        old_room_type:   old_room_type || '',
        old_amount:      old_price || '',
        new_venue:       booking.venue,
        new_room_type:   booking.room_type,
        new_total:       booking.total_price,
        upgrade_base:    `₹${Number(diff_amount).toLocaleString('en-IN')}`,
        upgrade_gst:     `₹${gst.toLocaleString('en-IN')}`,
        upgrade_total:   `₹${amountWithGst.toLocaleString('en-IN')}`,
      },
      callback_url: `${process.env.SITE_URL || 'https://moonfestival.in'}/booking-confirmed.html`,
      callback_method: 'get',
    });

    db.prepare("UPDATE bookings SET status='pending', razorpay_order_id=? WHERE booking_ref=?")
      .run(plink.id, booking.booking_ref);

    // Auto-send modification email (with payment link) to guests and BCC admin
    try {
      const { sendModificationEmail } = require('../email');
      await sendModificationEmail({
        booking,
        guests,
        oldVenue:    old_venue || '',
        oldRoomType: old_room_type || '',
        oldPrice:    old_price || booking.total_price,
        extraAmount: diff_amount,
        paymentLink: plink.short_url,
      });
    } catch (emailErr) {
      console.error('[transfer-paylink email]', emailErr.message);
      // Don't fail — Razorpay link was created successfully
    }

    res.json({ ok: true, payment_link: plink.short_url });
  } catch (err) {
    console.error('[transfer-paylink]', err);
    res.status(500).json({ error: err.message || 'Failed to create payment link' });
  }
});

// API: send modification email to all guests on a booking
router.post('/api/bookings/:ref/modification-email', requireAdmin, async (req, res) => {
  try {
    const { old_venue, old_room_type, old_price, extra_amount, payment_link } = req.body;
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
    const { sendModificationEmail } = require('../email');
    await sendModificationEmail({ booking, guests, oldVenue: old_venue, oldRoomType: old_room_type, oldPrice: old_price, extraAmount: extra_amount || 0, paymentLink: payment_link || null });
    db.prepare('UPDATE bookings SET transfer_email_pending=0 WHERE booking_ref=?').run(req.params.ref);
    res.json({ ok: true });
  } catch (err) {
    console.error('[modification-email]', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

// One-click confirm from email (no login required, token-protected)
router.get('/confirm/:ref/:token', async (req, res) => {
  const crypto = require('crypto');
  const secret = process.env.SESSION_SECRET || 'mf2026-secret';
  const expected = crypto.createHmac('sha256', secret).update(req.params.ref).digest('hex').slice(0, 16);
  if (req.params.token !== expected) {
    return res.status(403).send('<h2>Invalid or expired confirmation link.</h2>');
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
  if (!booking) return res.status(404).send('<h2>Booking not found.</h2>');
  if (booking.status === 'paid') {
    return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#f0e8dc;">
      <h2 style="color:#6b4f38;">Already confirmed</h2>
      <p style="color:#8a6e58;">${req.params.ref} was already marked as paid.</p>
      <a href="/admin" style="color:#C47D52;">Open Dashboard</a></body></html>`);
  }
  db.prepare("UPDATE bookings SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE booking_ref=?").run(req.params.ref);
  const updatedBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
  const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);
  try {
    await sendConfirmation({ booking: updatedBooking, guests });
    db.prepare('UPDATE bookings SET email_sent=1 WHERE booking_ref=?').run(req.params.ref);
    db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent')").run(req.params.ref);
  } catch (e) { console.error('[confirm-email]', e.message); }
  res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#f0e8dc;">
    <h2 style="color:#6b4f38;">✓ Booking Confirmed</h2>
    <p style="color:#8a6e58;"><strong>${req.params.ref}</strong> has been marked as paid and the guest has been sent their confirmation email.</p>
    <a href="/admin" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#C47D52;color:#fff;text-decoration:none;border-radius:2px;">Open Dashboard</a>
  </body></html>`);
});

// API: confirm a UPI/cash pending booking as paid (admin action)
router.post('/api/bookings/:ref/confirm-upi', requireAdmin, async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    db.prepare("UPDATE bookings SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE booking_ref=?")
      .run(req.params.ref);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=? ORDER BY guest_number').all(booking.id);

    try {
      await sendConfirmation({ booking: updatedBooking, guests });
      db.prepare('UPDATE bookings SET email_sent=1 WHERE booking_ref=?').run(req.params.ref);
      db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', 'Confirmation email sent')").run(req.params.ref);
    } catch (e) { console.error('[confirm-upi email]', e.message); }

    updateBookingRow(updatedBooking, guests).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('[confirm-upi]', err);
    res.status(500).json({ error: 'Error confirming payment' });
  }
});

// Duplicate route removed — the active resend-paylink handler is registered earlier (line 139)

router.post('/api/bookings/:ref/send-quote', requireAdmin, async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=?').all(booking.id);
    if (!guests.length || !guests[0].email) return res.status(400).json({ error: 'No guest email on file' });
    await sendQuote({ booking, guests });
    db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', ?)").run(req.params.ref, 'Quote / payment summary sent to guest');
    res.json({ ok: true });
  } catch (err) {
    console.error('[send-quote]', err);
    res.status(500).json({ error: err.message || 'Failed to send quote' });
  }
});

router.post('/api/bookings/:ref/send-addon-quote', requireAdmin, async (req, res) => {
  try {
    const { sendAddonQuoteEmail } = require('../email');
    const { addedItems } = req.body; // [{ name, price }]
    if (!addedItems || !addedItems.length) return res.status(400).json({ error: 'No addedItems provided' });
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=?').all(booking.id);
    if (!guests.length || !guests[0].email) return res.status(400).json({ error: 'No guest email on file' });
    await sendAddonQuoteEmail({ booking, guests, addedItems });
    const note = 'Add-on quote sent: ' + addedItems.map(a => a.name + ' (₹' + a.price + ')').join(', ');
    db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', ?)").run(req.params.ref, note);
    res.json({ ok: true });
  } catch (err) {
    console.error('[send-addon-quote]', err);
    res.status(500).json({ error: err.message || 'Failed to send addon quote' });
  }
});

router.post('/api/bookings/:ref/resend-confirmation', requireAdmin, async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref=?').get(req.params.ref);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id=?').all(booking.id);
    await sendConfirmation({ booking, guests });
    db.prepare('UPDATE bookings SET email_sent=1 WHERE booking_ref=?').run(req.params.ref);
    db.prepare("INSERT INTO booking_log (booking_ref, type, note) VALUES (?, 'email', ?)").run(req.params.ref, 'Confirmation email sent');
    res.json({ ok: true });
  } catch (err) {
    console.error('[resend-confirmation]', err);
    res.status(500).json({ error: err.message || 'Failed to send confirmation' });
  }
});

// Reports page
router.get('/reports', requireAdmin, (req, res) => {
  res.sendFile('reports.html', { root: __dirname + '/../views' });
});

// API: rooming list
router.get('/api/reports/rooming', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT
      b.venue,
      COALESCE(g.room_number, b.room_number) as room_number,
      b.room_type,
      b.booking_ref,
      g.full_name,
      g.whatsapp,
      b.arrival_date,
      b.addons,
      g.gender,
      g.id as guest_id,
      rhn.hotel_number
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN room_hotel_numbers rhn ON rhn.venue = b.venue AND rhn.label = COALESCE(g.room_number, b.room_number)
    WHERE b.status IN ('paid','pending','upi_pending')
      AND b.venue != 'Festival Access'
    ORDER BY b.venue, COALESCE(g.room_number, b.room_number), b.booking_ref
  `).all();

  // Build roommates lookup: venue+room_number -> names
  const roomMap = {};
  for (const r of rows) {
    const key = `${r.venue}|||${r.room_number}`;
    if (!roomMap[key]) roomMap[key] = [];
    roomMap[key].push({ id: r.guest_id, name: r.full_name });
  }

  const result = rows.map(r => {
    const key = `${r.venue}|||${r.room_number}`;
    const roommates = (roomMap[key] || [])
      .filter(e => e.id !== r.guest_id)
      .map(e => e.name)
      .join(', ');
    return {
      venue: r.venue,
      room_number: r.room_number,
      hotel_number: r.hotel_number || '',
      room_type: r.room_type,
      booking_ref: r.booking_ref,
      full_name: r.full_name,
      whatsapp: r.whatsapp,
      arrival_date: r.arrival_date,
      addons: r.addons,
      gender: r.gender,
      roommates,
    };
  });

  res.json(result);
});

// API: tribal lunch by day
router.get('/api/reports/tribal-lunch', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.booking_ref, g.full_name, g.whatsapp, b.venue,
           COALESCE(g.room_number, b.room_number) as room_number,
           b.arrival_date, b.addons,
           rhn.hotel_number
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN room_hotel_numbers rhn ON rhn.venue = b.venue AND rhn.label = COALESCE(g.room_number, b.room_number)
    WHERE b.status IN ('paid','pending','upi_pending')
      AND b.addons LIKE '%Tribal Lunch%'
    ORDER BY g.full_name
  `).all();

  function parseTribalDay(addons) {
    // Handles: "Tribal Lunch (27 Nov)" and "Tribal Lunch · 27 Nov"
    const match = (addons || '').match(/Tribal Lunch[\s·(]+(\d+) Nov/i);
    if (match) return parseInt(match[1], 10);
    return null;
  }

  const { day } = req.query;
  const clean = rows.map(r => ({
    booking_ref: r.booking_ref,
    full_name: r.full_name,
    whatsapp: r.whatsapp,
    venue: r.venue,
    room_number: r.room_number,
    hotel_number: r.hotel_number || '',
    arrival_date: r.arrival_date,
    _day: parseTribalDay(r.addons),
  }));

  function forDay(d) {
    return clean.filter(r => r._day === d || r._day === null).map(({ _day, ...rest }) => ({
      ...rest,
      tribal_date: _day ? _day + ' Nov' : null,
    }));
  }

  if (day) {
    return res.json(forDay(parseInt(day, 10)));
  }

  res.json({ day27: forDay(27), day28: forDay(28), day29: forDay(29) });
});

// API: massage list
router.get('/api/reports/massage', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.booking_ref, g.full_name, g.whatsapp, b.venue,
           COALESCE(g.room_number, b.room_number) as room_number,
           b.arrival_date, rhn.hotel_number
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN room_hotel_numbers rhn ON rhn.venue = b.venue AND rhn.label = COALESCE(g.room_number, b.room_number)
    WHERE b.status IN ('paid','pending','upi_pending')
      AND b.addons LIKE '%Ayurvedic Massage%'
    ORDER BY g.full_name
  `).all();
  res.json(rows.map(r => ({ ...r, hotel_number: r.hotel_number || '' })));
});

// API: pre-arrival (arriving 26 Nov)
router.get('/api/reports/pre-arrival', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.booking_ref, g.full_name, g.whatsapp, b.venue, b.room_type,
           COALESCE(g.room_number, b.room_number) as room_number,
           b.addons, rhn.hotel_number
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN room_hotel_numbers rhn ON rhn.venue = b.venue AND rhn.label = COALESCE(g.room_number, b.room_number)
    WHERE b.status IN ('paid','pending','upi_pending')
      AND b.arrival_date = '26 Nov'
    ORDER BY b.venue, COALESCE(g.room_number, b.room_number)
  `).all();
  res.json(rows.map(r => ({ ...r, hotel_number: r.hotel_number || '' })));
});

// API: scooter rental list
router.get('/api/reports/scooter', requireAdmin, (req, res) => {
  // Guest-booked scooters (in addons column, paid at booking)
  const guestRows = db.prepare(`
    SELECT b.booking_ref, g.full_name, g.whatsapp, b.venue,
           COALESCE(g.room_number, b.room_number) as room_number,
           b.arrival_date, b.addons, b.extra_addons, b.addons_collected, rhn.hotel_number,
           'guest' as source
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN room_hotel_numbers rhn ON rhn.venue = b.venue AND rhn.label = COALESCE(g.room_number, b.room_number)
    WHERE b.status IN ('paid','pending','upi_pending')
      AND b.addons LIKE '%Scooter Rental%'
      AND g.guest_number = 1
  `).all();

  // Admin-added scooters (in extra_addons column)
  const adminRows = db.prepare(`
    SELECT b.booking_ref, g.full_name, g.whatsapp, b.venue,
           COALESCE(g.room_number, b.room_number) as room_number,
           b.arrival_date, b.addons, b.extra_addons, b.addons_collected, rhn.hotel_number,
           'admin' as source
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN room_hotel_numbers rhn ON rhn.venue = b.venue AND rhn.label = COALESCE(g.room_number, b.room_number)
    WHERE b.status IN ('paid','pending','upi_pending')
      AND b.extra_addons LIKE '%Scooter Rental%'
      AND (b.addons IS NULL OR b.addons NOT LIKE '%Scooter Rental%')
      AND g.guest_number = 1
  `).all();

  const toResult = (r) => {
    const src = r.source === 'admin' ? (r.extra_addons || '') : (r.addons || '');
    const match = src.match(/Scooter Rental[^|]*?(\d+\s*Days?)/i);
    return {
      booking_ref: r.booking_ref,
      full_name: r.full_name,
      whatsapp: r.whatsapp,
      venue: r.venue,
      room_number: r.room_number,
      hotel_number: r.hotel_number || '',
      arrival_date: r.arrival_date,
      scooter_duration: match ? match[1] : '',
      payment_pending: r.source === 'admin' && !r.addons_collected,
    };
  };

  const result = [...guestRows, ...adminRows]
    .map(toResult)
    .sort((a, b) => (a.venue || '').localeCompare(b.venue || '') || (a.room_number || '').localeCompare(b.room_number || ''));
  res.json(result);
});

// API: download database backup
router.get('/api/backup/db', requireAdmin, (req, res) => {
  const dbPath = path.join(__dirname, '../../data/moonfestival.db');
  const date = new Date().toISOString().slice(0, 10);
  res.download(dbPath, `moonfestival-backup-${date}.db`, err => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Backup failed' });
  });
});

// API: all applications
router.get('/api/applications', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT * FROM applications ORDER BY created_at DESC`).all();
  res.json(rows);
});

// API: update application status
router.patch('/api/applications/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id);
  db.prepare(`UPDATE applications SET status=? WHERE id=?`).run(status, req.params.id);
  // Email 08 — send acceptance email when admin marks as accepted
  if (status === 'accepted' && app && app.email) {
    const { sendApplicationAccepted } = require('../email');
    sendApplicationAccepted({ applicantName: app.applicant, applicantEmail: app.email, formLabel: app.form_label }).catch(e => console.error('[admin] acceptance email failed:', e.message));
  }
  res.json({ ok: true });
});

router.get('/api/rooms/hotel-numbers', requireAdmin, (req, res) => {
  const { db } = require('../db');
  const rows = db.prepare('SELECT venue, label, hotel_number FROM room_hotel_numbers').all();
  res.json(rows);
});

router.post('/api/rooms/hotel-number', requireAdmin, (req, res) => {
  const { venue, label, hotel_number } = req.body;
  if (!venue || !label) return res.status(400).json({ error: 'Missing fields' });
  const { db } = require('../db');
  if (!hotel_number || !hotel_number.trim()) {
    db.prepare('DELETE FROM room_hotel_numbers WHERE venue = ? AND label = ?').run(venue, label);
  } else {
    db.prepare(`INSERT INTO room_hotel_numbers (venue, label, hotel_number) VALUES (?, ?, ?)
      ON CONFLICT(venue, label) DO UPDATE SET hotel_number = excluded.hotel_number`
    ).run(venue, label, hotel_number.trim());
  }
  res.json({ ok: true });
});

router.post('/api/rooms/rename', requireAdmin, (req, res) => {
  const { venue, old_label, new_label } = req.body;
  if (!venue || !old_label || !new_label) return res.status(400).json({ error: 'Missing fields' });
  try {
    const { renameRoomLabel } = require('../inventory');
    renameRoomLabel(venue, old_label, new_label.trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/rooms/undo-rename', requireAdmin, (req, res) => {
  const { venue, current_label } = req.body;
  if (!venue || !current_label) return res.status(400).json({ error: 'Missing fields' });
  try {
    const { db } = require('../db');
    const row = db.prepare('SELECT old_label FROM room_label_overrides WHERE venue = ? AND new_label = ?').get(venue, current_label);
    if (!row) return res.status(404).json({ error: 'No override found' });
    const { renameRoomLabel } = require('../inventory');
    renameRoomLabel(venue, current_label, row.old_label);
    db.prepare('DELETE FROM room_label_overrides WHERE venue = ? AND old_label = ?').run(venue, row.old_label);
    res.json({ ok: true, original_label: row.old_label });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Archive season & reset for new year
// Backfill: auto-assign room slots for all bookings that don't have one yet
router.post('/api/rooms/auto-assign-all', requireAdmin, (req, res) => {
  const { autoAssignRoom } = require('../inventory');
  const unassigned = db.prepare(`
    SELECT id FROM bookings
    WHERE status IN ('paid','pending','upi_pending') AND room_number IS NULL
  `).all();
  let assigned = 0;
  unassigned.forEach(b => { if (autoAssignRoom(db, b.id)) assigned++; });
  res.json({ total: unassigned.length, assigned });
});

router.post('/api/archive-season', requireAdmin, (req, res) => {
  const { confirm_text, year } = req.body;
  if (!year || !confirm_text) return res.status(400).json({ error: 'Missing fields' });
  if (confirm_text !== `ARCHIVE ${year}`) return res.status(400).json({ error: 'Confirmation text does not match' });

  try {
    const { db } = require('../db');
    const dbPath      = path.join(__dirname, '../../data/moonfestival.db');
    const archivePath = path.join(__dirname, `../../data/archive-${year}.db`);

    // Copy DB file as archive
    fs.copyFileSync(dbPath, archivePath);

    // Wipe live tables (keep admin credentials, settings, inventory config)
    db.exec('DELETE FROM guests');
    db.exec('DELETE FROM bookings');
    db.exec('DELETE FROM applications');
    db.exec('DELETE FROM room_label_overrides');
    db.exec('DELETE FROM room_hotel_numbers');
    db.exec('DELETE FROM sqlite_sequence WHERE name IN ("bookings","guests","applications")');

    res.json({ ok: true, archive: `archive-${year}.db` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CA GST Report — Excel
router.get('/api/ca-report', requireAdmin, async (req, res) => {
  const ExcelJS = require('exceljs');

  const bookings = db.prepare(`
    SELECT b.*, g.full_name, g.email, g.whatsapp, g.state, g.city
    FROM bookings b
    LEFT JOIN guests g ON g.booking_id = b.id AND g.guest_number = 1
    WHERE b.status = 'paid' AND b.deleted_at IS NULL
    ORDER BY b.paid_at ASC
  `).all();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Moon Festival Admin';

  // ── Sheet 1: Invoice Register ─────────────────────────────────────────────
  const ws = wb.addWorksheet('Invoice Register');

  const TERRA  = 'FFC47D52';
  const CREAM  = 'FFF8F3EE';
  const LIGHT  = 'FFFAF6F2';
  const BROWN  = 'FF261508';
  const BORDER_COLOR = { argb: 'FFD4C8BC' };

  const thin  = { style: 'thin',  color: BORDER_COLOR };
  const thick = { style: 'medium', color: { argb: 'FFFFC47D52' } };

  // Column definitions
  ws.columns = [
    { key: 'sr_no',        width: 6  },
    { key: 'inv_no',       width: 14 },
    { key: 'inv_date',     width: 14 },
    { key: 'customer',     width: 26 },
    { key: 'email',        width: 30 },
    { key: 'gstin',        width: 20 },
    { key: 'state',        width: 18 },
    { key: 'pos',          width: 14 },
    { key: 'sac',          width: 10 },
    { key: 'venue',        width: 22 },
    { key: 'guests',       width: 8  },
    { key: 'taxable',      width: 14 },
    { key: 'cgst',         width: 12 },
    { key: 'sgst',         width: 12 },
    { key: 'igst',         width: 12 },
    { key: 'total_gst',    width: 12 },
    { key: 'grand_total',  width: 14 },
    { key: 'payment_id',   width: 26 },
  ];

  // Title row
  ws.mergeCells('A1:R1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Moon Yoga & Adventures — GST Invoice Register (GSTR-1)';
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: BROWN } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // GSTIN row
  ws.mergeCells('A2:R2');
  const gstinCell = ws.getCell('A2');
  gstinCell.value = 'GSTIN: 27BOJPS0549J2ZG   |   PAN: BOJPS0549J   |   Place of Supply: Goa   |   SAC: 999723';
  gstinCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF8B6A4A' } };
  gstinCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
  gstinCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  // Header row
  const headers = [
    'Sr.', 'Invoice No', 'Invoice Date', 'Customer Name', 'Email',
    'Customer GSTIN', 'Customer State', 'Place of Supply', 'SAC',
    'Venue / Package', 'Guests', 'Taxable Amt (₹)',
    'CGST 2.5% (₹)', 'SGST 2.5% (₹)', 'IGST 5% (₹)',
    'Total GST (₹)', 'Grand Total (₹)', 'Payment / Ref ID',
  ];
  const hRow = ws.addRow(headers);
  hRow.height = 22;
  hRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TERRA } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });

  // Currency format
  const curr = '₹#,##0';
  const currCols = ['taxable','cgst','sgst','igst','total_gst','grand_total'];

  let rowIdx = 0;
  let sumTaxable = 0, sumCGST = 0, sumSGST = 0, sumIGST = 0, sumTotal = 0;

  for (const b of bookings) {
    const totalRaw = parseInt(String(b.total_price).replace(/[^\d]/g, ''), 10) || 0;
    const taxable  = totalRaw;
    const isMH     = (b.state || '').toLowerCase().includes('maharashtra');
    const cgst     = isMH ? Math.round(taxable * (GST_RATE / 2)) : 0;
    const sgst     = isMH ? Math.round(taxable * (GST_RATE / 2)) : 0;
    const igst     = isMH ? 0 : Math.round(taxable * GST_RATE);
    const totalGst = cgst + sgst + igst;
    const grand    = taxable + totalGst;

    sumTaxable += taxable; sumCGST += cgst; sumSGST += sgst; sumIGST += igst; sumTotal += grand;

    const paidDate = b.paid_at
      ? new Date(b.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';

    const dr = ws.addRow({
      sr_no:       rowIdx + 1,
      inv_no:      b.booking_ref,
      inv_date:    paidDate,
      customer:    b.full_name || '',
      email:       b.email || '',
      gstin:       b.gst_number || 'Unregistered',
      state:       b.state || b.city || '',
      pos:         'Goa',
      sac:         '999723',
      venue:       `${b.venue} – ${b.room_type}`,
      guests:      b.guest_count,
      taxable,
      cgst:        cgst || '',
      sgst:        sgst || '',
      igst:        igst || '',
      total_gst:   totalGst,
      grand_total: grand,
      payment_id:  b.razorpay_payment_id || b.booking_ref,
    });

    dr.height = 18;
    const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIdx % 2 === 0 ? 'FFFFFFFF' : LIGHT } };
    dr.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 9, color: { argb: BROWN } };
      cell.fill = fill;
      cell.alignment = { vertical: 'middle' };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });

    // Number formatting
    currCols.forEach(col => {
      const cell = dr.getCell(col);
      if (cell.value !== '') cell.numFmt = curr;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    dr.getCell('guests').alignment = { horizontal: 'center', vertical: 'middle' };
    rowIdx++;
  }

  // Totals row
  const totRow = ws.addRow({
    inv_no: 'TOTAL', inv_date: '', customer: '', email: '', gstin: '', state: '',
    pos: '', sac: '', venue: '', guests: '',
    taxable: sumTaxable, cgst: sumCGST, sgst: sumSGST, igst: sumIGST,
    total_gst: sumCGST + sumSGST + sumIGST, grand_total: sumTotal, payment_id: '',
  });
  totRow.height = 22;
  totRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TERRA } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });
  totRow.getCell('inv_no').alignment = { horizontal: 'left', vertical: 'middle' };
  currCols.forEach(col => {
    const cell = totRow.getCell(col);
    if (cell.value) cell.numFmt = curr;
  });

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Summary');
  ws2.columns = [{ width: 30 }, { width: 20 }];

  const addSummaryRow = (label, value, bold, isAmount) => {
    const r = ws2.addRow([label, value]);
    r.height = 20;
    r.getCell(1).font = { name: 'Calibri', size: 10, bold, color: { argb: BROWN } };
    r.getCell(2).font = { name: 'Calibri', size: 10, bold, color: { argb: bold ? TERRA : BROWN } };
    r.getCell(2).alignment = { horizontal: 'right' };
    if (isAmount && value) r.getCell(2).numFmt = curr;
    if (bold) {
      [1,2].forEach(i => {
        r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
      });
    }
  };

  ws2.addRow(['Moon Yoga & Adventures — GST Summary']).getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: TERRA } };
  ws2.getRow(1).height = 28;
  ws2.addRow([]);
  addSummaryRow('GSTIN', '27BOJPS0549J2ZG', false);
  addSummaryRow('PAN', 'BOJPS0549J', false);
  addSummaryRow('Period', `All paid bookings as of ${new Date().toLocaleDateString('en-IN')}`, false);
  ws2.addRow([]);
  addSummaryRow('Total Paid Bookings', bookings.length, true);
  addSummaryRow('Total Taxable Amount', sumTaxable, false, true);
  addSummaryRow('Total CGST (2.5%)', sumCGST, false, true);
  addSummaryRow('Total SGST (2.5%)', sumSGST, false, true);
  addSummaryRow('Total IGST (5%)', sumIGST, false, true);
  addSummaryRow('Total GST Collected', sumCGST + sumSGST + sumIGST, true, true);
  ws2.addRow([]);
  addSummaryRow('Grand Total (incl. GST)', sumTotal, true, true);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="MoonFestival-CA-Report.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// Invoice PDF download — all paid bookings as a ZIP
router.get('/api/invoices/download', requireAdmin, async (req, res) => {
  const archiver = require('archiver');
  const { generateInvoice } = require('../invoice');

  const bookings = db.prepare(`SELECT * FROM bookings WHERE status = 'paid' ORDER BY paid_at DESC`).all();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="MoonFestival-Invoices.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => console.error('Archive error:', err));
  archive.pipe(res);

  for (const booking of bookings) {
    const guests = db.prepare('SELECT * FROM guests WHERE booking_id = ? ORDER BY guest_number').all(booking.id);
    try {
      const buf = await generateInvoice({ booking, guests });
      archive.append(buf, { name: `${booking.booking_ref}.pdf` });
    } catch (e) {
      console.error('Invoice error for', booking.booking_ref, e.message);
    }
  }

  archive.finalize();
});

// Single invoice PDF
router.get('/api/invoices/:ref', requireAdmin, async (req, res) => {
  const { generateInvoice } = require('../invoice');
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const guests = db.prepare('SELECT * FROM guests WHERE booking_id = ? ORDER BY guest_number').all(booking.id);
  try {
    const buf = await generateInvoice({ booking, guests });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${booking.booking_ref}.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: custom payments list
router.get('/api/custom-payments', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM custom_payments ORDER BY created_at DESC').all();
  res.json(rows);
});

// API: synopsis data — venues, add-ons, mailer stats
router.get('/api/synopsis', requireAdmin, (req, res) => {
  const { INVENTORY, PRICING } = require('../inventory');

  // Build venue table: group by venue + room_type with all 3 phase prices
  const venues = [];
  const seen = new Set();
  for (const item of INVENTORY) {
    if (item.venue === 'Festival Access') continue;
    const key = item.venue + '|' + item.room_type;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = PRICING[item.venue]?.[item.room_type] || {};
    venues.push({
      venue: item.venue,
      roomType: item.room_type,
      capacity: item.capacity,
      label: item.label,
      earlyBird: p.earlyBird || 0,
      phase2: p.phase2 || 0,
      phase3: p.phase3 || 0,
      phase4: p.phase4 || 0,
      extraDay: p.extraDay || 0,
    });
  }

  // Passes
  const passes = [];
  for (const item of INVENTORY.filter(i => i.venue === 'Festival Access')) {
    const p = PRICING['Festival Access']?.[item.room_type] || {};
    passes.push({ roomType: item.room_type, earlyBird: p.earlyBird || 0, phase2: p.phase2 || 0, phase3: p.phase3 || 0, phase4: p.phase4 || 0 });
  }

  // Mailer stats from bookings
  const totalBookings   = db.prepare("SELECT COUNT(*) as n FROM bookings").get().n;
  const linksSent       = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE payment_link_url IS NOT NULL AND payment_link_url != ''").get().n;
  const confirmationsSent = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE email_sent=1").get().n;
  const paidCount       = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status='paid'").get().n;
  const pendingCount    = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status='pending'").get().n;
  const addonEmailsSent = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE addons_collected=1").get().n;

  // Count bookings that have any add-ons recorded
  const withAddons = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE addons IS NOT NULL AND addons != ''").get().n;

  res.json({ venues, passes, mailers: { totalBookings, linksSent, confirmationsSent, paidCount, pendingCount, addonEmailsSent, withAddons } });
});

module.exports = router;
