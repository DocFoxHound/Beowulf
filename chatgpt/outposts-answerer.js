const { maybeLoadOnce, refreshFromDb, getCache, getRelations } = require('./data-cache');

async function ensure() { await maybeLoadOnce(); refreshFromDb().catch(()=>{}); }

function filterOutposts(filters = {}) {
  const { outposts } = getCache();
  let rows = outposts || [];
  if (filters.system_name) rows = rows.filter(o => String(o.system || '').toLowerCase().includes(String(filters.system_name).toLowerCase()));
  if (filters.planet_name) rows = rows.filter(o => String(o.planet || '').toLowerCase().includes(String(filters.planet_name).toLowerCase()));
  if (filters.moon_name) rows = rows.filter(o => String(o.moon || '').toLowerCase().includes(String(filters.moon_name).toLowerCase()));
  if (filters.is_default) rows = rows.filter(o => o.default);
  return rows;
}

module.exports = {
  // Warm the in-memory cache for outposts (used by index.js at startup)
  async loadOutposts({ force = false } = {}) {
    await maybeLoadOnce();
    if (force) {
      try { await refreshFromDb(); } catch {}
    } else {
      refreshFromDb().catch(()=>{});
    }
    return true;
  },
  async outpostDetails({ name = null } = {}) {
    await ensure();
    const { outposts } = getCache();
    if (!name) return { text: 'Which outpost? Provide an outpost name.' };
    const o = (outposts || []).find(x => String(x.name || '').toLowerCase() === String(name).toLowerCase() || String(x.name || '').toLowerCase().includes(String(name).toLowerCase()));
    if (!o) return { text: `I don\'t have structured data yet for ${name}.` };
    const lines = [
      `Outpost: ${o.name}`,
      o.system ? `System: ${o.system}` : null,
      o.planet ? `Planet: ${o.planet}` : null,
      o.moon ? `Moon: ${o.moon}` : null,
      Array.isArray(o.features) && o.features.length ? `Features: ${o.features.join(', ')}` : null,
    ].filter(Boolean);
    // Relations: terminals attached to this outpost
    try {
      const rel = getRelations ? getRelations() : null;
      const oid = (o && typeof o.id === 'number') ? o.id : (rel?.byName?.outposts?.[String(o.name || '').trim().toLowerCase()] ?? null);
      const isNumericId = oid !== null && oid !== undefined && Number.isFinite(Number(oid));
      if (rel && isNumericId) {
        const oc = rel.outpostChildren?.[String(oid)] || {};
        const allTIds = Array.isArray(oc.terminals) ? oc.terminals : [];
        const tIds = allTIds.slice(0, 6);
        const tNames = tIds.map(id => rel.terminalsById?.[String(id)]?.name).filter(Boolean);
        if (tNames.length) lines.push(`Terminals: ${tNames.join(', ')}`);
        else if (allTIds.length) lines.push(`Terminals: ${allTIds.length}`);
        // Aggregate services across terminals
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
  async listOutposts({ filters = {}, top = 50 } = {}) {
    await ensure();
    const rows = filterOutposts(filters).slice(0, top);
    if (!rows.length) return { text: 'No outposts in cache yet.' };
  return { text: ['Outposts:', ...rows.map(o => `- ${o.name}${o.system?` — ${o.system}`:''}${o.moon?` (${o.moon})`:(o.planet?` (${o.planet})`:``)}`)].join('\n') };
  },
  async searchOutposts({ query = '', top = 12, location_name = null } = {}) {
    await ensure();
    const q = String(query || '').toLowerCase();
    const { outposts } = getCache();
    let rows = (outposts || []).filter(o => String(o.name || '').toLowerCase().includes(q));
  if (location_name) rows = rows.filter(o => [o.system, o.planet, o.moon].some(v => String(v||'').toLowerCase().includes(String(location_name).toLowerCase())));
    rows = rows.slice(0, top);
    if (!rows.length) return { text: 'No matching outposts found.' };
  return { text: ['Matches:', ...rows.map(o => `- ${o.name}${o.system?` — ${o.system}`:''}${o.moon?` (${o.moon})`:(o.planet?` (${o.planet})`:``)}`)].join('\n') };
  },
  async recentOutpostChanges() { return { text: 'No outpost change log available yet.' }; },
  async outpostFactionSummary() { return { text: 'Outpost faction summary requires populated faction data.' }; },
  async outpostJurisdictionSummary() { return { text: 'Outpost jurisdiction summary requires populated jurisdiction data.' }; },
  // Compact helper: list terminals at an outpost with trade counts and services
  async listTerminalsAtOutpost({ outpost_name = null, top = 10 } = {}) {
    await ensure();
    if (!outpost_name) return { text: 'Which outpost? Provide an outpost name.' };
    const { outposts } = getCache();
    const o = (outposts || []).find(x => String(x.name || '').toLowerCase() === String(outpost_name).toLowerCase() || String(x.name || '').toLowerCase().includes(String(outpost_name).toLowerCase()));
    if (!o) return { text: `No outpost found for ${outpost_name}.` };
    const rel = getRelations ? getRelations() : null;
    const oid = (o && typeof o.id === 'number') ? o.id : (rel?.byName?.outposts?.[String(o.name || '').trim().toLowerCase()] ?? null);
    const isNumericId = oid !== null && oid !== undefined && Number.isFinite(Number(oid));
    if (!rel || !isNumericId) return { text: `No terminals linked for ${o.name}.` };
    const oc = rel.outpostChildren?.[String(oid)] || {};
    const allTIds = Array.isArray(oc.terminals) ? oc.terminals : [];
    if (!allTIds.length) return { text: `No terminals found for ${o.name}.` };
    const take = allTIds.slice(0, top);
    const lines = [`Terminals at ${o.name}:`];
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
