// Dataset catalog and lightweight NL router for market/world questions
// This lets the LLM pass a free-form question and we choose the best dataset(s)
// and computation path without needing a separate function for every phrasing.

const { maybeLoadOnce, refreshFromDb, getCache, getRelations, whereItemAvailable } = require('./data-cache');

function norm(s) { return String(s || '').trim().toLowerCase(); }
function has(hay, needle) { return norm(hay).includes(norm(needle)); }

// Public: catalog of datasets available to the LLM/tooling
function getDatasetCatalog() {
  return [
    { key: 'starsystems', cacheKey: 'systems', id: 'id', name: 'name', fields: ['id','name','code','live','default','visible','factions','jurisdiction'] },
    { key: 'spacestations', cacheKey: 'stations', id: 'id', name: 'name', fields: ['id','name','system','planet','orbit','id_star_system','id_planet','id_city','features'] },
    { key: 'planets', cacheKey: 'planets', id: 'id', name: 'name', fields: ['id','name','code','system','id_star_system','factions','jurisdiction'] },
    { key: 'cities', cacheKey: 'cities', id: 'id', name: 'name', fields: ['id','name','system','planet','id_star_system','id_planet'] },
    { key: 'outposts', cacheKey: 'outposts', id: 'id', name: 'name', fields: ['id','name','system','planet','id_star_system','id_planet','features'] },
    { key: 'terminals', cacheKey: 'terminals', id: 'id', name: 'name', fields: ['id','name','system','planet','id_star_system','id_planet','id_space_station','id_outpost','id_city','type','is_refinery','is_cargo_center','is_medical','is_refuel','is_repair'] },
    { key: 'commoditiesbyterminals', cacheKey: 'commoditiesByTerminal', fields: ['id','id_commodity','id_terminal','commodity_name','terminal_name','price_buy','price_sell','status_buy','status_sell'] },
    { key: 'itemsbyterminals', cacheKey: 'itemsByTerminal', fields: ['id','id_item','id_terminal','item_name','terminal_name','price_buy','price_sell'] },
    { key: 'commoditiessummary', cacheKey: 'commoditiesSummary', fields: ['id','commodity_name','price_buy_avg','price_sell_avg'] },
    { key: 'itemssummary', cacheKey: 'itemsSummary', fields: ['id','commodity_name','price_buy_avg','price_sell_avg'] },
    { key: 'terminalprices', cacheKey: 'terminalPrices', fields: ['id_terminal','terminal_name','id_star_system','star_system_name','id_planet','planet_name','id_city','city_name','id_outpost','outpost_name','price_buy','price_buy_avg','price_sell','price_sell_avg','price_buy_users_rows','price_sell_users_rows'] },
    { key: 'refineryyields', cacheKey: 'refineryYields', fields: ['id','id_commodity','commodity_name','value','value_week','value_month','star_system_name','planet_name','moon_name','space_station_name','outpost_name','city_name','terminal_name'] },
  ];
}

