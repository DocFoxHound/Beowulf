const { getUexCacheRecords } = require('../../common/uex-cache');
const { KnowledgeDocsModel } = require('../../api/models/knowledge-docs');

const ENTITY_REFRESH_MS = Number(process.env.CHATGPT_ENTITY_INDEX_REFRESH_MS || 30 * 60 * 1000);
const ENTITY_DOC_LIMIT = Number(process.env.CHATGPT_ENTITY_DOC_LIMIT || 400);
const ENTITY_TOP_K = Number(process.env.CHATGPT_ENTITY_TOP_K || 5);

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

function pickName(record, dataset) {
  const fields = NAME_FIELDS[dataset] || ['name', 'label'];
  for (const key of fields) {
    if (record && record[key]) return String(record[key]);
  }
  return null;
}

function summarizeRecord(record, maxPairs = 6) {
  if (!record || typeof record !== 'object') return '';
  const entries = Object.entries(record)
    .filter(([key, value]) => value !== undefined && value !== null && typeof value !== 'object' && key !== 'vector')
    .slice(0, maxPairs);
  if (!entries.length) return '';
  return entries.map(([key, value]) => `${key}: ${value}`).join('; ');
}

function buildEntry({ id, name, type, subtype, dataset, source, tags, record, aliases }) {
  const normalized = normalize(name);
  if (!normalized) return null;
  const aliasList = Array.isArray(aliases) ? aliases.map(normalize).filter(Boolean) : [];
  return {
    id,
    name,
    type,
    subtype: subtype || null,
    datasetHint: dataset || null,
    source,
    tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
    record: record || null,
    summary: summarizeRecord(record),
    normalized,
    aliases: aliasList,
    tokens: tokenize(name)
      .concat(aliasList.flatMap(tokenize))
      .concat(Array.isArray(tags) ? tags.flatMap(tokenize) : []),
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

async function rebuildEntityIndex() {
  const baseEntries = collectUexEntities();
  const docEntries = await collectDocEntities();
  const merged = [...baseEntries, ...docEntries];
  state.entries = merged;
  state.builtAt = Date.now();
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
    confidence: Math.min(1, score / 250),
  }));
}

module.exports = {
  searchGameEntities,
};
