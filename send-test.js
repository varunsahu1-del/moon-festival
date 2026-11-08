const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

resend.emails.send({
  from: 'Moon Festival <hello@moonfestival.in>',
  to: 'moonyogaadventures@gmail.com',
  replyTo: 'moonyogaadventures@gmail.com',
  subject: 'Thank you for applying to Moon Festival',
  text: `Hi Varun,

Thank you so much for reaching out and taking the time to apply to Moon Festival. It genuinely means a lot to us that you wanted to be part of what we're building here.

We've now connected with everyone who's joining us in the lineup this year — and for those who couldn't make it this time, we're truly sorry. Please know that we went through every single application with real care and attention. The offerings we received were so beautiful, so varied, and so full of heart.

The Moon is growing. Over the next two to three months, we're expanding beyond Goa to more cities across India, and one of our biggest intentions is to give as many people as possible a platform to share their work. We have your details with us, and you're in our world now. We'd love for paths to cross.

With love,
The Moon Festival Team`,
  html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:560px;">
<p>Hi Varun,</p>
<p>Thank you so much for reaching out and taking the time to apply to Moon Festival. It genuinely means a lot to us that you wanted to be part of what we're building here.</p>
<p>We've now connected with everyone who's joining us in the lineup this year — and for those who couldn't make it this time, we're truly sorry. Please know that we went through every single application with real care and attention. The offerings we received were so beautiful, so varied, and so full of heart.</p>
<p>The Moon is growing. Over the next two to three months, we're expanding beyond Goa to more cities across India, and one of our biggest intentions is to give as many people as possible a platform to share their work. We have your details with us, and you're in our world now. We'd love for paths to cross.</p>
<p>With love,<br>The Moon Festival Team</p>
</div>`
}).then(r => console.log('Sent:', JSON.stringify(r))).catch(e => console.error('Error:', e.message));
