const { getUexCacheRecords, addUexCacheListener } = require('../../common/uex-cache');
const { KnowledgeDocsModel } = require('../../api/models/knowledge-docs');
const { GameEntitiesModel } = require('../../api/models/game-entities');

const ENTITY_REFRESH_MS = Number(process.env.CHATGPT_ENTITY_INDEX_REFRESH_MS || 30 * 60 * 1000);
const ENTITY_DOC_LIMIT = Number(process.env.CHATGPT_ENTITY_DOC_LIMIT || 400);
const ENTITY_TOP_K = Number(process.env.CHATGPT_ENTITY_TOP_K || 5);
const ENTITY_REBUILD_DEBOUNCE_MS = Number(process.env.CHATGPT_ENTITY_REBUILD_DEBOUNCE_MS || 1000);
const ENTITY_DB_LIMIT = Number(process.env.CHATGPT_ENTITY_DB_LIMIT || 2000);
const INCLUDE_CACHE_FALLBACK = (process.env.CHATGPT_ENTITY_INCLUDE_CACHE_FALLBACK || 'true').toLowerCase() === 'true';

const NAME_FIELDS = {
  commodities: ['commodity_name', 'name', 'label'],
  items: ['item_name', 'name', 'label', 'item'],
  terminals: ['terminal_name', 'name', 'label'],
  cities: ['city_name', 'name', 'label'],
  planets: ['planet_name', 'name', 'label'],
  moons: ['moon_name', 'name', 'label'],
  outposts: ['outpost_name', 'name', 'label'],
  space_stations: ['space_station_name', 'station_name', 'name', 'label'],
  star_systems: ['star_system_name', 'system_name', 'name', 'label'],
};

const LOCATION_DATASETS = new Set(['terminals', 'cities', 'planets', 'moons', 'outposts', 'space_stations', 'star_systems']);

const state = {
  entries: [],
  builtAt: 0,
  building: null,
};
let rebuildTimeout = null;

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function tokenize(str) {
  return normalize(str)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 16);
}

function formatNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString();
}

function summarizeCommodity(record) {
  const parts = [];
  const type = record.commodity_type || record.category || record.group || record.item_category;
  if (type) parts.push(`type ${type}`);
  const demand = record.demand || record.demand_level;
  if (demand) parts.push(`demand ${demand}`);
  const supply = record.supply || record.inventory_level;
  if (supply) parts.push(`supply ${supply}`);
  const buy = formatNumber(record.best_buy_price ?? record.buy_price ?? record.avg_buy_price);
  if (buy) parts.push(`buy ${buy}`);
  const sell = formatNumber(record.best_sell_price ?? record.sell_price ?? record.avg_sell_price);
  if (sell) parts.push(`sell ${sell}`);
  const volatility = record.volatility || record.risk_level;
  if (volatility) parts.push(`volatility ${volatility}`);
  return parts.join('; ');
}

function summarizeItem(record) {
  const parts = [];
  const subtype = record.item_type || record.sub_category || record.type;
  if (subtype) parts.push(subtype);
  const manufacturer = record.manufacturer || record.brand;
  if (manufacturer) parts.push(`by ${manufacturer}`);
  const size = record.size || record.class;
  if (size) parts.push(`size ${size}`);
  const role = record.role || record.function;
  if (role) parts.push(role);
  const rating = record.rating || record.grade;
  if (rating) parts.push(`grade ${rating}`);
  return parts.join('; ');
}

function summarizeTerminal(record) {
  const parts = [];
  const location = record.location_name || record.planet_name || record.system_name;
  if (location) parts.push(location);
  const services = Array.isArray(record.services) ? record.services.join(', ') : record.services_summary;
  if (services) parts.push(`services: ${services}`);
  const pads = record.pad_count || record.hangar_count;
  if (pads) parts.push(`${pads} pads`);
  const focus = record.terminal_type || record.specialty;
  if (focus) parts.push(`focus: ${focus}`);
  return parts.join('; ');
}

function summarizeLocation(record, dataset) {
  const parts = [];
  const type = record.type || record.location_type || dataset;
  if (type) parts.push(type);
  const region = record.region || record.system || record.star_system;
  if (region) parts.push(`system ${region}`);
  const parent = record.parent || record.planet || record.primary_body;
  if (parent) parts.push(`parent ${parent}`);
  const services = Array.isArray(record.services) ? record.services.join(', ') : record.services_summary;
  if (services) parts.push(`services: ${services}`);
  const population = formatNumber(record.population);
  if (population) parts.push(`pop ${population}`);
  return parts.join('; ');
}

