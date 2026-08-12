const { GST_RATE } = require('./inventory');

/**
 * Single source of truth for price breakdown.
 *
 * total_price in DB = (accomBase - discount) + addonTotal [+ extraAddonTotal if collected]
 * This function reverses that to show the full itemised breakdown.
 */
function computeBreakdown(booking) {
  const storedTotal = parseInt(String(booking.total_price || '0').replace(/[^\d]/g, ''), 10) || 0;
  const discount    = parseInt(String(booking.discount    || '0').replace(/[^\d]/g, ''), 10) || 0;
  const collected   = !!booking.addons_collected;

  function parseParts(str) {
    if (!str) return [];
    return str.split('|').filter(Boolean).map(a => {
      const ci = a.indexOf(':');
      if (ci < 0) return null;
      const price = parseInt(a.slice(0, ci), 10) || 0;
      const name  = a.slice(ci + 1).trim();
      return (name && price > 0) ? { price, name } : null;
    }).filter(Boolean);
  }

  function groupByName(parts) {
    const m = {};
    for (const a of parts) {
      if (!m[a.name]) m[a.name] = { name: a.name, unitPrice: a.price, count: 0, total: 0 };
      m[a.name].count++;
      m[a.name].total += a.price;
    }
    return Object.values(m);
  }

  const addonParts      = parseParts(booking.addons);
  // Always include extra_addons regardless of collected status (admin add-ons should always show)
  const extraParts      = parseParts(booking.extra_addons);

  // addons field stores per-person prices once; total_price already has them × guest_count.
  // Multiply addon totals by guest_count so accomBase reflects the true room cost.
  const guestCount      = Math.max(1, parseInt(booking.guest_count || 1, 10));
  const addonLinesRaw   = groupByName(addonParts);
  const addonLines      = addonLinesRaw.map(l => ({ ...l, count: l.count * guestCount, total: l.total * guestCount }));
  const extraAddonLines = groupByName(extraParts);
  const addonTotal      = addonParts.reduce((s, a) => s + a.price, 0) * guestCount;
  const extraAddonTotal = extraParts.reduce((s, a) => s + a.price, 0);

  // Reverse-calculate the pre-discount accommodation total.
  // storedTotal may NOT include extraAddonTotal for pending bookings (admin adds don't update total_price).
  // So compute accomBase without extraAddonTotal, then add it back for grandTotal.
  const accomBase = storedTotal - addonTotal + discount;

  const subtotal   = storedTotal + extraAddonTotal; // include admin add-ons in pre-GST total
  const gst        = Math.round(subtotal * GST_RATE);
  const grandTotal = subtotal + gst;

  return {
    accomBase,       // full accommodation pre-discount (÷ guest_count for per-person rate)
    addonLines,      // [{ name, unitPrice, count, total }] — guest add-ons
    extraAddonLines, // [{ name, unitPrice, count, total }] — admin add-ons
    addonTotal,
    extraAddonTotal,
    discount,
    subtotal,        // = storedTotal
    gst,
    grandTotal,
    collected,
  };
}

module.exports = { computeBreakdown };
