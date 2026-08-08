const express = require('express');
const router = express.Router();
const { db } = require('../db');

// POST /api/custom-payment
router.post('/', async (req, res) => {
  const { amount, name, phone, email, note, handled_by } = req.body;

  if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

  let Razorpay;
  try { Razorpay = require('razorpay'); } catch (_) {}

  if (!Razorpay || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payment gateway not configured' });
  }

  // Generate a short ref for tracking
  const ref = 'CP-' + Date.now().toString(36).toUpperCase().slice(-6);
  const contact = phone.replace(/\D/g, '').slice(-10);

  try {
    const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const plink = await rzp.paymentLink.create({
      amount: Math.round(amount) * 100,
      currency: 'INR',
      description: note || 'Moon Festival 2026 — Custom Payment',
      customer: { name, email, contact },
      notify: { sms: true, email: true },
      reminder_enable: false,
      notes: { type: 'custom', custom_ref: ref, payer_name: name },
    });

    db.prepare(`INSERT INTO custom_payments (ref, amount, name, phone, email, note, handled_by, razorpay_link_id, payment_link_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ref, Math.round(amount), name, phone, email || null, note || null, handled_by || null, plink.id, plink.short_url);

    res.json({ url: plink.short_url });
  } catch (e) {
    console.error('[custom-payment]', e.message);
    res.status(500).json({ error: e.message || 'Could not create payment link' });
  }
});

module.exports = router;
