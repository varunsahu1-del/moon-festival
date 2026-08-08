const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.sendFile('login.html', { root: __dirname + '/../views' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = username === process.env.ADMIN_USERNAME;
  let validPass = false;
  if (process.env.ADMIN_PASSWORD_HASH) {
    validPass = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  } else if (process.env.ADMIN_PASSWORD) {
    // Temporary plain-text fallback — run `npm run setup` to hash it
    validPass = password === process.env.ADMIN_PASSWORD;
  }

  if (validUser && validPass) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.sendFile('login.html', { root: __dirname + '/../views', headers: { 'x-login-error': '1' } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(403).send('Forbidden');
}

module.exports = router;
module.exports.requireAdmin = requireAdmin;
