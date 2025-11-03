// Market answerer: uses UEX APIs to answer buy/sell/spot/movement questions
const {
  getAllSummarizedCommodities,
  getAllTerminalCommodities,
  getAllSummarizedItems,
  getAllTerminalItems,
  getAllTerminals,
  getAllStarSystems,
  getAllPlanets,
  getAllSpaceStations,
  getAllOutposts,
} = require('../api/uexApi');

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function pickTop(arr, n) {
  return Array.isArray(arr) ? arr.slice(0, Math.max(1, n || 5)) : [];
}

function fmtLoc(t) {
  const parts = [];
  if (t.star_system_name) parts.push(t.star_system_name);
  if (t.planet_name) parts.push(t.planet_name);
  if (t.moon_name) parts.push(t.moon_name);
  if (t.space_station_name) parts.push(t.space_station_name);
  if (t.city_name) parts.push(t.city_name);
  if (t.outpost_name) parts.push(t.outpost_name);
  if (t.orbit_name) parts.push(t.orbit_name);
  if (t.poi_name) parts.push(t.poi_name);
  const where = parts.filter(Boolean).join(' › ');
  return where ? `${t.terminal_name} — ${where}` : t.terminal_name || 'Unknown terminal';
}

// Simple in-memory cache with 1-hour TTL
const CACHE_TTL_MS = 60 * 60 * 1000;
let CACHE = { ts: 0, data: null };

async function loadData({ force = false } = {}) {
  const now = Date.now();
  if (!force && CACHE.data && (now - CACHE.ts < CACHE_TTL_MS)) {
    return CACHE.data;
  }
  const [commodities, termCommodities, items, termItems, terminals, systems, planets, stations, outposts] = await Promise.all([
    getAllSummarizedCommodities(),
    getAllTerminalCommodities(),
    getAllSummarizedItems(),
    getAllTerminalItems(),
    getAllTerminals(),
    getAllStarSystems?.() || [],
    getAllPlanets?.() || [],
    getAllSpaceStations?.() || [],
    getAllOutposts?.() || [],
  ]);
  const terminalById = new Map();
  if (Array.isArray(terminals)) {
    for (const t of terminals) terminalById.set(String(t.id_terminal || t.id), t);
  }
  CACHE = {
    ts: now,
    data: {
      commodities: commodities || [],
      termCommodities: termCommodities || [],
      items: items || [],
      termItems: termItems || [],
      terminals: terminals || [],
      terminalById,
      systems: systems || [],
      planets: planets || [],
      stations: stations || [],
      outposts: outposts || [],
    },
  };
  return CACHE.data;
}

function findCommodity(commodities, name) {
  const q = norm(name);
  if (!q) return null;
  return commodities.find(c => norm(c.commodity_name) === q)
      || commodities.find(c => norm(c.commodity_name).includes(q))
      || null;
}

function findItem(items, name) {
  const q = norm(name);
  if (!q) return null;
  return items.find(i => norm(i.commodity_name || i.item_name) === q)
      || items.find(i => norm(i.commodity_name || i.item_name).includes(q))
      || null;
}

function filterByTerminal(termRows, targetId) {
  return termRows.filter(r => String(r.id_terminal) === String(targetId));
}

function formatPrice(v) {
  if (v == null || isNaN(Number(v))) return '—';
  const n = Number(v);
  return Math.round(n).toLocaleString();
}

function toLines(rows, opts={}) {
  const { terminalById, mode } = opts;
  const out = [];
  for (const r of rows) {
    const t = terminalById?.get(String(r.id_terminal)) || {};
    const where = fmtLoc({ ...t, terminal_name: r.terminal_name || t.terminal_name });
    if (mode === 'buy') {
      out.push(`- ${where}: buy ${formatPrice(r.price_buy ?? r.price_buy_avg)} aUEC (avg ${formatPrice(r.price_buy_avg)}; reports ${r.price_buy_users_rows ?? '—'})`);
    } else if (mode === 'sell') {
      out.push(`- ${where}: sell ${formatPrice(r.price_sell ?? r.price_sell_avg)} aUEC (avg ${formatPrice(r.price_sell_avg)}; reports ${r.price_sell_users_rows ?? '—'})`);
    } else if (mode === 'spot') {
      out.push(`- ${where}: buy ${formatPrice(r.price_buy_avg)} / sell ${formatPrice(r.price_sell_avg)} aUEC`);
    } else if (mode === 'activity') {
      const buys = Number(r.price_buy_users_rows || 0);
      const sells = Number(r.price_sell_users_rows || 0);
      out.push(`- ${where}: ${buys + sells} reports (buy ${buys} / sell ${sells}) — ${r.commodity_name || r.item_name}`);
    }
  }
  return out;
}

