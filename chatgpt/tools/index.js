const FALLBACK_LIMIT = 8;
const ITEM_NAME_FIELDS = ['item_name', 'item', 'commodity_name', 'commodity', 'commodityName', 'name', 'label'];
const LOCATION_FIELDS = ['terminal_name', 'terminal', 'location', 'station', 'space_station_name', 'outpost_name', 'city_name', 'moon_name', 'planet_name'];
const BUY_PRICE_FIELDS = ['buy_price', 'buy', 'best_buy', 'price', 'price_buy', 'price_buy_avg', 'price_buy_max', 'price_buy_min'];
const SELL_PRICE_FIELDS = ['sell_price', 'sell', 'best_sell', 'median_price', 'price_sell', 'price_sell_avg', 'price_sell_max', 'price_sell_min'];
const MARKETPLACE_CATEGORY_FIELDS = ['category_name', 'item_category', 'category', 'category_label'];
const COMMODITY_NAME_FIELDS = ['commodity_name', 'commodity', 'name', 'label'];
const ITEM_ONLY_NAME_FIELDS = ['item_name', 'item', 'name', 'label'];
const LOCATION_DATASET_FIELDS = {
  terminals: ['terminal_name', 'name', 'label', 'station', 'location'],
  cities: ['city_name', 'name', 'label'],
  outposts: ['outpost_name', 'name', 'label'],
  planets: ['planet_name', 'name', 'label'],
  moons: ['moon_name', 'name', 'label'],
  space_stations: ['space_station_name', 'station_name', 'name', 'label'],
  star_systems: ['star_system_name', 'system_name', 'name', 'label'],
  refineries_yields: ['refinery_name', 'name', 'label'],
};
const TERMINAL_NAME_FIELDS = ['terminal_name', 'name', 'label', 'station', 'location', 'nickname'];
const REFINERY_KEYWORD_REGEX = /\b(refinery|refine|refining|yield|yields|processing)\b/;
const REFINERY_LOCATION_FIELDS = [...new Set([...LOCATION_FIELDS, 'star_system_name', 'system_name', 'refinery_name'])];
const LOCATION_PARENT_FIELDS = ['star_system_name', 'system_name', 'planet_name', 'moon_name', 'orbit_name', 'city_name', 'outpost_name', 'space_station_name'];
const LOCATION_COORD_FIELDS = ['latitude', 'longitude', 'altitude'];
const LOCATION_FEATURE_FIELDS = [
  'has_trade_terminal',
  'has_refinery',
  'has_cargo_center',
  'has_clinic',
  'has_food',
  'has_shops',
  'has_refuel',
  'has_repair',
  'has_gravity',
  'has_loading_dock',
  'has_docking_port',
  'has_freight_elevator',
  'is_armistice',
  'is_landable',
];
const MARKET_LOOKUP_REFRESH_MS = 5 * 60 * 1000;
const MARKET_CATALOG_SAMPLE_LIMIT = 25;
const MARKETPLACE_KEYWORD_REGEX = /\b(player market|marketplace|market averages?|auc|trade board|player listings)\b/;
const ITEM_MARKET_KEYWORD_REGEX = /\b(weapon|weapons|rifle|pistol|armor|suit|undersuit|component|components|module|modules|item shop|gear)\b/;
const COMMODITY_KEYWORD_REGEX = /\b(commodity|commodities|ore|hauling|haul|cargo|mining|mined|mineral)\b/;
const HIT_VALUE_FIELDS = ['total_value', 'totalValue', 'value', 'credits', 'reward', 'payout'];
const HIT_TARGET_FIELDS = ['target', 'pilot', 'player', 'victim', 'ship_owner'];
const HIT_SHIP_FIELDS = ['ship', 'ship_type', 'ship_model', 'ship_class'];
const HIT_ROUTE_ORIGIN_FIELDS = ['route_origin', 'origin', 'origin_system', 'origin_location', 'start', 'from'];
const HIT_ROUTE_DEST_FIELDS = ['route_destination', 'destination', 'destination_system', 'destination_location', 'end', 'to', 'location'];
const HIT_TIMESTAMP_FIELDS = ['timestamp', 'created_at', 'createdAt', 'updated_at', 'updatedAt'];
const LEADERBOARD_SCORE_FIELDS = ['score', 'sb_score', 'rating', 'points', 'rank_points', 'total_score'];
const LEADERBOARD_KD_FIELDS = ['kd', 'kdr', 'kill_death', 'kill_death_ratio'];
const LEADERBOARD_WIN_FIELDS = ['wins', 'win_count', 'victories'];
const LOCATION_RELATION_REFRESH_MS = 5 * 60 * 1000;
const LOCATION_ALIAS_CANONICALS = new Map();
let marketLookupCache = {
  builtAt: 0,
  commodities: { entries: [], names: [] },
  items: { entries: [], names: [] },
  locations: { entries: [], namesByType: {} },
  catalogSummary: null,
};
let locationRelationCache = { builtAt: 0, relations: null };

function safeJson(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

function takeLast(arr, limit = FALLBACK_LIMIT) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const start = Math.max(0, arr.length - limit);
  return arr.slice(start);
}

function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}
const LOCATION_ALIAS_MAP = (() => {
  const map = new Map();
  const register = (canonical, aliases = []) => {
    const canonicalNormalized = normalizeName(canonical);
    if (!canonicalNormalized) return;
    map.set(canonicalNormalized, canonicalNormalized);
    const bucket = LOCATION_ALIAS_CANONICALS.get(canonicalNormalized) || new Set();
    bucket.add(canonicalNormalized);
    for (const alias of aliases) {
      const normalizedAlias = normalizeName(alias);
      if (!normalizedAlias) continue;
      map.set(normalizedAlias, canonicalNormalized);
      bucket.add(normalizedAlias);
    }
    LOCATION_ALIAS_CANONICALS.set(canonicalNormalized, bucket);
  };

  register('crusader', ['stanton ii', 'stanton 2', 'stanton-2', 'stanton-ii', 'stantonii', 'stanton2']);
  register('hurston', ['stanton i', 'stanton 1', 'stanton-1', 'stanton-i', 'stantoni', 'stanton1']);
  register('arccorp', ['arc corp', 'arc-corp', 'stanton iii', 'stanton 3', 'stanton-3', 'stanton-iii', 'stantoniii', 'stanton3']);
  register('microtech', ['micro tech', 'micro-tech', 'stanton iv', 'stanton 4', 'stanton-4', 'stanton-iv', 'stantoniv', 'stanton4']);

  return map;
})();

function canonicalizeLocationName(value) {
  if (value == null) return null;
  const normalized = normalizeName(value);
  if (!normalized) return null;
  return LOCATION_ALIAS_MAP.get(normalized) || normalized;
}

function getLocationAliasVariants(value) {
  const normalized = normalizeName(value);
  if (!normalized) return [];
  const canonical = canonicalizeLocationName(normalized);
  if (!canonical) return [normalized];
  const bucket = LOCATION_ALIAS_CANONICALS.get(canonical);
  if (!bucket || !bucket.size) return [canonical];
  return Array.from(bucket);
}

function buildLocationNameVariants(name) {
  const variants = new Set();
  const normalized = normalizeName(name);
  if (!normalized) return [];
  variants.add(normalized);
  const canonical = canonicalizeLocationName(normalized);
  if (canonical) variants.add(canonical);
  const aliasVariants = getLocationAliasVariants(normalized);
  for (const alias of aliasVariants) {
    if (alias) variants.add(alias);
  }
  if (normalized.includes('(')) {
    const beforeParen = normalizeName(normalized.split('(')[0]);
    if (beforeParen && beforeParen.length >= 3) variants.add(beforeParen);
  }
  if (normalized.includes(',')) {
    normalized.split(',').forEach((part) => {
      const trimmed = normalizeName(part);
      if (trimmed && trimmed.length >= 3) variants.add(trimmed);
    });
  }
  return Array.from(variants).filter((entry) => entry && entry.length >= 3);
}

function getLocationDisplayName(record, dataset) {
  if (!record) return null;
  const fields = LOCATION_DATASET_FIELDS[dataset] || ['name', 'label'];
  return getStringField(record, fields) || record.name || record.label || null;
}

