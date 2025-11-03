// Space Stations answerer: uses UEX /spacestations API to answer station questions with full field coverage
const { getAllSpaceStations } = require('../api/uexApi');

function norm(s) { return String(s || '').toLowerCase().trim(); }
function yesNo(v) { const n = Number(v); return isFinite(n) && n > 0 ? 'Yes' : 'No'; }
function pickTop(arr, n) { return Array.isArray(arr) ? arr.slice(0, Math.max(1, n || 10)) : []; }

// Local 1h TTL cache
const CACHE_TTL_MS = 60 * 60 * 1000;
let CACHE = { ts: 0, rows: [] };
async function loadStations({ force = false } = {}) {
  const now = Date.now();
  if (!force && CACHE.rows?.length && (now - CACHE.ts) < CACHE_TTL_MS) return CACHE.rows;
  const rows = await getAllSpaceStations();
  CACHE = { ts: now, rows: Array.isArray(rows) ? rows : [] };
  return CACHE.rows;
}

function toEpochMs(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n; // sec vs ms
}
function toIsoDate(v) { const ms = toEpochMs(v); return ms ? new Date(ms).toISOString().slice(0,10) : null; }

function matchStation(r, q) {
  const fq = norm(q);
  return norm(r.name).includes(fq) || norm(r.nickname || '').includes(fq);
}

function featureList(r) {
  const feats = [];
  const add = (k, label) => { if (r[k] != null) feats.push(`${label}:${yesNo(r[k])}`); };
  add('has_quantum_marker', 'Quantum Marker');
  add('has_trade_terminal', 'Trade Terminal');
  add('has_habitation', 'Habitation');
  add('has_refinery', 'Refinery');
  add('has_cargo_center', 'Cargo Center');
  add('has_clinic', 'Clinic');
  add('has_food', 'Food');
  add('has_shops', 'Shops');
  add('has_refuel', 'Refuel');
  add('has_repair', 'Repair');
  add('has_gravity', 'Gravity');
  add('has_loading_dock', 'Loading Dock');
  add('has_docking_port', 'Docking Port');
  add('has_freight_elevator', 'Freight Elevator');
  return feats;
}

function policyList(r) {
  const flags = [];
  const add = (k, label) => { if (r[k] != null) flags.push(`${label}:${yesNo(r[k])}`); };
  add('is_monitored', 'Monitored');
  add('is_armistice', 'Armistice');
  add('is_landable', 'Landable');
  add('is_decommissioned', 'Decommissioned');
  add('is_lagrange', 'Lagrange');
  add('is_available', 'Available');
  add('is_available_live', 'Live');
  add('is_visible', 'Visible');
  add('is_default', 'Default');
  return flags;
}

function fmtWhere(r) {
  const parts = [r.star_system_name, r.planet_name, r.orbit_name, r.moon_name, r.city_name].filter(Boolean);
  return parts.join(' › ');
}

function fmtStationLine(r) {
  const loc = fmtWhere(r);
  const flags = policyList(r).join(' | ');
  return `- ${r.name}${r.nickname ? ` (${r.nickname})` : ''} — ${loc || '—'}${flags ? ` [${flags}]` : ''}`;
}

function filterByFlags(rows, f = {}) {
  let r = rows.slice();
  const boolKeys = [
    'is_monitored','is_armistice','is_landable','is_decommissioned','is_lagrange',
    'is_available','is_available_live','is_visible','is_default',
    'has_quantum_marker','has_trade_terminal','has_habitation','has_refinery','has_cargo_center','has_clinic','has_food','has_shops','has_refuel','has_repair','has_gravity','has_loading_dock','has_docking_port','has_freight_elevator',
  ];
  for (const k of boolKeys) {
    if (f[k] === true) r = r.filter(x => Number(x[k]) > 0);
    if (f[k] === false) r = r.filter(x => Number(x[k]) === 0);
  }
  const locQ = norm(f.location_name || '');
  if (locQ) {
    r = r.filter(x => [x.star_system_name,x.planet_name,x.orbit_name,x.moon_name,x.city_name].filter(Boolean).some(v => norm(v).includes(locQ)));
  }
  return r;
}