function matchTerminalLocation(t, locationStr) {
  if (!locationStr) return true;
  const q = norm(locationStr);
  const fields = [
    t.star_system_name,
    t.planet_name,
    t.moon_name,
    t.space_station_name,
    t.city_name,
    t.outpost_name,
    t.orbit_name,
    t.poi_name,
    t.terminal_name,
  ];
  return fields.filter(Boolean).some(v => norm(v).includes(q));
}

function filterRowsByLocation(rows, terminalById, locationStr) {
  if (!locationStr) return rows;
  return rows.filter(r => {
    const t = terminalById?.get(String(r.id_terminal)) || {};
    return matchTerminalLocation(t, locationStr);
  });
}

async function bestBuyLocations({ name, top = 5, location = null }) {
  const data = await loadData();
  const com = findCommodity(data.commodities, name);
  const it = findItem(data.items, name);
  if (!com && !it) return { text: `I can't find an item or commodity named "${name}".`, ok: false };

  const parts = [];
  if (com) {
    let list = data.termCommodities.filter(r => String(r.id_commodity) === String(com.id));
    list = filterRowsByLocation(list, data.terminalById, location);
    const sorted = list.filter(r => r.price_buy != null || r.price_buy_avg != null)
      .sort((a,b)=> (Number(a.price_buy ?? a.price_buy_avg) - Number(b.price_buy ?? b.price_buy_avg))
        || (Number(b.price_buy_users_rows || 0) - Number(a.price_buy_users_rows || 0)));
    const topRows = pickTop(sorted, top);
    const lines = toLines(topRows, { terminalById: data.terminalById, mode: 'buy' });
    parts.push(`Best buy locations for ${com.commodity_name} (lowest price first):`);
    parts.push(...lines);
  }

  if (it) {
    let list = data.termItems.filter(r => norm(r.item_name) === norm(it.commodity_name || it.item_name));
    list = filterRowsByLocation(list, data.terminalById, location);
    const sorted = list.filter(r => r.price_buy != null || r.price_buy_avg != null)
      .sort((a,b)=> (Number(a.price_buy ?? a.price_buy_avg) - Number(b.price_buy ?? b.price_buy_avg))
        || (Number(b.price_buy_users_rows || 0) - Number(a.price_buy_users_rows || 0)));
    const topRows = pickTop(sorted, top);
    const lines = toLines(topRows, { terminalById: data.terminalById, mode: 'buy' });
    parts.push(`Best buy locations for ${it.commodity_name || it.item_name} (lowest price first):`);
    parts.push(...lines);
  }
  return { text: parts.join('\n'), ok: true };
}

async function bestSellLocations({ name, top = 5, location = null }) {
  const data = await loadData();
  const com = findCommodity(data.commodities, name);
  const it = findItem(data.items, name);
  if (!com && !it) return { text: `I can't find an item or commodity named "${name}".`, ok: false };

  const parts = [];
  if (com) {
    let list = data.termCommodities.filter(r => String(r.id_commodity) === String(com.id));
    list = filterRowsByLocation(list, data.terminalById, location);
    const sorted = list.filter(r => r.price_sell != null || r.price_sell_avg != null)
      .sort((a,b)=> (Number(b.price_sell ?? b.price_sell_avg) - Number(a.price_sell ?? a.price_sell_avg))
        || (Number(b.price_sell_users_rows || 0) - Number(a.price_sell_users_rows || 0)));
    const topRows = pickTop(sorted, top);
    const lines = toLines(topRows, { terminalById: data.terminalById, mode: 'sell' });
    parts.push(`Best sell locations for ${com.commodity_name} (highest price first):`);
    parts.push(...lines);
  }

  if (it) {
    let list = data.termItems.filter(r => norm(r.item_name) === norm(it.commodity_name || it.item_name));
    list = filterRowsByLocation(list, data.terminalById, location);
    const sorted = list.filter(r => r.price_sell != null || r.price_sell_avg != null)
      .sort((a,b)=> (Number(b.price_sell ?? b.price_sell_avg) - Number(a.price_sell ?? a.price_sell_avg))
        || (Number(b.price_sell_users_rows || 0) - Number(a.price_sell_users_rows || 0)));
    const topRows = pickTop(sorted, top);
    const lines = toLines(topRows, { terminalById: data.terminalById, mode: 'sell' });
    parts.push(`Best sell locations for ${it.commodity_name || it.item_name} (highest price first):`);
    parts.push(...lines);
  }
  return { text: parts.join('\n'), ok: true };
}

