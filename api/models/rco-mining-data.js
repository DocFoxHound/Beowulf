const api = require('../rcoMiningDataApi');

const FIELD_SPECS = {
  id: { type: 'int' },
  source_file: { type: 'string', required: true },
  stat_grain: { type: 'string', required: true },
  system_name: { type: 'string' },
  location_code: { type: 'string' },
  rock_type: { type: 'string' },
  ore_name: { type: 'string' },
  scans: { type: 'int' },
  clusters: { type: 'int' },
  finds: { type: 'int' },
  cluster_min: { type: 'int' },
  cluster_max: { type: 'int' },
  cluster_med: { type: 'int' },
  mass_min: { type: 'float' },
  mass_max: { type: 'float' },
  mass_med: { type: 'float' },
  inst_min: { type: 'float' },
  inst_max: { type: 'float' },
  inst_med: { type: 'float' },
  res_min: { type: 'float' },
  res_max: { type: 'float' },
  res_med: { type: 'float' },
  rocks_min: { type: 'int' },
  rocks_max: { type: 'int' },
  rocks_med: { type: 'int' },
  ore_prob: { type: 'float' },
  ore_pct_min: { type: 'float' },
  ore_pct_max: { type: 'float' },
  ore_pct_med: { type: 'float' },
};

function canonicalizeKey(key) {
  if (key === undefined || key === null) return null;
  return String(key)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function normalizeInt(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function normalizeFloat(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

const NORMALIZERS = {
  string: normalizeString,
  int: normalizeInt,
  float: normalizeFloat,
};

function normalizeInput(input = {}, { partial = false } = {}) {
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['row must be an object'], value: {} };
  }
  const errors = [];
  const value = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const canonical = canonicalizeKey(rawKey);
    if (!canonical || !FIELD_SPECS[canonical]) continue;
    const spec = FIELD_SPECS[canonical];
    const normalizer = NORMALIZERS[spec.type] || ((val) => val);
    const normalized = normalizer(rawValue);
    if (normalized === undefined) {
      errors.push(`Invalid value for ${canonical}`);
      continue;
    }
    value[canonical] = normalized;
  }

  if (!partial) {
    for (const [field, spec] of Object.entries(FIELD_SPECS)) {
      if (!spec.required) continue;
      const current = value[field];
      if (current === undefined || current === null || current === '') {
        errors.push(`${field} is required`);
      }
    }
  }

  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const doc = {};
  for (const field of Object.keys(FIELD_SPECS)) {
    if (row[field] === undefined) continue;
    doc[field] = row[field];
  }
  return doc;
}

const RcoMiningDataModel = {
  table: 'rco_mining_data',
  normalizeInput,
  fromApiRow,

  async list(params = {}) {
    const rows = await api.listRcoMiningData(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getRcoMiningDataById(id);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = normalizeInput(doc);
    if (!ok) return { ok: false, errors };
    const payload = { ...value };
    const created = await api.createRcoMiningData(payload);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async update(id, patch) {
    const { ok, errors, value } = normalizeInput(patch, { partial: true });
    if (!ok) return { ok: false, errors };
    const payload = { ...value };
    delete payload.id;
    if (!Object.keys(payload).length) {
      return { ok: false, errors: ['no fields provided for update'] };
    }
    const updated = await api.updateRcoMiningData(id, payload);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async remove(id) {
    return !!(await api.deleteRcoMiningData(id));
  },
};

module.exports = { RcoMiningDataModel };