function summarizeKnowledgeDoc(record) {
  const parts = [];
  if (record?.title) parts.push(record.title);
  if (Array.isArray(record?.tags) && record.tags.length) {
    parts.push(`tags: ${record.tags.slice(0, 4).join(', ')}`);
  }
  if (record?.created_at) parts.push(`created ${record.created_at}`);
  return parts.join('; ');
}

function summarizeGeneric(record, maxPairs = 6) {
  const entries = Object.entries(record)
    .filter(([key, value]) => value !== undefined && value !== null && typeof value !== 'object' && key !== 'vector')
    .slice(0, maxPairs);
  if (!entries.length) return '';
  return entries.map(([key, value]) => `${key}: ${value}`).join('; ');
}

function summarizeRecord(record, dataset, maxPairs = 6) {
  if (!record || typeof record !== 'object') return '';
  if (dataset === 'commodities') return summarizeCommodity(record);
  if (dataset === 'items') return summarizeItem(record);
  if (dataset === 'terminals') return summarizeTerminal(record);
  if (LOCATION_DATASETS.has(dataset)) return summarizeLocation(record, dataset);
  if (dataset === 'knowledge_docs') return summarizeKnowledgeDoc(record);
  return summarizeGeneric(record, maxPairs);
}

function extractCommodityDetails(record) {
  const details = {};
  if (record?.commodity_type) details.type = record.commodity_type;
  if (record?.category) details.category = record.category;
  const buy = formatNumber(record?.best_buy_price ?? record?.buy_price);
  if (buy) details.buy = buy;
  const sell = formatNumber(record?.best_sell_price ?? record?.sell_price);
  if (sell) details.sell = sell;
  if (record?.demand) details.demand = record.demand;
  if (record?.supply) details.supply = record.supply;
  return Object.keys(details).length ? details : null;
}

function extractItemDetails(record) {
  const details = {};
  if (record?.item_type || record?.sub_category) details.type = record.item_type || record.sub_category;
  if (record?.manufacturer) details.manufacturer = record.manufacturer;
  if (record?.size) details.size = record.size;
  if (record?.class) details.class = record.class;
  if (record?.power_draw) details.power = record.power_draw;
  if (record?.cooldown) details.cooldown = record.cooldown;
  return Object.keys(details).length ? details : null;
}

function extractTerminalDetails(record) {
  const details = {};
  if (record?.location_name) details.location = record.location_name;
  if (record?.terminal_type) details.type = record.terminal_type;
  if (Array.isArray(record?.services) && record.services.length) details.services = record.services.join(', ');
  if (record?.pad_count) details.pads = record.pad_count;
  if (record?.inventory_count) details.inventory = record.inventory_count;
  return Object.keys(details).length ? details : null;
}

function extractLocationDetails(record) {
  const details = {};
  if (record?.system || record?.star_system) details.system = record.system || record.star_system;
  if (record?.planet) details.planet = record.planet;
  if (record?.parent) details.parent = record.parent;
  if (Array.isArray(record?.services) && record.services.length) details.services = record.services.join(', ');
  if (record?.population) details.population = formatNumber(record.population);
  return Object.keys(details).length ? details : null;
}

function extractDocDetails(record) {
  const details = {};
  if (Array.isArray(record?.tags) && record.tags.length) details.tags = record.tags;
  if (record?.section) details.section = record.section;
  if (record?.created_at) details.created_at = record.created_at;
  return Object.keys(details).length ? details : null;
}

function extractDetails(record, dataset) {
  if (!record || typeof record !== 'object') return null;
  if (dataset === 'commodities') return extractCommodityDetails(record);
  if (dataset === 'items') return extractItemDetails(record);
  if (dataset === 'terminals') return extractTerminalDetails(record);
  if (LOCATION_DATASETS.has(dataset)) return extractLocationDetails(record);
  if (dataset === 'knowledge_docs') return extractDocDetails(record);
  return null;
}

function pickName(record, dataset) {
  const fields = NAME_FIELDS[dataset] || ['name', 'label'];
  for (const key of fields) {
    if (record && record[key]) return String(record[key]);
  }
  return null;
}

