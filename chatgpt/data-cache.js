// Lightweight in-memory cache for structured world/market data
// Works without DB loaded; will gracefully return empty results.

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
// Optional UEX models (HTTP-backed). We'll lazy-fallback to these when DB/JSON are empty.
let UexStarSystemsModel, UexPlanetsModel, UexSpaceStationsModel, UexOutpostsModel,
    UexCitiesModel, UexTerminalModel, UexCommoditiesByTerminalModel, UexItemsByTerminalModel,
    UexCommoditiesSummaryModel, UexItemsSummaryModel, UexTerminalPricesModel;
try {
  ({ UexStarSystemsModel } = require('../api/models/uex-star-systems'));
  ({ UexPlanetsModel } = require('../api/models/uex-planets'));
  ({ UexSpaceStationsModel } = require('../api/models/uex-space-stations'));
  ({ UexOutpostsModel } = require('../api/models/uex-outposts'));
  ({ UexCitiesModel } = require('../api/models/uex-cities'));
  ({ UexTerminalModel } = require('../api/models/uex-terminal'));
  ({ UexCommoditiesByTerminalModel } = require('../api/models/uex-commodities-by-terminal'));
  ({ UexItemsByTerminalModel } = require('../api/models/uex-items-by-terminal'));
  ({ UexCommoditiesSummaryModel } = require('../api/models/uex-commodities-summary'));
  ({ UexItemsSummaryModel } = require('../api/models/uex-items-summary'));
  ({ UexTerminalPricesModel } = require('../api/models/uex-terminal-prices'));
} catch (e) {
  // If any model fails to load (e.g., missing file or env), we simply won't use the UEX fallback.
}

const state = {
  loadedAt: 0,
  data: {
    items: [],           // { name, code, type }
    prices: [],          // { item, location, buy, sell, currency, ts }
    locations: [],       // { name, type: 'station'|'outpost'|'planet'|'moon', parent, system, orbit }
    systems: [],         // { id, name, code, live, default, visible, factions, jurisdiction }
    planets: [],         // { id, name, code, system, id_star_system, factions, jurisdiction }
    moons: [],           // { name, planet, system }
    stations: [],        // { id, name, system, planet, orbit, id_star_system, id_planet, id_city, features: [] }
    outposts: [],        // { id, name, planet, system, id_star_system, id_planet, features: [] }
    cities: [],          // { id, name, system, planet, id_star_system, id_planet }
    terminals: [],       // { id, name, system, planet, id_star_system, id_planet, id_space_station, id_outpost, id_city }
    commoditiesByTerminal: [], // commodity-terminal relations
    itemsByTerminal: [],       // item-terminal relations
    commoditiesSummary: [],    // summarized commodities
    itemsSummary: [],          // summarized items
    terminalPrices: [],        // price snapshots per terminal
    transactions: [],    // { item, location, qty, price, side: 'buy'|'sell', ts }
  },
  relations: {},
};

function safeReadJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function loadFromDisk() {
  const dir = path.join(__dirname, '..', 'data');
  const read = (name) => safeReadJson(path.join(dir, `${name}.json`));
  const parts = ['items','prices','locations','systems','planets','moons','stations','outposts','transactions','cities','terminals','commoditiesByTerminal','itemsByTerminal','commoditiesSummary','itemsSummary','terminalPrices'];
  let loaded = 0;
  for (const p of parts) {
    const val = read(p);
    if (Array.isArray(val)) { state.data[p] = val; loaded++; }
  }
  if (loaded > 0) state.loadedAt = Date.now();
}

async function maybeLoadOnce() {
  if (!state.loadedAt) {
    loadFromDisk();
    try { buildRelations(); } catch {}
  }
}

