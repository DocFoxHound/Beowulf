/* Model for public.hit_tracker wrapping hitTrackerApi.js */
const api = require('../hitTrackerApi');
const { toIntLike, toFloat, toIntArray, toStrArray, toJson } = require('./_utils');

const ID_FIELDS = ['id','user_id'];
const SNOWFLAKE_FIELDS = ['thread_id'];
const FLOAT_FIELDS = ['total_value','total_cut_value','total_scu','total_cut_scu'];
const STR_FIELDS = ['patch','air_or_ground','title','story','username','video_link','type_of_piracy'];
const JSON_FIELDS = ['cargo'];
const ARR_BIGINT_FIELDS = ['fleet_ids'];
const ARR_SNOWFLAKE_FIELDS = ['assists'];
const ARR_TEXT_FIELDS = ['assists_usernames','victims','guests','additional_media_links'];

function toSnowflakeArray(values) {
  if (!Array.isArray(values)) return undefined;
  const out = [];
  for (const value of values) {
    if (value == null) continue;
    const str = String(value).replace(/[^0-9]/g, '');
    if (str) out.push(str);
  }
  return out;
}

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  for (const f of SNOWFLAKE_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  for (const f of FLOAT_FIELDS) if (input[f] !== undefined) payload[f] = toFloat(input[f]);
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  for (const f of JSON_FIELDS) if (input[f] !== undefined) payload[f] = toJson(input[f]);
  for (const f of ARR_BIGINT_FIELDS) if (input[f] !== undefined) payload[f] = toIntArray(input[f]);
  for (const f of ARR_SNOWFLAKE_FIELDS) if (input[f] !== undefined) payload[f] = toSnowflakeArray(input[f]);
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
  for (const f of SNOWFLAKE_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  for (const f of FLOAT_FIELDS) out[f] = row[f] !== undefined ? Number(row[f]) : undefined;
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  for (const f of JSON_FIELDS) out[f] = row[f] !== undefined ? row[f] : undefined;
  for (const f of ARR_BIGINT_FIELDS) out[f] = Array.isArray(row[f]) ? row[f].map(toIntLike).filter(v=>v!==undefined) : [];
  for (const f of ARR_SNOWFLAKE_FIELDS) out[f] = Array.isArray(row[f]) ? row[f].map((value) => String(value)).filter(Boolean) : [];
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
    try {
      const typeSummary = Object.fromEntries(Object.entries(value || {}).map(([k,v]) => [k, Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v)]));
      console.log('[HitTrackerModel.create] payload types:', JSON.stringify(typeSummary));
      console.log('[HitTrackerModel.create] payload snapshot:', JSON.stringify({
        id: value?.id,
        user_id: value?.user_id,
        air_or_ground: value?.air_or_ground,
        total_value: value?.total_value,
        total_cut_value: value?.total_cut_value,
        total_scu: value?.total_scu,
        patch: value?.patch,
        cargo_len: Array.isArray(value?.cargo) ? value.cargo.length : undefined,
        assists_len: Array.isArray(value?.assists) ? value.assists.length : undefined,
      }));
    } catch {}
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

  async getByThreadId(thread_id) {
    const row = await api.getHitLogByThreadId(thread_id);
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

// EXAMPLES OF HIT ROWS IN THE DATABASE
// id             user_id             cargo                                                                 total_value total_cut_value total_scu total_cut_scu assists                 air_or_ground title      story                                                                                      timestamp               username        assists_usernames     video_link                             additional_media_links                                      type_of_piracy fleet_activity
// 1743940981687	156924379786117120	"[{""commodity_name"":""Fluorine"",""scuAmount"":10,""avg_price"":295},{""commodity_name"":""Medical Supplies"",""scuAmount"":25,""avg_price"":2519}]"	65925	"4.1"	16481.25	{169038445187039233}	35	"air"	"Default"	"This is the description of events that transpired during this piracy engagement."	"2025-05-10 13:00:00+03"	"dochound"	"{cowilco}"	"https://www.youtube.com/watch?v=k5GfqB9Aljk"	"{https://i.imgur.com/abNs7NU.png}"	"Brute Force"	false					
// 1743941095490	156924379786117120	"[{""commodity_name"":""Fluorine"",""scuAmount"":5,""avg_price"":295},{""commodity_name"":""Silicon"",""scuAmount"":5,""avg_price"":169},{""commodity_name"":""Steel"",""scuAmount"":25,""avg_price"":671},{""commodity_name"":""Distilled Spirits"",""scuAmount"":100,""avg_price"":369}]"	55995	"4.1"	27997.5	{825112725759459398}	135	"air"	"Default2"	"This is the description of events that transpired during this piracy engagement."	"2025-05-11 13:00:00+03"	"dochound"	"{allegedlyadam}"	"https://www.youtube.com/watch?v=k5GfqB9Aljk"	"{https://imgur.com/tTZPaT7,https://imgur.com/dritgaG}"	"Brute Force"	false					
// 1743941170265	156924379786117120	"[{""commodity_name"":""Scrap"",""scuAmount"":500,""avg_price"":1426},{""commodity_name"":""Distilled Spirits"",""scuAmount"":30,""avg_price"":369}]"	724070	"4.1"	241356.66666666666	{664023164350627843}	530	"air"	"Default3"	"This is the description of events that transpired during this piracy engagement."	"2025-05-12 13:00:00+03"	"mohawkress1629"	"{dochound}"	"https://www.youtube.com/watch?v=k5GfqB9Aljk"	"{https://i.imgur.com/abNs7NU.png}"	"Brute Force"	false					