function registerLocationLookup(lookups, dataset, record) {
  if (!lookups || !lookups[dataset] || !record) return;
  const id = normalizeId(record.id);
  const name = getLocationDisplayName(record, dataset);
  const canonicalName = canonicalizeLocationName(name);
  if (id) lookups[dataset].byId.set(id, record);
  if (canonicalName) lookups[dataset].byName.set(canonicalName, record);
}

function resolveRecordFromLookups(lookups, dataset, idValue, nameValue) {
  if (!lookups || !lookups[dataset]) return null;
  const normalizedId = normalizeId(idValue);
  if (normalizedId && lookups[dataset].byId.has(normalizedId)) {
    return lookups[dataset].byId.get(normalizedId);
  }
  const canonicalName = canonicalizeLocationName(nameValue);
  if (canonicalName && lookups[dataset].byName.has(canonicalName)) {
    return lookups[dataset].byName.get(canonicalName);
  }
  return null;
}

function summarizeNames(names = []) {
  const unique = Array.from(new Set(names.filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b));
  return {
    count: unique.length,
    samples: unique.slice(0, MARKET_CATALOG_SAMPLE_LIMIT),
  };
}

function ensureLocationRelations() {
  const now = Date.now();
  if (locationRelationCache.relations && now - locationRelationCache.builtAt < LOCATION_RELATION_REFRESH_MS) {
    return locationRelationCache.relations;
  }
  const cache = globalThis.uexCache;
  if (!cache || typeof cache.getRecords !== 'function') {
    locationRelationCache = { builtAt: now, relations: null };
    return null;
  }

  const lookupDatasets = ['star_systems', 'planets', 'moons', 'space_stations', 'cities', 'outposts'];
  const lookups = {};
  for (const dataset of lookupDatasets) {
    lookups[dataset] = { byId: new Map(), byName: new Map() };
  }

  const relations = {
    planetToStarSystem: new Map(),
    moonToPlanet: new Map(),
    moonToStarSystem: new Map(),
    cityToPlanet: new Map(),
    cityToMoon: new Map(),
    cityToStarSystem: new Map(),
    outpostToPlanet: new Map(),
    outpostToMoon: new Map(),
    outpostToStarSystem: new Map(),
    stationToPlanet: new Map(),
    stationToMoon: new Map(),
    stationToStarSystem: new Map(),
    lookups,
  };

  const starSystems = cache.getRecords('star_systems') || [];
  for (const system of starSystems) {
    registerLocationLookup(lookups, 'star_systems', system);
  }

  const planets = cache.getRecords('planets') || [];
  for (const planet of planets) {
    registerLocationLookup(lookups, 'planets', planet);
    const pid = normalizeId(planet.id);
    const sysId = normalizeId(planet.id_star_system);
    if (pid && sysId) relations.planetToStarSystem.set(pid, sysId);
  }

  const moons = cache.getRecords('moons') || [];
  for (const moon of moons) {
    registerLocationLookup(lookups, 'moons', moon);
    const mid = normalizeId(moon.id);
    if (!mid) continue;
    const pid = normalizeId(moon.id_planet);
    const sysId = normalizeId(moon.id_star_system);
    if (pid) relations.moonToPlanet.set(mid, pid);
    if (sysId) relations.moonToStarSystem.set(mid, sysId);
  }

  const cities = cache.getRecords('cities') || [];
  for (const city of cities) {
    registerLocationLookup(lookups, 'cities', city);
    const cid = normalizeId(city.id);
    if (!cid) continue;
    const pid = normalizeId(city.id_planet);
    const mid = normalizeId(city.id_moon);
    const sysId = normalizeId(city.id_star_system);
    if (pid) relations.cityToPlanet.set(cid, pid);
    if (mid) relations.cityToMoon.set(cid, mid);
    if (sysId) relations.cityToStarSystem.set(cid, sysId);
  }

  const outposts = cache.getRecords('outposts') || [];
  for (const outpost of outposts) {
    registerLocationLookup(lookups, 'outposts', outpost);
    const oid = normalizeId(outpost.id);
    if (!oid) continue;
    const pid = normalizeId(outpost.id_planet);
    const mid = normalizeId(outpost.id_moon);
    const sysId = normalizeId(outpost.id_star_system);
    if (pid) relations.outpostToPlanet.set(oid, pid);
    if (mid) relations.outpostToMoon.set(oid, mid);
    if (sysId) relations.outpostToStarSystem.set(oid, sysId);
  }

  const stations = cache.getRecords('space_stations') || [];
  for (const station of stations) {
    registerLocationLookup(lookups, 'space_stations', station);
    const sid = normalizeId(station.id);
    if (!sid) continue;
    const pid = normalizeId(station.id_planet);
    const mid = normalizeId(station.id_moon);
    const sysId = normalizeId(station.id_star_system);
    if (pid) relations.stationToPlanet.set(sid, pid);
    if (mid) relations.stationToMoon.set(sid, mid);
    if (sysId) relations.stationToStarSystem.set(sid, sysId);
  }

  locationRelationCache = { builtAt: now, relations };
  return relations;
}

function matchesId(candidate, targetId) {
  if (!candidate || !targetId) return false;
  return normalizeId(candidate) === targetId;
}

function matchesName(candidate, normalizedTarget) {
  if (!candidate || !normalizedTarget) return false;
  const candidateCanonical = canonicalizeLocationName(candidate);
  const targetCanonical = canonicalizeLocationName(normalizedTarget);
  if (!candidateCanonical || !targetCanonical) return false;
  return candidateCanonical === targetCanonical;
}

function looseNameMatch(candidate, target) {
  if (!candidate || !target) return false;
  const normalizedCandidate = normalizeName(candidate);
  const normalizedTarget = normalizeName(target);
  if (!normalizedCandidate || !normalizedTarget) return false;
  const candidateCanonical = canonicalizeLocationName(normalizedCandidate);
  const targetCanonical = canonicalizeLocationName(normalizedTarget);
  if (candidateCanonical && targetCanonical && candidateCanonical === targetCanonical) return true;
  return normalizedCandidate === normalizedTarget
    || normalizedCandidate.includes(normalizedTarget)
    || normalizedTarget.includes(normalizedCandidate);
}

