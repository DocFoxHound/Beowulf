/* Model for public.memories wrapping memoriesApi.js */
const api = require('../memoriesApi');
const { limitStr } = require('./_utils');

const MEMORY_TYPES = ['episodic', 'inside_joke', 'profile', 'lore'];
const VECTOR_DIM = 1536;
const MAX_CONTENT_LEN = 8000;
const MAX_TAGS = 24;
const MAX_TAG_LEN = 64;
const IMPORTANCE_MIN = -10;
const IMPORTANCE_MAX = 100;

function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const raw of tags) {
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    out.push(trimmed.length > MAX_TAG_LEN ? trimmed.slice(0, MAX_TAG_LEN) : trimmed);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function clampImportance(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(IMPORTANCE_MIN, Math.min(IMPORTANCE_MAX, Math.round(n)));
}

function isValidVector(vec) {
  return Array.isArray(vec) && vec.length === VECTOR_DIM && vec.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toApiPayload(input = {}) {
  const payload = {};
  if (input.id !== undefined) payload.id = String(input.id);
  if (input.user_id !== undefined) payload.user_id = input.user_id === null ? null : String(input.user_id);
  if (input.guild_id !== undefined) payload.guild_id = String(input.guild_id);
  if (input.channel_id !== undefined) payload.channel_id = input.channel_id === null ? null : String(input.channel_id);
  if (input.type !== undefined) payload.type = String(input.type);
  if (input.content !== undefined) payload.content = limitStr(input.content, MAX_CONTENT_LEN);
  if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags);
    if (tags !== undefined) payload.tags = tags;
  }
  if (input.importance !== undefined) payload.importance = clampImportance(input.importance);
  if (input.vector !== undefined && isValidVector(input.vector)) payload.vector = input.vector;
  if (input.last_used_at !== undefined) payload.last_used_at = normalizeTimestamp(input.last_used_at);
  if (input.created_at !== undefined) payload.created_at = normalizeTimestamp(input.created_at);
  if (input.updated_at !== undefined) payload.updated_at = normalizeTimestamp(input.updated_at);
  return payload;
}

function validate(input, { partial = false } = {}) {
  const value = toApiPayload(input || {});
  const errors = [];

  if (!partial) {
    if (!value.guild_id) errors.push('guild_id is required');
    if (!value.type) errors.push('type is required');
    if (!value.content) errors.push('content is required');
  }

  if (value.type && !MEMORY_TYPES.includes(value.type)) {
    errors.push(`type must be one of ${MEMORY_TYPES.join(', ')}`);
  }

  if (value.content && value.content.length > MAX_CONTENT_LEN) {
    errors.push(`content must be <= ${MAX_CONTENT_LEN} characters`);
  }

  if (value.tags && value.tags.length > MAX_TAGS) {
    errors.push(`tags must contain <= ${MAX_TAGS} items`);
  }

  if (value.tags) {
    for (const tag of value.tags) {
      if (tag.length > MAX_TAG_LEN) {
        errors.push(`tag '${tag.slice(0, 16)}...' exceeds ${MAX_TAG_LEN} characters`);
        break;
      }
    }
  }

  if (value.importance !== undefined && value.importance !== null) {
    if (value.importance < IMPORTANCE_MIN || value.importance > IMPORTANCE_MAX) {
      errors.push(`importance must be between ${IMPORTANCE_MIN} and ${IMPORTANCE_MAX}`);
    }
  }

  if (input.vector !== undefined && !isValidVector(input.vector)) {
    errors.push(`vector must be an array of ${VECTOR_DIM} finite numbers`);
  }

  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    user_id: row.user_id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    type: row.type,
    content: row.content,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    importance: row.importance !== undefined && row.importance !== null ? Number(row.importance) : undefined,
    vector: Array.isArray(row.vector) ? row.vector : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
  };
}

const MemoriesModel = {
  table: 'memories',
  vectorDim: VECTOR_DIM,
  allowedTypes: MEMORY_TYPES,
  limits: {
    content: MAX_CONTENT_LEN,
    tags: MAX_TAGS,
    tagLength: MAX_TAG_LEN,
    importance: [IMPORTANCE_MIN, IMPORTANCE_MAX],
  },

  validate,
  toApiPayload,
  fromApiRow,

  async list(params = {}) {
    const rows = await api.listMemories(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getMemoryById(id);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const created = await api.createMemory(value);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async replace(id, doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const updated = await api.updateMemory(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async update(id, patch) {
    const { ok, errors, value } = validate(patch, { partial: true });
    if (!ok) return { ok: false, errors };
    const updated = await api.patchMemory(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async remove(id) {
    return !!(await api.deleteMemory(id));
  },

  async vectorSearch(body) {
    if (!body || !isValidVector(body.queryEmbedding || body.embedding || [])) {
      console.warn('[MemoriesModel] vectorSearch called without a valid embedding');
    }
    const res = await api.vectorSearchMemories(body);
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

  async updateEmbedding(id, embedding) {
    if (!isValidVector(embedding)) return false;
    return !!(await api.updateMemoryEmbedding(id, embedding));
  },
};

module.exports = { MemoriesModel };
