/* Model for uex_item_categories wrapping `/itemcategories/` */
const uex = require('../uexApi');
const { toIntLike, toFlag01, fromFlag } = require('./_utils');

const ID_FIELDS = ['id', 'date_added', 'date_modified'];
const STR_FIELDS = ['type', 'section', 'name'];
const FLAG_FIELDS = ['is_game_related', 'is_mining'];

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
  if (value.name === undefined) errors.push('name is required');
  if (value.type === undefined) errors.push('type is required');
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

const UexItemCategoriesModel = {
  table: 'uex_item_categories',
  validate, toApiPayload, fromApiRow,
  async list() {
    const rows = await uex.getAllItemCategories();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },
  async getById(id) {
    const row = await uex.getItemCategoryById(id);
    return row ? fromApiRow(row) : null;
  },
  async upsert(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    try {
      await uex.createOrUpdateItemCategory(value);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [e?.response?.data || e?.message || 'upsert failed'] };
    }
  },
};

module.exports = { UexItemCategoriesModel };
