const express = require('express');
const router = express.Router();
const { readSettings, resolvePhase } = require('../settings');
const { PRICING, GST_RATE, FOOD_PRICE_TOTAL } = require('../inventory');

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
  res.json({ phase, prices, festival_pass_open: !!festival_pass_open, gst_rate: GST_RATE, food_price: FOOD_PRICE_TOTAL });
});

module.exports = router;
