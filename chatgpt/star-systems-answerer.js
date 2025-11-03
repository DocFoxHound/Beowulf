// Star Systems answerer: uses UEX /starsystems API to answer star-system questions
const { getAllStarSystems } = require('../api/uexApi');

function norm(s) { return String(s || '').toLowerCase().trim(); }

// Local 1h TTL cache (API layer may also cache, this just avoids extra work here)
const CACHE_TTL_MS = 60 * 60 * 1000;
let CACHE = { ts: 0, systems: [] };

async function loadSystems({ force = false } = {}) {
  const now = Date.now();
  if (!force && CACHE.systems?.length && (now - CACHE.ts) < CACHE_TTL_MS) return CACHE.systems;
  const rows = await getAllStarSystems();
  CACHE = { ts: now, systems: Array.isArray(rows) ? rows : [] };
  return CACHE.systems;
}

function toEpochMs(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  // Heuristic: seconds vs ms
  if (n < 1e12) return n * 1000; // seconds
  return n; // milliseconds
}

function toIsoDate(v) {
  const ms = toEpochMs(v);
  if (!ms) return null;
  try { return new Date(ms).toISOString().slice(0, 10); } catch { return null; }
}

function humanBool(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n > 0 ? 'Yes' : 'No';
}

function matchSystem(row, q) {
  const name = norm(row.name);
  const code = norm(row.code);
  const fq = norm(q);
  return name === fq || code === fq || name.includes(fq) || code.includes(fq);
}

function pickTop(arr, n) {
  return Array.isArray(arr) ? arr.slice(0, Math.max(1, n || 10)) : [];
}

function fmtSystemLine(r) {
  const flags = [];
  if (r.is_available != null) flags.push(`available:${humanBool(r.is_available)}`);
  if (r.is_available_live != null) flags.push(`live:${humanBool(r.is_available_live)}`);
  if (r.is_visible != null) flags.push(`visible:${humanBool(r.is_visible)}`);
  if (r.is_default != null) flags.push(`default:${humanBool(r.is_default)}`);
  const flagStr = flags.length ? ` [${flags.join(' | ')}]` : '';
  return `- ${r.name || 'Unknown'} (${r.code || '—'}) — Faction: ${r.faction_name || '—'} | Jurisdiction: ${r.jurisdiction_name || '—'}${flagStr}`;
}

async function starSystemDetails({ name = null, code = null }) {
  const systems = await loadSystems();
  const q = name || code;
  if (!q) return { ok: false, text: 'Which star system?' };
  const matches = systems.filter(r => matchSystem(r, q));
  if (!matches.length) {
    // Suggest top similar by includes()
    const guess = systems.filter(r => norm(r.name).includes(norm(q)) || norm(r.code).includes(norm(q)));
    const suggestions = pickTop(guess, 5).map(r => `- ${r.name} (${r.code || '—'})`).join('\n');
    return { ok: false, text: suggestions ? `I couldn't find a system named "${q}". Did you mean:\n${suggestions}` : `I couldn't find a system named "${q}".` };
  }
  const r = matches[0];
  const parts = [];
  parts.push(`${r.name || 'Unknown'} (${r.code || '—'})`);
  const flags = [
    `Available: ${humanBool(r.is_available)}`,
    `Live: ${humanBool(r.is_available_live)}`,
    `Visible: ${humanBool(r.is_visible)}`,
    `Default: ${humanBool(r.is_default)}`,
  ];
  parts.push(flags.join(' | '));
  parts.push(`Faction: ${r.faction_name || '—'} | Jurisdiction: ${r.jurisdiction_name || '—'}`);
  const dates = [];
  const da = toIsoDate(r.date_added);
  const dm = toIsoDate(r.date_modified);
  if (da) dates.push(`Added: ${da}`);
  if (dm) dates.push(`Modified: ${dm}`);
  if (dates.length) parts.push(dates.join(' | '));
  if (r.wiki) {
    const snippet = String(r.wiki).trim().split(/\r?\n/).filter(Boolean).slice(0, 3).join('\n');
    if (snippet) {
      parts.push('Overview:');
      parts.push(snippet.length > 600 ? (snippet.slice(0, 597) + '...') : snippet);
    }
  }
  return { ok: true, text: parts.join('\n') };
}

