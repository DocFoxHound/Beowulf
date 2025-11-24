const { GameEntitiesModel } = require('../api/models/game-entities');

const MAX_EXISTING_FETCH = Number(process.env.GAME_ENTITIES_EXISTING_LIMIT || 20000);

function normalizeNameOnly(name) {
  const n = (name || '').trim().toLowerCase();
  return n || null;
}

function normalizeDatasetHint(value) {
  const v = (value || '').trim().toLowerCase();
  return v || null;
}

function normalizeDatasetKey(name, datasetHint, type) {
  const baseName = normalizeNameOnly(name);
  if (!baseName) return null;
  const scope = normalizeDatasetHint(datasetHint) || (type || '').trim().toLowerCase() || 'unknown';
  return `${baseName}::${scope}`;
}

function normalizeKey(name, type, datasetHint) {
  const baseName = normalizeNameOnly(name);
  if (!baseName) return null;
  const scope = normalizeDatasetHint(datasetHint) || (type || '').trim().toLowerCase() || 'unknown';
  return `${baseName}::${scope}`;
}

async function loadExistingEntities() {
  const existing = await GameEntitiesModel.list({ limit: MAX_EXISTING_FETCH, order: 'updated_at.desc' }) || [];
  const map = new Map();
  const nameMap = new Map();
  for (const row of existing) {
    const key = normalizeKey(row?.name, row?.type, row?.dataset_hint);
    const nameScope = normalizeDatasetKey(row?.name, row?.dataset_hint, row?.type);
    if (key && !map.has(key)) {
      map.set(key, row);
    }
    if (nameScope && !nameMap.has(nameScope)) {
      nameMap.set(nameScope, row);
    }
  }
  return { existing, map, nameMap };
}

function sanitizeEntityInput(entity = {}, { defaultSource = 'manual-upload' } = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const name = typeof entity.name === 'string' ? entity.name.trim() : '';
  const type = typeof entity.type === 'string' ? entity.type.trim() : '';
  if (!name || !type) return null;
  const payload = {
    name,
    type,
    subcategory: entity.subcategory || entity.sub_category || null,
    short_description: entity.short_description || entity.description || entity.summary || null,
    aliases: Array.isArray(entity.aliases)
      ? entity.aliases.map((alias) => String(alias).trim()).filter(Boolean)
      : typeof entity.aliases === 'string'
        ? entity.aliases.split(/[|,\n]/).map((alias) => alias.trim()).filter(Boolean)
        : undefined,
    tags: Array.isArray(entity.tags)
      ? entity.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : typeof entity.tags === 'string'
        ? entity.tags.split(/[|,\n]/).map((tag) => tag.trim()).filter(Boolean)
        : undefined,
    dataset_hint: typeof (entity.dataset_hint ?? entity.dataset ?? entity.datasetHint) === 'string'
      ? (entity.dataset_hint ?? entity.dataset ?? entity.datasetHint).trim()
      : entity.dataset_hint ?? entity.dataset ?? entity.datasetHint ?? null,
    source: entity.source || defaultSource,
    metadata: entity.metadata && typeof entity.metadata === 'object'
      ? entity.metadata
      : typeof entity.metadata === 'string'
        ? safeParseJson(entity.metadata)
        : extractMetadata(entity),
  };
  if (payload.aliases && !payload.aliases.length) delete payload.aliases;
  if (payload.tags && !payload.tags.length) delete payload.tags;
  if (payload.metadata && !Object.keys(payload.metadata).length) delete payload.metadata;
  return payload;
}

function safeParseJson(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractMetadata(entity) {
  const reserved = new Set([
    'id', 'name', 'type', 'subcategory', 'sub_category', 'short_description', 'description', 'summary',
    'aliases', 'tags', 'dataset', 'dataset_hint', 'datasetHint', 'source', 'metadata',
  ]);
  const metadata = {};
  for (const [key, value] of Object.entries(entity)) {
    if (reserved.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    metadata[key] = value;
  }
  return metadata;
}

async function upsertGameEntities(entities = [], { defaultSource = 'manual-upload', dryRun = false } = {}) {
  if (!Array.isArray(entities) || entities.length === 0) {
    return { created: 0, updated: 0, skipped: 0, total: 0 };
  }
  const { map, nameMap } = await loadExistingEntities();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of entities) {
    const payload = sanitizeEntityInput(raw, { defaultSource });
    if (!payload) {
      skipped += 1;
      continue;
    }
    const key = normalizeKey(payload.name, payload.type, payload.dataset_hint);
    const datasetKey = normalizeDatasetKey(payload.name, payload.dataset_hint, payload.type);
    if (!key) {
      skipped += 1;
      continue;
    }
    const existing = map.get(key) || nameMap.get(datasetKey) || null;
    if (existing && existing.id) {
      if (!dryRun) {
        try {
          await GameEntitiesModel.update(existing.id, payload);
        } catch (error) {
          console.error('[GameEntitiesSync] update failed:', existing.id, error?.message || error);
          skipped += 1;
          continue;
        }
      }
      updated += 1;
      map.set(key, { ...existing, ...payload, id: existing.id });
      if (datasetKey) {
        nameMap.set(datasetKey, { ...existing, ...payload, id: existing.id });
      }
    } else {
      if (!dryRun) {
        try {
          const result = await GameEntitiesModel.create(payload);
          if (result?.data?.id && !map.has(key)) {
            map.set(key, result.data);
          }
          if (result?.data?.id && datasetKey) {
            nameMap.set(datasetKey, result.data);
          }
        } catch (error) {
          console.error('[GameEntitiesSync] create failed:', payload.name, error?.message || error);
          skipped += 1;
          continue;
        }
      }
      created += 1;
    }
  }
  return { created, updated, skipped, total: entities.length };
}

module.exports = {
  normalizeKey,
  sanitizeEntityInput,
  upsertGameEntities,
  loadExistingEntities,
};