// Optional: attempt to refresh from Postgres when tables exist.
async function refreshFromDb() {
  try {
    const client = await pool.connect();
    try {
      const tryQuery = async (sql) => {
        try { return await client.query(sql); } catch { return { rows: [] }; }
      };
      const items = (await tryQuery('select name, code, type from items limit 5000')).rows;
      const prices = (await tryQuery('select item, location, buy, sell, currency, ts from prices order by ts desc limit 20000')).rows;
      const locations = (await tryQuery('select name, type, parent, system, orbit from locations limit 10000')).rows;
      const systems = (await tryQuery('select name, code, live, "default" as default, visible, factions, jurisdiction from systems limit 1000')).rows;
      const planets = (await tryQuery('select name, code, system, factions, jurisdiction from planets limit 5000')).rows;
      const moons = (await tryQuery('select name, planet, system from moons limit 5000')).rows;
      const stations = (await tryQuery('select name, system, planet, orbit, features from stations limit 5000')).rows;
      const outposts = (await tryQuery('select name, system, planet, features from outposts limit 5000')).rows;
      const transactions = (await tryQuery('select item, location, qty, price, side, ts from transactions order by ts desc limit 50000')).rows;
      state.data = {
        items, prices, locations, systems, planets, moons, stations, outposts, transactions,
        cities: [], terminals: [], commoditiesByTerminal: [], itemsByTerminal: [], commoditiesSummary: [], itemsSummary: [], terminalPrices: [],
      };
      state.loadedAt = Date.now();
      try { buildRelations(); } catch {}
      // If DB provided nothing for core world topology, fall back to UEX API to seed cache
      const coreCounts = [systems?.length || 0, planets?.length || 0, stations?.length || 0, outposts?.length || 0].reduce((a,b)=>a+b,0);
      if (coreCounts === 0) {
        await refreshFromUex();
      }
      return true;
    } finally {
      client.release();
    }
  } catch {
    // No DB or tables — try UEX fallback, if available.
    try {
      await refreshFromUex();
      return true;
    } catch {
      return false;
    }
  }
}

// Build a simplified features array from many booleans
function collectFeatures(obj = {}) {
  const features = [];
  const flag = (k, label) => { if (obj[k]) features.push(label); };
  flag('has_trade_terminal', 'Trade Terminal');
  flag('has_habitation', 'Habitation');
  flag('has_refinery', 'Refinery');
  flag('has_cargo_center', 'Cargo Center');
  flag('has_clinic', 'Clinic');
  flag('has_food', 'Food/Bar');
  flag('has_shops', 'Shops');
  flag('has_refuel', 'Refuel');
  flag('has_repair', 'Repair');
  flag('has_gravity', 'Gravity');
  flag('has_loading_dock', 'Loading Dock');
  flag('has_docking_port', 'Docking Port');
  flag('has_freight_elevator', 'Freight Elevator');
  return features;
}

