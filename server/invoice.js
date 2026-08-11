const PDFDocument = require('pdfkit');
const path = require('path');
const { computeBreakdown } = require('./breakdown');

const FONTS = path.join(__dirname, '..', 'Fonts', 'lato');

const WHITE  = '#ffffff';
const CREAM  = '#f8f3ee';
const TERRA  = '#C47D52';
const BROWN  = '#0f0804';
const SUB    = '#261508';
const MUTED  = '#3d2a1a';
const BORDER = '#b8afa5';

// Supplier (seller) details
const SUPPLIER = {
  name:    'Moon Yoga & Adventures',
  legal:   'Bharatvarun Sahu',
  address: 'B/202, Shree Amrit CHS Ltd, Carter Road, Khar West',
  city:    'Mumbai – 400052, Maharashtra',
  gstin:   '27BOJPS0549J2ZG',
  pan:     'BOJPS0549J',
  email:   'moonyogaadventures@gmail.com',
  bank:    'HDFC Bank',
  acc:     '50200053890710',
  ifsc:    'HDFC0000016',
};

const SAC_CODE   = '999723';
const SERVICE    = 'Moon Wellness Festival Package';
const PLACE_SUPPLY = 'Goa';
const SUPPLIER_STATE = 'Maharashtra';

function generateInvoice({ booking, guests }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Invoice ' + booking.booking_ref } });
    doc.registerFont('Lato-Light',   path.join(FONTS, 'Lato-Light.ttf'));
    doc.registerFont('Lato-Regular', path.join(FONTS, 'Lato-Regular.ttf'));

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const M  = 52;
    const CW = PW - M * 2;

    // Background
    doc.rect(0, 0, PW, PH).fill(WHITE);
    // Terracotta top rule
    doc.rect(0, 0, PW, 3).fill(TERRA);

    // ── Header ──────────────────────────────────────────────────────────────
    let y = 36;

    doc.fillColor(MUTED).font('Lato-Light').fontSize(9)
       .text('MOON HOLISTIC FESTIVAL', M, y, { characterSpacing: 2 });
    doc.fillColor(BROWN).font('Lato-Light').fontSize(11)
       .text('27 – 30 Nov 2026  ·  Palolem, South Goa', M, y + 14);

    // TAX INVOICE label + ref right-aligned
    doc.fillColor(MUTED).font('Lato-Light').fontSize(9)
       .text('TAX INVOICE', PW - M - 120, y, { width: 120, align: 'right', characterSpacing: 2 });
    doc.fillColor(TERRA).font('Lato-Light').fontSize(13)
       .text(booking.booking_ref, PW - M - 120, y + 13, { width: 120, align: 'right' });

    const paid_at = booking.paid_at
      ? new Date(booking.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(9.5)
       .text(paid_at, PW - M - 120, y + 29, { width: 120, align: 'right' });

    y = 76;
    doc.rect(M, y, CW, 0.5).fill(BORDER);
    y += 20;

    // ── Supplier + Recipient ─────────────────────────────────────────────────
    const col2X = M + CW / 2 + 12;
    const colW  = CW / 2 - 12;
    const primary = guests[0];

    // FROM (supplier)
    doc.fillColor(MUTED).font('Lato-Light').fontSize(7.5)
       .text('FROM', M, y, { characterSpacing: 2 });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(7.5)
       .text('BILLED TO', col2X, y, { characterSpacing: 2 });
    y += 14;

    doc.fillColor(BROWN).font('Lato-Regular').fontSize(12)
       .text(SUPPLIER.name, M, y, { width: colW });
    doc.fillColor(SUB).font('Lato-Light').fontSize(9.5)
       .text(SUPPLIER.legal, M, y + 16, { width: colW })
       .text(SUPPLIER.address, M, y + 28, { width: colW })
       .text(SUPPLIER.city, M, y + 40, { width: colW });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8.5)
       .text('GSTIN  ' + SUPPLIER.gstin, M, y + 56, { width: colW, characterSpacing: 0.3 })
       .text('PAN  ' + SUPPLIER.pan, M, y + 69, { width: colW, characterSpacing: 0.3 });

    // TO (recipient)
    doc.fillColor(BROWN).font('Lato-Regular').fontSize(12)
       .text(primary.full_name, col2X, y, { width: colW });
    doc.fillColor(SUB).font('Lato-Light').fontSize(9.5)
       .text(primary.email, col2X, y + 16, { width: colW })
       .text(primary.whatsapp, col2X, y + 28, { width: colW });

    let recipientY = y + 40;
    if (primary.address) {
      doc.fillColor(SUB).font('Lato-Light').fontSize(9.5)
         .text(primary.address, col2X, recipientY, { width: colW });
      recipientY += 12;
    }
    const cityLine = [primary.city, primary.state, primary.pin].filter(Boolean).join(', ');
    if (cityLine) {
      doc.fillColor(SUB).font('Lato-Light').fontSize(9.5)
         .text(cityLine, col2X, recipientY, { width: colW });
      recipientY += 12;
    }
    // GSTIN or Unregistered
    const recipientGstin = booking.gst_number || 'Unregistered';
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8.5)
       .text('GSTIN  ' + recipientGstin, col2X, recipientY + 4, { width: colW, characterSpacing: 0.3 });
    if (booking.gst_name) {
      doc.fillColor(MUTED).font('Lato-Light').fontSize(8.5)
         .text(booking.gst_name, col2X, recipientY + 17, { width: colW });
    }

    y += 88;
    doc.rect(M, y, CW, 0.5).fill(BORDER);
    y += 16;

    // ── Invoice meta row ─────────────────────────────────────────────────────
    const metaItems = [
      ['Place of Supply', PLACE_SUPPLY],
      ['Reverse Charge', 'No'],
      ['Invoice Date', paid_at],
    ];
    const metaW = CW / metaItems.length;
    metaItems.forEach((item, idx) => {
      const mx = M + idx * metaW;
      doc.fillColor(MUTED).font('Lato-Light').fontSize(7.5)
         .text(item[0].toUpperCase(), mx, y, { characterSpacing: 1 });
      doc.fillColor(BROWN).font('Lato-Light').fontSize(9.5)
         .text(item[1], mx, y + 11);
    });

    y += 32;
    doc.rect(M, y, CW, 0.5).fill(BORDER);
    y += 16;

    // ── Line items table ─────────────────────────────────────────────────────
    doc.rect(M, y, CW, 22).fill(CREAM);
    const colDesc = M + 10;
    const colSAC  = PW - M - 230;
    const colQty  = PW - M - 168;
    const colRate = PW - M - 108;
    const colAmt  = PW - M - 46;

    doc.fillColor(MUTED).font('Lato-Light').fontSize(8)
       .text('DESCRIPTION',         colDesc,  y + 7, { characterSpacing: 1.2 });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8)
       .text('SAC',                 colSAC,   y + 7, { width: 46, align: 'right', characterSpacing: 1.2 });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8)
       .text('QTY',                 colQty,   y + 7, { width: 46, align: 'right', characterSpacing: 1.2 });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8)
       .text('RATE',                colRate,  y + 7, { width: 46, align: 'right', characterSpacing: 1.2 });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8)
       .text('AMOUNT',              colAmt,   y + 7, { width: 46, align: 'right', characterSpacing: 1.2 });

    y += 30;
    doc.rect(M, y - 4, CW, 0.5).fill(BORDER);

    const fmt = n => '₹' + n.toLocaleString('en-IN');

    const bd = computeBreakdown(booking);
    const { accomBase, addonLines: addonGroupList, extraAddonLines: extraAddonItems,
            addonTotal, extraAddonTotal, discount, subtotal: taxableAmount, gst, grandTotal,
            collected } = bd;
    // accomAmount shown in invoice = post-discount accommodation (for the rate line)
    // We show accomBase (pre-discount) in qty × rate, then a discount row below
    const accomAmount = accomBase;


    // Main accommodation line
    doc.fillColor(BROWN).font('Lato-Regular').fontSize(11)
       .text(SERVICE, colDesc, y, { width: colSAC - colDesc - 8 });
    doc.fillColor(SUB).font('Lato-Light').fontSize(10)
       .text('27–30 November 2026', colDesc, y + 16, { width: colSAC - colDesc - 8 });
    doc.fillColor(MUTED).font('Lato-Light').fontSize(10)
       .text(SAC_CODE, colSAC, y, { width: 46, align: 'right' });
    doc.fillColor(SUB).font('Lato-Light').fontSize(11)
       .text(String(booking.guest_count), colQty,  y, { width: 46, align: 'right' })
       .text(fmt(Math.round(accomAmount / booking.guest_count)), colRate, y, { width: 46, align: 'right' })
       .text(fmt(accomAmount),            colAmt,  y, { width: 46, align: 'right' });
    y += 36;

    // Guest add-on lines (grouped — one row per unique addon name)
    addonGroupList.forEach(g => {
      doc.rect(M, y - 2, CW, 0.5).fill('#ece5de');
      doc.fillColor(SUB).font('Lato-Light').fontSize(10)
         .text(g.name, colDesc, y, { width: colSAC - colDesc - 8 });
      doc.fillColor(MUTED).font('Lato-Light').fontSize(10)
         .text(SAC_CODE, colSAC, y, { width: 46, align: 'right' });
      doc.fillColor(SUB).font('Lato-Light').fontSize(10)
         .text(String(g.count),   colQty,  y, { width: 46, align: 'right' })
         .text(fmt(g.unitPrice),  colRate, y, { width: 46, align: 'right' })
         .text(fmt(g.total), colAmt,  y, { width: 46, align: 'right' });
      y += 28;
    });

    // Discount row (if any)
    if (discount > 0) {
      doc.rect(M, y - 2, CW, 0.5).fill('#ece5de');
      doc.fillColor('#c0392b').font('Lato-Light').fontSize(10)
         .text('Discount', colDesc, y, { width: colSAC - colDesc - 8 });
      doc.fillColor('#c0392b').font('Lato-Light').fontSize(10)
         .text('', colQty, y, { width: 46, align: 'right' })
         .text('', colRate, y, { width: 46, align: 'right' })
         .text('−' + fmt(discount), colAmt, y, { width: 46, align: 'right' });
      y += 28;
    }

    // Extra add-on lines (admin-added, collected)
    extraAddonItems.forEach(a => {
      doc.rect(M, y - 2, CW, 0.5).fill('#ece5de');
      doc.fillColor(SUB).font('Lato-Light').fontSize(10)
         .text(a.name, colDesc, y, { width: colSAC - colDesc - 8 });
      doc.fillColor(MUTED).font('Lato-Light').fontSize(10)
         .text(SAC_CODE, colSAC, y, { width: 46, align: 'right' });
      doc.fillColor(SUB).font('Lato-Light').fontSize(10)
         .text(String(a.count), colQty,  y, { width: 46, align: 'right' })
         .text(fmt(a.unitPrice), colRate, y, { width: 46, align: 'right' })
         .text(fmt(a.total),     colAmt,  y, { width: 46, align: 'right' });
      y += 28;
    });

    doc.rect(M, y, CW, 0.5).fill(BORDER);
    y += 18;

    // ── Totals ───────────────────────────────────────────────────────────────
    const totX = M + CW - 240;
    const lblW = 150;
    const valW = 80;

    function totRow(label, value, accent) {
      doc.fillColor(accent ? BROWN : SUB)
         .font(accent ? 'Lato-Regular' : 'Lato-Light')
         .fontSize(accent ? 11.5 : 10.5)
         .text(label, totX, y + 4, { width: lblW });
      doc.fillColor(accent ? TERRA : MUTED)
         .font(accent ? 'Lato-Regular' : 'Lato-Light')
         .fontSize(accent ? 12.5 : 10.5)
         .text(value, totX + lblW, y + 4, { width: valW, align: 'right' });
      y += 24;
    }

    totRow('Taxable Amount', fmt(taxableAmount), false);
    // Supplier: Maharashtra; Place of supply: Goa → always inter-state → IGST
    totRow('IGST @ 5%', fmt(gst), false);

    doc.rect(totX, y, lblW + valW, 0.5).fill(TERRA);
    y += 10;

    doc.rect(totX - 10, y, lblW + valW + 10, 26).fill(CREAM);
    totRow('Total Paid (Incl. GST)', fmt(grandTotal), true);

    if (booking.razorpay_payment_id) {
      doc.fillColor(MUTED).font('Lato-Light').fontSize(8)
         .text('Payment ID: ' + booking.razorpay_payment_id, totX, y + 2, { width: lblW + valW, align: 'right' });
      y += 18;
    }

    // ── Guest list (multi-guest) ─────────────────────────────────────────────
    if (guests.length > 1) {
      y += 20;
      doc.rect(M, y, CW, 0.5).fill(BORDER);
      y += 14;
      doc.fillColor(MUTED).font('Lato-Light').fontSize(7.5)
         .text('GUESTS', M, y, { characterSpacing: 2 });
      y += 14;
      guests.forEach((g, i) => {
        doc.fillColor(BROWN).font('Lato-Regular').fontSize(9.5)
           .text((i + 1) + '.  ' + g.full_name, M, y, { continued: true });
        doc.fillColor(MUTED).font('Lato-Light').fontSize(9.5)
           .text('   ' + g.email + '  ·  ' + g.whatsapp);
        y += 16;
      });
    }

    // ── Remarks ──────────────────────────────────────────────────────────────
    y += 16;
    doc.rect(M, y, CW, 0.5).fill(BORDER);
    y += 14;
    doc.fillColor(MUTED).font('Lato-Light').fontSize(7.5)
       .text('REMARKS', M, y, { characterSpacing: 2 });
    y += 12;
    doc.fillColor(MUTED).font('Lato-Light').fontSize(8.5)
       .text(
         'Supply under Group 99972 – beauty & physical well-being services – rate 5% (input tax credit not availed as required under Notification 15/2025). ' +
         'Place of supply: Goa.',
         M, y, { width: CW }
       );

    // ── Bank details ─────────────────────────────────────────────────────────
    y += 28;
    doc.rect(M, y, CW, 0.5).fill(BORDER);
    y += 14;
    doc.fillColor(MUTED).font('Lato-Light').fontSize(7.5)
       .text('BANK DETAILS', M, y, { characterSpacing: 2 });
    y += 12;
    doc.fillColor(SUB).font('Lato-Light').fontSize(9)
       .text(SUPPLIER.bank + '  ·  A/c ' + SUPPLIER.acc + '  ·  IFSC ' + SUPPLIER.ifsc, M, y, { width: CW });

    // ── Footer ───────────────────────────────────────────────────────────────
    const footY = PH - 48;
    doc.rect(M, footY, CW, 0.5).fill(BORDER);
    doc.fillColor(MUTED).font('Lato-Light').fontSize(9.5)
       .text('Thank you for being part of Moon. We cannot wait to see you in Goa.', M, footY + 12, { width: CW, align: 'center' });
    doc.fillColor(SUB).font('Lato-Light').fontSize(10)
       .text('Moon Holistic Festival 2026  ·  Palolem Beach, South Goa  ·  moonyogaadventures@gmail.com', M, footY + 27, { width: CW, align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoice };
