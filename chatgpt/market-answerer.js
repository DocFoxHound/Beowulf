// Market and item answerers built atop the data-cache. Always return { text, meta? }.

const { maybeLoadOnce, refreshFromDb, findItem, whereItemAvailable, summarizeMovement, getCache, getRelations } = require('./data-cache');

function fmtNum(n) { const x = Number(n || 0); return isFinite(x) ? Math.round(x).toLocaleString() : String(n); }

async function ensureData() {
  await maybeLoadOnce();
  // Optionally try DB in the background (non-blocking)
  refreshFromDb().catch(()=>{});
}

function pickRowsForItem(name, location, areaType) {
  const rows = whereItemAvailable(name) || [];
  const locNorm = String(location || '').trim().toLowerCase();
  const typeNorm = String(areaType || '').trim().toLowerCase();
  let filtered = rows;
  if (locNorm) {
    filtered = filtered.filter(r => String(r.location || '').toLowerCase().includes(locNorm)
      || String(r.star_system_name || '').toLowerCase().includes(locNorm)
      || String(r.planet_name || '').toLowerCase().includes(locNorm));
  }
  if (typeNorm) {
    filtered = filtered.filter(r => {
      if (typeNorm === 'terminal') return true; // rows are per-terminal already; do not exclude
      if (typeNorm === 'station') return r.id_space_station != null;
      if (typeNorm === 'outpost') return r.id_outpost != null;
      if (typeNorm === 'city') return r.id_city != null;
      if (typeNorm === 'planet') return r.id_planet != null && r.id_space_station == null && r.id_outpost == null && r.id_city == null;
      return true;
    });
  }
  return filtered;
}

function renderLocations(rows, { top = 5, mode = 'buy' }) {
  if (!Array.isArray(rows) || !rows.length) return 'I don\'t have structured market data yet for that item. Load your UEX/market tables and I\'ll get specific.';
  const scored = rows.map(r => ({
    ...r,
    score: mode === 'buy' ? Number(r.buy ?? Infinity) : Number(r.sell ?? 0)
  })).filter(r => isFinite(r.score) && r.score > 0);
  if (!scored.length) {
    return mode === 'buy'
      ? 'No buy prices found.'
      : 'No sell prices found.';
  }
  const ordered = scored.sort((a, b) => mode === 'buy' ? a.score - b.score : b.score - a.score).slice(0, top);
  const lines = ordered.map(r => `- ${r.location}: ${mode === 'buy' ? 'buy' : 'sell'} at ${fmtNum(mode === 'buy' ? r.buy : r.sell)} ${r.currency || 'aUEC'}`);
  return lines.join('\n');
}

