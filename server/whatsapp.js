const cron = require('node-cron');
const { Resend } = require('resend');
const { db } = require('./db');
const { getInventoryStats } = require('./inventory');

const REPORT_EMAIL = ['varunsahu1@gmail.com', 'moonyogaadventures@gmail.com'];

function buildStats() {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  const totalBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='paid'").get().c;
  const pending       = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status IN ('pending','upi_pending')").get().c;
  const totalGuests   = db.prepare("SELECT COALESCE(SUM(guest_count),0) as s FROM bookings WHERE status='paid'").get().s;
  const newApps       = db.prepare("SELECT COUNT(*) as c FROM applications WHERE status='new'").get().c;

  const priceRows = db.prepare("SELECT total_price FROM bookings WHERE status='paid'").all();
  const revenue = priceRows.reduce((sum, r) => sum + (parseInt(String(r.total_price).replace(/[^\d]/g, ''), 10) || 0), 0);
  const revenueStr = '₹' + revenue.toLocaleString('en-IN');

  const inventory = getInventoryStats(db);

  const guestRows = db.prepare(`
    SELECT g.full_name, g.whatsapp, b.venue, b.room_type, b.room_number
    FROM guests g
    JOIN bookings b ON b.id = g.booking_id
    WHERE b.status = 'paid'
    ORDER BY b.venue, b.room_type, g.full_name
  `).all();

  return { today, totalBookings, pending, totalGuests, newApps, revenueStr, inventory, guestRows };
}

function buildHtml({ today, totalBookings, pending, totalGuests, newApps, revenueStr, inventory, guestRows }) {
  const venueRows = inventory
    .filter(i => i.venue !== 'Festival Access')
    .map(i => {
      const pct = Math.round((i.occupied / i.capacity) * 100);
      const dot = pct >= 90 ? '🔴' : pct >= 60 ? '🟠' : '🟢';
      const label = i.room_type !== 'All Rooms' ? `${i.venue} · ${i.room_type}` : i.venue;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #ede8e2;color:#3a2d24;">${dot} ${label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ede8e2;color:#3a2d24;text-align:right;font-variant-numeric:tabular-nums;">${i.occupied} / ${i.capacity} ${i.unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ede8e2;width:80px;">
          <div style="background:#ede8e2;border-radius:4px;height:6px;"><div style="background:${pct>=90?'#c0392b':pct>=60?'#e67e22':'#27ae60'};width:${pct}%;height:6px;border-radius:4px;"></div></div>
        </td>
      </tr>`;
    }).join('');

  const passRows = inventory
    .filter(i => i.venue === 'Festival Access')
    .map(i => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #ede8e2;color:#3a2d24;">🎟 ${i.room_type}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #ede8e2;color:#3a2d24;text-align:right;font-variant-numeric:tabular-nums;">${i.occupied} / ${i.capacity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #ede8e2;"></td>
    </tr>`).join('');

  const attendeeRows = guestRows.map((g, i) => {
    const room = g.room_number ? ` · Rm ${g.room_number}` : '';
    return `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #ede8e2;color:#3a2d24;font-weight:600;">${i + 1}. ${g.full_name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #ede8e2;color:#7a6355;">${g.venue}${room}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #ede8e2;color:#7a6355;">${g.room_type}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #ede8e2;color:#B06030;">${g.whatsapp}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:40px 20px;">
  <div style="background:#fff;border:1px solid #e5ddd5;border-top:3px solid #B06030;">

    <div style="padding:28px 32px 24px;border-bottom:1px solid #ede8e2;">
      <p style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#B06030;margin:0 0 4px;">Moon Festival 2026</p>
      <p style="font-size:20px;font-weight:600;color:#3a2d24;margin:0;">Daily Report · ${today}</p>
    </div>

    <div style="padding:24px 32px;border-bottom:1px solid #ede8e2;display:grid;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 16px 8px 0;"><p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#9a8070;margin:0 0 4px;">Revenue</p><p style="font-size:22px;font-weight:700;color:#3a2d24;margin:0;">${revenueStr}</p></td>
          <td style="padding:8px 16px;"><p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#9a8070;margin:0 0 4px;">Confirmed</p><p style="font-size:22px;font-weight:700;color:#3a2d24;margin:0;">${totalBookings} bookings</p></td>
          <td style="padding:8px 0 8px 16px;"><p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#9a8070;margin:0 0 4px;">Guests</p><p style="font-size:22px;font-weight:700;color:#3a2d24;margin:0;">${totalGuests}</p></td>
        </tr>
        <tr>
          <td style="padding:8px 16px 8px 0;"><p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#9a8070;margin:0 0 4px;">Pending (unpaid)</p><p style="font-size:18px;font-weight:600;color:${pending>0?'#c0392b':'#3a2d24'};margin:0;">${pending}</p></td>
          <td style="padding:8px 16px;"><p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#9a8070;margin:0 0 4px;">New Applications</p><p style="font-size:18px;font-weight:600;color:${newApps>0?'#B06030':'#3a2d24'};margin:0;">${newApps}</p></td>
          <td></td>
        </tr>
      </table>
    </div>

    <div style="padding:24px 32px;border-bottom:1px solid #ede8e2;">
      <p style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#B06030;margin:0 0 12px;">Accommodation</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">${venueRows}</table>
    </div>

    <div style="padding:24px 32px;border-bottom:1px solid #ede8e2;">
      <p style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#B06030;margin:0 0 12px;">Festival Passes</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">${passRows}</table>
    </div>

    <div style="padding:24px 32px;">
      <p style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#B06030;margin:0 0 12px;">Attendees (${guestRows.length})</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="background:#faf7f4;">
          <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#9a8070;font-weight:400;">Name</th>
          <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#9a8070;font-weight:400;">Venue</th>
          <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#9a8070;font-weight:400;">Room</th>
          <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#9a8070;font-weight:400;">WhatsApp</th>
        </tr>
        ${attendeeRows || '<tr><td colspan="4" style="padding:12px;color:#aaa;">No attendees yet.</td></tr>'}
      </table>
    </div>

    <div style="padding:14px 32px;background:#faf7f4;border-top:1px solid #ede8e2;">
      <p style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#b8a898;margin:0;">Moon Holistic Festival 2026 · Goa, India</p>
    </div>
  </div>
</div>
</body></html>`;
}

async function sendDailyReport() {
  const stats = buildStats();
  const html = buildHtml(stats);

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Moon Festival <bookings@moonfestival.in>',
    to: REPORT_EMAIL,
    subject: `[MF Stats] Moon Festival · Daily Report · ${stats.today}`,
    html,
  });
  console.log(`[daily-report] sent to ${REPORT_EMAIL}`);
}

function startDailyReport() {
  if (!process.env.RESEND_API_KEY) {
    console.log('[daily-report] RESEND_API_KEY not set — daily report disabled');
    return;
  }

  // 11 PM IST
  cron.schedule('0 23 * * *', async () => {
    try {
      await sendDailyReport();
    } catch (err) {
      console.error('[daily-report] failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[daily-report] Scheduled at 11:00 PM IST → ' + REPORT_EMAIL);
}

module.exports = { startDailyReport, sendDailyReport };
