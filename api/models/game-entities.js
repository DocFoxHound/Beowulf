const api = require('../gameEntitiesApi');
const { limitStr, toStrArray, toJson } = require('./_utils');

const VECTOR_DIM = 1536;
const MAX_NAME_LEN = 200;
const MAX_DESC_LEN = 600;
const MAX_TYPE_LEN = 64;
const MAX_SOURCE_LEN = 64;
const MAX_TAGS = 32;
const MAX_TAG_LEN = 64;
const MAX_ALIASES = 32;
const MAX_ALIAS_LEN = 80;

function normalizeStringArray(input, { maxItems = MAX_TAGS, maxLen = MAX_TAG_LEN } = {}) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const value of input) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (!str) continue;
    out.push(str.length > maxLen ? str.slice(0, maxLen) : str);
    if (out.length >= maxItems) break;
  }
  return out;
}

function isValidVector(vec) {
  return Array.isArray(vec) && vec.length === VECTOR_DIM && vec.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function normalizeMetadata(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'object') return value;
  const parsed = toJson(value);
  return parsed === undefined ? undefined : parsed;
}

function toApiPayload(input = {}) {
  const payload = {};
  if (input.id !== undefined) payload.id = String(input.id);
  if (input.name !== undefined) payload.name = limitStr(input.name, MAX_NAME_LEN);
  if (input.type !== undefined) payload.type = limitStr(input.type, MAX_TYPE_LEN);
  if (input.subcategory !== undefined) payload.subcategory = limitStr(input.subcategory, MAX_TYPE_LEN);
  if (input.short_description !== undefined) payload.short_description = limitStr(input.short_description, MAX_DESC_LEN);
  if (input.tags !== undefined) payload.tags = normalizeStringArray(input.tags, { maxItems: MAX_TAGS, maxLen: MAX_TAG_LEN });
  if (input.aliases !== undefined) payload.aliases = normalizeStringArray(input.aliases, { maxItems: MAX_ALIASES, maxLen: MAX_ALIAS_LEN });
  if (input.metadata !== undefined) payload.metadata = normalizeMetadata(input.metadata);
  if (input.source !== undefined) payload.source = limitStr(input.source, MAX_SOURCE_LEN);
  if (input.dataset_hint !== undefined) payload.dataset_hint = limitStr(input.dataset_hint, MAX_TYPE_LEN);
  if (input.vector !== undefined && isValidVector(input.vector)) payload.vector = input.vector;
  if (input.created_at !== undefined) payload.created_at = input.created_at;
  if (input.updated_at !== undefined) payload.updated_at = input.updated_at;
  return payload;
}

function validate(input, { partial = false } = {}) {
  const value = toApiPayload(input || {});
  const errors = [];

  if (!partial) {
    if (!value.name) errors.push('name is required');
    if (!value.type) errors.push('type is required');
  }

  if (value.name && value.name.length > MAX_NAME_LEN) errors.push(`name must be <= ${MAX_NAME_LEN} chars`);
  if (value.type && value.type.length > MAX_TYPE_LEN) errors.push(`type must be <= ${MAX_TYPE_LEN} chars`);
  if (value.subcategory && value.subcategory.length > MAX_TYPE_LEN) errors.push(`subcategory must be <= ${MAX_TYPE_LEN} chars`);
  if (value.short_description && value.short_description.length > MAX_DESC_LEN) errors.push(`short_description must be <= ${MAX_DESC_LEN} chars`);
  if (value.source && value.source.length > MAX_SOURCE_LEN) errors.push(`source must be <= ${MAX_SOURCE_LEN} chars`);

  if (value.tags && value.tags.length > MAX_TAGS) errors.push(`tags must contain <= ${MAX_TAGS} entries`);
  if (value.aliases && value.aliases.length > MAX_ALIASES) errors.push(`aliases must contain <= ${MAX_ALIASES} entries`);

  if (input.vector !== undefined && !isValidVector(input.vector)) {
    errors.push(`vector must be an array of ${VECTOR_DIM} finite numbers`);
  }

  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    subcategory: row.subcategory || row.sub_category || null,
    short_description: row.short_description || row.description || null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : null,
    source: row.source,
    dataset_hint: row.dataset_hint || row.dataset || null,
    vector: Array.isArray(row.vector) ? row.vector : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const GameEntitiesModel = {
  table: 'game_entities',
  vectorDim: VECTOR_DIM,
  limits: {
    name: MAX_NAME_LEN,
    description: MAX_DESC_LEN,
    tags: MAX_TAGS,
    aliases: MAX_ALIASES,
  },

  validate,
  toApiPayload,
  fromApiRow,

  async list(params = {}) {
    const rows = await api.listGameEntities(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getGameEntityById(id);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const created = await api.createGameEntity(value);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async replace(id, doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const updated = await api.updateGameEntity(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async update(id, patch) {
    const { ok, errors, value } = validate(patch, { partial: true });
    if (!ok) return { ok: false, errors };
    const updated = await api.patchGameEntity(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async remove(id) {
    return !!(await api.deleteGameEntity(id));
  },

  async search(body = {}) {
    const res = await api.searchGameEntities(body);
    if (!res) return null;
    if (Array.isArray(res)) {
      return res.map((entry) => {
        if (entry && typeof entry === 'object' && entry.row) {
          return { row: fromApiRow(entry.row), score: entry.score };
        }
        return { row: fromApiRow(entry), score: entry?.score };
      });
    }
    return res;
  },
};

module.exports = { GameEntitiesModel };
