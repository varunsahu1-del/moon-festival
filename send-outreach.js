const { Resend } = require('resend');
const { db } = require('./server/db');

const resend = new Resend(process.env.RESEND_API_KEY);

const rows = db.prepare(
  "SELECT applicant, email FROM applications WHERE form_type NOT IN ('apply-retail','apply-fb') AND email IS NOT NULL AND email != '' ORDER BY id ASC"
).all();

const seen = new Set();
const list = [];
for (const r of rows) {
  const e = r.email.trim().toLowerCase();
  if (!seen.has(e) && e !== 'aa@test.com' && e !== 'varunsahu1@gmail.com') {
    seen.add(e);
    const firstName = (r.applicant || '').trim().split(' ')[0] || 'there';
    list.push({ name: firstName.charAt(0).toUpperCase() + firstName.slice(1), email: r.email.trim() });
  }
}

console.log('Sending to', list.length, 'recipients...');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendAll() {
  let ok = 0, fail = 0;
  for (const { name, email } of list) {
    try {
      await resend.emails.send({
        from: 'Moon Festival <hello@moonfestival.in>',
        to: email,
        replyTo: 'moonyogaadventures@gmail.com',
        subject: 'Thank you for applying to Moon Festival',
        text: `Hi ${name},\n\nThank you so much for reaching out and taking the time to apply to Moon Festival. It genuinely means a lot to us that you wanted to be part of what we're building here.\n\nWe've now connected with everyone who's joining us in the lineup this year — and for those who couldn't make it this time, we're truly sorry. Please know that we went through every single application with real care and attention. The offerings we received were so beautiful, so varied, and so full of heart.\n\nThe Moon is growing. Over the next two to three months, we're expanding beyond Goa to more cities across India, and one of our biggest intentions is to give as many people as possible a platform to share their work. We have your details with us, and you're in our world now. We'd love for paths to cross.\n\nWith love,\nThe Moon Festival Team`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:560px;">
<p>Hi ${name},</p>
<p>Thank you so much for reaching out and taking the time to apply to Moon Festival. It genuinely means a lot to us that you wanted to be part of what we're building here.</p>
<p>We've now connected with everyone who's joining us in the lineup this year — and for those who couldn't make it this time, we're truly sorry. Please know that we went through every single application with real care and attention. The offerings we received were so beautiful, so varied, and so full of heart.</p>
<p>The Moon is growing. Over the next two to three months, we're expanding beyond Goa to more cities across India, and one of our biggest intentions is to give as many people as possible a platform to share their work. We have your details with us, and you're in our world now. We'd love for paths to cross.</p>
<p>With love,<br>The Moon Festival Team</p>
</div>`
      });
      ok++;
      console.log(`[${ok + fail}/${list.length}] OK ${email}`);
    } catch(e) {
      fail++;
      console.log(`[${ok + fail}/${list.length}] FAIL ${email} — ${e.message}`);
    }
    await sleep(250);
  }
  console.log(`\nDone. ${ok} sent, ${fail} failed.`);
}

sendAll();