function terminalMatchesLocation(terminal, context) {
  if (!terminal || !context) return false;
  const { locationDataset, locationId, normalizedLocationName, relations = {} } = context;
  const lookups = relations.lookups || null;
  const lookupRecord = (dataset, idValue, nameValue) => resolveRecordFromLookups(lookups, dataset, idValue, nameValue);
  const matchesParentRecord = (record, idField, nameField) => {
    if (!record) return false;
    if (idField && matchesId(record[idField], locationId)) return true;
    if (nameField && matchesName(record[nameField], normalizedLocationName)) return true;
    if (!idField && !nameField) {
      const displayName = getLocationDisplayName(record, locationDataset);
      if (displayName && matchesName(displayName, normalizedLocationName)) return true;
    }
    return false;
  };
  const planetId = normalizeId(terminal.id_planet);
  const moonId = normalizeId(terminal.id_moon);
  const cityId = normalizeId(terminal.id_city);
  const outpostId = normalizeId(terminal.id_outpost);
  const stationId = normalizeId(terminal.id_space_station);

  switch (locationDataset) {
    case 'star_systems':
      if (matchesId(terminal.id_star_system, locationId) || matchesName(terminal.star_system_name, normalizedLocationName)) return true;
      if (planetId && relations.planetToStarSystem?.get(planetId) === locationId) return true;
      if (moonId && relations.moonToStarSystem?.get(moonId) === locationId) return true;
      if (cityId && relations.cityToStarSystem?.get(cityId) === locationId) return true;
      if (outpostId && relations.outpostToStarSystem?.get(outpostId) === locationId) return true;
      if (stationId && relations.stationToStarSystem?.get(stationId) === locationId) return true;
      const planetRecord = lookupRecord('planets', terminal.id_planet, terminal.planet_name);
      if (matchesParentRecord(planetRecord, 'id_star_system', 'star_system_name')) return true;
      const moonRecord = lookupRecord('moons', terminal.id_moon, terminal.moon_name);
      if (matchesParentRecord(moonRecord, 'id_star_system', 'star_system_name')) return true;
      const cityRecord = lookupRecord('cities', terminal.id_city, terminal.city_name);
      if (matchesParentRecord(cityRecord, 'id_star_system', 'star_system_name')) return true;
      const outpostRecord = lookupRecord('outposts', terminal.id_outpost, terminal.outpost_name);
      if (matchesParentRecord(outpostRecord, 'id_star_system', 'star_system_name')) return true;
      const stationRecord = lookupRecord('space_stations', terminal.id_space_station, terminal.space_station_name);
      if (matchesParentRecord(stationRecord, 'id_star_system', 'star_system_name')) return true;
      return false;
    case 'planets':
      if (matchesId(terminal.id_planet, locationId) || matchesName(terminal.planet_name, normalizedLocationName)) return true;
      if (moonId && relations.moonToPlanet?.get(moonId) === locationId) return true;
      if (cityId && relations.cityToPlanet?.get(cityId) === locationId) return true;
      if (outpostId && relations.outpostToPlanet?.get(outpostId) === locationId) return true;
      if (stationId && relations.stationToPlanet?.get(stationId) === locationId) return true;
      const planetRecordSelf = lookupRecord('planets', terminal.id_planet, terminal.planet_name);
      if (matchesParentRecord(planetRecordSelf, 'id', null)) return true;
      const moonRecordForPlanet = lookupRecord('moons', terminal.id_moon, terminal.moon_name);
      if (matchesParentRecord(moonRecordForPlanet, 'id_planet', 'planet_name')) return true;
      const cityRecordForPlanet = lookupRecord('cities', terminal.id_city, terminal.city_name);
      if (matchesParentRecord(cityRecordForPlanet, 'id_planet', 'planet_name')) return true;
      const outpostRecordForPlanet = lookupRecord('outposts', terminal.id_outpost, terminal.outpost_name);
      if (matchesParentRecord(outpostRecordForPlanet, 'id_planet', 'planet_name')) return true;
      const stationRecordForPlanet = lookupRecord('space_stations', terminal.id_space_station, terminal.space_station_name);
      if (matchesParentRecord(stationRecordForPlanet, 'id_planet', 'planet_name')) return true;
      return false;
    case 'moons':
      if (matchesId(terminal.id_moon, locationId) || matchesName(terminal.moon_name, normalizedLocationName)) return true;
      if (cityId && relations.cityToMoon?.get(cityId) === locationId) return true;
      if (outpostId && relations.outpostToMoon?.get(outpostId) === locationId) return true;
      if (stationId && relations.stationToMoon?.get(stationId) === locationId) return true;
      const moonRecordSelf = lookupRecord('moons', terminal.id_moon, terminal.moon_name);
      if (matchesParentRecord(moonRecordSelf, 'id', null)) return true;
      const cityRecordForMoon = lookupRecord('cities', terminal.id_city, terminal.city_name);
      if (matchesParentRecord(cityRecordForMoon, 'id_moon', 'moon_name')) return true;
      const outpostRecordForMoon = lookupRecord('outposts', terminal.id_outpost, terminal.outpost_name);
      if (matchesParentRecord(outpostRecordForMoon, 'id_moon', 'moon_name')) return true;
      const stationRecordForMoon = lookupRecord('space_stations', terminal.id_space_station, terminal.space_station_name);
      if (matchesParentRecord(stationRecordForMoon, 'id_moon', 'moon_name')) return true;
      return false;
    case 'cities':
      return matchesId(terminal.id_city, locationId) || matchesName(terminal.city_name, normalizedLocationName);
    case 'space_stations':
      return matchesId(terminal.id_space_station, locationId) || matchesName(terminal.space_station_name, normalizedLocationName);
    case 'outposts':
      return matchesId(terminal.id_outpost, locationId) || matchesName(terminal.outpost_name, normalizedLocationName);
    case 'terminals':
      if (matchesId(terminal.id, locationId)) return true;
      const terminalName = getStringField(terminal, TERMINAL_NAME_FIELDS) || terminal.name || terminal.terminal_name;
      return matchesName(terminalName, normalizedLocationName);
    default:
      return false;
  }
}

function buildTerminalFallbackMatcher(dataset, normalizedTarget) {
  if (!normalizedTarget) return null;
  const matchFields = ({ planet = false, moon = false, city = false, outpost = false, station = false, system = false, terminal = false }) => {
    return (terminal) => {
      if (!terminal) return false;
      if (system && looseNameMatch(terminal.star_system_name, normalizedTarget)) return true;
      if (planet && looseNameMatch(terminal.planet_name, normalizedTarget)) return true;
      if (moon && looseNameMatch(terminal.moon_name, normalizedTarget)) return true;
      if (city && looseNameMatch(terminal.city_name, normalizedTarget)) return true;
      if (outpost && looseNameMatch(terminal.outpost_name, normalizedTarget)) return true;
      if (station && looseNameMatch(terminal.space_station_name, normalizedTarget)) return true;
      if (terminal && (looseNameMatch(terminal.terminal_name, normalizedTarget) || looseNameMatch(terminal.name, normalizedTarget))) return true;
      return false;
    };
  };

  switch (dataset) {
    case 'star_systems':
      return matchFields({ system: true, planet: true, moon: true, city: true, outpost: true, station: true });
    case 'planets':
      return matchFields({ planet: true, moon: true, city: true, outpost: true, station: true });
    case 'moons':
      return matchFields({ moon: true, city: true, outpost: true, station: true });
    case 'cities':
      return matchFields({ city: true, planet: true, station: true });
    case 'space_stations':
      return matchFields({ station: true, city: true, planet: true });
    case 'outposts':
      return matchFields({ outpost: true, moon: true, planet: true });
    case 'terminals':
      return matchFields({ terminal: true, city: true, station: true, planet: true });
    default:
      return null;
  }
}

function resolveTerminalsForLocation(locationRecord, locationDataset) {
  try {
    if (!locationRecord || !locationDataset) return null;
    const cache = globalThis.uexCache;
    if (!cache || typeof cache.getRecords !== 'function') return null;
    const terminals = cache.getRecords('terminals') || [];
    if (!terminals.length) return null;

    const relations = ensureLocationRelations() || {};
    const locationId = normalizeId(locationRecord.id);
    const locationName = getStringField(locationRecord, LOCATION_DATASET_FIELDS[locationDataset] || ['name', 'label'])
      || locationRecord.name
      || locationRecord.label
      || null;
    const normalizedLocationNameRaw = normalizeName(locationName);
    const normalizedLocationName = canonicalizeLocationName(normalizedLocationNameRaw) || normalizedLocationNameRaw;

    const context = { locationDataset, locationId, normalizedLocationName, relations };
    let matches = terminals.filter((terminal) => terminalMatchesLocation(terminal, context));
    let usedFallback = false;

    if (!matches.length) {
      const fallbackMatcher = buildTerminalFallbackMatcher(locationDataset, normalizedLocationNameRaw || normalizedLocationName);
      if (fallbackMatcher) {
        const fuzzyMatches = terminals.filter((terminal) => fallbackMatcher(terminal));
        if (fuzzyMatches.length) {
          matches = fuzzyMatches;
          usedFallback = true;
        }
      }
    }

    const terminalIds = [];
    const terminalNames = [];
    const samples = matches.slice(0, 10).map((terminal) => {
      const id = normalizeId(terminal.id);
      if (id) terminalIds.push(id);
      const prettyName = getStringField(terminal, TERMINAL_NAME_FIELDS) || terminal.terminal_name || terminal.name || `Terminal ${terminal.id}`;
      if (prettyName) terminalNames.push(prettyName);
      return {
        id: terminal.id,
        name: prettyName,
        star_system_name: terminal.star_system_name || null,
        planet_name: terminal.planet_name || null,
        moon_name: terminal.moon_name || null,
        city_name: terminal.city_name || null,
        outpost_name: terminal.outpost_name || null,
        space_station_name: terminal.space_station_name || null,
      };
    });

    const uniqueIds = Array.from(new Set(terminalIds.filter(Boolean)));
    const uniqueNames = Array.from(new Set(terminalNames.filter(Boolean))).slice(0, 10);

    return {
      locationId,
      locationName,
      locationDataset,
      terminalCount: matches.length,
      terminalIds: uniqueIds,
      terminalNames: uniqueNames,
      sampleTerminals: samples,
      usedFallback,
    };
  } catch (error) {
    console.error('[ChatGPT][Tools] terminal resolution failed:', error?.message || error);
    return null;
  }
}

