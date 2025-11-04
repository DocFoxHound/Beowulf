const { maybeLoadOnce, refreshFromDb, getCache, getRelations } = require('./data-cache');

async function ensure() { await maybeLoadOnce(); refreshFromDb().catch(()=>{}); }

function findPlanet({ name, code, system_name }) {
  const { planets } = getCache();
  const n = String(name || '').toLowerCase();
  const c = String(code || '').toLowerCase();
  const sys = String(system_name || '').toLowerCase();
  let rows = planets || [];
  if (sys) rows = rows.filter(p => String(p.system || '').toLowerCase().includes(sys));
  let p = null;
  if (c) p = rows.find(x => String(x.code || '').toLowerCase() === c);
  if (!p && n) p = rows.find(x => String(x.name || '').toLowerCase() === n || String(x.name || '').toLowerCase().includes(n));
  return p || null;
}

module.exports = {
  // Warm the in-memory cache for planets (used by index.js at startup)
  async loadPlanets({ force = false } = {}) {
    await maybeLoadOnce();
    if (force) {
      try { await refreshFromDb(); } catch {}
    } else {
      refreshFromDb().catch(()=>{});
    }
    return true;
  },
  async planetDetails({ name = null, code = null, system_name = null } = {}) {
    await ensure();
    const p = findPlanet({ name, code, system_name });
    if (!p) return { text: `I don\'t have structured data yet for that planet${name?` (${name})`:''}.` };
    const lines = [
      `Planet: ${p.name}${p.code?` (${p.code})`:''}${p.system?` — ${p.system}`:''}`,
      p.factions ? `Factions: ${Array.isArray(p.factions) ? p.factions.join(', ') : String(p.factions)}` : null,
      p.jurisdiction ? `Jurisdiction: ${p.jurisdiction}` : null,
    ].filter(Boolean);
    // Relationship enrichment: list child stations/outposts/cities and terminal count
    try {
      const rel = getRelations ? getRelations() : null;
      const pid = (p && typeof p.id === 'number') ? p.id : (rel?.byName?.planets?.[String(p.name || '').trim().toLowerCase()] ?? null);
      const isNumericId = pid !== null && pid !== undefined && Number.isFinite(Number(pid));
      if (rel && isNumericId) {
        const pc = rel.planetChildren?.[String(pid)] || {};
        const nameOf = (type, id) => {
          const map = type==='station'? rel.stationsById : type==='city'? rel.citiesById : type==='outpost'? rel.outpostsById : null;
          const row = map ? map[String(id)] : null;
          return row?.name || null;
        };
        const capList = (arr, type, n=8) => (Array.isArray(arr)?arr:[]).map(id => nameOf(type, id)).filter(Boolean).slice(0,n);
        const stations = capList(pc.stations, 'station');
        const outposts = capList(pc.outposts, 'outpost');
        const cities = capList(pc.cities, 'city');
        const tCount = Array.isArray(pc.terminals) ? pc.terminals.length : 0;
        if (stations.length) lines.push(`Stations: ${stations.join(', ')}`);
        if (outposts.length) lines.push(`Outposts: ${outposts.join(', ')}`);
        if (cities.length) lines.push(`Cities: ${cities.join(', ')}`);
        if (tCount) lines.push(`Terminals: ${tCount}`);
      }
    } catch {}
    return { text: lines.join('\n') };
  },
  async listPlanets({ filters = {}, top = 50 } = {}) {
    await ensure();
    const { planets } = getCache();
    let rows = planets || [];
    if (filters.is_default) rows = rows.filter(p => p.default);
    if (filters.system_name) rows = rows.filter(p => String(p.system || '').toLowerCase().includes(String(filters.system_name).toLowerCase()));
    const take = rows.slice(0, top);
    if (!take.length) return { text: 'No planets in cache yet.' };
    return { text: ['Planets:', ...take.map(p => `- ${p.name}${p.system?` — ${p.system}`:''}`)].join('\n') };
  },
  async searchPlanets({ query = '', top = 12, system_name = null } = {}) {
    await ensure();
    const { planets } = getCache();
    const q = String(query || '').toLowerCase();
    let rows = (planets || []).filter(p => String(p.name || '').toLowerCase().includes(q) || String(p.code || '').toLowerCase().includes(q));
    if (system_name) rows = rows.filter(p => String(p.system || '').toLowerCase().includes(String(system_name).toLowerCase()));
    rows = rows.slice(0, top);
    if (!rows.length) return { text: 'No matching planets found.' };
    return { text: ['Matches:', ...rows.map(p => `- ${p.name}${p.system?` — ${p.system}`:''}`)].join('\n') };
  },
  async recentPlanetChanges() { return { text: 'No planet change log available yet.' }; },
  async planetFactionSummary() {
    await ensure();
    const { planets } = getCache();
    if (!planets?.length) return { text: 'No planet faction data yet.' };
    const map = new Map();
    for (const p of planets) {
      const facs = Array.isArray(p.factions) ? p.factions : (p.factions ? [p.factions] : []);
      for (const f of facs) map.set(f, (map.get(f) || 0) + 1);
    }
    const lines = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).map(([f,c]) => `- ${f}: ${c} planet(s)`);
    return { text: ['Planet factions:', ...lines].join('\n') };
  },
  async planetJurisdictionSummary() {
    await ensure();
    const { planets } = getCache();
    if (!planets?.length) return { text: 'No planet jurisdiction data yet.' };
    const map = new Map();
    for (const p of planets) { const j = p.jurisdiction || 'Unknown'; map.set(j, (map.get(j) || 0) + 1); }
    const lines = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).map(([j,c]) => `- ${j}: ${c} planet(s)`);
    return { text: ['Planet jurisdictions:', ...lines].join('\n') };
  },
};
