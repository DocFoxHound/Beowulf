/* Model for uex_items wrapping `/items/` */
const uex = require('../uexApi');
const { toIntLike, toFlag01, fromFlag } = require('./_utils');

const ID_FIELDS = ['id', 'id_parent', 'id_category', 'id_company', 'id_vehicle', 'date_added', 'date_modified'];
const STR_FIELDS = [
  'name', 'section', 'category', 'company_name', 'vehicle_name',
  'slug', 'size', 'uuid', 'url_store', 'screenshot', 'game_version', 'notification'
];
const FLAG_FIELDS = [
  'is_exclusive_pledge', 'is_exclusive_subscriber', 'is_exclusive_concierge',
  'is_commodity', 'is_harvestable'
];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  for (const f of FLAG_FIELDS) if (input[f] !== undefined) payload[f] = toFlag01(input[f]);
  return payload;
}

function validate(input) {
  const value = toApiPayload(input || {});
  const errors = [];
  if (value.id === undefined) errors.push('id is required');
  if (value.id_category === undefined) errors.push('id_category is required');
  if (value.name === undefined) errors.push('name is required');
  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const f of ID_FIELDS) out[f] = toIntLike(row[f]);
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  for (const f of FLAG_FIELDS) out[f] = fromFlag(row[f]);
  return out;
}

const UexItemsModel = {
  table: 'uex_items',
  validate, toApiPayload, fromApiRow,
  async list() {
    const rows = await uex.getAllItems();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },
  async getById(id) {
    const row = await uex.getItemById(id);
    return row ? fromApiRow(row) : null;
  },
  async upsert(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    try {
      await uex.createOrUpdateItem(value);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [e?.response?.data || e?.message || 'upsert failed'] };
    }
  },
};

module.exports = { UexItemsModel };
