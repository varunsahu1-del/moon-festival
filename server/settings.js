const fs   = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, 'settings.json');

// Pricing is locked to Phase 4 until the festival. If settings.json is missing or
// unreadable, fall back to Phase 4 — never to an older, cheaper phase.
const DEFAULT_PHASE = 'phase4';

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return { phase: DEFAULT_PHASE }; }
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

function resolvePhase() {
  const s = readSettings();
  if (s.phase) return s.phase;
  if (!s.phaseDates) return DEFAULT_PHASE;
  const today = new Date().toISOString().slice(0, 10);
  for (const [name, range] of Object.entries(s.phaseDates)) {
    if (today >= range.start && today <= range.end) return name;
  }
  return DEFAULT_PHASE;
}

module.exports = { readSettings, writeSettings, resolvePhase };
