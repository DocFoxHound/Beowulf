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
let marketLookupCache = {
  builtAt: 0,
  commodities: { entries: [], names: [] },
  items: { entries: [], names: [] },
  locations: { entries: [], namesByType: {} },
  catalogSummary: null,
};

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

function summarizeNames(names = []) {
  const unique = Array.from(new Set(names.filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b));
  return {
    count: unique.length,
    samples: unique.slice(0, MARKET_CATALOG_SAMPLE_LIMIT),
  };
}

function buildLookupEntries(records, { dataset, type, nameFields }) {
  const entries = [];
  const names = [];
  for (const record of records || []) {
    const name = getStringField(record, nameFields);
    const normalized = normalizeName(name);
    if (!normalized || normalized.length < 3) continue; // avoid noisy 1-2 char hits
    entries.push({ name, normalized, dataset, type, record });
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
    const lookup = buildLookupEntries(rows, { dataset, type, nameFields: fields });
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

function filterRecordsByField(records, fields, needle) {
  const normalized = normalizeName(needle);
  if (!normalized) return [];
  const exact = [];
  const partial = [];
  for (const entry of records || []) {
    const value = getStringField(entry, fields);
    if (!value) continue;
    const lower = value.toLowerCase();
    if (lower === normalized) {
      exact.push(entry);
    } else if (lower.includes(normalized)) {
      partial.push(entry);
    }
  }
  return exact.length ? exact : partial;
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
    filtered = priceMatches.filter((entry) => {
      const location = getStringField(entry, LOCATION_FIELDS);
      if (!location) return false;
      const lower = normalizeName(location);
      return lower ? lower.includes(normalizedLocation) : false;
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
      const narrowed = filtered.filter((entry) => {
        const locationValue = getStringField(entry, LOCATION_FIELDS);
        if (!locationValue) return false;
        const lower = normalizeName(locationValue);
        return lower ? lower.includes(normalizedLocation) : false;
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
  const locationMatches = filterRecordsByField(priceRecords, LOCATION_FIELDS, locationName);
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
    const matches = filterRecordsByField(filtered, REFINERY_LOCATION_FIELDS, locationName);
    if (matches.length) {
      filtered = matches;
    } else {
      const fallbackMatches = filterRecordsByField(refineryRecords, REFINERY_LOCATION_FIELDS, locationName);
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
      const matches = filterRecordsByField(rows, LOCATION_DATASET_FIELDS[dataset] || ['name', 'label'], resolvedName);
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
} = {}) {
  try {
    const cache = globalThis.uexCache;
    if (!cache || typeof cache.getRecords !== 'function') return null;
    const priceRecords = cache.getRecords('terminal_prices') || [];
    const commodityRecords = cache.getRecords('commodities') || [];
    const itemRecords = cache.getRecords('items') || [];
    const itemTerminalRecords = cache.getRecords('items_by_terminal') || [];
    const marketplaceRecords = cache.getRecords('marketplace_averages') || [];
    const refineryRecords = cache.getRecords('refineries_yields') || [];

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

    const datasetSnapshots = [];
    const recordSnapshot = (dataset, snapshot) => {
      if (!snapshot) return;
      datasetSnapshots.push({
        dataset,
        label: datasetLabels[dataset] || dataset,
        snapshot: { ...snapshot, dataset },
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
      const fallback = buildOverviewSnapshot({ priceRecords, limit })
        || buildFallbackSnapshot({ commodities: commodityRecords, items: itemRecords, limit });
      recordSnapshot('commodities', fallback);
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
  getMarketSnapshotFromCache,
  getLocationSnapshotFromCache,
  getHitActivitySummary,
  extractMarketTargets,
};
