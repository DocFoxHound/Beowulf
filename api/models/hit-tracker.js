/* Model for public.hit_tracker wrapping hitTrackerApi.js */
const api = require('../hitTrackerApi');
const { toIntLike, toFloat, toIntArray, toStrArray, toJson } = require('./_utils');

const ID_FIELDS = ['id','user_id','thread_id'];
const FLOAT_FIELDS = ['total_value','total_cut_value','total_scu','total_cut_scu'];
const STR_FIELDS = ['patch','air_or_ground','title','story','username','video_link','type_of_piracy'];
const JSON_FIELDS = ['cargo'];
const ARR_BIGINT_FIELDS = ['assists','fleet_ids'];
const ARR_TEXT_FIELDS = ['assists_usernames','victims','guests','additional_media_links'];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of FLOAT_FIELDS) if (input[f] !== undefined) payload[f] = toFloat(input[f]);
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  for (const f of JSON_FIELDS) if (input[f] !== undefined) payload[f] = toJson(input[f]);
  for (const f of ARR_BIGINT_FIELDS) if (input[f] !== undefined) payload[f] = toIntArray(input[f]);
  for (const f of ARR_TEXT_FIELDS) if (input[f] !== undefined) payload[f] = toStrArray(input[f]);
  if (input.timestamp !== undefined) payload.timestamp = input.timestamp; // ISO or Date
  if (input.fleet_activity !== undefined) payload.fleet_activity = !!input.fleet_activity;
  return payload;
}

function validate(input) {
  const value = toApiPayload(input || {});
  const errors = [];
  // For creation, id may be provided by client; not strictly required here
  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const f of ID_FIELDS) out[f] = row[f] !== undefined ? toIntLike(row[f]) : undefined;
  for (const f of FLOAT_FIELDS) out[f] = row[f] !== undefined ? Number(row[f]) : undefined;
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  for (const f of JSON_FIELDS) out[f] = row[f] !== undefined ? row[f] : undefined;
  for (const f of ARR_BIGINT_FIELDS) out[f] = Array.isArray(row[f]) ? row[f].map(toIntLike).filter(v=>v!==undefined) : [];
  for (const f of ARR_TEXT_FIELDS) out[f] = Array.isArray(row[f]) ? row[f].map(String) : [];
  out.timestamp = row.timestamp;
  out.fleet_activity = !!row.fleet_activity;
  return out;
}

const HitTrackerModel = {
  table: 'hit_tracker',
  validate, toApiPayload, fromApiRow,

  // CRUD-like operations via API
  async create(doc) {
    const { value } = validate(doc);
    const created = await api.createHitLog(value);
    return created ? fromApiRow(created) : null;
  },

  async update(id, patch) {
    const { value } = validate({ ...patch, id });
    return !!(await api.editHitLog(id, value));
  },

  async remove(id) {
    return !!(await api.deleteHitLog(id));
  },

  // Queries
  async listAll() {
    const rows = await api.getAllHitLogs();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getByEntryId(id) {
    const row = await api.getHitLogByEntryId(id);
    return row ? fromApiRow(row) : null;
  },

  async listByUserId(user_id) {
    const rows = await api.getHitLogsByUserId(user_id);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async listByPatch(patch) {
    const rows = await api.getHitLogsByPatch(patch);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async listByUserAndPatch({ user_id, patch }) {
    const rows = await api.getHitLogsByUserAndPatch({ user_id, patch });
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async listAssists(user_id) {
    const rows = await api.getAssistHitLogs(user_id);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async listAssistsByUserAndPatch({ user_id, patch }) {
    const rows = await api.getAssistHitLogsByUserAndPatch({ user_id, patch });
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },
};

module.exports = { HitTrackerModel };