function buildLookupEntries(records, { dataset, type, nameFields, aliasLocations = false }) {
  const entries = [];
  const names = [];
  for (const record of records || []) {
    const name = getStringField(record, nameFields);
    const normalized = normalizeName(name);
    if (!normalized || normalized.length < 3) continue; // avoid noisy 1-2 char hits
    const normalizedValues = aliasLocations ? buildLocationNameVariants(name) : [normalized];
    for (const normalizedValue of normalizedValues) {
      if (!normalizedValue || normalizedValue.length < 3) continue;
      entries.push({ name, normalized: normalizedValue, dataset, type, record });
    }
    names.push(name);
  }
  entries.sort((a, b) => b.normalized.length - a.normalized.length);
  return { entries, names };
}

function buildMarketLookupCache() {
  const cache = globalThis.uexCache;
  if (!cache || typeof cache.getRecords !== 'function') return marketLookupCache;

  const commodities = cache.getRecords('commodities') || [];
  const items = cache.getRecords('items') || [];

  const commodityLookup = buildLookupEntries(commodities, {
    dataset: 'commodities',
    type: 'commodity',
    nameFields: COMMODITY_NAME_FIELDS,
  });

  const itemLookup = buildLookupEntries(items, {
    dataset: 'items',
    type: 'item',
    nameFields: ITEM_ONLY_NAME_FIELDS,
  });

  const locationEntries = [];
  const locationNamesByType = {};
  const locationDatasets = Object.entries(LOCATION_DATASET_FIELDS);
  for (const [dataset, fields] of locationDatasets) {
    const type = dataset.replace(/_/g, '-');
    const rows = cache.getRecords(dataset) || [];
    const lookup = buildLookupEntries(rows, { dataset, type, nameFields: fields, aliasLocations: true });
    locationEntries.push(...lookup.entries);
    locationNamesByType[type] = summarizeNames(lookup.names);
  }

  const catalogSummary = {
    commodities: summarizeNames(commodityLookup.names),
    items: summarizeNames(itemLookup.names),
    locations: locationNamesByType,
  };

  marketLookupCache = {
    builtAt: Date.now(),
    commodities: commodityLookup,
    items: itemLookup,
    locations: {
      entries: locationEntries,
      namesByType: locationNamesByType,
    },
    catalogSummary,
  };

  return marketLookupCache;
}

function ensureMarketLookupCache() {
  const now = Date.now();
  if (marketLookupCache.builtAt && now - marketLookupCache.builtAt < MARKET_LOOKUP_REFRESH_MS) {
    return marketLookupCache;
  }
  return buildMarketLookupCache();
}

function matchNameInContent(contentLower, entries = []) {
  if (!contentLower) return null;
  for (const entry of entries) {
    if (!entry?.normalized) continue;
    if (contentLower.includes(entry.normalized)) return entry;
  }
  return null;
}

function extractMarketTargets(content) {
  const lookup = ensureMarketLookupCache();
  const text = (content || '').toLowerCase();
  const commodityMatch = matchNameInContent(text, lookup.commodities.entries);
  const itemMatch = commodityMatch ? null : matchNameInContent(text, lookup.items.entries);
  const locationMatch = matchNameInContent(text, lookup.locations.entries);

  const hasRefineryKeyword = REFINERY_KEYWORD_REGEX.test(text);
  const hasMarketplaceKeyword = MARKETPLACE_KEYWORD_REGEX.test(text);
  const hasItemKeyword = ITEM_MARKET_KEYWORD_REGEX.test(text);
  const hasCommodityKeyword = COMMODITY_KEYWORD_REGEX.test(text);
  const locationIsRefinery = locationMatch?.dataset === 'refineries_yields' || (locationMatch?.type || '').includes('refiner');

  let marketType = 'overview';
  if (commodityMatch || itemMatch) {
    marketType = 'commodity';
  }
  if (locationMatch) {
    if (marketType === 'commodity') {
      marketType = 'commodity_location';
    } else {
      marketType = 'location';
    }
  }
  if (hasRefineryKeyword || locationIsRefinery) {
    marketType = (commodityMatch || itemMatch) ? 'refinery' : 'refinery_location';
  }

  let datasetPreference = null;
  if (commodityMatch) {
    datasetPreference = commodityMatch.dataset === 'items' ? 'items' : 'commodities';
  } else if (itemMatch) {
    datasetPreference = 'items';
  } else if (hasMarketplaceKeyword) {
    datasetPreference = 'marketplace';
  } else if (hasItemKeyword) {
    datasetPreference = 'items';
  } else if (hasCommodityKeyword) {
    datasetPreference = 'commodities';
  }
  if (marketType.startsWith('refinery')) {
    datasetPreference = 'refinery';
  }

  const locationTerminals = locationMatch?.record
    ? resolveTerminalsForLocation(locationMatch.record, locationMatch.dataset)
    : null;

  return {
    marketType,
    commodityName: commodityMatch?.name || itemMatch?.name || null,
    commodityDataset: commodityMatch ? commodityMatch.dataset : itemMatch ? itemMatch.dataset : null,
    locationName: locationMatch?.name || null,
    locationDataset: locationMatch?.dataset || null,
    locationType: locationMatch?.type || null,
    locationRecord: locationMatch?.record || null,
    hasRefineryKeyword,
    datasetPreference,
    locationTerminals,
    locationTerminalIds: locationTerminals?.terminalIds || [],
    locationTerminalNames: locationTerminals?.terminalNames || [],
    locationTerminalCount: locationTerminals?.terminalCount || 0,
    locationTerminalSample: locationTerminals?.sampleTerminals || [],
    locationTerminalFallbackUsed: locationTerminals?.usedFallback || false,
    catalogSummary: lookup.catalogSummary,
  };
}

function getRecentChatForChannel(channelId, limit = 10) {
  try {
    const cache = globalThis.chatMessagesCache;
    if (!cache || typeof cache.getForChannel !== 'function') return [];
    const entries = cache.getForChannel(channelId) || [];
    return takeLast(entries, limit).map((entry) => ({
      channel_id: entry.channel_id,
      guild_id: entry.guild_id,
      user_id: entry.user_id,
      content: entry.content,
      timestamp: entry.timestamp,
    }));
  } catch (error) {
    console.error('[ChatGPT][Tools] recent chat lookup failed:', error?.message || error);
    return [];
  }
}

function getUserProfileFromCache(userId) {
  try {
    if (!userId) return null;
    const personaCache = globalThis.userProfilesCache;
    if (personaCache && typeof personaCache.getById === 'function') {
      const profile = personaCache.getById(userId);
      if (profile) return safeJson(profile);
    }
    const cache = globalThis.userListCache;
    if (!cache || typeof cache.getById !== 'function') return null;
    const row = cache.getById(userId);
    return row ? safeJson(row) : null;
  } catch (error) {
    console.error('[ChatGPT][Tools] user profile lookup failed:', error?.message || error);
    return null;
  }
}

function normalizeId(value) {
  return value == null ? null : String(value);
}

function findRowByDiscordId(rows, userId) {
  const target = normalizeId(userId);
  if (!target) return null;
  return rows.find((row) => {
    return [row.discord_id, row.discordId, row.user_id, row.userId, row.discordId].some((field) => normalizeId(field) === target);
  }) || null;
}

function getLeaderboardSnapshot(userId) {
  try {
    const cache = globalThis.leaderboardCache;
    if (!cache || typeof cache.getPlayers !== 'function') return null;
    const players = cache.getPlayers() || [];
    const row = findRowByDiscordId(players, userId);
    return row ? safeJson(row) : null;
  } catch (error) {
    console.error('[ChatGPT][Tools] leaderboard lookup failed:', error?.message || error);
    return null;
  }
}

function getPlayerStatsSnapshot(userId) {
  try {
    const stats = globalThis.playerStatsCache?.getAll?.();
    if (!Array.isArray(stats)) return null;
    const target = normalizeId(userId);
    if (!target) return null;
    const row = stats.find((entry) => [entry.discord_id, entry.user_id, entry.discordId].some((field) => normalizeId(field) === target));
    return row ? safeJson(row) : null;
  } catch (error) {
    console.error('[ChatGPT][Tools] player stats lookup failed:', error?.message || error);
    return null;
  }
}

