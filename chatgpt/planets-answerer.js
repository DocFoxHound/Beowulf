// Planets answerer: uses UEX /planets API to respond with full field coverage
const { getAllPlanets } = require('../api/uexApi');

function norm(s) { return String(s || '').toLowerCase().trim(); }
function yesNo(v) { const n = Number(v); return isFinite(n) && n > 0 ? 'Yes' : 'No'; }
function pickTop(arr, n) { return Array.isArray(arr) ? arr.slice(0, Math.max(1, n || 10)) : []; }

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let CACHE = { ts: 0, rows: [] };

async function loadPlanets({ force = false } = {}) {
  const now = Date.now();
  if (!force && CACHE.rows?.length && (now - CACHE.ts) < CACHE_TTL_MS) return CACHE.rows;
  const rows = await getAllPlanets();
  CACHE = { ts: now, rows: Array.isArray(rows) ? rows : [] };
  return CACHE.rows;
}

function toEpochMs(v) { if (v == null) return null; const n = Number(v); if (!isFinite(n) || n <= 0) return null; return n < 1e12 ? n * 1000 : n; }
function toIsoDate(v) { const ms = toEpochMs(v); return ms ? new Date(ms).toISOString().slice(0,10) : null; }

function matchPlanet(r, q) {
  const fq = norm(q);
  return norm(r.name).includes(fq) || norm(r.code || '').includes(fq) || norm(r.name_origin || '').includes(fq);
}

function fmtPlanetLine(r) {
  const flags = [];
  if (r.is_available != null) flags.push(`available:${yesNo(r.is_available)}`);
  if (r.is_available_live != null) flags.push(`live:${yesNo(r.is_available_live)}`);
  if (r.is_visible != null) flags.push(`visible:${yesNo(r.is_visible)}`);
  if (r.is_default != null) flags.push(`default:${yesNo(r.is_default)}`);
  const flagStr = flags.length ? ` [${flags.join(' | ')}]` : '';
  return `- ${r.name}${r.code ? ` (${r.code})` : ''} — ${r.star_system_name || '—'}${flagStr}`;
}

function filterPlanets(rows, f = {}) {
  let r = rows.slice();
  const boolKeys = ['is_available','is_available_live','is_visible','is_default'];
  for (const k of boolKeys) {
    if (f[k] === true) r = r.filter(x => Number(x[k]) > 0);
    if (f[k] === false) r = r.filter(x => Number(x[k]) === 0);
  }
  const sys = norm(f.system_name || '');
  if (sys) r = r.filter(x => norm(x.star_system_name).includes(sys));
  return r;
}

async function planetDetails({ name = null, code = null, system_name = null }) {
  const rows = await loadPlanets();
  const q = name || code;
  if (!q) return { ok: false, text: 'Which planet?' };
  let matches = rows.filter(r => matchPlanet(r, q));
  if (system_name) matches = matches.filter(r => norm(r.star_system_name).includes(norm(system_name)));
  if (!matches.length) {
    const sugg = pickTop(rows.filter(r => norm(r.name).includes(norm(q))), 5).map(r => `- ${r.name}${r.code?` (${r.code})`:''} — ${r.star_system_name || '—'}`).join('\n');
    return { ok: false, text: sugg ? `I couldn't find that planet. Did you mean:\n${sugg}` : `I couldn't find that planet.` };
  }
  const r = matches[0];
  const parts = [];
  parts.push(`${r.name}${r.code?` (${r.code})`:''}`);
  if (r.name_origin) parts.push(`Name origin: ${r.name_origin}`);
  parts.push(`System: ${r.star_system_name || '—'}`);
  parts.push(`Faction: ${r.faction_name || '—'} | Jurisdiction: ${r.jurisdiction_name || '—'}`);
  const flags = [
    `Available: ${yesNo(r.is_available)}`,
    `Live: ${yesNo(r.is_available_live)}`,
    `Visible: ${yesNo(r.is_visible)}`,
    `Default: ${yesNo(r.is_default)}`,
  ];
  parts.push(flags.join(' | '));
  const dates = [];
  const da = toIsoDate(r.date_added), dm = toIsoDate(r.date_modified);
  if (da) dates.push(`Added: ${da}`);
  if (dm) dates.push(`Modified: ${dm}`);
  if (dates.length) parts.push(dates.join(' | '));
  return { ok: true, text: parts.join('\n') };
}