async function listStarSystems({ liveOnly = false, visibleOnly = false, defaultOnly = false, top = 50 } = {}) {
  const systems = await loadSystems();
  let rows = systems.slice();
  if (liveOnly) rows = rows.filter(r => Number(r.is_available_live) > 0);
  if (visibleOnly) rows = rows.filter(r => Number(r.is_visible) > 0);
  if (defaultOnly) rows = rows.filter(r => Number(r.is_default) > 0);
  // Sort: default first, then name
  rows.sort((a,b) => (Number(b.is_default || 0) - Number(a.is_default || 0)) || String(a.name||'').localeCompare(String(b.name||'')));
  const lines = pickTop(rows, top).map(fmtSystemLine);
  if (!lines.length) return { ok: false, text: 'No star systems matched that filter.' };
  const head = `Star systems${liveOnly?' (live only)':''}${visibleOnly?' (visible only)':''}${defaultOnly?' (default only)':''}:`;
  return { ok: true, text: [head, ...lines].join('\n') };
}

async function searchStarSystems({ query, top = 10 } = {}) {
  const systems = await loadSystems();
  const q = norm(query || '');
  if (!q) return { ok: false, text: 'What should I search for?' };
  const matches = systems.filter(r => norm(r.name).includes(q) || norm(r.code).includes(q));
  if (!matches.length) return { ok: false, text: `No star systems matched "${query}".` };
  return { ok: true, text: ['Matches:', ...pickTop(matches, top).map(fmtSystemLine)].join('\n') };
}

async function recentStarSystemChanges({ date_start = null, date_end = null } = {}) {
  const systems = await loadSystems();
  let startMs = date_start ? Date.parse(date_start + 'T00:00:00Z') : null;
  let endMs = date_end ? Date.parse(date_end + 'T23:59:59Z') : null;
  if (!startMs && !endMs) {
    // Default: last 30 days
    endMs = Date.now();
    startMs = endMs - 30 * 86400000;
  }
  const inRange = systems.filter(r => {
    const dm = toEpochMs(r.date_modified) || toEpochMs(r.date_added);
    if (!dm) return false;
    if (startMs && dm < startMs) return false;
    if (endMs && dm > endMs) return false;
    return true;
  });
  if (!inRange.length) return { ok: true, text: 'No star system changes in the requested timeframe.' };
  const lines = inRange
    .sort((a,b)=> (toEpochMs(b.date_modified)||0) - (toEpochMs(a.date_modified)||0))
    .map(r => `- ${r.name} (${r.code || '—'}) — Modified: ${toIsoDate(r.date_modified) || toIsoDate(r.date_added) || '—'} | Live: ${humanBool(r.is_available_live)} | Visible: ${humanBool(r.is_visible)}`);
  return { ok: true, text: ['Recent star system changes:', ...pickTop(lines, 20)].join('\n') };
}

async function starSystemFactionSummary() {
  const systems = await loadSystems();
  const map = new Map();
  for (const r of systems) {
    const k = String(r.faction_name || '—');
    map.set(k, (map.get(k) || 0) + 1);
  }
  const lines = Array.from(map.entries()).sort((a,b)=> b[1]-a[1]).map(([k,v]) => `- ${k}: ${v}`);
  return { ok: true, text: ['Star systems by faction:', ...lines].join('\n') };
}

async function starSystemJurisdictionSummary() {
  const systems = await loadSystems();
  const map = new Map();
  for (const r of systems) {
    const k = String(r.jurisdiction_name || '—');
    map.set(k, (map.get(k) || 0) + 1);
  }
  const lines = Array.from(map.entries()).sort((a,b)=> b[1]-a[1]).map(([k,v]) => `- ${k}: ${v}`);
  return { ok: true, text: ['Star systems by jurisdiction:', ...lines].join('\n') };
}

module.exports = {
  loadSystems,
  starSystemDetails,
  listStarSystems,
  searchStarSystems,
  recentStarSystemChanges,
  starSystemFactionSummary,
  starSystemJurisdictionSummary,
};
