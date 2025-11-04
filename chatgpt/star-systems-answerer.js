// Star systems answerers using data-cache. Always return { text }.
const { maybeLoadOnce, refreshFromDb, getCache, getRelations } = require('./data-cache');

async function ensure() { await maybeLoadOnce(); refreshFromDb().catch(()=>{}); }

function findSystem({ name, code }) {
  const { systems } = getCache();
  const n = String(name || '').toLowerCase();
  const c = String(code || '').toLowerCase();
  let s = null;
  if (c) s = systems.find(x => String(x.code || '').toLowerCase() === c);
  if (!s && n) s = systems.find(x => String(x.name || '').toLowerCase() === n || String(x.name || '').toLowerCase().includes(n));
  return s || null;
}

module.exports = {
  // Warm the in-memory cache for star systems (used by index.js at startup)
  async loadSystems({ force = false } = {}) {
    await maybeLoadOnce();
    if (force) {
      try { await refreshFromDb(); } catch {}
    } else {
      // Try background refresh without blocking
      refreshFromDb().catch(()=>{});
    }
    return true;
  },
  async starSystemDetails({ name = null, code = null } = {}) {
    await ensure();
    const sys = findSystem({ name, code });
    if (!sys) return { text: `I don\'t have structured data yet for that star system${name?` (${name})`:''}.` };
    const flags = [sys.live ? 'live' : null, sys.default ? 'default' : null, sys.visible ? 'visible' : null].filter(Boolean).join(', ');
    const lines = [
      `Star system: ${sys.name}${sys.code ? ` (${sys.code})` : ''}${flags ? ` — ${flags}` : ''}`,
      sys.factions ? `Factions: ${Array.isArray(sys.factions) ? sys.factions.join(', ') : String(sys.factions)}` : null,
      sys.jurisdiction ? `Jurisdiction: ${sys.jurisdiction}` : null,
    ].filter(Boolean);

    // Relationship enrichment (children) if relations graph is available
    try {
      const rel = getRelations ? getRelations() : null;
      const sid = (sys && typeof sys.id === 'number') ? sys.id : (rel?.byName?.systems?.[String(sys.name || '').trim().toLowerCase()] ?? null);
      const isNumericId = sid !== null && sid !== undefined && Number.isFinite(Number(sid));
      if (rel && isNumericId) {
        const sc = rel.systemChildren?.[String(sid)] || {};
        const nameOf = (type, id) => {
          const map = type==='planet'? rel.planetsById : type==='station'? rel.stationsById : type==='city'? rel.citiesById : type==='outpost'? rel.outpostsById : null;
          const row = map ? map[String(id)] : null;
          return row?.name || null;
        };
        const capList = (arr, type, n=6) => (Array.isArray(arr)?arr:[]).map(id => nameOf(type, id)).filter(Boolean).slice(0,n);
        const planets = capList(sc.planets, 'planet');
        const stations = capList(sc.stations, 'station');
        const outposts = capList(sc.outposts, 'outpost');
        const cities = capList(sc.cities, 'city');
        if (planets.length) lines.push(`Planets: ${planets.join(', ')}`);
        if (stations.length) lines.push(`Stations: ${stations.join(', ')}`);
        if (outposts.length) lines.push(`Outposts: ${outposts.join(', ')}`);
        if (cities.length) lines.push(`Cities: ${cities.join(', ')}`);
      }
    } catch {}
    return { text: lines.join('\n') };
  },
  async listStarSystems({ liveOnly = false, visibleOnly = false, defaultOnly = false, top = 50 } = {}) {
    await ensure();
    const { systems } = getCache();
    let rows = systems || [];
    if (liveOnly) rows = rows.filter(r => r.live);
    if (visibleOnly) rows = rows.filter(r => r.visible);
    if (defaultOnly) rows = rows.filter(r => r.default);
    const take = rows.slice(0, top);
    if (!take.length) return { text: 'No star systems in cache yet.' };
    return { text: ['Star systems:', ...take.map(r => `- ${r.name}${r.code?` (${r.code})`:''}${r.live?' — live':''}${r.default?' — default':''}`)].join('\n') };
  },
  async searchStarSystems({ query = '', top = 12 } = {}) {
    await ensure();
    const q = String(query || '').toLowerCase();
    const { systems } = getCache();
    const rows = (systems || []).filter(r => String(r.name || '').toLowerCase().includes(q) || String(r.code || '').toLowerCase().includes(q)).slice(0, top);
    if (!rows.length) return { text: 'No matching star systems found.' };
    return { text: ['Matches:', ...rows.map(r => `- ${r.name}${r.code?` (${r.code})`:''}`)].join('\n') };
  },
  async recentStarSystemChanges({ date_start = null, date_end = null } = {}) {
    // Without a changelog table, provide a placeholder acknowledging lack of data
    return { text: 'I don\'t have a star system changelog yet. Once knowledge or DB tables include changes, I can summarize them by date.' };
  },
  async starSystemFactionSummary() {
    await ensure();
    const { systems } = getCache();
    if (!systems?.length) return { text: 'No faction data available yet for star systems.' };
    const map = new Map();
    for (const s of systems) {
      const facs = Array.isArray(s.factions) ? s.factions : (s.factions ? [s.factions] : []);
      for (const f of facs) map.set(f, (map.get(f) || 0) + 1);
    }
    const lines = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).map(([f,c]) => `- ${f}: ${c} system(s)`);
    return { text: ['Star system factions:', ...lines].join('\n') };
  },
  async starSystemJurisdictionSummary() {
    await ensure();
    const { systems } = getCache();
    if (!systems?.length) return { text: 'No jurisdiction data available yet for star systems.' };
    const map = new Map();
    for (const s of systems) { const j = s.jurisdiction || 'Unknown'; map.set(j, (map.get(j) || 0) + 1); }
    const lines = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).map(([j,c]) => `- ${j}: ${c} system(s)`);
    return { text: ['Star system jurisdictions:', ...lines].join('\n') };
  },
};