// Fallback: load structured world data from UEX HTTP API via models
async function refreshFromUex() {
  if (!UexStarSystemsModel || !UexPlanetsModel || !UexSpaceStationsModel || !UexOutpostsModel) return false;
  try {
    // Fetch in parallel (gracefully handle optional models)
    const [sysRows, planetRows, stationRows, outpostRows, cityRows, terminalRows, cbtRows, ibtRows, csRows, isRows, tpRows] = await Promise.all([
      UexStarSystemsModel.list().catch(()=>[]),
      UexPlanetsModel.list().catch(()=>[]),
      UexSpaceStationsModel.list().catch(()=>[]),
      UexOutpostsModel.list().catch(()=>[]),
      (UexCitiesModel?.list ? UexCitiesModel.list().catch(()=>[]) : Promise.resolve([])),
      (UexTerminalModel?.list ? UexTerminalModel.list().catch(()=>[]) : Promise.resolve([])),
      (UexCommoditiesByTerminalModel?.list ? UexCommoditiesByTerminalModel.list().catch(()=>[]) : Promise.resolve([])),
      (UexItemsByTerminalModel?.list ? UexItemsByTerminalModel.list().catch(()=>[]) : Promise.resolve([])),
      (UexCommoditiesSummaryModel?.list ? UexCommoditiesSummaryModel.list().catch(()=>[]) : Promise.resolve([])),
      (UexItemsSummaryModel?.list ? UexItemsSummaryModel.list().catch(()=>[]) : Promise.resolve([])),
      (UexTerminalPricesModel?.list ? UexTerminalPricesModel.list().catch(()=>[]) : Promise.resolve([])),
    ]);

    // Map to simplified cache shapes used by answerers and relations
    const systems = (sysRows || []).map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      live: Boolean(r.is_available_live || r.is_available),
      default: Boolean(r.is_default),
      visible: Boolean(r.is_visible),
      factions: r.faction_name ? [r.faction_name] : undefined,
      jurisdiction: r.jurisdiction_name || undefined,
    }));
    const planets = (planetRows || []).map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      system: r.star_system_name || undefined,
      id_star_system: r.id_star_system,
      live: Boolean(r.is_available_live || r.is_available),
      default: Boolean(r.is_default),
      visible: Boolean(r.is_visible),
      factions: r.faction_name ? [r.faction_name] : undefined,
      jurisdiction: r.jurisdiction_name || undefined,
    }));
    const stations = (stationRows || []).map(r => ({
      id: r.id,
      name: r.name || r.nickname || undefined,
      system: r.star_system_name || undefined,
      planet: r.planet_name || undefined,
      orbit: r.orbit_name || undefined,
      id_star_system: r.id_star_system,
      id_planet: r.id_planet,
      id_city: r.id_city,
      default: Boolean(r.is_default),
      features: collectFeatures(r),
    })).filter(s => s.name && s.id);
    const outposts = (outpostRows || []).map(r => ({
      id: r.id,
      name: r.name || r.nickname || undefined,
      system: r.star_system_name || undefined,
      planet: r.planet_name || undefined,
      id_star_system: r.id_star_system,
      id_planet: r.id_planet,
      default: Boolean(r.is_default),
      features: collectFeatures(r),
    })).filter(o => o.name && o.id);
    const cities = (cityRows || []).map(r => ({
      id: r.id,
      name: r.name,
      system: r.star_system_name || undefined,
      planet: r.planet_name || undefined,
      id_star_system: r.id_star_system,
      id_planet: r.id_planet,
    })).filter(c => c.name && c.id);
    const terminals = (terminalRows || []).map(r => ({
      id: r.id,
      name: r.name || r.nickname || r.code || undefined,
      system: r.star_system_name || undefined,
      planet: r.planet_name || undefined,
      id_star_system: r.id_star_system,
      id_planet: r.id_planet,
      id_space_station: r.id_space_station,
      id_outpost: r.id_outpost,
      id_city: r.id_city,
      type: r.type || undefined,
      // Common service flags captured for summaries
      is_habitation: Boolean(r.is_habitation),
      is_refinery: Boolean(r.is_refinery),
      is_cargo_center: Boolean(r.is_cargo_center),
      is_medical: Boolean(r.is_medical),
      is_food: Boolean(r.is_food),
      is_shop_fps: Boolean(r.is_shop_fps),
      is_shop_vehicle: Boolean(r.is_shop_vehicle),
      is_refuel: Boolean(r.is_refuel),
      is_repair: Boolean(r.is_repair),
      has_loading_dock: Boolean(r.has_loading_dock),
      has_docking_port: Boolean(r.has_docking_port),
      has_freight_elevator: Boolean(r.has_freight_elevator),
    })).filter(t => t.name && t.id);
    const commoditiesByTerminal = (cbtRows || []).map(r => ({
      id: r.id,
      id_commodity: r.id_commodity,
      id_terminal: r.id_terminal,
      commodity_name: r.commodity_name,
      terminal_name: r.terminal_name,
      price_buy: r.price_buy,
      price_sell: r.price_sell,
      status_buy: r.status_buy,
      status_sell: r.status_sell,
    }));
    const itemsByTerminal = (ibtRows || []).map(r => ({
      id: r.id,
      id_item: r.id_item,
      id_terminal: r.id_terminal,
      item_name: r.item_name,
      terminal_name: r.terminal_name,
      price_buy: r.price_buy,
      price_sell: r.price_sell,
    }));
    const commoditiesSummary = (csRows || []).map(r => ({
      id: r.id,
      commodity_name: r.commodity_name,
      price_buy_avg: r.price_buy_avg,
      price_sell_avg: r.price_sell_avg,
    }));
    const itemsSummary = (isRows || []).map(r => ({
      id: r.id,
      commodity_name: r.commodity_name,
      price_buy_avg: r.price_buy_avg,
      price_sell_avg: r.price_sell_avg,
    }));
    const terminalPrices = (tpRows || []).map(r => ({ ...r }));

    // Seed cache only if we have at least some core entities
    const coreCounts = [systems.length, planets.length, stations.length, outposts.length].reduce((a,b)=>a+b,0);
    if (coreCounts === 0) return false;

    // Preserve any market data already present (items/prices/transactions), replace world topology
    const { items, prices, locations, moons, transactions } = state.data;
    state.data = {
      items, prices, locations,
      systems, planets, moons: moons || [], stations, outposts,
      cities, terminals, commoditiesByTerminal, itemsByTerminal, commoditiesSummary, itemsSummary, terminalPrices,
      transactions,
    };
    state.loadedAt = Date.now();
    try { buildRelations(); } catch {}
    return true;
  } catch (e) {
    return false;
  }
}

