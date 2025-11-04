/* Model for public.users wrapping userlistApi.js */
const api = require('../userlistApi');
const { limitStr, toIntLike, toIntArray } = require('./_utils');

const MAX_NAME = 100;

const ID_FIELDS = ['id','rank','verification_code','fleet'];
const INT_FIELDS = ['corsair_level','raptor_level','raider_level'];
const STR_FIELDS = ['username','nickname','rsi_handle','rsi_display_name','player_org'];
const ARR_BIGINT_FIELDS = ['roles'];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of INT_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  if (input.joined_date !== undefined) payload.joined_date = input.joined_date; // ISO string or Date accepted by API
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = limitStr(input[f], MAX_NAME);
  for (const f of ARR_BIGINT_FIELDS) if (input[f] !== undefined) payload[f] = toIntArray(input[f]);
  return payload;
}

function validate(input) {
  const value = toApiPayload(input || {});
  const errors = [];
  if (value.id === undefined) errors.push('id is required');
  for (const f of ['username','nickname']) {
    if (value[f] && String(value[f]).length > MAX_NAME) errors.push(`${f} must be <= ${MAX_NAME} chars`);
  }
  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const f of ID_FIELDS) out[f] = row[f] !== undefined ? toIntLike(row[f]) : undefined;
  for (const f of INT_FIELDS) out[f] = row[f] !== undefined ? toIntLike(row[f]) : undefined;
  out.joined_date = row.joined_date;
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  for (const f of ARR_BIGINT_FIELDS) out[f] = Array.isArray(row[f]) ? row[f].map(toIntLike).filter(v=>v!==undefined) : [];
  return out;
}

const UsersModel = {
  table: 'users',
  validate, toApiPayload, fromApiRow,

  async list() {
    const rows = await api.getUsers();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getUserById(id);
    return row ? fromApiRow(row) : null;
  },

  async getByUsername(username) {
    const row = await api.getUserByUsername(username);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const res = await api.createUser(value);
    return res ? { ok: true } : { ok: false, errors: ['create failed'] };
  },

  async update(id, patch) {
    const { value } = validate({ ...patch, id });
    const ok = await api.editUser(id, value);
    return !!ok;
  },

  async remove(id) {
    const ok = await api.deleteUser(id);
    return !!ok;
  },
};

module.exports = { UsersModel };
