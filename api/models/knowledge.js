/*
 Data model for Knowledge documents matching the Postgres table `public.knowledge`.
 This model is designed to work with the HTTP client in `api/knowledgeApi.js`.

 Fields (from DB schema):
 - id: bigint (server-assigned)
 - source: text (required)
 - category: text (required)
 - title: text (nullable)
 - section: text (nullable)
 - content: text (required)
 - tags: text[] (non-null, defaults to [])
 - url: text (nullable — used with dedupe)
 - version: text (nullable)
 - guild_id: bigint (nullable)
 - channel_id: bigint (nullable)
 - created_at: timestamptz (server-assigned)
 - updated_at: timestamptz (server-assigned)
 - tsv: tsvector (generated)
 - embedding: vector(1536) (nullable)

 Notes:
 - To stay consistent with `knowledgeApi.js` fallbacks, we apply conservative
   client-side limits: title <= 300 chars, content <= 12000 chars, up to 20 tags,
   each tag <= 64 chars. These mirror the API helper's sanitize/minimal payloads.
 - guild_id and channel_id may exceed JS safe integer range; we keep them as
   strings when provided as strings (otherwise as numbers if safe). No coercion
   to BigInt to avoid JSON transport issues.
*/

const api = require('../knowledgeApi');

// Constants aligned with knowledgeApi.js helpers
const MAX_TITLE_LEN = 300;
const MAX_CONTENT_LEN = 12000;
const MAX_TAGS = 20;
const MAX_TAG_LEN = 64;
const VECTOR_DIM = 1536;

/**
 * @typedef {Object} Knowledge
 * @property {string|number} [id]
 * @property {string} source
 * @property {string} category
 * @property {string} [title]
 * @property {string} [section]
 * @property {string} content
 * @property {string[]} [tags]
 * @property {string} [url]
 * @property {string} [version]
 * @property {string|number} [guild_id]
 * @property {string|number} [channel_id]
 * @property {string} [created_at]
 * @property {string} [updated_at]
 * @property {number[]} [embedding]
 */