function parseTimestampValue(entry) {
  if (!entry) return null;
  for (const field of HIT_TIMESTAMP_FIELDS) {
    const raw = entry[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return null;
}

function getHitTimestamp(entry) {
  if (!entry) return null;
  for (const field of HIT_TIMESTAMP_FIELDS) {
    if (entry[field]) return entry[field];
  }
  return null;
}

function getHitValue(entry) {
  const value = getNumberField(entry, HIT_VALUE_FIELDS);
  return Number.isFinite(value) ? value : null;
}

function getHitRouteLabel(entry) {
  if (!entry) return null;
  if (entry.route) return entry.route;
  const origin = getStringField(entry, HIT_ROUTE_ORIGIN_FIELDS);
  const destination = getStringField(entry, HIT_ROUTE_DEST_FIELDS);
  if (origin && destination) return `${origin} -> ${destination}`;
  return destination || origin || entry.system || entry.location || null;
}

function buildHitInsight(entry) {
  if (!entry) return null;
  const value = getHitValue(entry);
  return {
    id: entry.id ?? entry.entry_id ?? null,
    user_id: entry.user_id ?? entry.discord_id ?? entry.owner_id ?? null,
    hunter: entry.username || entry.nickname || entry.handle || entry.author || null,
    target: getStringField(entry, HIT_TARGET_FIELDS),
    ship: getStringField(entry, HIT_SHIP_FIELDS),
    route: getHitRouteLabel(entry),
    value,
    cargo: entry.cargo || entry.cargo_manifest || null,
    timestamp: getHitTimestamp(entry),
    status: entry.status || entry.outcome || null,
    air_or_ground: entry.air_or_ground || entry.engagement_type || null,
  };
}

function getLatestHitEntry() {
  try {
    const hits = globalThis.hitCache?.getAll?.();
    if (!Array.isArray(hits) || !hits.length) return null;
    let latest = null;
    let latestTs = -Infinity;
    for (const entry of hits) {
      const ts = parseTimestampValue(entry);
      if (ts == null) continue;
      if (ts > latestTs) {
        latest = entry;
        latestTs = ts;
      }
    }
    if (!latest) {
      latest = hits[hits.length - 1];
    }
    return buildHitInsight(latest);
  } catch (error) {
    console.error('[ChatGPT][Tools] latest hit lookup failed:', error?.message || error);
    return null;
  }
}

function getTopHitsByValue(limit = 3) {
  try {
    const hits = globalThis.hitCache?.getAll?.();
    if (!Array.isArray(hits) || !hits.length) return [];
    return hits
      .map((entry) => ({ entry, value: getHitValue(entry) }))
      .filter((item) => item.value != null)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map((item) => buildHitInsight(item.entry));
  } catch (error) {
    console.error('[ChatGPT][Tools] top hits lookup failed:', error?.message || error);
    return [];
  }
}

function getPirateRouteStats(limit = 3) {
  try {
    const hits = globalThis.hitCache?.getAll?.();
    if (!Array.isArray(hits) || !hits.length) return [];
    const buckets = new Map();
    for (const entry of hits) {
      const route = getHitRouteLabel(entry);
      if (!route) continue;
      const bucket = buckets.get(route) || { route, count: 0, totalValue: 0, latestTimestamp: null };
      bucket.count += 1;
      const value = getHitValue(entry);
      if (value != null) bucket.totalValue += value;
      const ts = parseTimestampValue(entry);
      if (ts != null) {
        bucket.latestTimestamp = bucket.latestTimestamp == null ? ts : Math.max(bucket.latestTimestamp, ts);
      }
      buckets.set(route, bucket);
    }
    return Array.from(buckets.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return (b.totalValue || 0) - (a.totalValue || 0);
      })
      .slice(0, limit)
      .map((bucket) => ({
        route: bucket.route,
        hits: bucket.count,
        totalValue: bucket.totalValue || null,
        avgValue: bucket.count ? Math.round((bucket.totalValue / bucket.count) * 100) / 100 : null,
        latestTimestamp: bucket.latestTimestamp || null,
      }));
  } catch (error) {
    console.error('[ChatGPT][Tools] route stats lookup failed:', error?.message || error);
    return [];
  }
}

function getPirateInsights({ topHitLimit = 3, routeLimit = 3 } = {}) {
  return {
    latest: getLatestHitEntry(),
    topHits: getTopHitsByValue(topHitLimit),
    topRoutes: getPirateRouteStats(routeLimit),
  };
}

function getLeaderboardTopPilots(limit = 5) {
  try {
    const cache = globalThis.leaderboardCache;
    if (!cache || typeof cache.getPlayers !== 'function') return [];
    const players = cache.getPlayers() || [];
    if (!players.length) return [];
    const ranked = players
      .map((entry) => {
        const score = getNumberField(entry, LEADERBOARD_SCORE_FIELDS);
        const kd = getNumberField(entry, LEADERBOARD_KD_FIELDS);
        const wins = getNumberField(entry, LEADERBOARD_WIN_FIELDS);
        const name = getStringField(entry, ['player_name', 'display_name', 'username', 'discord_name', 'pilot', 'name']) || 'Unknown pilot';
        return {
          name,
          discord_id: entry.discord_id || entry.user_id || entry.discordId || null,
          score,
          kd,
          wins,
          rank: entry.rank || entry.position || null,
          ship: entry.primary_ship || entry.favorite_ship || entry.ship || null,
          updated_at: entry.updated_at || entry.updatedAt || entry.timestamp || null,
        };
      })
      .sort((a, b) => {
        const scoreA = Number.isFinite(a.score) ? a.score : -Infinity;
        const scoreB = Number.isFinite(b.score) ? b.score : -Infinity;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const winA = Number.isFinite(a.wins) ? a.wins : -Infinity;
        const winB = Number.isFinite(b.wins) ? b.wins : -Infinity;
        if (winA !== winB) return winB - winA;
        return (a.name || '').localeCompare(b.name || '');
      });
    return ranked.slice(0, limit);
  } catch (error) {
    console.error('[ChatGPT][Tools] leaderboard highlights lookup failed:', error?.message || error);
    return [];
  }
}

function getChannelDigest(channelId, limit = 8) {
  try {
    if (!channelId) return [];
    const cache = globalThis.chatMessagesCache;
    if (!cache || typeof cache.getForChannel !== 'function') return [];
    const entries = cache.getForChannel(channelId) || [];
    return takeLast(entries, limit).map((entry) => ({
      channel_id: entry.channel_id,
      user_id: entry.user_id,
      username: entry.username || null,
      content: entry.content,
      timestamp: entry.timestamp,
    }));
  } catch (error) {
    console.error('[ChatGPT][Tools] channel digest lookup failed:', error?.message || error);
    return [];
  }
}

function getStringField(entry, keys) {
  for (const key of keys) {
    if (entry && entry[key]) return String(entry[key]);
  }
  return null;
}

function getNumberField(entry, keys) {
  for (const key of keys) {
    if (entry && entry[key] !== undefined && entry[key] !== null) {
      const num = Number(entry[key]);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

function formatUpdatedAt(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

function buildTerminalMetaMap(terminals = []) {
  const map = new Map();
  for (const terminal of terminals) {
    const id = normalizeId(terminal?.id);
    if (!id) continue;
    const name = getStringField(terminal, TERMINAL_NAME_FIELDS) || terminal?.terminal_name || terminal?.name || `Terminal ${terminal.id}`;
    const locationParts = [
      terminal?.city_name,
      terminal?.outpost_name,
      terminal?.space_station_name,
      terminal?.moon_name,
      terminal?.planet_name,
      terminal?.star_system_name,
    ].map((value) => (value ? String(value).trim() : '')).filter(Boolean);
    map.set(id, {
      id,
      name,
      locationLabel: locationParts.length ? locationParts.join(' / ') : null,
      planetName: terminal?.planet_name || null,
      moonName: terminal?.moon_name || null,
      cityName: terminal?.city_name || null,
      stationName: terminal?.space_station_name || null,
      systemName: terminal?.star_system_name || null,
    });
  }
  return map;
}

function projectMarketEntry(entry, dataset = 'terminal_prices') {
  const item = getStringField(entry, ITEM_NAME_FIELDS) || 'Unknown item';
  const location = getStringField(entry, LOCATION_FIELDS) || 'Unknown terminal';
  const buyPrice = getNumberField(entry, BUY_PRICE_FIELDS);
  const sellPrice = getNumberField(entry, SELL_PRICE_FIELDS);
  const updatedAtRaw = entry.updated_at || entry.last_updated || entry.timestamp || entry.date_modified || entry.date_added || null;
  return { item, location, buyPrice, sellPrice, updatedAt: formatUpdatedAt(updatedAtRaw), dataset };
}

function sortByValueDesc(a, b) {
  const valueA = (a.sellPrice ?? a.buyPrice ?? 0);
  const valueB = (b.sellPrice ?? b.buyPrice ?? 0);
  return valueB - valueA;
}

function projectRecordSample(records, { limit = 5, dataset = 'terminal_prices', dedupeByItem = false } = {}) {
  if (!Array.isArray(records) || !records.length) return [];
  const projected = records.map((entry) => projectMarketEntry(entry, dataset)).sort(sortByValueDesc);
  if (!dedupeByItem) return projected.slice(0, limit);
  const seen = new Set();
  const unique = [];
  for (const entry of projected) {
    const key = entry.item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
    if (unique.length >= limit) break;
  }
  return unique;
}

function buildTerminalCommoditySummary(priceRecords = [], terminalMetaMap = new Map(), { limitPerTerminal = 3 } = {}) {
  if (!Array.isArray(priceRecords) || !priceRecords.length) return [];
  const grouped = new Map();
  for (const entry of priceRecords) {
    const terminalId = normalizeId(entry?.id_terminal);
    if (!terminalId) continue;
    if (!grouped.has(terminalId)) grouped.set(terminalId, []);
    grouped.get(terminalId).push(entry);
  }
  const summaries = [];
  for (const [terminalId, entries] of grouped.entries()) {
    const meta = terminalMetaMap.get(terminalId) || {};
    const projected = entries.map((entry) => projectMarketEntry(entry, 'terminal_prices')).sort(sortByValueDesc);
    const sample = projected.slice(0, limitPerTerminal);
    summaries.push({
      terminalId,
      terminalName: meta.name || sample[0]?.location || `Terminal ${terminalId}`,
      locationLabel: meta.locationLabel || null,
      planetName: meta.planetName || null,
      moonName: meta.moonName || null,
      cityName: meta.cityName || null,
      stationName: meta.stationName || null,
      systemName: meta.systemName || null,
      matchCount: entries.length,
      sample,
    });
  }
  summaries.sort((a, b) => {
    const aValue = a.sample?.[0]?.sellPrice ?? a.sample?.[0]?.buyPrice ?? 0;
    const bValue = b.sample?.[0]?.sellPrice ?? b.sample?.[0]?.buyPrice ?? 0;
    return bValue - aValue;
  });
  return summaries;
}

function filterRecordsByField(records, fields, needle, options = {}) {
  const { useLocationAlias = false } = options;
  const normalized = normalizeName(needle);
  if (!normalized) return [];
  const canonicalNeedle = useLocationAlias ? canonicalizeLocationName(normalized) : null;
  const exact = [];
  const partial = [];
  for (const entry of records || []) {
    const value = getStringField(entry, fields);
    if (!value) continue;
    const lower = normalizeName(value);
    if (!lower) continue;
    const canonicalValue = useLocationAlias ? canonicalizeLocationName(lower) : null;
    const aliasExact = canonicalNeedle && canonicalValue && canonicalNeedle === canonicalValue;
    if (lower === normalized || aliasExact) {
      exact.push(entry);
    } else if (lower.includes(normalized)) {
      partial.push(entry);
    }
  }
  return exact.length ? exact : partial;
}

function filterRecordsByTerminalIds(records, idField, terminalIdSet) {
  if (!Array.isArray(records) || !terminalIdSet || !terminalIdSet.size) return records || [];
  return records.filter((entry) => {
    const value = entry ? entry[idField] : null;
    if (value == null) return false;
    return terminalIdSet.has(normalizeId(value));
  });
}

function projectCatalogRecord(record, dataset) {
  const item = getStringField(record, ITEM_NAME_FIELDS) || getStringField(record, COMMODITY_NAME_FIELDS) || 'Unknown item';
  const location = getStringField(record, LOCATION_FIELDS) || 'Multiple locations';
  return {
    item,
    location,
    buyPrice: null,
    sellPrice: null,
    updatedAt: null,
    dataset,
  };
}

function humanizeLabel(value) {
  if (!value) return '';
  return value
    .replace(/^(has_|is_)/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function projectLocationInfo(record, dataset) {
  if (!record) return null;
  const fields = LOCATION_DATASET_FIELDS[dataset] || ['name', 'label'];
  const name = getStringField(record, fields) || record.name || record.label || 'Unknown location';
  const system = record.star_system_name || record.system_name || null;
  const parent = record.planet_name || record.moon_name || record.orbit_name || record.city_name || record.outpost_name || record.space_station_name || null;
  const coords = LOCATION_COORD_FIELDS
    .map((field) => (record[field] != null ? `${field.replace('_', ' ')} ${record[field]}` : null))
    .filter(Boolean);
  const features = LOCATION_FEATURE_FIELDS
    .filter((field) => {
      const value = record[field];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
      return false;
    })
    .map(humanizeLabel);
  const notes = [];
  if (system) notes.push(`System: ${system}`);
  if (parent) notes.push(`Body: ${parent}`);
  if (record.region_name) notes.push(`Region: ${record.region_name}`);
  if (coords.length) notes.push(`Coords: ${coords.join(', ')}`);
  if (record.popular_name) notes.push(`Also known as ${record.popular_name}`);
  if (record.description) notes.push(`Notes: ${record.description}`);
  if (!notes.length) {
    const parentPairs = LOCATION_PARENT_FIELDS
      .map((field) => (record[field] ? `${humanizeLabel(field)}: ${record[field]}` : null))
      .filter(Boolean);
    if (parentPairs.length) notes.push(parentPairs.join(' | '));
  }
  const services = features.slice(0, 8);
  return {
    name,
    dataset,
    type: dataset.replace(/_/g, ' '),
    system,
    parent,
    services,
    notes,
  };
}

function projectRefineryEntry(entry) {
  const item = getStringField(entry, COMMODITY_NAME_FIELDS) || 'Unknown ore';
  const locationParts = [
    entry?.terminal_name,
    entry?.space_station_name,
    entry?.city_name,
    entry?.outpost_name,
    entry?.planet_name,
    entry?.moon_name,
    entry?.star_system_name,
  ].map((val) => (val ? String(val).trim() : '')).filter(Boolean);
  const location = locationParts.length ? locationParts.join(' / ') : 'Unknown refinery';
  const yieldValue = getNumberField(entry, ['value']);
  const yieldWeek = getNumberField(entry, ['value_week']);
  const yieldMonth = getNumberField(entry, ['value_month']);
  const updatedAt = formatUpdatedAt(entry?.date_modified || entry?.date_added);
  return {
    item,
    location,
    buyPrice: null,
    sellPrice: null,
    updatedAt,
    dataset: 'refineries_yields',
    yieldValue,
    yieldWeek,
    yieldMonth,
  };
}

function buildCommoditySnapshot({
  commodityName,
  locationName,
  priceRecords,
  commodityRecords,
  itemRecords,
  limit,
}) {
  if (!commodityName) return null;
  const priceMatches = filterRecordsByField(priceRecords, ITEM_NAME_FIELDS, commodityName);
  let filtered = priceMatches;
  if (locationName && filtered.length) {
    const normalizedLocation = normalizeName(locationName);
    const canonicalLocation = canonicalizeLocationName(normalizedLocation);
    filtered = priceMatches.filter((entry) => {
      const location = getStringField(entry, LOCATION_FIELDS);
      if (!location) return false;
      const lower = normalizeName(location);
      if (!lower) return false;
      if (canonicalLocation) {
        const candidateCanonical = canonicalizeLocationName(lower);
        if (candidateCanonical && candidateCanonical === canonicalLocation) return true;
      }
      return normalizedLocation ? lower.includes(normalizedLocation) : false;
    });
    if (!filtered.length) filtered = priceMatches;
  }

  let sample = projectRecordSample(filtered, { limit, dataset: 'terminal_prices' });
  let fallbackUsed = sample.length === 0;
  let matchCount = filtered.length;

  if (!sample.length) {
    const commodityCatalogMatches = filterRecordsByField(commodityRecords, COMMODITY_NAME_FIELDS, commodityName);
    const itemCatalogMatches = filterRecordsByField(itemRecords, ITEM_ONLY_NAME_FIELDS, commodityName);
    const catalogSource = commodityCatalogMatches.length ? 'commodities' : itemCatalogMatches.length ? 'items' : null;
    const catalogRecords = commodityCatalogMatches.length ? commodityCatalogMatches : itemCatalogMatches;
    matchCount = catalogRecords.length;
    sample = catalogRecords.slice(0, limit).map((record) => projectCatalogRecord(record, catalogSource || 'catalog'));
  }

  if (!sample.length) return null;
  return {
    type: 'commodity',
    query: commodityName,
    matches: matchCount,
    totalRecords: priceRecords.length,
    fallbackUsed,
    sample,
    filters: { commodityName, locationName },
  };
}

function buildItemsByTerminalSnapshot({
  commodityName,
  locationName,
  itemTerminalRecords,
  limit,
}) {
  if (!Array.isArray(itemTerminalRecords) || !itemTerminalRecords.length) return null;

  let filtered = itemTerminalRecords;
  let fallbackUsed = false;

  if (commodityName) {
    const itemMatches = filterRecordsByField(itemTerminalRecords, ITEM_NAME_FIELDS, commodityName);
    if (itemMatches.length) {
      filtered = itemMatches;
    } else {
      fallbackUsed = true;
    }
  }

  if (locationName) {
    const normalizedLocation = normalizeName(locationName);
    if (normalizedLocation) {
      const canonicalLocation = canonicalizeLocationName(normalizedLocation);
      const narrowed = filtered.filter((entry) => {
        const locationValue = getStringField(entry, LOCATION_FIELDS);
        if (!locationValue) return false;
        const lower = normalizeName(locationValue);
        if (!lower) return false;
        if (canonicalLocation) {
          const candidateCanonical = canonicalizeLocationName(lower);
          if (candidateCanonical && candidateCanonical === canonicalLocation) return true;
        }
        return lower.includes(normalizedLocation);
      });
      if (narrowed.length) {
        filtered = narrowed;
      } else {
        fallbackUsed = true;
      }
    }
  }

  const sample = projectRecordSample(filtered, { limit, dataset: 'items_by_terminal', dedupeByItem: true });
  if (!sample.length) return null;

  return {
    type: 'item_terminal',
    query: commodityName || locationName || 'items',
    matches: filtered.length,
    totalRecords: itemTerminalRecords.length,
    fallbackUsed,
    sample,
    filters: { commodityName, locationName },
  };
}

function buildLocationSnapshot({ locationName, priceRecords, limit }) {
  if (!locationName) return null;
  const locationMatches = filterRecordsByField(priceRecords, LOCATION_FIELDS, locationName, { useLocationAlias: true });
  if (!locationMatches.length) return null;
  const sample = projectRecordSample(locationMatches, { limit, dataset: 'terminal_prices', dedupeByItem: true });
  if (!sample.length) return null;
  return {
    type: 'location',
    query: locationName,
    matches: locationMatches.length,
    totalRecords: priceRecords.length,
    fallbackUsed: false,
    sample,
    filters: { locationName },
  };
}

function buildOverviewSnapshot({ priceRecords, limit }) {
  const sample = projectRecordSample(priceRecords, { limit, dataset: 'terminal_prices', dedupeByItem: true });
  if (!sample.length) return null;
  return {
    type: 'overview',
    query: null,
    matches: priceRecords.length,
    totalRecords: priceRecords.length,
    fallbackUsed: false,
    sample,
  };
}

function buildFallbackSnapshot({ commodities, items, limit }) {
  const sample = [];
  for (const record of commodities || []) {
    sample.push(projectCatalogRecord(record, 'commodities'));
    if (sample.length >= limit) break;
  }
  if (sample.length < limit) {
    for (const record of items || []) {
      sample.push(projectCatalogRecord(record, 'items'));
      if (sample.length >= limit) break;
    }
  }
  if (!sample.length) return null;
  return {
    type: 'catalog',
    query: null,
    matches: sample.length,
    totalRecords: (commodities?.length || 0) + (items?.length || 0),
    fallbackUsed: true,
    sample,
  };
}

function buildRefinerySnapshot({ commodityName, locationName, refineryRecords, limit }) {
  if (!Array.isArray(refineryRecords) || !refineryRecords.length) return null;
  let filtered = refineryRecords;
  let fallbackUsed = false;

  if (commodityName) {
    const matches = filterRecordsByField(refineryRecords, COMMODITY_NAME_FIELDS, commodityName);
    if (matches.length) {
      filtered = matches;
    } else {
      fallbackUsed = true;
    }
  }

  if (locationName) {
    const matches = filterRecordsByField(filtered, REFINERY_LOCATION_FIELDS, locationName, { useLocationAlias: true });
    if (matches.length) {
      filtered = matches;
    } else {
      const fallbackMatches = filterRecordsByField(refineryRecords, REFINERY_LOCATION_FIELDS, locationName, { useLocationAlias: true });
      if (fallbackMatches.length) {
        filtered = fallbackMatches;
        fallbackUsed = true;
      }
    }
  }

  if (!filtered.length) {
    filtered = refineryRecords;
    fallbackUsed = true;
  }

  const projected = filtered.map(projectRefineryEntry).sort((a, b) => {
    const valueA = a.yieldValue ?? 0;
    const valueB = b.yieldValue ?? 0;
    return valueB - valueA;
  }).slice(0, limit);

  if (!projected.length) return null;

  return {
    type: 'refinery',
    query: commodityName || locationName || null,
    matches: filtered.length,
    totalRecords: refineryRecords.length,
    fallbackUsed,
    sample: projected,
    filters: { commodityName, locationName },
  };
}

function buildMarketplaceSnapshot({ commodityName, marketplaceRecords, limit }) {
  if (!Array.isArray(marketplaceRecords) || !marketplaceRecords.length) return null;
  let matches = marketplaceRecords;
  let fallbackUsed = false;
  if (commodityName) {
    const filtered = filterRecordsByField(marketplaceRecords, ITEM_NAME_FIELDS, commodityName);
    if (filtered.length) {
      matches = filtered;
    } else {
      fallbackUsed = true;
    }
  }

  const sample = matches
    .map((entry) => {
      const projected = projectMarketEntry(entry, 'marketplace_averages');
      if (!projected.updatedAt) {
        projected.updatedAt = formatUpdatedAt(entry?.date_modified || entry?.date_added);
      }
      if (!projected.location || projected.location === 'Unknown terminal') {
        const category = getStringField(entry, MARKETPLACE_CATEGORY_FIELDS) || null;
        projected.location = category ? `${category} average` : 'Marketplace average';
      }
      return projected;
    })
    .sort(sortByValueDesc)
    .slice(0, limit);

  if (!sample.length) return null;

  return {
    type: 'marketplace_average',
    query: commodityName || 'player market',
    matches: matches.length,
    totalRecords: marketplaceRecords.length,
    fallbackUsed,
    sample,
    filters: { commodityName },
  };
}

function getLocationSnapshotFromCache({
  locationName,
  locationDataset,
  locationRecord,
  limit = 1,
} = {}) {
  try {
    const cache = globalThis.uexCache;
    if (!cache || typeof cache.getRecords !== 'function') return null;
    const resolvedName = locationName || getStringField(locationRecord, ['name', 'label']);
    if (!resolvedName && !locationRecord) return null;

    const datasets = locationDataset
      ? [locationDataset]
      : Object.keys(LOCATION_DATASET_FIELDS).filter((label) => label !== 'refineries_yields');

    if (locationRecord) {
      const dataset = locationDataset || datasets.find((label) => label !== undefined) || 'terminals';
      const projected = projectLocationInfo(locationRecord, dataset);
      if (!projected) return null;
      return {
        type: 'location_info',
        query: resolvedName || projected.name,
        dataset,
        matches: 1,
        totalRecords: 1,
        sample: [projected],
      };
    }

    for (const dataset of datasets) {
      const rows = cache.getRecords(dataset) || [];
      if (!rows.length) continue;
      const matches = filterRecordsByField(
        rows,
        LOCATION_DATASET_FIELDS[dataset] || ['name', 'label'],
        resolvedName,
        { useLocationAlias: true },
      );
      if (!matches.length) continue;
      const sample = matches
        .slice(0, limit)
        .map((record) => projectLocationInfo(record, dataset))
        .filter(Boolean);
      if (!sample.length) continue;
      return {
        type: 'location_info',
        query: resolvedName,
        dataset,
        matches: matches.length,
        totalRecords: rows.length,
        sample,
      };
    }
    return null;
  } catch (error) {
    console.error('[ChatGPT][Tools] location snapshot lookup failed:', error?.message || error);
    return null;
  }
}

function getMarketSnapshotFromCache(query, {
  limit = 5,
  requestedQuery = null,
  isGeneric = false,
  marketType = 'overview',
  commodityName = null,
  locationName = null,
  commodityDataset = null,
  datasetPreference = null,
  terminalIds = null,
  locationDescriptor = null,
} = {}) {
  try {
    const cache = globalThis.uexCache;
    if (!cache || typeof cache.getRecords !== 'function') return null;
    const allPriceRecords = cache.getRecords('terminal_prices') || [];
    const commodityRecords = cache.getRecords('commodities') || [];
    const itemRecords = cache.getRecords('items') || [];
    const allItemTerminalRecords = cache.getRecords('items_by_terminal') || [];
    const marketplaceRecords = cache.getRecords('marketplace_averages') || [];
    const allRefineryRecords = cache.getRecords('refineries_yields') || [];
    const allTerminals = cache.getRecords('terminals') || [];
    const terminalMetaMap = buildTerminalMetaMap(allTerminals);

    const locationMeta = locationDescriptor ? { ...locationDescriptor } : null;
    const terminalSource = Array.isArray(terminalIds) && terminalIds.length
      ? terminalIds
      : Array.isArray(locationMeta?.terminalIds)
        ? locationMeta.terminalIds
        : [];
    const terminalIdSet = new Set(terminalSource.map(normalizeId).filter(Boolean));
    const hasTerminalFilter = terminalIdSet.size > 0;
    const terminalIdList = hasTerminalFilter ? Array.from(terminalIdSet) : [];

    const priceRecords = hasTerminalFilter
      ? filterRecordsByTerminalIds(allPriceRecords, 'id_terminal', terminalIdSet)
      : allPriceRecords;
    const itemTerminalRecords = hasTerminalFilter
      ? filterRecordsByTerminalIds(allItemTerminalRecords, 'id_terminal', terminalIdSet)
      : allItemTerminalRecords;
    const refineryRecords = hasTerminalFilter
      ? filterRecordsByTerminalIds(allRefineryRecords, 'id_terminal', terminalIdSet)
      : allRefineryRecords;
    const terminalSummaries = hasTerminalFilter
      ? buildTerminalCommoditySummary(priceRecords, terminalMetaMap, { limitPerTerminal: 4 })
      : [];

    const preferredFromDataset = commodityDataset === 'items' ? 'items' : commodityDataset === 'commodities' ? 'commodities' : null;
    const preferredDataset = datasetPreference || preferredFromDataset || null;
    const datasetLabels = {
      commodities: 'Commodity Terminals',
      items: 'Items & Gear Terminals',
      marketplace: 'Player Market Averages',
      refinery: 'Refinery Yields',
    };
    const datasetOrderBase = ['commodities', 'items', 'marketplace'];
    const datasetOrder = preferredDataset && datasetOrderBase.includes(preferredDataset)
      ? [preferredDataset, ...datasetOrderBase.filter((entry) => entry !== preferredDataset)]
      : datasetOrderBase;

    const resolvedLocationMeta = locationMeta
      ? { ...locationMeta, filterApplied: hasTerminalFilter, filterTerminalCount: terminalIdList.length }
      : (hasTerminalFilter ? { filterApplied: true, filterTerminalCount: terminalIdList.length } : null);

    const datasetSnapshots = [];
    const recordSnapshot = (dataset, snapshot) => {
      if (!snapshot) return;
      const filters = { ...(snapshot.filters || {}) };
      if (resolvedLocationMeta?.locationName && !filters.locationName) {
        filters.locationName = resolvedLocationMeta.locationName;
      }
      if (hasTerminalFilter && terminalIdList.length) {
        filters.terminalIds = terminalIdList;
      }
      const enrichedSnapshot = {
        ...snapshot,
        dataset,
        filters,
      };
      if (resolvedLocationMeta) {
        enrichedSnapshot.locationMeta = resolvedLocationMeta;
      }
      if (dataset === 'commodities' && terminalSummaries.length) {
        enrichedSnapshot.terminalSummaries = terminalSummaries;
      }
      datasetSnapshots.push({
        dataset,
        label: datasetLabels[dataset] || dataset,
        snapshot: enrichedSnapshot,
      });
    };

    if (marketType === 'refinery' || marketType === 'refinery_location' || preferredDataset === 'refinery') {
      const refinerySnapshot = buildRefinerySnapshot({
        commodityName,
        locationName,
        refineryRecords,
        limit,
      });
      recordSnapshot('refinery', refinerySnapshot);
    } else {
      for (const dataset of datasetOrder) {
        if (dataset === 'commodities') {
          let commoditySnapshot = null;
          if (locationName && (marketType === 'location' || marketType === 'commodity_location')) {
            commoditySnapshot = buildLocationSnapshot({ locationName, priceRecords, limit });
          }
          if (!commoditySnapshot) {
            if (commodityName) {
              commoditySnapshot = buildCommoditySnapshot({
                commodityName,
                locationName,
                priceRecords,
                commodityRecords,
                itemRecords,
                limit,
              });
            } else {
              commoditySnapshot = buildOverviewSnapshot({ priceRecords, limit })
                || buildFallbackSnapshot({ commodities: commodityRecords, items: itemRecords, limit });
            }
          }
          recordSnapshot('commodities', commoditySnapshot);
        } else if (dataset === 'items') {
          const itemsSnapshot = buildItemsByTerminalSnapshot({
            commodityName,
            locationName,
            itemTerminalRecords,
            limit,
          });
          recordSnapshot('items', itemsSnapshot);
        } else if (dataset === 'marketplace') {
          const marketplaceSnapshot = buildMarketplaceSnapshot({
            commodityName,
            marketplaceRecords,
            limit,
          });
          recordSnapshot('marketplace', marketplaceSnapshot);
        }
      }
    }

    if (!datasetSnapshots.length) {
      const scopedFallback = buildOverviewSnapshot({ priceRecords, limit });
      recordSnapshot('commodities', scopedFallback);
    }

    if (!datasetSnapshots.length) {
      const globalFallback = buildOverviewSnapshot({ priceRecords: allPriceRecords, limit })
        || buildFallbackSnapshot({ commodities: commodityRecords, items: itemRecords, limit });
      recordSnapshot('commodities', globalFallback);
    }

    if (!datasetSnapshots.length) return null;

    const primary = datasetSnapshots[0];
    const primarySnapshot = primary?.snapshot;
    if (!primarySnapshot) return null;

    const resolvedQuery = primarySnapshot.query ?? query ?? commodityName ?? locationName ?? null;
    return {
      ...primarySnapshot,
      query: resolvedQuery,
      dataset: primary?.dataset || primarySnapshot.dataset || preferredDataset || 'commodities',
      datasetLabel: primary?.label || datasetLabels[primary?.dataset] || 'Market',
      requestedQuery: requestedQuery || query || commodityName || locationName || null,
      isGenericRequest: Boolean(isGeneric),
      marketType: primarySnapshot.type || marketType,
      datasetSnapshots,
      terminalFilterApplied: hasTerminalFilter,
      terminalFilterCount: terminalIdList.length,
      locationMeta: resolvedLocationMeta || null,
    };
  } catch (error) {
    console.error('[ChatGPT][Tools] market snapshot lookup failed:', error?.message || error);
    return null;
  }
}

function getHitActivitySummary(limit = 4) {
  try {
    const hits = globalThis.hitCache?.getAll?.();
    if (!Array.isArray(hits) || !hits.length) return [];
    return takeLast(hits, limit).map((entry) => ({
      target: entry.target || entry.pilot || entry.player || 'Unknown target',
      ship: entry.ship || entry.ship_type || null,
      reward: entry.reward || entry.credits || null,
      total_value: entry.total_value ?? entry.totalValue ?? null,
      cargo: entry.cargo || entry.cargo_manifest || null,
      timestamp: entry.created_at || entry.timestamp || entry.updated_at || null,
      status: entry.status || entry.outcome || 'logged',
    }));
  } catch (error) {
    console.error('[ChatGPT][Tools] hit summary lookup failed:', error?.message || error);
    return [];
  }
}

module.exports = {
  getRecentChatForChannel,
  getUserProfileFromCache,
  getLeaderboardSnapshot,
  getPlayerStatsSnapshot,
  getPirateInsights,
  getLeaderboardTopPilots,
  getChannelDigest,
  getMarketSnapshotFromCache,
  getLocationSnapshotFromCache,
  getHitActivitySummary,
  extractMarketTargets,
};