async function listPlanets({ filters = {}, top = 50 } = {}) {
  const rows = await loadPlanets();
  let r = filterPlanets(rows, filters);
  r.sort((a,b)=> (Number(b.is_default||0) - Number(a.is_default||0)) || String(a.name||'').localeCompare(String(b.name||'')));
  const lines = pickTop(r, top).map(fmtPlanetLine);
  if (!lines.length) return { ok: false, text: 'No planets matched that filter.' };
  const tags = [];
  if (filters.system_name) tags.push(`system:${filters.system_name}`);
  if (filters.is_visible) tags.push('visible');
  if (filters.is_available_live) tags.push('live');
  if (filters.is_default) tags.push('default');
  const head = `Planets${tags.length?` (${tags.join(' | ')})`:''}:`;
  return { ok: true, text: [head, ...lines].join('\n') };
}

async function searchPlanets({ query, top = 12, system_name = null } = {}) {
  const rows = await loadPlanets();
  const q = norm(query || '');
  if (!q) return { ok: false, text: 'What should I search for?' };
  let r = rows.filter(rr => matchPlanet(rr, q));
  if (system_name) r = r.filter(rr => norm(rr.star_system_name).includes(norm(system_name)));
  if (!r.length) return { ok: false, text: `No planets matched "${query}".` };
  const lines = pickTop(r, top).map(fmtPlanetLine);
  return { ok: true, text: ['Matches:', ...lines].join('\n') };
}

async function recentPlanetChanges({ date_start = null, date_end = null } = {}) {
  const rows = await loadPlanets();
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
  if (!inRange.length) return { ok: true, text: 'No planet changes in the requested timeframe.' };
  const lines = inRange
    .sort((a,b)=> (toEpochMs(b.date_modified)||0) - (toEpochMs(a.date_modified)||0))
    .map(r => `- ${r.name}${r.code?` (${r.code})`:''} — ${r.star_system_name || '—'} — ${toIsoDate(r.date_modified) || toIsoDate(r.date_added) || '—'} | Live:${yesNo(r.is_available_live)} | Visible:${yesNo(r.is_visible)}`);
  return { ok: true, text: ['Recent planet changes:', ...pickTop(lines, 20)].join('\n') };
}

async function planetFactionSummary() {
  const rows = await loadPlanets();
  const map = new Map();
  for (const r of rows) {
    const k = String(r.faction_name || '—');
    map.set(k, (map.get(k) || 0) + 1);
  }
  const lines = Array.from(map.entries()).sort((a,b)=> b[1]-a[1]).map(([k,v]) => `- ${k}: ${v}`);
  return { ok: true, text: ['Planets by faction:', ...lines].join('\n') };
}

async function planetJurisdictionSummary() {
  const rows = await loadPlanets();
  const map = new Map();
  for (const r of rows) {
    const k = String(r.jurisdiction_name || '—');
    map.set(k, (map.get(k) || 0) + 1);
  }
  const lines = Array.from(map.entries()).sort((a,b)=> b[1]-a[1]).map(([k,v]) => `- ${k}: ${v}`);
  return { ok: true, text: ['Planets by jurisdiction:', ...lines].join('\n') };
}

module.exports = {
  loadPlanets,
  planetDetails,
  listPlanets,
  searchPlanets,
  recentPlanetChanges,
  planetFactionSummary,
  planetJurisdictionSummary,
};