// Utility coercers and validators
function strOrUndefined(v) {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function limit(str, max) {
  if (str === undefined) return undefined;
  const s = String(str);
  return s.length > max ? s.slice(0, max) : s;
}

function coerceTags(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const t of arr) {
    if (t === undefined || t === null) continue;
    const s = String(t).trim();
    if (!s) continue;
    out.push(s.slice(0, MAX_TAG_LEN));
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function isValidEmbedding(vec) {
  if (!Array.isArray(vec)) return false;
  if (vec.length !== VECTOR_DIM) return false;
  return vec.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function generateDefaultUrl() {
  return `discord://note/${Date.now()}`;
}

// Build a safe, sanitized payload for create/update operations
function toApiPayload(input) {
  const payload = {};

  if (input.source !== undefined) payload.source = String(input.source);
  if (input.category !== undefined) payload.category = String(input.category);
  if (input.title !== undefined) payload.title = limit(input.title, MAX_TITLE_LEN);
  if (input.section !== undefined) payload.section = String(input.section);
  if (input.content !== undefined) payload.content = limit(input.content, MAX_CONTENT_LEN) || '';
  if (input.tags !== undefined) payload.tags = coerceTags(input.tags);
  if (input.url !== undefined) payload.url = String(input.url);
  if (input.version !== undefined) payload.version = String(input.version);
  if (input.guild_id !== undefined) payload.guild_id = input.guild_id;
  if (input.channel_id !== undefined) payload.channel_id = input.channel_id;
  if (input.embedding !== undefined && Array.isArray(input.embedding)) payload.embedding = input.embedding;

  // Ensure minimal required defaults if creating
  if (!payload.source) payload.source = 'discord';
  if (!payload.category) payload.category = 'chat';
  if (payload.content === undefined) payload.content = '';

  return payload;
}

// Validate a proposed Knowledge document. Does not throw; returns report.
function validate(input) {
  const errors = [];
  const value = toApiPayload(input || {});

  // Required
  if (!value.source) errors.push('source is required');
  if (!value.category) errors.push('category is required');
  if (!value.content || typeof value.content !== 'string') errors.push('content is required');

  // Length checks
  if (value.title && value.title.length > MAX_TITLE_LEN) errors.push(`title must be <= ${MAX_TITLE_LEN}`);
  if (value.content && value.content.length > MAX_CONTENT_LEN) errors.push(`content must be <= ${MAX_CONTENT_LEN}`);
  if (Array.isArray(value.tags) && value.tags.length > MAX_TAGS) errors.push(`tags must have <= ${MAX_TAGS} items`);
  if (Array.isArray(value.tags)) {
    for (const t of value.tags) {
      if (t.length > MAX_TAG_LEN) errors.push(`tag '${t.slice(0, 16)}...' exceeds ${MAX_TAG_LEN} chars`);
    }
  }

  // Embedding
  if (value.embedding !== undefined && !isValidEmbedding(value.embedding)) {
    errors.push(`embedding must be an array of ${VECTOR_DIM} finite numbers`);
  }

  return { ok: errors.length === 0, errors, value };
}

// Compute the dedupe key used by the DB unique index (mirrors COALESCE order)
function dedupeKey(doc) {
  const source = (doc && doc.source) ? String(doc.source) : '';
  const url = (doc && doc.url) ? String(doc.url) : '';
  const version = (doc && doc.version) ? String(doc.version) : '';
  const section = (doc && doc.section) ? String(doc.section) : '';
  return `${source}||${url}||${version}||${section}`;
}

// Convert an API row to a normalized model instance
function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {
    id: row.id,
    source: strOrUndefined(row.source),
    category: strOrUndefined(row.category),
    title: strOrUndefined(row.title),
    section: strOrUndefined(row.section),
    content: strOrUndefined(row.content),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    url: strOrUndefined(row.url),
    version: strOrUndefined(row.version),
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    embedding: Array.isArray(row.embedding) ? row.embedding : undefined,
  };
  return out;
}

// High-level model with helpers that wrap `knowledgeApi.js`
const KnowledgeModel = {
  table: 'knowledge',
  vectorDim: VECTOR_DIM,
  limits: {
    title: MAX_TITLE_LEN,
    content: MAX_CONTENT_LEN,
    tagsCount: MAX_TAGS,
    tagLen: MAX_TAG_LEN,
  },

  // Validate and optionally auto-fill minimal defaults
  validate,
  toApiPayload,
  fromApiRow,
  dedupeKey,

  // CRUD wrappers against the HTTP API client
  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) {
      return { ok: false, errors };
    }
    // Ensure URL exists for better dedupe semantics
    if (!value.url && (value.section || value.version)) {
      value.url = generateDefaultUrl();
    }
    const created = await api.createKnowledge(value);
    return created ? { ok: true, data: fromApiRow(created) } : { ok: false, errors: ['create failed'] };
  },

  async getById(id) {
    const row = await api.getKnowledgeById(id);
    return row ? fromApiRow(row) : null;
  },

  async list(params = {}) {
    const rows = await api.listKnowledge(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async update(id, patch) {
    const { value } = validate(patch || {});
    const ok = await api.updateKnowledge(id, value);
    return !!ok;
  },

  async remove(id) {
    const ok = await api.deleteKnowledge(id);
    return !!ok;
  },

  async vectorSearch({ queryEmbedding, limit, filter_category, filter_guild_id, filter_channel_id }) {
    const body = { queryEmbedding };
    if (typeof limit === 'number') body.limit = limit;
    if (filter_category) body.filter_category = filter_category;
    if (filter_guild_id) body.filter_guild_id = filter_guild_id;
    if (filter_channel_id) body.filter_channel_id = filter_channel_id;

    const res = await api.vectorSearchKnowledge(body);
    if (!res) return null;
    // Expect array of rows (or objects with { row, score }) depending on API; normalize best-effort
    if (Array.isArray(res)) {
      return res.map((r) => {
        if (r && typeof r === 'object' && 'row' in r) {
          return { row: fromApiRow(r.row), score: r.score };
        }
        return { row: fromApiRow(r), score: r.score };
      });
    }
    return res;
  },

  async updateEmbedding(id, embedding) {
    if (!isValidEmbedding(embedding)) return false;
    return !!(await api.updateKnowledgeEmbedding(id, embedding));
  },

  // Dedupe helpers via paginated scans
  async findByUrl({ url, category, section }) {
    const row = await api.findKnowledgeByUrl({ url, category, section });
    return row ? fromApiRow(row) : null;
  },

  async listAllUrls({ category, section }) {
    return api.listAllKnowledgeUrls({ category, section });
  },
};

module.exports = { KnowledgeModel };
