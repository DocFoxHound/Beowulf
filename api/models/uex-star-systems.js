/* Model for uex_star_systems wrapping `/starsystems/` */
const uex = require('../uexApi');
const { toIntLike, toFlag01, fromFlag } = require('./_utils');

const ID_FIELDS = ['id', 'id_faction', 'id_jurisdiction', 'date_added', 'date_modified'];
const FLAG_FIELDS = ['is_available', 'is_available_live', 'is_visible', 'is_default'];
const STR_FIELDS = ['name', 'code', 'wiki', 'faction_name', 'jurisdiction_name'];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of FLAG_FIELDS) if (input[f] !== undefined) payload[f] = toFlag01(input[f]);
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  return payload;
}

function validate(input) {
  const value = toApiPayload(input || {});
  const errors = [];
  if (value.id === undefined) errors.push('id is required');
  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const f of ID_FIELDS) out[f] = row[f] !== undefined ? toIntLike(row[f]) : undefined;
  for (const f of FLAG_FIELDS) out[f] = fromFlag(row[f]);
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  return out;
}

const UexStarSystemsModel = {
  table: 'uex_star_systems',
  validate, toApiPayload, fromApiRow,
  async list() {
    const rows = await uex.getAllStarSystems();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },
  async getById(id) {
    const row = await uex.getStarSystemById(id);
    return row ? fromApiRow(row) : null;
  },
  async upsert(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    try { await uex.createOrUpdateStarSystem(value); return { ok: true }; }
    catch (e) { return { ok: false, errors: [e?.response?.data || e?.message || 'upsert failed'] }; }
  },
};

module.exports = { UexStarSystemsModel };