// Parse a free-form question into an intent and filters
function parseMarketQuery(text) {
  const s = norm(text);
  let intent = (() => {
    if (/(refiner(y|ies)|refine|refining|yield|yields|ore|ores|mining|mined|mineral)/.test(s)) return 'refinery_yields';
    if (/(best|good).{0,10}\b(buy|purchase)\b|\bwhere\s+(?:can|do|to)\s+buy\b|\bbuy\s+[a-z]/.test(s)) return 'best_buy';
    if (/(best|good).{0,10}\b(sell)\b|\bwhere\s+(?:can|do|to)\s+sell\b|\bsell\s+[a-z]/.test(s)) return 'best_sell';
    if (/(spot|price|prices|how\s+much|cost)/.test(s)) return 'spot';
    if (/(route|profit|trade\s+route|haul)/.test(s)) return 'route';
    if (/(active|reports|most\s+active|traffic|hotspots|movement|transactions?)/.test(s)) return 'activity';
    if (/(list|which|what)\s+(terminals?|stations?|outposts?|cities|planets|systems)/.test(s)) return 'list';
    return 'spot';
  })();
  // Extract simple entity terms
  const areaType = (function() {
    if (/\bterminals?\b/.test(s)) return 'terminal';
    if (/\b(space\s*)?stations?\b/.test(s)) return 'station';
    if (/\boutposts?\b/.test(s)) return 'outpost';
    if (/\bcit(y|ies)\b/.test(s)) return 'city';
    if (/\bplanets?\b/.test(s)) return 'planet';
    if (/\bsystems?\b|\bstar\s*systems?\b/.test(s)) return 'system';
    return null;
  })();
  // Map natural-language feature words to our normalized feature labels
  function parseFeatures(text) {
    const t = norm(text);
    const feats = new Set();
    if (/(refiner(y|ies)|refine)/.test(t)) feats.add('refinery');
    if (/(cargo\s*center|cargo\s*hub|cargo)/.test(t)) feats.add('cargo center');
    if (/(clinic|medical|hospital|med\b)/.test(t)) feats.add('clinic');
    if (/(food|bar|canteen)/.test(t)) feats.add('food');
    if (/(shop|shops|store|market)/.test(t)) feats.add('shops');
    if (/(refuel|fuel)/.test(t)) feats.add('refuel');
    if (/(repair)/.test(t)) feats.add('repair');
    if (/(gravity|grav)/.test(t)) feats.add('gravity');
    if (/(loading\s*dock)/.test(t)) feats.add('loading dock');
    if (/(docking\s*port|dock\s*port|docking)/.test(t)) feats.add('docking port');
    if (/(freight\s*elevator|freight)/.test(t)) feats.add('freight elevator');
    if (/(trade\s*terminal|trade)/.test(t)) feats.add('trade terminal');
    if (/(habitation|hab)/.test(t)) feats.add('habitation');
    return Array.from(feats);
  }
  // Extract crude item name — take phrase after 'for', 'of', 'find', or leading token
  let item = null;
  // After buy/sell
  const mBuy = s.match(/\bbuy\s+([a-z0-9 '\-]{2,40}?)(?:\s+(?:in|at|near|for)\b|$)/i);
  const mSell = s.match(/\bsell\s+([a-z0-9 '\-]{2,40}?)(?:\s+(?:in|at|near|for)\b|$)/i);
  const mFor = s.match(/\b(?:for|of)\s+([a-z0-9 '\-]{2,40})/i);
  const mFind = s.match(/\bfind\s+(?:the\s+)?([a-z0-9 '\-]{2,40})(?=\b(?:in|at|near|on|with|that|which)\b|[?.,!]|$)/i);
  if (mBuy) item = (mBuy[1] || '').trim();
  else if (mSell) item = (mSell[1] || '').trim();
  else if (mFor) item = (mFor[1] || '').trim();
  else if (mFind) item = (mFind[1] || '').trim();
  // Extract location like 'in X', 'near X', 'at X', 'on X' (stop at with/have/that/which)
  let location = null;
  const mLoc = s.match(/\b(?:in|near|at|on)\s+([a-z0-9 '\-]{2,40}?)(?=\s+(?:with|have|that|which)\b|[?.,!]|$)/i);
  if (mLoc) location = mLoc[1].replace(/\?+$/,'').trim();
  // Cross-system route: between A and B / from A to B
  let from = null, to = null;
  const mBetween = s.match(/\bbetween\s+([a-z0-9 '\-]{2,30})\s+and\s+([a-z0-9 '\-]{2,30})/i);
  const mFromTo = s.match(/\bfrom\s+([a-z0-9 '\-]{2,30})\s+to\s+([a-z0-9 '\-]{2,30})/i);
  if (mBetween) { from = mBetween[1].trim(); to = mBetween[2].trim(); }
  if (mFromTo) { from = from || mFromTo[1].trim(); to = to || mFromTo[2].trim(); }
  // Feature flags
  const features = parseFeatures(s);
  // If this looks like a listing by entity (e.g., "cities in Pyro"), prefer list intent unless pricing/route/activity words appear
  if (areaType) {
    const hasPricingWords = /(price|prices|cost|buy|sell|spot)/.test(s);
    const hasRouteWords = /(route|profit|haul)/.test(s);
    const hasActivityWords = /(active|reports|hotspots|traffic|movement|transactions?)/.test(s);
    if (!hasPricingWords && !hasRouteWords && !hasActivityWords) intent = 'list';
  }
  return { intent, item_name: item, location, area_type: areaType, from, to, features };
}

// Listing helper using cache/relations
function listEntities({ entity, system = null, planet = null, features = [], top = 30 }) {
  const d = getCache();
  const rel = getRelations();
  const n = norm;
  const by = {
    station: d.stations || [],
    outpost: d.outposts || [],
    city: d.cities || [],
    planet: d.planets || [],
    terminal: d.terminals || [],
    system: d.systems || [],
  }[entity] || [];
  let rows = by.slice();
  if (system) rows = rows.filter(r => n(r.system).includes(n(system)));
  if (planet) rows = rows.filter(r => n(r.planet).includes(n(planet)) || n(r.name).includes(n(planet)));
  if (Array.isArray(features) && features.length && entity !== 'system' && entity !== 'planet') {
    const needs = features.map(n);
    rows = rows.filter(r => {
      const hasFeature = (label) => {
        const f = n(label);
        if (Array.isArray(r.features)) return r.features.some(x => n(x).includes(f));
        if (entity === 'terminal') {
          if (f.includes('refinery')) return !!r.is_refinery;
          if (f.includes('cargo')) return !!r.is_cargo_center;
          if (f.includes('medical') || f.includes('clinic')) return !!r.is_medical;
          if (f.includes('refuel')) return !!r.is_refuel;
          if (f.includes('repair')) return !!r.is_repair;
          if (f.includes('loading')) return !!r.has_loading_dock;
          if (f.includes('docking')) return !!r.has_docking_port;
          if (f.includes('freight')) return !!r.has_freight_elevator;
        }
        return false;
      };
      // Require all requested features (AND)
      return needs.every(hasFeature);
    });
  }
  rows = rows.slice(0, Math.max(1, Math.min(100, top)));
  return rows;
}

// Mensuration helpers
function summarizePricesForItem(name, { location = null, mode = 'spot', top = 5 }) {
  const rows = (whereItemAvailable(name) || []).filter(r => {
    if (!location) return true;
    const l = norm(location);
    return has(r.location, l) || has(r.star_system_name, l) || has(r.planet_name, l);
  });
  if (!rows.length) return { lines: [], count: 0 };
  const scored = rows.map(r => ({ ...r, buyN: Number(r.buy), sellN: Number(r.sell) }));
  let ordered = [];
  if (mode === 'buy') ordered = scored.filter(r => isFinite(r.buyN) && r.buyN > 0).sort((a,b)=>a.buyN-b.buyN);
  else if (mode === 'sell') ordered = scored.filter(r => isFinite(r.sellN) && r.sellN > 0).sort((a,b)=>b.sellN-a.sellN);
  else ordered = scored; // spot
  const take = ordered.slice(0, Math.max(1, top));
  const lines = take.map(r => {
    if (mode === 'buy') return `- ${r.location}: buy at ${Math.round(r.buyN).toLocaleString()} aUEC`;
    if (mode === 'sell') return `- ${r.location}: sell at ${Math.round(r.sellN).toLocaleString()} aUEC`;
    return `- ${r.location}: buy ${Math.round(r.buyN||0).toLocaleString()} / sell ${Math.round(r.sellN||0).toLocaleString()} aUEC`;
  });
  return { lines, count: rows.length };
}

async function autoAnswerMarketQuestion({ query, top = 5 }) {
  await maybeLoadOnce();
  // Best-effort refresh in background
  refreshFromDb().catch(()=>{});

  const q = parseMarketQuery(query);
  // Note: variant/armor set disambiguation now handled by LLM using market_catalog tool; router stays lean.
  // Refinery yields intent: defer to market-answerer summarizer
  if (q.intent === 'refinery_yields') {
    try {
      const { summarizeRefineryYields } = require('./market-answerer');
      const ans = await summarizeRefineryYields({ commodity: q.item_name || null, location: q.location || null, top: Math.max(5, top) });
      return { text: ans?.text || 'No refinery yield data available yet.', meta: { routed: 'refinery_yields' } };
    } catch {
      // Fall through to generic spot prices if summarizer import fails
    }
  }
  // Route intents
  if (q.intent === 'best_buy' && q.item_name) {
    const { lines } = summarizePricesForItem(q.item_name, { location: q.location, mode: 'buy', top });
    const where = q.location ? ` near ${q.location}` : '';
    if (!lines.length) {
      return { text: `I couldn't find buy prices for "${q.item_name}"${where}. If this is an armor set or brand, specify the exact piece/variant (e.g., helmet/chest) or ask me to show the catalog using: 'catalog for ${q.item_name}'.`, meta: { routed: 'best_buy.empty' } };
    }
    return { text: [`Best buy locations for ${q.item_name}${where}:`, lines.join('\n')].join('\n'), meta: { routed: 'best_buy' } };
  }
  if (q.intent === 'best_sell' && q.item_name) {
    const { lines } = summarizePricesForItem(q.item_name, { location: q.location, mode: 'sell', top });
    const where = q.location ? ` near ${q.location}` : '';
    if (lines.length) {
      return { text: [`Best sell locations for ${q.item_name}${where}:`, lines.join('\n')].join('\n'), meta: { routed: 'best_sell' } };
    }
    // Fallback: delegate to market-answerer to use heuristic/summary when no direct prices
    try {
      const { bestSellLocations } = require('./market-answerer');
      const ans = await bestSellLocations({ name: q.item_name, top, location: q.location });
      const text = ans?.text || '';
      if (!text) {
        return { text: `I couldn't find sell prices for "${q.item_name}"${where}. If this is an armor set or brand, specify the exact piece/variant (e.g., helmet/chest) or ask me to show the catalog using: 'catalog for ${q.item_name}'.`, meta: { routed: 'best_sell.empty' } };
      }
      return { text, meta: { routed: 'best_sell.fallback' } };
    } catch {
      return { text: `I couldn't find sell prices for "${q.item_name}"${where}. If this is an armor set or brand, specify the exact piece/variant (e.g., helmet/chest) or ask me to show the catalog using: 'catalog for ${q.item_name}'.`, meta: { routed: 'best_sell.empty' } };
    }
  }
  if (q.intent === 'spot' && q.item_name) {
    const { lines } = summarizePricesForItem(q.item_name, { location: q.location, mode: 'spot', top: Math.max(3, top) });
    const where = q.location ? ` near ${q.location}` : '';
    if (!lines.length) {
      return { text: `No spot prices available yet for "${q.item_name}"${where}. If you're asking about an armor set/brand, please specify the exact piece/variant (helmet/chest/legs/etc.) or ask me for the catalog using: 'catalog for ${q.item_name}'.`, meta: { routed: 'spot.empty' } };
    }
    return { text: [`Spot prices for ${q.item_name}${where}:`, lines.join('\n')].join('\n'), meta: { routed: 'spot' } };
  }
  if (q.intent === 'route' && q.from && q.to) {
    // Leave cross-system route computation to existing tool-agent route function if available; here provide a brief acknowledgment.
    return { text: `Route analysis between ${q.from} and ${q.to}: ask me for 'best routes between ${q.from} and ${q.to}' and I'll compute margins across items.`, meta: { routed: 'route.handoff' } };
  }
  if (q.intent === 'activity') {
    // Use terminalPrices visitation counts if present
    const d = getCache();
    const rows = Array.isArray(d.terminalPrices) ? d.terminalPrices : [];
    if (!rows.length) return { text: 'No terminal activity data available yet.', meta: { routed: 'activity' } };
    const loc = q.location ? norm(q.location) : null;
    const filtered = rows.filter(r => !loc || [r.terminal_name, r.space_station_name, r.outpost_name, r.city_name, r.planet_name, r.star_system_name].some(v => norm(v).includes(loc)));
    const agg = new Map();
    for (const r of filtered) {
      const id = String(r.id_terminal || r.terminal_name || 'unknown');
      const cur = agg.get(id) || { name: r.terminal_name || 'Terminal', reports: 0, star_system_name: r.star_system_name || null, planet_name: r.planet_name || null, space_station_name: r.space_station_name || r.station_name || null, outpost_name: r.outpost_name || null, city_name: r.city_name || null };
      cur.reports += Number(r.price_buy_users_rows || 0) + Number(r.price_sell_users_rows || 0);
      agg.set(id, cur);
    }
    const list = Array.from(agg.values()).filter(r => r.reports > 0).sort((a,b)=>b.reports-a.reports).slice(0, Math.max(5, top));
    if (!list.length) return { text: 'No recent user report activity found for terminals.', meta: { routed: 'activity' } };
    const lines = list.map(r => {
      const locBits = [r.star_system_name, r.planet_name, r.space_station_name || r.outpost_name || r.city_name].filter(Boolean);
      const where = locBits.length ? ` — ${locBits.join(' / ')}` : '';
      return `- ${r.name}${where}: reports ${Math.round(r.reports).toLocaleString()}`;
    });
    return { text: [`Most active terminals${q.location ? ` near ${q.location}` : ''}:`, ...lines].join('\n'), meta: { routed: 'activity' } };
  }
  if (q.intent === 'list' && q.area_type) {
    // Try filtering by system name first when a location is present; if zero, fall back to planet match
    const sys = q.location || null;
    let rows = listEntities({ entity: q.area_type, system: sys, planet: null, features: q.features || [], top: Math.max(20, top) });
    if (!rows.length && q.location) {
      rows = listEntities({ entity: q.area_type, system: null, planet: q.location, features: q.features || [], top: Math.max(20, top) });
    }
    if (!rows.length) {
      const featText = (q.features && q.features.length) ? ` with ${q.features.join(', ')}` : '';
      const scope = q.location ? ` in ${q.location}` : '';
      return { text: `No ${q.area_type}s${featText}${scope} found in the current dataset.`, meta: { routed: 'list' } };
    }
    const lines = rows.map(r => {
      const locBits = [r.system, r.planet, r.orbit].filter(Boolean);
      const where = locBits.length ? ` — ${locBits.join(' / ')}` : '';
      return `- ${r.name}${where}`;
    });
    const featText = (q.features && q.features.length) ? ` with ${q.features.join(', ')}` : '';
    const title = `Here are ${q.area_type}s${q.location ? ` in ${q.location}` : ''}${featText}:`;
    return { text: [title, ...lines].join('\n'), meta: { routed: 'list' } };
  }
  // Fallback: if an item was mentioned, give spot prices; else show a quick catalog pointer
  if (q.item_name) {
    const { lines } = summarizePricesForItem(q.item_name, { location: q.location, mode: 'spot', top: Math.max(4, top) });
    return { text: [`Spot prices for ${q.item_name}${q.location ? ` near ${q.location}` : ''}:`, lines.length ? lines.join('\n') : 'No spot prices available yet.'].join('\n'), meta: { routed: 'fallback.spot' } };
  }
  return { text: 'Ask me about buy/sell locations, spot prices, profit routes, activity, or to list stations/outposts/terminals by system or planet.', meta: { routed: 'help' } };
}

module.exports = {
  getDatasetCatalog,
  parseMarketQuery,
  listEntities,
  autoAnswerMarketQuestion,
};
