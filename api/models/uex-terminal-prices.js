/* Model for uex_terminal_prices wrapping uexApi `/terminalprices/` */
const uex = require('../uexApi');
const { toIntLike, toFloat, toFlag01, fromFlag } = require('./_utils');

const ID_FIELDS = [
  'id', 'id_commodity', 'id_star_system', 'id_planet', 'id_orbit', 'id_moon',
  'id_city', 'id_outpost', 'id_poi', 'id_terminal', 'id_faction',
  'price_buy_users_rows', 'price_sell_users_rows', 'scu_buy_users_rows', 'scu_sell_users_rows',
  'status_buy', 'status_buy_min', 'status_buy_min_week', 'status_buy_min_month',
  'status_buy_max', 'status_buy_max_week', 'status_buy_max_month',
  'status_buy_avg', 'status_buy_avg_week', 'status_buy_avg_month',
  'status_sell', 'status_sell_min', 'status_sell_min_week', 'status_sell_min_month',
  'status_sell_max', 'status_sell_max_week', 'status_sell_max_month',
  'status_sell_avg', 'status_sell_avg_week', 'status_sell_avg_month',
  'faction_affinity', 'date_added', 'date_modified', 'terminal_mcs'
];

const FLAG_FIELDS = [ 'terminal_is_player_owned' ];

const FLOAT_FIELDS = [
  'price_buy', 'price_buy_min', 'price_buy_min_week', 'price_buy_min_month',
  'price_buy_max', 'price_buy_max_week', 'price_buy_max_month', 'price_buy_avg',
  'price_buy_avg_week', 'price_buy_avg_month', 'price_buy_users',
  'price_sell', 'price_sell_min', 'price_sell_min_week', 'price_sell_min_month',
  'price_sell_max', 'price_sell_max_week', 'price_sell_max_month', 'price_sell_avg',
  'price_sell_avg_week', 'price_sell_avg_month', 'price_sell_users',
  'scu_buy', 'scu_buy_min', 'scu_buy_min_week', 'scu_buy_min_month', 'scu_buy_max',
  'scu_buy_max_week', 'scu_buy_max_month', 'scu_buy_avg', 'scu_buy_avg_week',
  'scu_buy_avg_month', 'scu_buy_users',
  'scu_sell_stock', 'scu_sell_stock_avg', 'scu_sell_stock_avg_week', 'scu_sell_stock_avg_month',
  'scu_sell', 'scu_sell_min', 'scu_sell_min_week', 'scu_sell_min_month', 'scu_sell_max',
  'scu_sell_max_week', 'scu_sell_max_month', 'scu_sell_avg', 'scu_sell_avg_week', 'scu_sell_avg_month', 'scu_sell_users',
  'volatility_buy', 'volatility_sell', 'volatility_price_buy', 'volatility_price_sell', 'volatility_scu_buy', 'volatility_scu_sell'
];

const STR_FIELDS = [
  'container_sizes', 'game_version', 'commodity_name', 'commodity_code', 'commodity_slug',
  'star_system_name', 'planet_name', 'orbit_name', 'moon_name', 'space_station_name',
  'city_name', 'outpost_name', 'poi_name', 'faction_name', 'terminal_name', 'terminal_slug', 'terminal_code'
];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of FLAG_FIELDS) if (input[f] !== undefined) payload[f] = toFlag01(input[f]);
  for (const f of FLOAT_FIELDS) if (input[f] !== undefined) payload[f] = toFloat(input[f]);
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
  for (const f of FLOAT_FIELDS) out[f] = row[f] !== undefined ? Number(row[f]) : undefined;
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  return out;
}

const UexTerminalPricesModel = {
  table: 'uex_terminal_prices',
  validate, toApiPayload, fromApiRow,
  async list() {
    const rows = await uex.getAllTerminalPrices();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },
  async getById(id) {
    const row = await uex.getTerminalPricesById(id);
    return row ? fromApiRow(row) : null;
  },
  async upsert(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    try { await uex.createOrUpdateTerminalPrices(value); return { ok: true }; }
    catch (e) { return { ok: false, errors: [e?.response?.data || e?.message || 'upsert failed'] }; }
  },
};

module.exports = { UexTerminalPricesModel };
