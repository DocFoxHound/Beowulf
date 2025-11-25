/* Model for public.knowledge_docs wrapping knowledgeDocsApi.js */
const api = require('../knowledgeDocsApi');

const VECTOR_DIM = 1536;
const MAX_TITLE_LEN = 400;
const MAX_TEXT_LEN = 20000;
const MAX_TAGS = 32;
const MAX_TAG_LEN = 64;

function limit(str, max) {
  if (str === undefined || str === null) return undefined;
  const value = String(str);
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const t of tags) {
    if (t === undefined || t === null) continue;
    const trimmed = String(t).trim();
    if (!trimmed) continue;
    out.push(trimmed.length > MAX_TAG_LEN ? trimmed.slice(0, MAX_TAG_LEN) : trimmed);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function isValidVector(vec) {
  return Array.isArray(vec) && vec.length === VECTOR_DIM && vec.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function toApiPayload(input = {}) {
  const payload = {};
  if (input.id !== undefined) payload.id = String(input.id);
  if (input.title !== undefined) payload.title = limit(input.title, MAX_TITLE_LEN);
  if (input.text !== undefined) payload.text = limit(input.text, MAX_TEXT_LEN);
  if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags);
    if (tags !== undefined) payload.tags = tags;
  }
  if (input.vector !== undefined && isValidVector(input.vector)) payload.vector = input.vector;
  if (input.version !== undefined) payload.version = String(input.version);
  if (input.created_at !== undefined) payload.created_at = input.created_at;
  return payload;
}

function validate(input, { partial = false } = {}) {
  const value = toApiPayload(input || {});
  const errors = [];

  if (!partial) {
    if (!value.title) errors.push('title is required');
    if (!value.text) errors.push('text is required');
  }

  if (value.title && value.title.length > MAX_TITLE_LEN) {
    errors.push(`title must be <= ${MAX_TITLE_LEN} characters`);
  }

  if (value.text && value.text.length > MAX_TEXT_LEN) {
    errors.push(`text must be <= ${MAX_TEXT_LEN} characters`);
  }

  if (value.tags && value.tags.length > MAX_TAGS) {
    errors.push(`tags must contain <= ${MAX_TAGS} entries`);
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
    title: row.title,
    text: row.text,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    vector: Array.isArray(row.vector) ? row.vector : undefined,
    version: row.version,
    created_at: row.created_at,
  };
}

const KnowledgeDocsModel = {
  table: 'knowledge_docs',
  vectorDim: VECTOR_DIM,
  limits: {
    title: MAX_TITLE_LEN,
    text: MAX_TEXT_LEN,
    tags: MAX_TAGS,
  },

  validate,
  toApiPayload,
  fromApiRow,

  async list(params = {}) {
    const rows = await api.listKnowledgeDocs(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getKnowledgeDocById(id);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const created = await api.createKnowledgeDoc(value);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async replace(id, doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const updated = await api.updateKnowledgeDoc(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async update(id, patch) {
    const { ok, errors, value } = validate(patch, { partial: true });
    if (!ok) return { ok: false, errors };
    const updated = await api.patchKnowledgeDoc(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async remove(id) {
    return !!(await api.deleteKnowledgeDoc(id));
  },

  async vectorSearch(body = {}) {
    const embedding = body.queryEmbedding || body.embedding;
    if (embedding && !isValidVector(embedding)) {
      console.warn('[KnowledgeDocsModel] vectorSearch called with invalid embedding');
      return null;
    }
    const res = await api.vectorSearchKnowledgeDocs(body);
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
    return !!(await api.updateKnowledgeDocEmbedding(id, embedding));
  },
};

module.exports = { KnowledgeDocsModel };
