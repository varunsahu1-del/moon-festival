const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const crypto  = require('crypto');

const ROOT  = path.join(__dirname, '../..');
const CACHE = path.join(__dirname, '../../data/img-cache');

if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });

const MOBILE_BREAKPOINT = 768;
const DEFAULT_W = 900;
const MAX_W     = 1800;

// GET /img/<any/path/to/image.jpg>?w=800&q=80
router.get('/*', async (req, res) => {
  const rel = req.params[0];
  if (!rel) return res.status(400).end();

  // Sanitize: no traversal above root
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return res.status(403).end();
  if (!fs.existsSync(abs)) return res.status(404).end();

  const ext = path.extname(rel).toLowerCase();
  // Only optimize images
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return res.status(400).end();

  const w = Math.min(MAX_W, Math.max(50, parseInt(req.query.w, 10) || DEFAULT_W));
  const q = Math.min(95, Math.max(10, parseInt(req.query.q, 10) || 82));

  // Cache key based on file path + mtime + params
  const mtime = fs.statSync(abs).mtimeMs;
  const key   = crypto.createHash('md5').update(`${abs}|${mtime}|${w}|${q}`).digest('hex');
  const cached = path.join(CACHE, key + '.webp');

  if (!fs.existsSync(cached)) {
    try {
      await sharp(abs)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: q })
        .toFile(cached);
    } catch (err) {
      console.error('[img]', err.message);
      return res.status(500).end();
    }
  }

  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
  res.setHeader('Vary', 'Accept');
  res.sendFile(cached);
});

module.exports = router;
