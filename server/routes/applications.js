const express = require('express');
const router = express.Router();
const multer = require('multer');
const nodemailer = require('nodemailer');
const { db } = require('../db');
const { sendApplicationReceived } = require('../email');

const PARTICIPATE_EMAIL = 'participate.moon@gmail.com';

// Store files in memory so we can attach them directly to the email
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

const FORM_LABELS = {
  'apply-facilitator': 'Facilitator Application',
  'apply-fb':          'Food & Beverage Application',
  'apply-installation':'Art Installation Application',
  'apply-performance': 'Performance Artist Application',
  'apply-retail':      'Retail / Flea Stall Application',
  'apply-volunteer':   'Volunteer Application',
};

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// POST /api/applications/submit
// multipart/form-data — all fields + optional file uploads
router.post('/submit', upload.any(), async (req, res) => {
  try {
    const fields = req.body;
    const files  = req.files || [];

    const formName  = fields['form-name'] || 'unknown';
    const formLabel = FORM_LABELS[formName] || formName;
    const applicantName  = fields.fullName || fields.name || 'Applicant';
    const applicantEmail = fields.email || '';

    // Extra context for subject line (offer type, performance type, etc.)
    const subjectExtra = fields.offerType || fields.performanceType || fields.installationType || fields.areaOfInterest || null;
    const subjectTag = subjectExtra ? ` · ${subjectExtra.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}` : '';

    // Build a readable HTML table of all submitted fields
    const SKIP = ['form-name', 'phoneCC', 'phoneNumber']; // phone combined below
    const FIELD_ORDER = [
      // What they offer
      'offerType','performanceType','installationType','areaOfInterest',
      'description','whatYouSell','whatYouServe','concept',
      'about','skills','duration','daysAvailable',
      'ownEquipment','foodSafety',
      // Links & media
      'instagram','reel','portfolio','videoLink1','videoLink2','videoLink3',
      // Contact
      'fullName','name','location','email',
    ];
    const allKeys = Object.keys(fields).filter(k => !SKIP.includes(k) && fields[k] && String(fields[k]).trim());
    const orderedKeys = [
      ...FIELD_ORDER.filter(k => allKeys.includes(k)),
      ...allKeys.filter(k => !FIELD_ORDER.includes(k)),
    ];

    // Combine phone CC + number
    const phoneVal = fields.phoneNumber ? `${fields.phoneCC || '+91'} ${fields.phoneNumber}` : null;

    function formatValue(k, v) {
      const str = String(v);
      if (/^https?:\/\//i.test(str.trim())) {
        return `<a href="${str.trim()}" style="color:#B06030;text-decoration:none;">${str.trim()}</a>`;
      }
      return str.replace(/\n/g, '<br>');
    }

    const LABELS = {
      offerType: 'Category', performanceType: 'Performance Type', installationType: 'Installation Type',
      areaOfInterest: 'Area of Interest', description: 'Session / Stall Description',
      whatYouSell: 'What You Sell', whatYouServe: 'What You Serve', concept: 'Concept',
      about: 'About You', skills: 'Skills', duration: 'Duration', daysAvailable: 'Days Available',
      ownEquipment: 'Own Equipment', foodSafety: 'Food Safety',
      instagram: 'Instagram', reel: 'Reel / Video Link', portfolio: 'Portfolio',
      videoLink1: 'Video Link 1', videoLink2: 'Video Link 2', videoLink3: 'Video Link 3',
      fullName: 'Full Name', location: 'City / Location', email: 'Email',
    };

    const LBL = 'padding:16px 0 3px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#9a8070;';
    const VAL = 'padding:0 0 14px;font-family:Arial,sans-serif;font-size:14px;font-weight:300;color:#EDD4B2;line-height:1.6;word-break:break-word;border-bottom:1px solid rgba(176,96,48,0.18);';

    const phoneRow = phoneVal ? `<tr><td style="${LBL}">Phone</td></tr><tr><td style="${VAL}">${phoneVal}</td></tr>` : '';

    const rows = orderedKeys.map(k => {
        const v = fields[k];
        const label = LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        return `<tr><td style="${LBL}">${label}</td></tr><tr><td style="${VAL}">${formatValue(k, v)}</td></tr>`;
      }).join('') + phoneRow;

    const BG = '#191406';
    const BORDER = 'rgba(176,96,48,0.18)';
    const TERRA = '#C47D52';
    const TEXT = '#EDD4B2';
    const SUB = 'rgba(237,212,178,0.75)';
    const MUTED = 'rgba(237,212,178,0.4)';
    const OPEN = "'Lato','Open Sans',Helvetica,Arial,sans-serif";

    const filesHtml = files.length ? (
      '<tr><td style="padding:20px 0 6px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:' + TERRA + ';">Uploads (' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' — see attachments)</td></tr>'
      + files.map(f => '<tr><td style="padding:0 0 4px;font-family:Arial,sans-serif;font-size:12px;color:' + SUB + ';padding:7px 12px;border-left:2px solid ' + TERRA + ';background:rgba(176,96,48,0.06);">📎 ' + f.originalname + '</td></tr>').join('')
    ) : '';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>'
      + '<body style="margin:0;padding:0;background:' + BG + ';">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' + BG + ';border:1px solid ' + BORDER + ';">'
      // Header
      + '<tr><td style="padding:44px 52px 36px;border-bottom:1px solid ' + BORDER + ';">'
      + '<p style="margin:0 0 3px;font-family:' + OPEN + ';font-size:28px;font-weight:700;letter-spacing:0.1em;color:' + TEXT + ';">MOON 2026</p>'
      + '<p style="margin:8px 0 0;font-family:' + OPEN + ';font-size:9px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:' + MUTED + ';">27 – 30 Nov 2026 &nbsp;|&nbsp; South Goa</p>'
      + '</td></tr>'
      // Applicant summary
      + '<tr><td style="padding:36px 52px 28px;">'
      + '<p style="margin:0 0 6px;font-family:' + OPEN + ';font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:' + MUTED + ';">' + formLabel + (subjectExtra ? ' &nbsp;·&nbsp; ' + subjectExtra.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : '') + '</p>'
      + '<p style="margin:0 0 20px;font-family:' + OPEN + ';font-size:24px;font-weight:700;color:' + TEXT + ';">' + applicantName + '</p>'
      + (phoneVal ? '<p style="margin:0 0 8px;font-family:' + OPEN + ';font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:' + MUTED + ';">WhatsApp</p><p style="margin:0 0 16px;"><a href="https://wa.me/' + phoneVal.replace(/\D/g,'').replace(/^0/,'91') + '" style="font-family:' + OPEN + ';font-size:15px;font-weight:600;color:#25d366;text-decoration:none;">' + phoneVal + '</a></p>' : '')
      + (applicantEmail ? '<p style="margin:0 0 8px;font-family:' + OPEN + ';font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:' + MUTED + ';">Email</p><p style="margin:0 0 16px;"><a href="mailto:' + applicantEmail + '" style="font-family:' + OPEN + ';font-size:15px;color:' + TERRA + ';text-decoration:none;">' + applicantEmail + '</a></p>' : '')
      + (fields.instagram ? '<p style="margin:0 0 8px;font-family:' + OPEN + ';font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:' + MUTED + ';">Instagram</p><p style="margin:0 0 16px;"><a href="' + (fields.instagram.startsWith('http') ? fields.instagram : 'https://instagram.com/' + fields.instagram.replace(/^@/,'')) + '" style="font-family:' + OPEN + ';font-size:15px;color:' + TERRA + ';text-decoration:none;">' + fields.instagram + '</a></p>' : '')
      + ((fields.location || fields.city) ? '<p style="margin:0 0 8px;font-family:' + OPEN + ';font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:' + MUTED + ';">Location</p><p style="margin:0;font-family:' + OPEN + ';font-size:15px;color:' + TEXT + ';">' + (fields.location || fields.city) + '</p>' : '')
      + '</td></tr>'
      // Divider
      + '<tr><td style="padding:24px 52px 0;"><div style="height:1px;background:' + BORDER + ';"></div></td></tr>'
      // Fields table
      + '<tr><td style="padding:24px 52px 32px;">'
      + '<table width="100%" cellpadding="0" cellspacing="0">'
      + rows
      + filesHtml
      + '</table>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="padding:24px 0;text-align:center;border-top:1px solid ' + BORDER + ';">'
      + '<p style="margin:0;font-family:' + OPEN + ';font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + MUTED + ';">Moon Festival 2026 &nbsp;·&nbsp; Goa, India</p>'
      + '</td></tr>'
      + '</table></td></tr></table></body></html>';

    const attachments = files.map(f => ({
      filename: f.originalname,
      content:  f.buffer,
      contentType: f.mimetype,
    }));

    // Save to database
    try {
      db.prepare(`
        INSERT INTO applications (form_type, form_label, applicant, email, whatsapp, fields_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(formName, formLabel, applicantName, applicantEmail, fields.whatsapp || '', JSON.stringify(fields));
    } catch (e) { console.error('[applications] DB save failed:', e.message); }

    if (!process.env.GMAIL_APP_PASSWORD) {
      console.log('[applications] GMAIL_APP_PASSWORD not set — skipping email, fields:', fields);
      return res.json({ ok: true, note: 'email_skipped' });
    }

    const transporter = createTransport();
    await transporter.sendMail({
      from:        `"Moon Festival" <${process.env.GMAIL_USER}>`,
      to:          PARTICIPATE_EMAIL,
      replyTo:     applicantEmail || undefined,
      subject:     `📋 ${applicantName} · ${formLabel}${subjectTag} · Moon Festival 2026`,
      html,
      attachments,
    });

    console.log(`[applications] ${formLabel} from ${applicantName} sent to ${PARTICIPATE_EMAIL}`);

    // Email 07 — acknowledgement to applicant
    if (applicantEmail) {
      sendApplicationReceived({ applicantName, applicantEmail, formLabel }).catch(e => console.error('[applications] applicant ack failed:', e.message));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[applications/submit]', err);
    res.status(500).json({ error: 'Failed to send application' });
  }
});

module.exports = router;
