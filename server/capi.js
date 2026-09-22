// Meta Conversions API — server-side Purchase event
// Fires when admin marks a booking as paid (any payment method).
// Requires META_CAPI_TOKEN in .env (System User token with ads_management permission).
// Pixel ID is hard-coded because it never changes across environments.

const https = require('https');

const PIXEL_ID = '2620039581784763';
const API_VERSION = 'v19.0';

function sendCapiPurchase({ bookingRef, amountINR, venue, roomType, email, phone }) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return; // silently skip if not configured

  const eventTime = Math.floor(Date.now() / 1000);

  // Hash helper (Meta requires SHA-256 for PII)
  const crypto = require('crypto');
  const hash = v => v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined;

  const userData = {};
  if (email) userData.em = [hash(email)];
  if (phone) {
    // Normalise: strip non-digits, ensure starts with country code
    const digits = String(phone).replace(/\D/g, '');
    userData.ph = [hash(digits)];
  }

  const payload = JSON.stringify({
    data: [{
      event_name: 'Purchase',
      event_time: eventTime,
      action_source: 'website',
      event_source_url: 'https://moonfestival.in/tickets.html',
      user_data: userData,
      custom_data: {
        currency: 'INR',
        value: amountINR,
        content_name: `${venue} · ${roomType}`,
        order_id: bookingRef,
      },
    }],
  });

  const options = {
    hostname: 'graph.facebook.com',
    path: `/${API_VERSION}/${PIXEL_ID}/events?access_token=${token}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  };

  const req = https.request(options, res => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error('[capi] Purchase event failed:', res.statusCode, body.slice(0, 200));
      }
    });
  });
  req.on('error', e => console.error('[capi] request error:', e.message));
  req.write(payload);
  req.end();
}

module.exports = { sendCapiPurchase };