function buildEntry({ id, name, type, subtype, dataset, source, tags, record, aliases }) {
  const normalized = normalize(name);
  if (!normalized) return null;
  const aliasList = Array.isArray(aliases) ? aliases.map(normalize).filter(Boolean) : [];
  const summary = summarizeRecord(record, dataset);
  const details = extractDetails(record, dataset);
  return {
    id,
    name,
    type,
    subtype: subtype || null,
    datasetHint: dataset || null,
    source,
    tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
    record: record || null,
    summary,
    details,
    normalized,
    aliases: aliasList,
    tokens: tokenize(name)
      .concat(aliasList.flatMap(tokenize))
      .concat(Array.isArray(tags) ? tags.flatMap(tokenize) : []),
  };
}

function buildEntryFromGameEntity(row) {
  if (!row || !row.name) return null;
  const normalized = normalize(row.name);
  if (!normalized) return null;
  const aliasList = Array.isArray(row.aliases)
    ? row.aliases.map(normalize).filter(Boolean)
    : [];
  const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
  const details = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const extraTokens = [];
  if (row.type) extraTokens.push(...tokenize(row.type));
  if (row.subcategory) extraTokens.push(...tokenize(row.subcategory));
  return {
    id: row.id || row.slug || row.name,
    name: row.name,
    type: row.type || 'entity',
    subtype: row.subcategory || row.dataset_hint || null,
    datasetHint: row.dataset_hint || null,
    source: row.source || 'game_entities',
    tags,
    record: details,
    summary: row.short_description || (details?.description) || null,
    details,
    normalized,
    aliases: aliasList,
    tokens: tokenize(row.name)
      .concat(aliasList.flatMap(tokenize))
      .concat(tags.flatMap(tokenize))
      .concat(extraTokens),
  };
}

function collectUexEntities() {
  const datasets = ['commodities', 'items', 'terminals', 'cities', 'planets', 'moons', 'outposts', 'space_stations', 'star_systems'];
  const entries = [];
  for (const dataset of datasets) {
    const records = getUexCacheRecords(dataset) || [];
    for (const record of records) {
      const name = pickName(record, dataset);
      if (!name) continue;
      const id = record?.id || record?.uuid || `${dataset}:${name}`;
      const type = dataset === 'commodities'
        ? 'commodity'
        : dataset === 'items'
          ? 'component'
          : LOCATION_DATASETS.has(dataset)
            ? 'location'
            : 'dataset';
      const subtype = dataset;
      const tags = [];
      if (record?.category) tags.push(`category:${record.category}`);
      if (record?.item_category) tags.push(`category:${record.item_category}`);
      if (record?.commodity_type) tags.push(`type:${record.commodity_type}`);
      if (record?.manufacturer) tags.push(`manufacturer:${record.manufacturer}`);
      if (Array.isArray(record?.tags)) tags.push(...record.tags);
      const aliasFields = [];
      if (record?.abbreviation) aliasFields.push(record.abbreviation);
      if (record?.code) aliasFields.push(record.code);
      if (record?.short_name) aliasFields.push(record.short_name);
      if (Array.isArray(record?.item_aliases)) aliasFields.push(...record.item_aliases);
      if (Array.isArray(record?.aliases)) aliasFields.push(...record.aliases);
      const entry = buildEntry({
        id: `${dataset}:${id}`,
        name,
        type,
        subtype,
        dataset,
        source: `uex:${dataset}`,
        tags,
        record,
        aliases: aliasFields,
      });
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

async function collectGameEntitiesFromDb(limit = ENTITY_DB_LIMIT) {
  try {
    const rows = await GameEntitiesModel.list({ limit, order: 'updated_at.desc' });
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows.map(buildEntryFromGameEntity).filter(Boolean);
  } catch (error) {
    console.error('[EntityIndex] game_entities fetch failed:', error?.message || error);
    return [];
  }
}

async function collectDocEntities(limit = ENTITY_DOC_LIMIT) {
  try {
    const docs = await KnowledgeDocsModel.list({ limit, order: 'created_at.desc' });
    if (!Array.isArray(docs) || !docs.length) return [];
    const entries = [];
    for (const doc of docs) {
      const entry = buildEntry({
        id: `doc:${doc.id}`,
        name: doc.title || doc.section || 'Doc snippet',
        type: 'doc_topic',
        subtype: doc.section || null,
        dataset: 'knowledge_docs',
        source: 'knowledge_doc',
        tags: doc.tags,
        aliases: doc.tags,
        record: { title: doc.title, tags: doc.tags, created_at: doc.created_at },
      });
      if (entry) entries.push(entry);
    }
    return entries;
  } catch (error) {
    console.error('[EntityIndex] knowledge docs load failed:', error?.message || error);
    return [];
  }
}

function dedupeEntries(entries = []) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry) continue;
    const key = entry.id || entry.normalized || entry.name;
    if (!key) continue;
    const normalizedKey = String(key).toLowerCase();
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push(entry);
  }
  return result;
}