function normalize(s) { return String(s || '').trim().toLowerCase(); }
function fuzzyMatch(hay, needle) {
  hay = normalize(hay); needle = normalize(needle);
  if (!needle) return false;
  return hay.includes(needle);
}

function findItem(name) {
  const n = normalize(name);
  // Prefer explicit items table
  const byItems = state.data.items.find(i => normalize(i.name) === n) || state.data.items.find(i => fuzzyMatch(i.name, n));
  if (byItems) return byItems;
  // Fallback to summarized item names
  const byItemSummary = (state.data.itemsSummary || []).find(r => normalize(r.commodity_name) === n) || (state.data.itemsSummary || []).find(r => fuzzyMatch(r.commodity_name, n));
  if (byItemSummary) return { name: byItemSummary.commodity_name, type: 'item' };
  // Fallback to summarized commodity names (e.g., Laranite)
  const byCommoditySummary = (state.data.commoditiesSummary || []).find(r => normalize(r.commodity_name) === n) || (state.data.commoditiesSummary || []).find(r => fuzzyMatch(r.commodity_name, n));
  if (byCommoditySummary) return { name: byCommoditySummary.commodity_name, type: 'commodity' };
  return null;
}

function whereItemAvailable(itemName) {
  const n = normalize(itemName);
  // 1) Use explicit prices, if any
  const rows = state.data.prices.filter(p => normalize(p.item) === n || fuzzyMatch(p.item, n));
  if (rows && rows.length) return rows;
  // 2) Synthesize rows from UEX terminal relationships when prices table is empty
  const rel = state.relations || {};
  const terminalsById = rel.terminalsById || {};
  const systemsById = rel.systemsById || {};
  const planetsById = rel.planetsById || {};
  const stationsById = rel.stationsById || {};
  const outpostsById = rel.outpostsById || {};
  const citiesById = rel.citiesById || {};

  const makeLocString = (t) => {
    if (!t) return '';
    const sys = t.id_star_system != null ? systemsById[String(t.id_star_system)] : null;
    const pl = t.id_planet != null ? planetsById[String(t.id_planet)] : null;
    const st = t.id_space_station != null ? stationsById[String(t.id_space_station)] : null;
    const op = t.id_outpost != null ? outpostsById[String(t.id_outpost)] : null;
    const ci = t.id_city != null ? citiesById[String(t.id_city)] : null;
    // Compose a readable, filter-friendly location string that includes the system
    const leaf = (st?.name || op?.name || ci?.name || pl?.name || t.name);
    const mid = pl?.name && (st || op || ci) ? `${pl.name}` : (pl?.name || null);
    const parts = [leaf, mid, sys?.name].filter(Boolean);
    return parts.join(' / ');
  };

  const out = [];
  // Commodities
  for (const r of state.data.commoditiesByTerminal || []) {
    const nm = normalize(r.commodity_name);
    if (!(nm === n || fuzzyMatch(nm, n))) continue;
    const t = terminalsById[String(r.id_terminal)] || null;
    out.push({
      item: r.commodity_name,
      location: makeLocString(t),
      buy: r.price_buy != null ? Number(r.price_buy) : undefined,
      sell: r.price_sell != null ? Number(r.price_sell) : undefined,
      currency: 'aUEC',
      ts: undefined,
      // Enriched geo fields for precise filtering
      id_terminal: t?.id,
      id_star_system: t?.id_star_system,
      star_system_name: t?.system,
      id_planet: t?.id_planet,
      planet_name: t?.planet,
      id_space_station: t?.id_space_station,
      id_outpost: t?.id_outpost,
      id_city: t?.id_city,
    });
  }
  // Items
  for (const r of state.data.itemsByTerminal || []) {
    const nm = normalize(r.item_name);
    if (!(nm === n || fuzzyMatch(nm, n))) continue;
    const t = terminalsById[String(r.id_terminal)] || null;
    out.push({
      item: r.item_name,
      location: makeLocString(t),
      buy: r.price_buy != null ? Number(r.price_buy) : undefined,
      sell: r.price_sell != null ? Number(r.price_sell) : undefined,
      currency: 'aUEC',
      ts: undefined,
      id_terminal: t?.id,
      id_star_system: t?.id_star_system,
      star_system_name: t?.system,
      id_planet: t?.id_planet,
      planet_name: t?.planet,
      id_space_station: t?.id_space_station,
      id_outpost: t?.id_outpost,
      id_city: t?.id_city,
    });
  }
  return out;
}

