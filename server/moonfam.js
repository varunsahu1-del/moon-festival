// Moon Fam: guest-list tickets for facilitators, artists and mooncrew.
// The page is unlisted (not linked from the site or sitemap); anyone with its URL can book.
// Prices live here (not in PRICING) so they are not exposed through /api/public/pricing.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const PASS_ROOMS = {
  1: { roomType: 'Moon Fam 1 Day Pass', price: 3000, days: 1 },
  2: { roomType: 'Moon Fam 2 Day Pass', price: 6000, days: 2 },
  3: { roomType: 'Moon Fam 3 Day Pass', price: 9000, days: 3 },
};
const WORKSHOP_ROOM = 'Moon Fam Workshops';
const WORKSHOP_PRICE = 650;
const GIG_ROOM = 'Moon Fam Gigs';
const GIG_PRICES = { 'Ecstatic Dance & Cacao': 800 }; // all other gigs are 1000
const GIG_DEFAULT_PRICE = 1000;
const gigPrice = name => GIG_PRICES[name] || GIG_DEFAULT_PRICE;
// Evening shows / gigs sold on the Moon Fam page (matched by session name in schedule.json)
const GIG_NAMES = ['Latin Fusion', 'Ecstatic Dance & Cacao', 'The Elevate Show', 'Hindi Film Retro Band', 'Moon Musician Jam'];
const FESTIVAL_DAYS = [
  { date: '2026-11-27', key: '27 Nov', label: 'Fri 27 Nov' },
  { date: '2026-11-28', key: '28 Nov', label: 'Sat 28 Nov' },
  { date: '2026-11-29', key: '29 Nov', label: 'Sun 29 Nov' },
];
// Sessions sold as workshops that are not listed inside a "sessions" block in schedule.json
const EXTRA_WORKSHOPS = ['Unity Circle', 'Moon Choir'];
const SCHEDULE_PATH = path.join(__dirname, '..', 'schedule', 'schedule.json');

let workshopCache = null;
let gigCache = null;
function loadGigs() {
  if (gigCache) return gigCache;
  const sched = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
  const out = [];
  for (const day of sched.days) {
    const fd = FESTIVAL_DAYS.find(d => d.date === day.date);
    if (!fd) continue;
    for (const slot of day.slots) {
      if (!GIG_NAMES.includes(slot.session)) continue;
      const id = crypto.createHash('sha1').update(`gig|${day.date}|${slot.time}|${slot.session}`).digest('hex').slice(0, 12);
      out.push({ id, day: fd.key, dayLabel: fd.label, time: slot.time, session: slot.session, facilitator: slot.facilitator || '', price: gigPrice(slot.session) });
    }
  }
  gigCache = out;
  return out;
}
function loadWorkshops() {
  if (workshopCache) return workshopCache;
  const sched = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
  const out = [];
  for (const day of sched.days) {
    const fd = FESTIVAL_DAYS.find(d => d.date === day.date);
    if (!fd) continue;
    for (const slot of day.slots) {
      const items = Array.isArray(slot.sessions)
        ? slot.sessions
        : (EXTRA_WORKSHOPS.includes(slot.session) ? [{ session: slot.session, facilitator: slot.facilitator, venue: slot.venue }] : []);
      for (const s of items) {
        const id = crypto.createHash('sha1').update(`${day.date}|${slot.time}|${s.session}`).digest('hex').slice(0, 12);
        out.push({ id, day: fd.key, dayLabel: fd.label, time: slot.time, session: s.session, facilitator: s.facilitator || '', venue: s.venue || '' });
      }
    }
  }
  workshopCache = out;
  return out;
}

// GET /api/moonfam/data → passes, days, workshops for the Moon Fam page
router.get('/data', (req, res) => {
  res.json({
    passes: Object.entries(PASS_ROOMS).map(([n, p]) => ({ passDays: Number(n), price: p.price })),
    days: FESTIVAL_DAYS.map(d => ({ key: d.key, label: d.label })),
    workshop_price: WORKSHOP_PRICE,
    workshops: loadWorkshops(),
    gigs: loadGigs(),
    gst_rate: 0.05,
  });
});

// Server-side quote used by POST /api/bookings/create. Throws Error(message) when the selection is invalid.
// Returns the venue/room/base total (pre-GST, per the site convention) that the booking is stored with.
function quoteMoonFam(input, guestCount) {
  const mode = input.mode;
  if (mode === 'pass') {
    const pass = PASS_ROOMS[Number(input.passDays)];
    if (!pass) throw new Error('Please choose a 1, 2 or 3 day pass.');
    const picked = Array.isArray(input.days) ? [...new Set(input.days)] : [];
    const validKeys = FESTIVAL_DAYS.map(d => d.key);
    if (picked.length !== pass.days || picked.some(d => !validKeys.includes(d))) {
      throw new Error(`Please choose exactly ${pass.days} festival day${pass.days > 1 ? 's' : ''} for this pass.`);
    }
    const ordered = validKeys.filter(k => picked.includes(k));
    return {
      venue: 'Festival Access',
      roomType: pass.roomType,
      totalBase: pass.price * guestCount,
      daysSelected: ordered.join(', '),
    };
  }
  if (mode === 'workshops') {
    const ids = Array.isArray(input.workshopIds) ? [...new Set(input.workshopIds)] : [];
    if (!ids.length) throw new Error('Please choose at least one workshop.');
    const all = loadWorkshops();
    const chosen = ids.map(id => all.find(w => w.id === id));
    if (chosen.some(w => !w)) throw new Error('One of the chosen workshops is no longer in the schedule. Please choose again.');
    return {
      venue: 'Festival Access',
      roomType: WORKSHOP_ROOM,
      totalBase: WORKSHOP_PRICE * chosen.length * guestCount,
      daysSelected: 'Workshops: ' + chosen.map(w => `${w.session} (${w.day} ${w.time})`).join('; '),
    };
  }
  if (mode === 'gigs') {
    const ids = Array.isArray(input.gigIds) ? [...new Set(input.gigIds)] : [];
    if (!ids.length) throw new Error('Please choose at least one gig.');
    const all = loadGigs();
    const chosen = ids.map(id => all.find(g => g.id === id));
    if (chosen.some(g => !g)) throw new Error('One of the chosen gigs is no longer in the schedule. Please choose again.');
    return {
      venue: 'Festival Access',
      roomType: GIG_ROOM,
      totalBase: chosen.reduce((sum, g) => sum + g.price, 0) * guestCount,
      daysSelected: 'Gigs: ' + chosen.map(g => `${g.session} (${g.day} ${g.time})`).join('; '),
    };
  }
  throw new Error('Please choose day passes, workshops or gigs.');
}

module.exports = { router, quoteMoonFam, PASS_ROOMS, WORKSHOP_ROOM, FESTIVAL_DAYS };