async function rebuildEntityIndex() {
  const [dbEntries, docEntries] = await Promise.all([
    collectGameEntitiesFromDb(),
    collectDocEntities(),
  ]);
  const combined = [];
  if (Array.isArray(dbEntries) && dbEntries.length) {
    combined.push(...dbEntries);
  }
  if (!dbEntries.length || INCLUDE_CACHE_FALLBACK) {
    combined.push(...collectUexEntities());
  }
  if (Array.isArray(docEntries) && docEntries.length) {
    combined.push(...docEntries);
  }
  state.entries = dedupeEntries(combined);
  state.builtAt = Date.now();
}

function scheduleEntityRebuild(reason) {
  if (state.building) return;
  if (rebuildTimeout) {
    clearTimeout(rebuildTimeout);
    rebuildTimeout = null;
  }
  rebuildTimeout = setTimeout(() => {
    rebuildTimeout = null;
    rebuildEntityIndex().catch((error) => {
      console.error('[EntityIndex] scheduled rebuild failed:', error?.message || error, { reason });
    });
  }, ENTITY_REBUILD_DEBOUNCE_MS);
}

function invalidateEntityIndex(reason) {
  state.builtAt = 0;
  scheduleEntityRebuild(reason);
}

async function ensureEntityIndex() {
  const now = Date.now();
  if (state.entries.length && now - state.builtAt < ENTITY_REFRESH_MS) {
    return state.entries;
  }
  if (state.building) {
    await state.building;
    return state.entries;
  }
  state.building = rebuildEntityIndex().catch((error) => {
    console.error('[EntityIndex] rebuild failed:', error?.message || error);
  }).finally(() => {
    state.building = null;
  });
  await state.building;
  return state.entries;
}

function scoreEntry(entry, queryLower, queryTokens) {
  if (!entry || !entry.name) return 0;
  let score = 0;
  if (entry.normalized === queryLower) score += 200;
  if (entry.normalized.startsWith(queryLower) || queryLower.startsWith(entry.normalized)) score += 120;
  if (entry.normalized.includes(queryLower) || queryLower.includes(entry.normalized)) score += 80;
  for (const alias of entry.aliases) {
    if (!alias) continue;
    if (alias === queryLower) score += 90;
    if (alias.startsWith(queryLower) || queryLower.startsWith(alias)) score += 60;
    if (alias.includes(queryLower)) score += 40;
  }
  const entryTokens = entry.tokens || [];
  const overlaps = queryTokens.filter((token) => entryTokens.includes(token));
  score += overlaps.length * 25;
  if (entry.tags?.length) {
    const tagHits = entry.tags.filter((tag) => queryTokens.some((token) => tag.includes(token))).length;
    score += tagHits * 15;
  }
  return score;
}

async function searchGameEntities({ query, limit = ENTITY_TOP_K } = {}) {
  const text = normalize(query).slice(0, 200);
  if (!text) return [];
  const entries = await ensureEntityIndex();
  if (!entries.length) return [];
  const tokens = tokenize(query);
  const scored = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, text, tokens);
    if (score <= 0) continue;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ entry, score }) => ({
    id: entry.id,
    name: entry.name,
    type: entry.type,
    subtype: entry.subtype,
    dataset: entry.datasetHint,
    source: entry.source,
    tags: entry.tags,
    summary: entry.summary,
    record: entry.record,
    details: entry.details,
    confidence: Math.min(1, score / 250),
  }));
}

module.exports = {
  searchGameEntities,
  invalidateEntityIndex,
};

if (typeof addUexCacheListener === 'function') {
  addUexCacheListener(({ label }) => invalidateEntityIndex(`uex:${label}`));
}