async function spotFor({ name, top = 5, location = null }) {
  const data = await loadData();
  const com = findCommodity(data.commodities, name);
  const it = findItem(data.items, name);
  if (!com && !it) return { text: `I can't find an item or commodity named "${name}".`, ok: false };

  const parts = [];
  if (com) {
    let list = data.termCommodities.filter(r => String(r.id_commodity) === String(com.id));
    list = filterRowsByLocation(list, data.terminalById, location);
    const sorted = list.sort((a,b)=> (Number(a.price_buy_avg || 0) + Number(a.price_sell_avg || 0)) - (Number(b.price_buy_avg || 0) + Number(b.price_sell_avg || 0)));
    const topRows = pickTop(sorted, top);
    const lines = toLines(topRows, { terminalById: data.terminalById, mode: 'spot' });
    parts.push(`Spot prices for ${com.commodity_name} (avg buy/sell):`);
    parts.push(...lines);
  }

  if (it) {
    let list = data.termItems.filter(r => norm(r.item_name) === norm(it.commodity_name || it.item_name));
    list = filterRowsByLocation(list, data.terminalById, location);
    const sorted = list.sort((a,b)=> (Number(a.price_buy_avg || 0) + Number(a.price_sell_avg || 0)) - (Number(b.price_buy_avg || 0) + Number(b.price_sell_avg || 0)));
    const topRows = pickTop(sorted, top);
    const lines = toLines(topRows, { terminalById: data.terminalById, mode: 'spot' });
    parts.push(`Spot prices for ${it.commodity_name || it.item_name} (avg buy/sell):`);
    parts.push(...lines);
  }
  return { text: parts.join('\n'), ok: true };
}

async function mostMovement({ scope = 'commodity', top = 5, location = null }) {
  const data = await loadData();
  // Using /terminals data which includes users_rows per commodity per terminal
  const rowsAll = data.terminals || [];
  if (!rowsAll.length) return { text: 'No terminal data available.', ok: false };
  const rows = location ? rowsAll.filter(r => matchTerminalLocation(r, location)) : rowsAll;

  if (scope === 'terminal') {
    // Sum per terminal
    const agg = new Map();
    for (const r of rows) {
      const k = String(r.id_terminal);
      const curr = agg.get(k) || { id_terminal: r.id_terminal, terminal_name: r.terminal_name, total: 0 };
      curr.total += Number(r.price_buy_users_rows || 0) + Number(r.price_sell_users_rows || 0);
      agg.set(k, curr);
    }
    const list = Array.from(agg.values()).sort((a,b)=> b.total - a.total);
    const topRows = pickTop(list, top);
    const lines = topRows.map(r => `- ${r.terminal_name} — ${r.total} reports`);
    return { text: ['Most active terminals (by reports):', ...lines].join('\n'), ok: true };
  }

  // Default: per commodity/item across all terminals
  const agg = new Map();
  for (const r of rows) {
    const name = r.commodity_name || r.item_name;
    if (!name) continue;
    const k = norm(name);
    const curr = agg.get(k) || { name, total: 0 };
    curr.total += Number(r.price_buy_users_rows || 0) + Number(r.price_sell_users_rows || 0);
    agg.set(k, curr);
  }
  const list = Array.from(agg.values()).sort((a,b)=> b.total - a.total);
  const topRows = pickTop(list, top);
  const lines = topRows.map(r => `- ${r.name}: ${r.total} reports`);
  return { text: ['Most movement by item/commodity (reports):', ...lines].join('\n'), ok: true };
}

