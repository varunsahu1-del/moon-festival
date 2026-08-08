# Moon Festival Backend — Setup Guide

## 1. Install Node.js

If you don't have Node.js, install it from https://nodejs.org (choose the LTS version).

## 2. Install dependencies

Open Terminal, navigate to this folder, and run:

```bash
cd "/Users/varunsahu/Documents/Claude Code/moon-festival"
npm install
```

## 3. Set your admin password

Run the setup script — it will ask for a username and password and save them securely:

```bash
npm run setup
```

Enter your chosen username (e.g. `admin`) and a strong password. This creates a `.env` file.

## 4. Add your Gmail App Password

To send confirmation emails from moonyogaadventures@gmail.com:

1. Go to https://myaccount.google.com/apppasswords
2. Sign in, choose "Mail" and "Mac" (or Other)
3. Copy the 16-character password it gives you
4. Open the `.env` file and paste it as `GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx`

## 5. Add Razorpay keys (when ready)

1. Log into https://dashboard.razorpay.com/app/keys
2. Copy your Key ID and Key Secret
3. Add them to `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_live_xxxxx
   RAZORPAY_KEY_SECRET=xxxxx
   ```

## 6. Start the server

```bash
npm start
```

The site will be live at: http://localhost:4000  
Admin dashboard at: http://localhost:4000/admin

## 7. Deploying online (so it's accessible from anywhere)

Recommended: **Railway** (free tier)
1. Go to https://railway.app and sign up
2. Connect your GitHub repo or drag the folder
3. Add all your `.env` variables in Railway's dashboard
4. Railway will give you a public URL

---

## Summary of what was built

- **`server/index.js`** — Express server, serves the static site + API
- **`server/db.js`** — SQLite database (saved in `data/moonfestival.db`)
- **`server/email.js`** — Confirmation email sender
- **`server/routes/bookings.js`** — Booking creation + Razorpay payment verification
- **`server/routes/admin.js`** — Admin dashboard API (stats, bookings, CSV export)
- **`server/routes/auth.js`** — Admin login/logout
- **`server/views/login.html`** — Admin login page
- **`server/views/dashboard.html`** — Admin dashboard
- **`data/moonfestival.db`** — Created automatically on first run

## Booking flow

1. Guest fills form on tickets page → clicks "Proceed to Payment"
2. Server creates a booking record (status: pending) + Razorpay order
3. Razorpay checkout opens
4. On payment success → server verifies signature → marks booking paid
5. Confirmation email sent to guest + BCC to moonyogaadventures@gmail.com
6. Admin dashboard updates in real time
