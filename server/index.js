require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions (in-memory — survives server restarts via short maxAge)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

// API routes
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/applications', require('./routes/applications'));
app.use('/admin', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));

// Public pricing endpoint (no auth) — used by tickets.html and book.html
app.get('/api/public/pricing', require('./routes/public-pricing'));

// Custom payment page + API
app.get('/pay', (req, res) => res.sendFile('pay.html', { root: path.join(__dirname, '..') }));
app.use('/api/custom-payment', require('./routes/custompay'));

// Serve UPI screenshots (admin only — basic auth check done in admin route)
app.use('/data/screenshots', require('./routes/auth').requireAdmin, express.static(path.join(__dirname, '../data/screenshots')));

// Serve static site
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => res.sendFile('index.html', { root: path.join(__dirname, '..') }));

const { startDailyReport, sendDailyReport } = require('./whatsapp');
const { sendDailyBackup } = require('./email');

const DB_PATH = path.join(__dirname, '../data/moonfestival.db');

function scheduleDailyBackup() {
  function msUntil(hour, minute) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }
  // Fire at 08:00 every day
  setTimeout(function fire() {
    sendDailyBackup(DB_PATH).catch(e => console.error('[backup] Daily backup failed:', e.message));
    setTimeout(fire, 24 * 60 * 60 * 1000);
  }, msUntil(8, 0));
  console.log('[backup] Daily backup scheduled at 08:00');
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🌙 Moon Festival server running at http://localhost:${PORT}`);
  console.log(`   Admin dashboard: http://localhost:${PORT}/admin\n`);
  startDailyReport();
  scheduleDailyBackup();
});
