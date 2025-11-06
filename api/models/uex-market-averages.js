/* Model for uex_market_averages wrapping `/marketaverages/` */
const uex = require('../uexApi');
const { toIntLike } = require('./_utils');

const ID_FIELDS = ['id', 'id_item', 'id_category', 'price_buy', 'price_sell', 'date_added', 'date_modified'];
const STR_FIELDS = ['item_name', 'item_uuid'];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  return payload;
}

function validate(input) {
  const value = toApiPayload(input || {});
  const errors = [];
  if (value.id === undefined) errors.push('id is required');
  if (value.id_item === undefined) errors.push('id_item is required');
  if (value.id_category === undefined) errors.push('id_category is required');
  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const f of ID_FIELDS) out[f] = toIntLike(row[f]);
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  return out;
}

const UexMarketAveragesModel = {
  table: 'uex_market_averages',
  validate, toApiPayload, fromApiRow,
  async list() {
    const rows = await uex.getAllMarketAverages();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },
  async getById(id) {
    const row = await uex.getMarketAverageById(id);
    return row ? fromApiRow(row) : null;
  },
  async upsert(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    try {
      await uex.createOrUpdateMarketAverage(value);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [e?.response?.data || e?.message || 'upsert failed'] };
    }
  },
};

module.exports = { UexMarketAveragesModel };
