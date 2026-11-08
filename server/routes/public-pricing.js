const express = require('express');
const router = express.Router();
const { readSettings, resolvePhase } = require('../settings');
const { PRICING, GST_RATE, FOOD_PRICE_TOTAL } = require('../inventory');
const { db } = require('../db');

const PASS_CAPACITY = { 'Full Festival Pass': 30, 'Weekend Pass': 40, 'Single Day Pass': 30 };

router.get('/', (req, res) => {
  const phase = resolvePhase();
  const prices = {};
  for (const [venue, rooms] of Object.entries(PRICING)) {
    prices[venue] = {};
    for (const [roomType, tiers] of Object.entries(rooms)) {
      prices[venue][roomType] = {
        active:   tiers[phase] ?? tiers.phase2,
        phase4:   tiers.phase4 ?? tiers.phase2,
        extraDay: tiers.extraDay ?? 0,
      };
    }
  }
  const { festival_pass_open } = readSettings();

  const passRows = db.prepare(`
    SELECT room_type, COALESCE(SUM(guest_count),0) as booked
    FROM bookings
    WHERE venue='Festival Access' AND deleted_at IS NULL AND status NOT IN ('cancelled')
    GROUP BY room_type
  `).all();
  const booked = {};
  for (const r of passRows) booked[r.room_type] = r.booked;
  const pass_inventory = {};
  for (const [type, cap] of Object.entries(PASS_CAPACITY)) {
    pass_inventory[type] = { capacity: cap, booked: booked[type] || 0, left: cap - (booked[type] || 0) };
  }

  res.json({ phase, prices, festival_pass_open: !!festival_pass_open, gst_rate: GST_RATE, food_price: FOOD_PRICE_TOTAL, pass_inventory });
});

module.exports = router;