function resolveNameForRow(r) {
  return r.commodity_name || r.item_name || r.terminal_name || 'Unknown';
}

function buildRouteLine({ buyRow, sellRow, terminalById }) {
  const bt = terminalById.get(String(buyRow.id_terminal)) || {};
  const st = terminalById.get(String(sellRow.id_terminal)) || {};
  const bWhere = fmtLoc({ ...bt, terminal_name: buyRow.terminal_name || bt.terminal_name });
  const sWhere = fmtLoc({ ...st, terminal_name: sellRow.terminal_name || st.terminal_name });
  const buyPrice = Number((buyRow.price_buy ?? buyRow.price_buy_avg) ?? 0);
  const sellPrice = Number((sellRow.price_sell ?? sellRow.price_sell_avg) ?? 0);
  const profit = sellPrice - buyPrice;
  const bReps = Number(buyRow.price_buy_users_rows || 0);
  const sReps = Number(sellRow.price_sell_users_rows || 0);
  return `- Buy at ${bWhere} for ${formatPrice(buyPrice)} → sell at ${sWhere} for ${formatPrice(sellPrice)} (spread ${formatPrice(profit)} aUEC; reports buy ${bReps} / sell ${sReps})`;
}

async function bestProfitRoutes({ name, top = 5, location = null }) {
  const data = await loadData();
  const com = findCommodity(data.commodities, name);
  const it = findItem(data.items, name);
  if (!com && !it) return { text: `I can't find an item or commodity named "${name}".`, ok: false };

  const parts = [];

  const computeFor = (label, listBuySell) => {
    let { buyRows, sellRows } = listBuySell;
    buyRows = filterRowsByLocation(buyRows, data.terminalById, location);
    sellRows = filterRowsByLocation(sellRows, data.terminalById, location);
    const candidates = [];
    for (const b of buyRows) {
      const bp = Number(b.price_buy ?? b.price_buy_avg);
      if (!isFinite(bp)) continue;
      for (const s of sellRows) {
        if (String(s.id_terminal) === String(b.id_terminal)) continue; // skip same terminal
        const sp = Number(s.price_sell ?? s.price_sell_avg);
        if (!isFinite(sp)) continue;
        const spread = sp - bp;
        if (spread <= 0) continue;
        candidates.push({ spread, buyRow: b, sellRow: s });
      }
    }
    candidates.sort((a,b)=> b.spread - a.spread);
    const topPairs = pickTop(candidates, top);
    const lines = topPairs.map(p => buildRouteLine({ ...p, terminalById: data.terminalById }));
    if (lines.length) {
      parts.push(`Top ${lines.length} routes for ${label} (max spread):`);
      parts.push(...lines);
    } else {
      parts.push(`No profitable routes found for ${label}.`);
    }
  };

  if (com) {
    const list = data.termCommodities.filter(r => String(r.id_commodity) === String(com.id));
    computeFor(com.commodity_name, {
      buyRows: list.filter(r => r.price_buy != null || r.price_buy_avg != null),
      sellRows: list.filter(r => r.price_sell != null || r.price_sell_avg != null),
    });
  }
  if (it) {
    const list = data.termItems.filter(r => norm(r.item_name) === norm(it.commodity_name || it.item_name));
    computeFor(it.commodity_name || it.item_name, {
      buyRows: list.filter(r => r.price_buy != null || r.price_buy_avg != null),
      sellRows: list.filter(r => r.price_sell != null || r.price_sell_avg != null),
    });
  }
  return { text: parts.join('\n'), ok: true };
}

async function primeMarketCache({ force = true } = {}) {
  try {
    await loadData({ force });
    return true;
  } catch (e) {
    // Don't throw on prime failures; callers may treat this as best-effort
    return false;
  }
}

module.exports = {
  bestBuyLocations,
  bestSellLocations,
  spotFor,
  mostMovement,
  bestProfitRoutes,
  primeMarketCache,
};
