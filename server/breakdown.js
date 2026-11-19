const { GST_RATE } = require('./inventory');

// Add-ons added by the admin ("extras") carry GST on top, like everything else.
// Extras that were already collected before this date were charged without GST
// and are left exactly as they were.
const EXTRAS_GST_FROM = '2026-11-15';

/**
 * Single source of truth for price breakdown.
 *
 * total_price in DB = (accomBase - discount) + addonTotal [+ extraAddonTotal if collected]
 * This function reverses that to show the full itemised breakdown.
 */
function computeBreakdown(booking) {
  const storedTotal = Math.round(parseFloat(String(booking.total_price || '0').replace(/[^\d.]/g, '')) || 0);
  const discount    = Math.round(parseFloat(String(booking.discount    || '0').replace(/[^\d.]/g, '')) || 0);
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

  // Admin add-ons (extra_addons) are kept separate from total_price and collected separately.
  // GST is charged on top of them, except for extras collected before EXTRAS_GST_FROM.
  const legacyExtras = collected && !!booking.addons_collected_at && String(booking.addons_collected_at) < EXTRAS_GST_FROM;
  // Extras marked 'included' are already covered by the booked price: no GST, nothing to collect.
  const includedExtras = collected && booking.addons_collection_method === 'included';
  const subtotal   = storedTotal;
  const baseGst    = booking.no_gst ? 0 : Math.round(subtotal * GST_RATE);
  const extraGst   = (booking.no_gst || legacyExtras || includedExtras) ? 0 : Math.round(extraAddonTotal * GST_RATE);
  const gst        = baseGst + extraGst;
  const taxable    = subtotal + (legacyExtras ? 0 : extraAddonTotal);
  const grandTotal = subtotal + gst + (includedExtras ? 0 : extraAddonTotal);

  return {
    accomBase,       // full accommodation pre-discount (÷ guest_count for per-person rate)
    addonLines,      // [{ name, unitPrice, count, total }] — guest add-ons
    extraAddonLines, // [{ name, unitPrice, count, total }] — admin add-ons
    addonTotal,
    extraAddonTotal,
    discount,
    subtotal,        // = storedTotal
    taxable,         // amount GST is charged on (subtotal + extras, unless extras are legacy)
    gst,             // baseGst + extraGst
    baseGst,         // GST on the booking itself
    extraGst,        // GST on admin-added extras
    extraAddonDue: includedExtras ? 0 : extraAddonTotal + extraGst, // what to collect for the extras
    grandTotal,
    collected,
  };
}

module.exports = { computeBreakdown };
