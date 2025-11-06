const { maybeLoadOnce, refreshFromDb, getCache, getRelations } = require('./data-cache');

async function ensure() { await maybeLoadOnce(); refreshFromDb().catch(()=>{}); }

function filterStations(filters = {}) {
  const { stations } = getCache();
  let rows = stations || [];
  if (filters.system_name) rows = rows.filter(s => String(s.system || '').toLowerCase().includes(String(filters.system_name).toLowerCase()));
  if (filters.planet_name) rows = rows.filter(s => String(s.planet || '').toLowerCase().includes(String(filters.planet_name).toLowerCase()));
  if (filters.moon_name) rows = rows.filter(s => String(s.moon || '').toLowerCase().includes(String(filters.moon_name).toLowerCase()));
  if (filters.is_default) rows = rows.filter(s => s.default);
  return rows;
}

module.exports = {
  // Warm the in-memory cache for space stations (used by index.js at startup)
  async loadStations({ force = false } = {}) {
    await maybeLoadOnce();
    if (force) {
      try { await refreshFromDb(); } catch {}
    } else {
      refreshFromDb().catch(()=>{});
    }
    return true;
  },
  async spaceStationDetails({ name = null } = {}) {
    await ensure();
    const { stations } = getCache();
    if (!name) return { text: 'Which station? Provide a station name.' };
    const s = (stations || []).find(x => String(x.name || '').toLowerCase() === String(name).toLowerCase() || String(x.name || '').toLowerCase().includes(String(name).toLowerCase()));
    if (!s) return { text: `I don\'t have structured data yet for ${name}.` };
    const lines = [
      `Station: ${s.name}`,
      s.system ? `System: ${s.system}` : null,
      s.planet ? `Planet: ${s.planet}` : null,
      s.moon ? `Moon: ${s.moon}` : null,
      s.orbit ? `Orbit: ${s.orbit}` : null,
      Array.isArray(s.features) && s.features.length ? `Features: ${s.features.join(', ')}` : null,
    ].filter(Boolean);
    // Relations: terminals attached to this station
    try {
      const rel = getRelations ? getRelations() : null;
      const sid = (s && typeof s.id === 'number') ? s.id : (rel?.byName?.stations?.[String(s.name || '').trim().toLowerCase()] ?? null);
      const isNumericId = sid !== null && sid !== undefined && Number.isFinite(Number(sid));
      if (rel && isNumericId) {
        const sc = rel.stationChildren?.[String(sid)] || {};
        const allTIds = Array.isArray(sc.terminals) ? sc.terminals : [];
        const tIds = allTIds.slice(0, 6);
        const tNames = tIds.map(id => rel.terminalsById?.[String(id)]?.name).filter(Boolean);
        if (tNames.length) lines.push(`Terminals: ${tNames.join(', ')}`);
        else if (allTIds.length) lines.push(`Terminals: ${allTIds.length}`);
        // Aggregate station-level services from child terminals
        const svcSet = new Set();
        for (const tid of allTIds) {
          const t = rel.terminalsById?.[String(tid)] || {};
          const refs = rel.terminalRefs?.[String(tid)] || { commodities: [], items: [], prices: [] };
          if ((refs.commodities?.length || 0) > 0 || (refs.items?.length || 0) > 0) svcSet.add('trade');
          if (t.is_medical) svcSet.add('medical');
          if (t.is_refinery) svcSet.add('refinery');
          if (t.is_cargo_center) svcSet.add('cargo');
          if (t.is_refuel) svcSet.add('refuel');
          if (t.is_repair) svcSet.add('repair');
          if (t.is_shop_fps || t.is_shop_vehicle) svcSet.add('shops');
          if (t.is_habitation) svcSet.add('habitation');
          if (t.is_food) svcSet.add('food');
        }
        if (svcSet.size) lines.push(`Services: ${Array.from(svcSet).sort().join(', ')}`);
      }
    } catch {}
    return { text: lines.join('\n') };
  },
  async listSpaceStations({ filters = {}, top = 50 } = {}) {
    await ensure();
    const rows = filterStations(filters).slice(0, top);
    if (!rows.length) return { text: 'No stations in cache yet.' };
  return { text: ['Stations:', ...rows.map(s => `- ${s.name}${s.system?` — ${s.system}`:''}${s.moon?` (${s.moon})`:(s.planet?` (${s.planet})`:``)}`)].join('\n') };
  },
  async searchSpaceStations({ query = '', top = 12, location_name = null } = {}) {
    await ensure();
    const q = String(query || '').toLowerCase();
    const { stations } = getCache();
    let rows = (stations || []).filter(s => String(s.name || '').toLowerCase().includes(q));
  if (location_name) rows = rows.filter(s => [s.system, s.planet, s.moon, s.orbit].some(v => String(v||'').toLowerCase().includes(String(location_name).toLowerCase())));
    rows = rows.slice(0, top);
    if (!rows.length) return { text: 'No matching stations found.' };
  return { text: ['Matches:', ...rows.map(s => `- ${s.name}${s.system?` — ${s.system}`:''}${s.moon?` (${s.moon})`:(s.planet?` (${s.planet})`:``)}`)].join('\n') };
  },
  async recentSpaceStationChanges() {
    return { text: 'No station change log available yet. Once populated, I can summarize by date.' };
  },
  // Compact helper: list terminals at a station with quick buy/sell counts and services
  async listTerminalsAtStation({ station_name = null, top = 10 } = {}) {
    await ensure();
    if (!station_name) return { text: 'Which station? Provide a station name.' };
    const { stations } = getCache();
    const s = (stations || []).find(x => String(x.name || '').toLowerCase() === String(station_name).toLowerCase() || String(x.name || '').toLowerCase().includes(String(station_name).toLowerCase()));
    if (!s) return { text: `No station found for ${station_name}.` };
    const rel = getRelations ? getRelations() : null;
    const sid = (s && typeof s.id === 'number') ? s.id : (rel?.byName?.stations?.[String(s.name || '').trim().toLowerCase()] ?? null);
    const isNumericId = sid !== null && sid !== undefined && Number.isFinite(Number(sid));
    if (!rel || !isNumericId) return { text: `No terminals linked for ${s.name}.` };
    const sc = rel.stationChildren?.[String(sid)] || {};
    const allTIds = Array.isArray(sc.terminals) ? sc.terminals : [];
    if (!allTIds.length) return { text: `No terminals found for ${s.name}.` };
    const take = allTIds.slice(0, top);
    const lines = [`Terminals at ${s.name}:`];
    for (const tid of take) {
      const t = rel.terminalsById?.[String(tid)] || {};
      const refs = rel.terminalRefs?.[String(tid)] || { commodities: [], items: [] };
      const cBuys = (refs.commodities || []).filter(r => r.price_buy != null || r.status_buy != null).length;
      const cSells = (refs.commodities || []).filter(r => r.price_sell != null || r.status_sell != null).length;
      const iBuys = (refs.items || []).filter(r => r.price_buy != null).length;
      const iSells = (refs.items || []).filter(r => r.price_sell != null).length;
      const svc = [];
      if ((cBuys + iBuys + cSells + iSells) > 0) svc.push(`trade: ${cBuys + iBuys} buy / ${cSells + iSells} sell`);
      if (t.is_medical) svc.push('medical');
      if (t.is_refinery) svc.push('refinery');
      if (t.is_cargo_center) svc.push('cargo');
      if (t.is_refuel) svc.push('refuel');
      if (t.is_repair) svc.push('repair');
      if (t.is_shop_fps || t.is_shop_vehicle) svc.push('shops');
      if (t.is_habitation) svc.push('habitation');
      if (t.is_food) svc.push('food');
      lines.push(`- ${t.name}${svc.length ? ' — ' + svc.join('; ') : ''}`);
    }
    const remaining = allTIds.length - take.length;
    if (remaining > 0) lines.push(`…and ${remaining} more.`);
    return { text: lines.join('\n') };
  },
};