module.exports = {
  // Warm the in-memory cache for market/items (used by index.js at startup)
  async primeMarketCache({ force = false } = {}) {
    await maybeLoadOnce();
    if (force) {
      try { await refreshFromDb(); } catch {}
    } else {
      refreshFromDb().catch(()=>{});
    }
    return true;
  },
  // Compute best overall profit routes across all commodities/items, constrained by location if provided
  async bestOverallProfitRoute({ top = 5, location = null } = {}) {
    await ensureData();
    const d = getCache();
    const names = new Set();
    for (const r of d.commoditiesByTerminal || []) if (r?.commodity_name) names.add(String(r.commodity_name));
    for (const r of d.itemsByTerminal || []) if (r?.item_name) names.add(String(r.item_name));
    // Fallback: summaries
    for (const r of d.commoditiesSummary || []) if (r?.commodity_name) names.add(String(r.commodity_name));
    for (const r of d.itemsSummary || []) if (r?.commodity_name) names.add(String(r.commodity_name));
    const loc = String(location || '').trim();
    const withinLocStr = (s) => !loc || String(s || '').toLowerCase().includes(loc.toLowerCase());
    const withinSystem = (row) => {
      if (!loc) return true;
      const sys = String(row?.star_system_name || '').toLowerCase();
      if (sys) return sys.includes(loc.toLowerCase());
      return withinLocStr(row?.location);
    };
    const results = [];
    for (const name of names) {
  const rows = whereItemAvailable(name) || [];
      if (!rows.length) continue;
  const buys = rows.filter(r => isFinite(Number(r.buy)) && Number(r.buy) > 0 && withinSystem(r));
  const sells = rows.filter(r => isFinite(Number(r.sell)) && Number(r.sell) > 0 && withinSystem(r));
      if (!buys.length || !sells.length) continue;
      // sort and pick best pair with different locations
      buys.sort((a,b)=>Number(a.buy)-Number(b.buy));
      sells.sort((a,b)=>Number(b.sell)-Number(a.sell));
      let best = null;
      const maxCandidates = 6;
      for (let i=0; i<Math.min(maxCandidates, buys.length); i++) {
        for (let j=0; j<Math.min(maxCandidates, sells.length); j++) {
          const b = buys[i], s = sells[j];
          if (!b || !s) continue;
          // Require different locations
          if (String(b.location) === String(s.location)) continue;
          const margin = Number(s.sell) - Number(b.buy);
          if (margin <= 0) continue;
          const candidate = { item: name, buyAt: b.location, sellAt: s.location, buy: b.buy, sell: s.sell, margin };
          if (!best || candidate.margin > best.margin) best = candidate;
        }
      }
      if (best) results.push(best);
    }
    if (!results.length) return { text: loc ? `No profitable routes found within ${loc} with the current data.` : 'No profitable routes found with the current data.' };
    results.sort((a,b)=>b.margin - a.margin);
    const topRows = results.slice(0, top);
    const header = `Best overall profit routes${loc ? ` in ${loc}` : ''}:`;
    const lines = topRows.map(p => `- ${p.item}: Buy at ${p.buyAt} for ${fmtNum(p.buy)}, sell at ${p.sellAt} for ${fmtNum(p.sell)} — margin ${fmtNum(p.margin)} aUEC`);
    return { text: [header, ...lines].join('\n') };
  },

  // Diagnostic utility: given a list of location names, report the top-buy commodity at each (by price_buy_avg)
  // Contract:
  // - inputs: { locations: string[], system?: string, top?: number }
  // - outputs: { text, rows: Array<{ location: string, commodities: Array<{ name, buy_avg, sell_avg }> }> }
  async topBuysByLocations({ locations = [], system = null, top = 1 } = {}) {
    await ensureData();
    const { terminalPrices } = getCache();
    if (!Array.isArray(terminalPrices) || !terminalPrices.length) {
      return { text: 'No terminal price data available.', rows: [] };
    }
    const norm = (s) => String(s || '').trim().toLowerCase();
    const sys = norm(system);
    const whereNameMatches = (r, loc) => {
      const t = [r.space_station_name, r.outpost_name, r.city_name, r.planet_name, r.terminal_name].map(norm);
      const L = norm(loc);
      return t.some(x => x && x.includes(L));
    };
    const out = [];
    for (const loc of locations) {
      const rows = terminalPrices.filter(r => (!sys || norm(r.star_system_name).includes(sys)) && whereNameMatches(r, loc));
      const nonZero = rows.filter(r => Number(r.price_buy_avg) > 0);
      nonZero.sort((a,b)=>Number(b.price_buy_avg)-Number(a.price_buy_avg));
      const take = nonZero.slice(0, Math.max(1, top));
      out.push({
        location: loc,
        commodities: take.map(r => ({ name: r.commodity_name, buy_avg: Number(r.price_buy_avg) || 0, sell_avg: Number(r.price_sell_avg) || 0 }))
      });
    }
    const lines = [];
    for (const row of out) {
      if (!row.commodities.length) { lines.push(`- ${row.location}: no buy data`); continue; }
      const items = row.commodities.map(c => `${c.name}: ${isFinite(c.buy_avg) ? Math.round(c.buy_avg).toLocaleString() : c.buy_avg} aUEC`);
      lines.push(`- ${row.location}: ${items.join('; ')}`);
    }
    return { text: ['Top buys by location', ...(system ? [`in ${system}`] : []), ':'].join(' ')+`\n${lines.join('\n')}`, rows: out };
  },

  // Compute best routes between two star systems across all items
  async bestCrossSystemRoutes({ from, to, top = 5 } = {}) {
    await ensureData();
    const d = getCache();
    const names = new Set();
    for (const r of d.commoditiesByTerminal || []) if (r?.commodity_name) names.add(String(r.commodity_name));
    for (const r of d.itemsByTerminal || []) if (r?.item_name) names.add(String(r.item_name));
    for (const r of d.commoditiesSummary || []) if (r?.commodity_name) names.add(String(r.commodity_name));
    for (const r of d.itemsSummary || []) if (r?.commodity_name) names.add(String(r.commodity_name));
    const A = String(from || '').trim().toLowerCase();
    const B = String(to || '').trim().toLowerCase();
    if (!A || !B) return { text: 'Please specify the two systems, e.g., "between Stanton and Pyro".' };
    const inSys = (row, sys) => {
      const s = String(row?.star_system_name || '').toLowerCase();
      if (s) return s.includes(sys);
      return String(row?.location || '').toLowerCase().includes(sys);
    };
    const results = [];
    for (const name of names) {
      const rows = whereItemAvailable(name) || [];
      if (!rows.length) continue;
      const buyA = rows.filter(r => isFinite(Number(r.buy)) && Number(r.buy) > 0 && inSys(r, A));
      const sellB = rows.filter(r => isFinite(Number(r.sell)) && Number(r.sell) > 0 && inSys(r, B));
      const buyB = rows.filter(r => isFinite(Number(r.buy)) && Number(r.buy) > 0 && inSys(r, B));
      const sellA = rows.filter(r => isFinite(Number(r.sell)) && Number(r.sell) > 0 && inSys(r, A));
      const tryPairs = (buys, sells) => {
        buys.sort((a,b)=>Number(a.buy)-Number(b.buy));
        sells.sort((a,b)=>Number(b.sell)-Number(a.sell));
        let best = null;
        const maxCandidates = 6;
        for (let i=0; i<Math.min(maxCandidates, buys.length); i++) {
          for (let j=0; j<Math.min(maxCandidates, sells.length); j++) {
            const b = buys[i], s = sells[j];
            if (!b || !s) continue;
            if (String(b.location) === String(s.location)) continue;
            const margin = Number(s.sell) - Number(b.buy);
            if (margin <= 0) continue;
            const candidate = { item: name, buyAt: b.location, sellAt: s.location, buy: b.buy, sell: s.sell, margin };
            if (!best || candidate.margin > best.margin) best = candidate;
          }
        }
        return best;
      };
      const bestAB = tryPairs(buyA, sellB);
      const bestBA = tryPairs(buyB, sellA);
      if (bestAB) { bestAB.direction = `${from} -> ${to}`; results.push(bestAB); }
      if (bestBA) { bestBA.direction = `${to} -> ${from}`; results.push(bestBA); }
    }
    if (!results.length) return { text: `No profitable cross-system routes found between ${from} and ${to} with the current data.` };
    results.sort((a,b)=>b.margin - a.margin);
    const topRows = results.slice(0, top);
    const header = `Best cross-system routes between ${from} and ${to}:`;
    const lines = topRows.map(p => `- ${p.item} (${p.direction}): Buy at ${p.buyAt} for ${fmtNum(p.buy)}, sell at ${p.sellAt} for ${fmtNum(p.sell)} — margin ${fmtNum(p.margin)} aUEC`);
    return { text: [header, ...lines].join('\n') };
  },
  async bestBuyLocations({ name, top = 5, location = null, areaType = null }) {
    await ensureData();
    const item = findItem(name) || { name };
    const rows = pickRowsForItem(item.name, location, areaType);
    const scopeBit = areaType ? ` (${areaType})` : '';
    const header = `Best buy locations for ${item.name}${location ? ` near ${location}` : ''}${scopeBit}:`;
    const body = renderLocations(rows, { top, mode: 'buy' });
    return { text: [header, body].filter(Boolean).join('\n') };
  },
  async bestSellLocations({ name, top = 5, location = null, areaType = null }) {
    await ensureData();
    const item = findItem(name) || { name };
    const rows = pickRowsForItem(item.name, location, areaType);
    const scopeBit = areaType ? ` (${areaType})` : '';
    const header = `Best sell locations for ${item.name}${location ? ` near ${location}` : ''}${scopeBit}:`;
    const body = renderLocations(rows, { top, mode: 'sell' });
    return { text: [header, body].filter(Boolean).join('\n') };
  },
  async spotFor({ name, top = 6, location = null, areaType = null }) {
    await ensureData();
    const item = findItem(name) || { name };
    const rows = pickRowsForItem(item.name, location, areaType).slice(0, top);
    if (!rows.length) return { text: `No spot prices available yet for ${item.name}. Once prices are loaded, I\'ll list buy/sell by terminal.` };
    const lines = rows.map(r => `- ${r.location}: buy ${fmtNum(r.buy)} / sell ${fmtNum(r.sell)} ${r.currency || 'aUEC'}`);
    const scopeBit = areaType ? ` (${areaType})` : '';
    return { text: [`Spot prices for ${item.name}${location ? ` near ${location}` : ''}${scopeBit}:`, ...lines].join('\n') };
  },
  async mostMovement({ scope = 'commodity', top = 7, location = null }) {
    await ensureData();
    const rows = summarizeMovement(scope, location).slice(0, top);
    if (!rows.length) return { text: 'I don\'t have movement/transaction data yet. Load terminal transactions and I\'ll summarize the busiest commodities or terminals.' };
    const label = scope === 'terminal' ? 'terminals' : 'commodities';
    const lines = rows.map(r => `- ${r.key}: qty ${fmtNum(r.qty)} (buys ${fmtNum(r.buys)}, sells ${fmtNum(r.sells)})`);
    return { text: [`Most movement (${label})${location ? ` at ${location}` : ''}:`, ...lines].join('\n') };
  },
  // Rank terminals by user report counts (last 15 days) aggregated from terminal prices
  async mostActiveTerminals({ top = 10, location = null } = {}) {
    await ensureData();
    const { terminalPrices } = getCache();
    if (!Array.isArray(terminalPrices) || !terminalPrices.length) {
      return { text: 'I don\'t have terminal price/user report data yet. Once loaded, I\'ll rank the most active terminals.' };
    }
    const rel = (typeof getRelations === 'function') ? getRelations() : null;
    const norm = (s) => String(s || '').trim().toLowerCase();
    const loc = norm(location);
    const filtered = location ? terminalPrices.filter(r => {
      return [r.terminal_name, r.space_station_name, r.outpost_name, r.city_name, r.planet_name, r.star_system_name]
        .some(v => norm(v).includes(loc));
    }) : terminalPrices;
    const map = new Map(); // id_terminal -> aggregate
    for (const r of filtered) {
      const idt = r.id_terminal != null ? String(r.id_terminal) : null;
      if (!idt) continue;
      const cur = map.get(idt) || {
        id_terminal: r.id_terminal,
        name: r.terminal_name || null,
        star_system_name: r.star_system_name || null,
        planet_name: r.planet_name || null,
        space_station_name: r.space_station_name || r.station_name || null,
        outpost_name: r.outpost_name || null,
        city_name: r.city_name || null,
        reports_buy: 0,
        reports_sell: 0,
      };
      cur.reports_buy += Number(r.price_buy_users_rows || 0);
      cur.reports_sell += Number(r.price_sell_users_rows || 0);
      if (!cur.name && rel && rel.terminalsById?.[idt]?.name) cur.name = rel.terminalsById[idt].name;
      // Fill missing location labels using relations if possible
      if (!cur.star_system_name && rel && rel.terminalsById?.[idt]?.id_star_system) {
        const sid = String(rel.terminalsById[idt].id_star_system);
        cur.star_system_name = rel.systemsById?.[sid]?.name || cur.star_system_name;
      }
      if (!cur.planet_name && rel && rel.terminalsById?.[idt]?.id_planet) {
        const pid = String(rel.terminalsById[idt].id_planet);
        cur.planet_name = rel.planetsById?.[pid]?.name || cur.planet_name;
      }
      if (!cur.space_station_name && rel && rel.terminalsById?.[idt]?.id_space_station) {
        const sid2 = String(rel.terminalsById[idt].id_space_station);
        cur.space_station_name = rel.stationsById?.[sid2]?.name || cur.space_station_name;
      }
      if (!cur.outpost_name && rel && rel.terminalsById?.[idt]?.id_outpost) {
        const oid = String(rel.terminalsById[idt].id_outpost);
        cur.outpost_name = rel.outpostsById?.[oid]?.name || cur.outpost_name;
      }
      if (!cur.city_name && rel && rel.terminalsById?.[idt]?.id_city) {
        const cid = String(rel.terminalsById[idt].id_city);
        cur.city_name = rel.citiesById?.[cid]?.name || cur.city_name;
      }
      map.set(idt, cur);
    }
    const rows = Array.from(map.values()).map(r => ({
      ...r,
      total: Number(r.reports_buy || 0) + Number(r.reports_sell || 0),
    })).filter(r => r.total > 0);
    rows.sort((a,b) => b.total - a.total);
    const topRows = rows.slice(0, top);
    if (!topRows.length) return { text: 'No recent user report activity found for terminals.' };
    const lines = topRows.map(r => {
      const locBits = [r.star_system_name, r.planet_name, r.space_station_name || r.outpost_name || r.city_name].filter(Boolean);
      const where = locBits.length ? ` — ${locBits.join(' / ')}` : '';
      return `- ${r.name || ('Terminal #' + r.id_terminal)}${where}: reports ${fmtNum(r.total)} (buy ${fmtNum(r.reports_buy)}, sell ${fmtNum(r.reports_sell)})`;
    });
    return { text: [`Most active terminals (last 15d user reports)${location ? ` near ${location}` : ''}:`, ...lines].join('\n') };
  },
  async bestProfitRoutes({ name, top = 5, location = null, areaType = null }) {
    await ensureData();
    // Heuristic route: choose min buy and max sell terminals for the item
    const rows = whereItemAvailable(name) || [];
    if (!rows.length) return { text: `I don\'t have route data yet for ${name}. Once prices are loaded, I\'ll compute buy->sell pairs by margin.` };
    // Exclude zero/invalid prices: buy > 0 and sell > 0
    const buys = rows
      .filter(r => isFinite(Number(r.buy)) && Number(r.buy) > 0)
      .sort((a,b)=>Number(a.buy)-Number(b.buy))
      .slice(0, Math.max(2, Math.min(6, top+1)));
    const sells = rows
      .filter(r => isFinite(Number(r.sell)) && Number(r.sell) > 0)
      .sort((a,b)=>Number(b.sell)-Number(a.sell))
      .slice(0, Math.max(2, Math.min(6, top+1)));
    const pairs = [];
    for (const b of buys) {
      for (const s of sells) {
        if (location || areaType) {
          const loc = String(location).toLowerCase();
          const bSys = String(b.star_system_name || '').toLowerCase();
          const sSys = String(s.star_system_name || '').toLowerCase();
          if (location) {
            const bothInSys = (bSys && sSys) ? (bSys.includes(loc) && sSys.includes(loc)) : (String(b.location).toLowerCase().includes(loc) && String(s.location).toLowerCase().includes(loc));
            if (!bothInSys) continue;
          }
          if (areaType) {
            const t = String(areaType).toLowerCase();
            if (t === 'station' && !(b.id_space_station != null && s.id_space_station != null)) continue;
            if (t === 'outpost' && !(b.id_outpost != null && s.id_outpost != null)) continue;
            if (t === 'city' && !(b.id_city != null && s.id_city != null)) continue;
            if (t === 'planet') {
              const bPlanetOnly = b.id_planet != null && b.id_space_station == null && b.id_outpost == null && b.id_city == null;
              const sPlanetOnly = s.id_planet != null && s.id_space_station == null && s.id_outpost == null && s.id_city == null;
              if (!(bPlanetOnly && sPlanetOnly)) continue;
            }
          }
        }
        const margin = Number(s.sell || 0) - Number(b.buy || 0);
        if (margin > 0) pairs.push({ buyAt: b.location, sellAt: s.location, buy: b.buy, sell: s.sell, margin });
      }
    }
    pairs.sort((a,b)=>b.margin-a.margin);
    const best = pairs.slice(0, top);
    if (!best.length) return { text: `No profitable routes found for ${name} with the current data.` };
    const lines = best.map(p => `- Buy at ${p.buyAt} for ${fmtNum(p.buy)}, sell at ${p.sellAt} for ${fmtNum(p.sell)} — margin ${fmtNum(p.margin)} aUEC`);
    const scopeBit = areaType ? ` (${areaType})` : '';
    return { text: [`Best profit routes for ${name}${location ? ` near ${location}` : ''}${scopeBit}:`, ...lines].join('\n') };
  },
  // Combined summary to ensure internal consistency across buys, sells, and routes
  async summarizeMarket({ name, location = null, areaType = null, topBuys = 5, topSells = 5, topRoutes = 5 }) {
    await ensureData();
    const item = findItem(name) || { name };
    const rows = pickRowsForItem(item.name, location, areaType);
    const scopeBit = areaType ? ` (${areaType})` : '';
    if (!rows.length) {
      return { text: `I don't have structured market data yet for ${item.name}. Load market/UEX data and I'll get specific.` };
    }
    // Buys
    const buys = rows.filter(r => isFinite(Number(r.buy)) && Number(r.buy) > 0)
      .sort((a,b)=>Number(a.buy)-Number(b.buy))
      .slice(0, topBuys);
    const buyLines = buys.map(r => `- ${r.location}: buy at ${fmtNum(r.buy)} ${r.currency || 'aUEC'}`);
    // Sells
    const sells = rows.filter(r => isFinite(Number(r.sell)) && Number(r.sell) > 0)
      .sort((a,b)=>Number(b.sell)-Number(a.sell))
      .slice(0, topSells);
    const sellLines = sells.map(r => `- ${r.location}: sell at ${fmtNum(r.sell)} ${r.currency || 'aUEC'}`);
    // Routes (use same filtered rows to keep consistency)
    const pairs = [];
    for (const b of buys.slice(0, Math.max(2, Math.min(6, topRoutes+1)))) {
      for (const s of sells.slice(0, Math.max(2, Math.min(6, topRoutes+1)))) {
        if (String(b.location) === String(s.location)) continue;
        const margin = Number(s.sell || 0) - Number(b.buy || 0);
        if (margin > 0) pairs.push({ buyAt: b.location, sellAt: s.location, buy: b.buy, sell: s.sell, margin });
      }
    }
    pairs.sort((a,b)=>b.margin-a.margin);
    const routeBest = pairs.slice(0, topRoutes);
    const routeLines = routeBest.map(p => `- Buy at ${p.buyAt} for ${fmtNum(p.buy)}, sell at ${p.sellAt} for ${fmtNum(p.sell)} — margin ${fmtNum(p.margin)} aUEC`);

    const parts = [];
    parts.push(`Best Buy Locations for ${item.name}${location ? ` near ${location}` : ''}${scopeBit}:`);
    parts.push(buyLines.length ? buyLines.join('\n') : 'No buy prices found.');
    parts.push('');
    parts.push(`Best Sell Locations for ${item.name}${location ? ` near ${location}` : ''}${scopeBit}:`);
    parts.push(sellLines.length ? sellLines.join('\n') : 'No sell prices found.');
    parts.push('');
    parts.push(`Best Profit Routes for ${item.name}${location ? ` near ${location}` : ''}${scopeBit}:`);
    parts.push(routeLines.length ? routeLines.join('\n') : 'No profitable routes found with the current data.');
    return { text: parts.join('\n') };
  },
  // Refinery yields: summarize best yields for an ore/commodity optionally scoped by location
  // Contract:
  // - inputs: { commodity: string, location?: string, top?: number }
  // - outputs: { text }
  async summarizeRefineryYields({ commodity, location = null, top = 8 } = {}) {
    await ensureData();
    const d = getCache();
    const rows = Array.isArray(d.refineryYields) ? d.refineryYields : [];
    if (!rows.length) return { text: 'No refinery yield data available yet.' };
    const n = (s) => String(s || '').trim().toLowerCase();
    const itemName = commodity || '';
    const itemNorm = n(itemName);
    let filtered = rows;
    if (itemNorm) filtered = filtered.filter(r => n(r.commodity_name).includes(itemNorm));
    if (location) {
      const loc = n(location);
      filtered = filtered.filter(r => [r.terminal_name, r.space_station_name, r.outpost_name, r.city_name, r.moon_name, r.planet_name, r.star_system_name]
        .some(v => n(v).includes(loc)));
    }
    if (!filtered.length) return { text: `No refinery yield data found${itemName?` for ${itemName}`:''}${location?` near ${location}`:''}.` };
    // Score by current value, break ties with weekly/monthly averages
    const sc = (r) => ({
      val: Number(r.value || 0),
      wk: Number(r.value_week || 0),
      mo: Number(r.value_month || 0),
    });
    filtered.sort((a,b) => {
      const A = sc(a), B = sc(b);
      if (B.val !== A.val) return B.val - A.val;
      if (B.wk !== A.wk) return B.wk - A.wk;
      return B.mo - A.mo;
    });
    const take = filtered.slice(0, Math.max(3, Math.min(20, top)));
    const locStr = (r) => r.terminal_name || r.space_station_name || r.outpost_name || r.city_name || r.moon_name || r.planet_name || r.star_system_name || 'Unknown';
    const fmtPct = (v) => isFinite(Number(v)) && Number(v) > 0 ? `${Math.round(Number(v))}%` : '—';
    const lines = take.map(r => `- ${locStr(r)}: yield ${fmtPct(r.value)}${r.value_week!=null?` (7d ${fmtPct(r.value_week)}`:''}${r.value_week!=null&&r.value_month!=null?`, `:''}${r.value_month!=null?`30d ${fmtPct(r.value_month)}`:''}${(r.value_week!=null||r.value_month!=null)?')':''}`);
    const title = itemName ? `Best refinery yields for ${itemName}${location?` near ${location}`:''}:` : `Best refinery yields${location?` near ${location}`:''}:`;
    return { text: [title, ...lines].join('\n') };
  },
};
