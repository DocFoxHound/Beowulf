const api = require('../itemsComponentsApi');

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function normalizeStats(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function normalizeString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function toApiPayload(input = {}) {
  const payload = {};
  if (input.id !== undefined) {
    const id = normalizeId(input.id);
    if (id !== null) payload.id = id;
  }
  if (input.name !== undefined) payload.name = normalizeString(input.name);
  if (input.category !== undefined) payload.category = normalizeString(input.category);
  if (input.type !== undefined) payload.type = normalizeString(input.type);
  if (input.stats !== undefined) payload.stats = normalizeStats(input.stats);
  return payload;
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    name: row.name ?? null,
    category: row.category ?? null,
    type: row.type ?? null,
    stats: row.stats && typeof row.stats === 'object' ? row.stats : null,
  };
}

function validate(input, { partial = false } = {}) {
  const errors = [];
  const value = toApiPayload(input || {});

  if (!partial) {
    const id = normalizeId(input?.id ?? value.id);
    if (id === null) errors.push('id is required and must be numeric');
    else value.id = id;
  }

  if (input?.stats !== undefined && value.stats === null && input.stats !== null) {
    errors.push('stats must be JSON or null');
  }

  return { ok: errors.length === 0, errors, value };
}

const ItemsComponentsModel = {
  table: 'items_components',
  normalizeId,
  normalizeStats,
  toApiPayload,
  fromApiRow,
  validate,

  async list(params = {}) {
    const rows = await api.listItemsComponents(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getItemsComponentById(id);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const created = await api.createItemsComponent(value);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async update(id, patch) {
    const { ok, errors, value } = validate(patch, { partial: true });
    if (!ok) return { ok: false, errors };
    const updated = await api.updateItemsComponent(id, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async remove(id) {
    return !!(await api.deleteItemsComponent(id));
  },
};

module.exports = { ItemsComponentsModel };
