const UEX = require('../api/uexApi.js');

const cacheStore = new Map();
const UEX_CACHE_DEBUG = (process.env.UEX_CACHE_DEBUG || 'true').toLowerCase() === 'true';
const LOG_COMMODITIES_SNAPSHOT = (process.env.UEX_CACHE_COMMODITIES_SNAPSHOT || 'false').toLowerCase() === 'true';
const SNAPSHOT_TO_DATASET = {
  terminalPrices: 'terminal_prices',
  terminals: 'terminals',
  commodities: 'commodities',
  cities: 'cities',
  outposts: 'outposts',
  planets: 'planets',
  spaceStations: 'space_stations',
  starSystems: 'star_systems',
};

// Map of dataset labels -> API loader used for DB hydration
const DATASET_LOADERS = {
  marketplace_averages: UEX.getAllMarketAverages,
  commodities: UEX.getAllCommodities,
  terminals: UEX.getAllTerminals,
  terminal_prices: UEX.getAllTerminalPrices,
  commodities_by_terminal: UEX.getAllTerminalCommodities,
  item_categories: UEX.getAllItemCategories,
  items: UEX.getAllItems,
  items_by_terminal: UEX.getAllTerminalItems,
  cities: UEX.getAllCities,
  outposts: UEX.getAllOutposts,
  planets: UEX.getAllPlanets,
  space_stations: UEX.getAllSpaceStations,
  star_systems: UEX.getAllStarSystems,
  moons: UEX.getAllMoons,
  refineries_yields: UEX.getAllRefineryYields,
};

function normalizeRecords(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => normalizeRecords(entry));
  }
  if (typeof payload === 'object') {
    if (Array.isArray(payload.data)) return payload.data;
    return [payload];
  }
  return [];
}

function refreshUexCache(label, payload, meta = {}) {
  const entry = {
    label,
    records: normalizeRecords(payload),
    raw: payload,
    lastUpdated: meta.lastUpdated || new Date().toISOString(),
    source: meta.source || 'runtime',
    info: meta.info,
  };
  cacheStore.set(label, entry);
  if (UEX_CACHE_DEBUG) {
    console.log(`[UEXCache] Loaded ${label} (${entry.records.length} records) from ${entry.source}`);
    if (label === 'commodities' && LOG_COMMODITIES_SNAPSHOT) {
      console.log('[UEXCache][Debug] Commodities dataset snapshot:', JSON.stringify(entry.records, null, 2));
    }
  }
  return entry;
}

function getUexCache(label) {
  if (!cacheStore.has(label)) {
    return { label, records: [], raw: null, lastUpdated: null, source: null, info: null };
  }
  return cacheStore.get(label);
}

function getUexCacheRecords(label) {
  return getUexCache(label).records;
}

function getUexCacheState() {
  return cacheStore;
}

function getUexCacheLabels() {
  return Array.from(cacheStore.keys());
}

function getUexCacheSummary() {
  return getUexCacheLabels().map((label) => {
    const entry = getUexCache(label);
    return {
      label,
      count: entry.records.length,
      lastUpdated: entry.lastUpdated,
      source: entry.source,
      info: entry.info,
    };
  });
}

async function hydrateUexCachesFromDb({ labels } = {}) {
  const targets = Array.isArray(labels) && labels.length ? labels : Object.keys(DATASET_LOADERS);
  for (const label of targets) {
    const loader = DATASET_LOADERS[label];
    if (typeof loader !== 'function') continue;
    try {
      const payload = await loader();
      refreshUexCache(label, payload, { source: 'database', info: 'hydrate' });
    } catch (e) {
      console.error(`[UEXCache] Hydrate failed for ${label}:`, e?.message || e);
    }
  }
}

function primeUexCacheFromSnapshot(snapshot = {}, meta = {}) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  let primed = 0;
  for (const [snapshotKey, datasetLabel] of Object.entries(SNAPSHOT_TO_DATASET)) {
    const records = snapshot[snapshotKey];
    if (!Array.isArray(records) || records.length === 0) continue;
    refreshUexCache(datasetLabel, records, {
      source: meta.source || 'snapshot',
      info: meta.info || `prime:${snapshotKey}`,
      lastUpdated: meta.lastUpdated,
    });
    primed += 1;
  }
  return primed;
}

module.exports = {
  refreshUexCache,
  getUexCache,
  getUexCacheRecords,
  getUexCacheState,
  getUexCacheLabels,
  getUexCacheSummary,
  hydrateUexCachesFromDb,
  DATASET_LOADERS,
  primeUexCacheFromSnapshot,
};
