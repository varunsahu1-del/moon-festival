const fs   = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return { phase: 'earlyBird' }; }
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

function resolvePhase() {
  const s = readSettings();
  if (!s.phaseDates) return s.phase || 'earlyBird';
  const today = new Date().toISOString().slice(0, 10);
  for (const [name, range] of Object.entries(s.phaseDates)) {
    if (today >= range.start && today <= range.end) return name;
  }
  return s.phase || 'earlyBird';
}

module.exports = { readSettings, writeSettings, resolvePhase };