function listByType(type) {
  const n = normalize(type);
  if (n === 'system' || n === 'systems') return state.data.systems;
  if (n === 'planet' || n === 'planets') return state.data.planets;
  if (n === 'moon' || n === 'moons') return state.data.moons;
  if (n === 'station' || n === 'stations') return state.data.stations;
  if (n === 'outpost' || n === 'outposts') return state.data.outposts;
  return [];
}

function summarizeMovement(scope = 'commodity', locationName = null) {
  const tx = state.data.transactions;
  if (!Array.isArray(tx) || !tx.length) return [];
  const key = (row) => (scope === 'terminal') ? `${row.location}` : `${row.item}`;
  const filtered = locationName ? tx.filter(t => normalize(t.location) === normalize(locationName)) : tx;
  const map = new Map();
  for (const t of filtered) {
    const k = key(t);
    const cur = map.get(k) || { key: k, buys: 0, sells: 0, qty: 0 };
    cur.qty += Number(t.qty || 0);
    if (t.side === 'buy') cur.buys += Number(t.qty || 0);
    if (t.side === 'sell') cur.sells += Number(t.qty || 0);
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
}

// Build fast lookup indexes and adjacency lists for relationships
function buildRelations() {
  const d = state.data;
  const toMap = (arr, key) => {
    const m = Object.create(null);
    for (const x of Array.isArray(arr) ? arr : []) {
      const k = x && x[key];
      if (k !== undefined && k !== null) m[String(k)] = x;
    }
    return m;
  };
  const normalizeName = (s) => String(s || '').trim().toLowerCase();
  const byName = (arr) => {
    const m = Object.create(null);
    for (const x of Array.isArray(arr) ? arr : []) {
      const nm = normalizeName(x?.name);
      if (nm) m[nm] = x.id || x.name;
    }
    return m;
  };

  const systemsById = toMap(d.systems, 'id');
  const planetsById = toMap(d.planets, 'id');
  const stationsById = toMap(d.stations, 'id');
  const citiesById = toMap(d.cities, 'id');
  const outpostsById = toMap(d.outposts, 'id');
  const terminalsById = toMap(d.terminals, 'id');

  const systemChildren = Object.create(null);
  const planetChildren = Object.create(null);
  const stationChildren = Object.create(null);
  const outpostChildren = Object.create(null);
  const cityChildren = Object.create(null);

  const ensureSystemChild = (sid, kind) => {
    const k = String(sid);
    if (!systemChildren[k]) systemChildren[k] = { planets: [], stations: [], cities: [], outposts: [], terminals: [] };
    if (!systemChildren[k][kind]) systemChildren[k][kind] = [];
    return systemChildren[k][kind];
  };
  const ensurePlanetChild = (pid) => {
    const k = String(pid);
    if (!planetChildren[k]) planetChildren[k] = { stations: [], cities: [], outposts: [], terminals: [] };
    return planetChildren[k];
  };

  // Populate children for systems and planets
  for (const p of d.planets) {
    if (p.id_star_system != null) ensureSystemChild(p.id_star_system, 'planets').push(p.id);
  }
  for (const s of d.stations) {
    if (s.id_star_system != null) ensureSystemChild(s.id_star_system, 'stations').push(s.id);
    if (s.id_planet != null) ensurePlanetChild(s.id_planet).stations.push(s.id);
  }
  for (const c of d.cities) {
    if (c.id_star_system != null) ensureSystemChild(c.id_star_system, 'cities').push(c.id);
    if (c.id_planet != null) ensurePlanetChild(c.id_planet).cities.push(c.id);
  }
  for (const o of d.outposts) {
    if (o.id_star_system != null) ensureSystemChild(o.id_star_system, 'outposts').push(o.id);
    if (o.id_planet != null) ensurePlanetChild(o.id_planet).outposts.push(o.id);
  }
  for (const t of d.terminals) {
    if (t.id_star_system != null) ensureSystemChild(t.id_star_system, 'terminals').push(t.id);
    if (t.id_planet != null) ensurePlanetChild(t.id_planet).terminals.push(t.id);
    if (t.id_space_station != null) {
      const k = String(t.id_space_station);
      if (!stationChildren[k]) stationChildren[k] = { terminals: [] };
      stationChildren[k].terminals.push(t.id);
    }
    if (t.id_outpost != null) {
      const k = String(t.id_outpost);
      if (!outpostChildren[k]) outpostChildren[k] = { terminals: [] };
      outpostChildren[k].terminals.push(t.id);
    }
    if (t.id_city != null) {
      const k = String(t.id_city);
      if (!cityChildren[k]) cityChildren[k] = { terminals: [] };
      cityChildren[k].terminals.push(t.id);
    }
  }

  // Terminal references: traded goods and price snapshots per terminal
  const terminalRefs = Object.create(null);
  for (const r of d.commoditiesByTerminal) {
    const idt = String(r.id_terminal);
    if (!terminalRefs[idt]) terminalRefs[idt] = { commodities: [], items: [], prices: [] };
    terminalRefs[idt].commodities.push(r);
  }
  for (const r of d.itemsByTerminal) {
    const idt = String(r.id_terminal);
    if (!terminalRefs[idt]) terminalRefs[idt] = { commodities: [], items: [], prices: [] };
    terminalRefs[idt].items.push(r);
  }
  for (const r of d.terminalPrices) {
    const idt = String(r.id_terminal);
    if (!terminalRefs[idt]) terminalRefs[idt] = { commodities: [], items: [], prices: [] };
    terminalRefs[idt].prices.push(r);
  }

  state.relations = {
    systemsById,
    planetsById,
    stationsById,
    citiesById,
    outpostsById,
    terminalsById,
    systemChildren,
    planetChildren,
    stationChildren,
    outpostChildren,
    cityChildren,
    byName: {
      systems: byName(d.systems),
      planets: byName(d.planets),
      stations: byName(d.stations),
      cities: byName(d.cities),
      outposts: byName(d.outposts),
      terminals: byName(d.terminals),
    },
    terminalRefs,
  };
}

module.exports = {
  maybeLoadOnce,
  refreshFromDb,
  // Expose UEX refresh for manual forcing if needed
  refreshFromUex,
  getCache: () => state.data,
  getRelations: () => state.relations,
  findItem,
  whereItemAvailable,
  listByType,
  summarizeMovement,
};