async function spaceStationDetails({ name = null }) {
  const rows = await loadStations();
  if (!name) return { ok: false, text: 'Which space station?' };
  const matches = rows.filter(r => matchStation(r, name));
  if (!matches.length) {
    const sugg = pickTop(rows.filter(r => norm(r.name).includes(norm(name))), 5).map(r => `- ${r.name}${r.nickname ? ` (${r.nickname})` : ''}`).join('\n');
    return { ok: false, text: sugg ? `I couldn't find that station. Did you mean:\n${sugg}` : `I couldn't find that station.` };
  }
  const r = matches[0];
  const parts = [];
  parts.push(`${r.name}${r.nickname ? ` (${r.nickname})` : ''}`);
  const flags = policyList(r);
  if (flags.length) parts.push(flags.join(' | '));
  const feats = featureList(r);
  if (feats.length) parts.push(`Features: ${feats.join(' | ')}`);
  const loc = fmtWhere(r);
  parts.push(`Location: ${loc || '—'}`);
  parts.push(`Faction: ${r.faction_name || '—'} | Jurisdiction: ${r.jurisdiction_name || '—'}`);
  if (r.pad_types) parts.push(`Pad types: ${String(r.pad_types).trim()}`);
  const dates = [];
  const da = toIsoDate(r.date_added); const dm = toIsoDate(r.date_modified);
  if (da) dates.push(`Added: ${da}`);
  if (dm) dates.push(`Modified: ${dm}`);
  if (dates.length) parts.push(dates.join(' | '));
  return { ok: true, text: parts.join('\n') };
}

async function listSpaceStations({ filters = {}, top = 50 } = {}) {
  const rows = await loadStations();
  let r = filterByFlags(rows, filters);
  // Prefer visible, then name
  r.sort((a,b)=> (Number(b.is_visible||0) - Number(a.is_visible||0)) || String(a.name||'').localeCompare(String(b.name||'')));
  const lines = pickTop(r, top).map(fmtStationLine);
  if (!lines.length) return { ok: false, text: 'No stations matched that filter.' };
  const tags = [];
  const tagIf = (cond, t) => { if (cond) tags.push(t); };
  tagIf(filters.location_name, `near:${filters.location_name}`);
  const capTags = ['has_refinery','has_cargo_center','has_clinic','has_food','has_shops','has_refuel','has_repair','has_habitation','has_trade_terminal'].filter(k => filters[k]);
  if (capTags.length) tags.push('features:' + capTags.map(k=>k.replace(/^has_/, '')).join(','));
  const polTags = ['is_monitored','is_armistice','is_landable','is_decommissioned','is_lagrange','is_available','is_available_live','is_visible','is_default'].filter(k => filters[k]);
  if (polTags.length) tags.push('flags:' + polTags.map(k=>k.replace(/^is_/, '')).join(','));
  const head = `Space stations${tags.length?' ('+tags.join(' | ')+')':''}:`;
  return { ok: true, text: [head, ...lines].join('\n') };
}

async function searchSpaceStations({ query, top = 12, location_name = null } = {}) {
  const rows = await loadStations();
  const q = norm(query || '');
  if (!q) return { ok: false, text: 'What should I search for?' };
  let r = rows.filter(rr => matchStation(rr, q));
  if (location_name) r = filterByFlags(r, { location_name });
  if (!r.length) return { ok: false, text: `No stations matched "${query}".` };
  const lines = pickTop(r, top).map(fmtStationLine);
  return { ok: true, text: ['Matches:', ...lines].join('\n') };
}

async function recentSpaceStationChanges({ date_start = null, date_end = null } = {}) {
  const rows = await loadStations();
  let startMs = date_start ? Date.parse(date_start + 'T00:00:00Z') : null;
  let endMs = date_end ? Date.parse(date_end + 'T23:59:59Z') : null;
  if (!startMs && !endMs) { endMs = Date.now(); startMs = endMs - 30*86400000; }
  const inRange = rows.filter(r => {
    const dm = toEpochMs(r.date_modified) || toEpochMs(r.date_added);
    if (!dm) return false;
    if (startMs && dm < startMs) return false;
    if (endMs && dm > endMs) return false;
    return true;
  });
  if (!inRange.length) return { ok: true, text: 'No space station changes in the requested timeframe.' };
  const lines = inRange
    .sort((a,b)=> (toEpochMs(b.date_modified)||0) - (toEpochMs(a.date_modified)||0))
    .map(r => `- ${r.name}${r.nickname?` (${r.nickname})`:''} — ${toIsoDate(r.date_modified) || toIsoDate(r.date_added) || '—'} | Visible:${yesNo(r.is_visible)} | Live:${yesNo(r.is_available_live)} | Armistice:${yesNo(r.is_armistice)}`);
  return { ok: true, text: ['Recent space station changes:', ...pickTop(lines, 20)].join('\n') };
}

module.exports = {
  loadStations,
  spaceStationDetails,
  listSpaceStations,
  searchSpaceStations,
  recentSpaceStationChanges,
};
