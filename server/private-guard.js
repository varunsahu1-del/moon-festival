// Blocks private project files from being served as static files.
//
// index.js serves the whole project folder with express.static, so without this
// guard anything in it is downloadable by URL, including the booking database
// (/data/moonfestival.db), its backups, the server code and project docs.
// Mount this BEFORE the HTML-partials middleware and express.static, and AFTER
// any route that deliberately serves from these folders (e.g. /data/screenshots,
// which is admin-only).

const path = require('path');

// Folders that hold data, code or tooling. Nothing public is loaded from them.
const PRIVATE_DIRS = /^\/(data|server|scripts|node_modules|\.claude|\.git)(\/|$)/i;

// File types that are never part of the public site.
const PRIVATE_EXT = /\.(db|db-wal|db-shm|sqlite|sqlite3|md|sh|py|log|jsonl|lock|example|bak)$/i;

// Individual root files that are tooling, not site content.
const PRIVATE_FILES = new Set([
  '/package.json',
  '/package-lock.json',
  '/send-outreach.js',
  '/send-test.js',
]);

function isPrivatePath(rawPath) {
  let p;
  try { p = decodeURIComponent(rawPath); } catch { return true; } // malformed encoding: refuse
  p = path.posix.normalize('/' + p.replace(/\\/g, '/'));
  return PRIVATE_DIRS.test(p) || PRIVATE_EXT.test(p) || PRIVATE_FILES.has(p.toLowerCase());
}

function privateGuard(req, res, next) {
  if (isPrivatePath(req.path)) return res.status(404).type('text').send('Not found');
  next();
}

module.exports = { privateGuard, isPrivatePath };
