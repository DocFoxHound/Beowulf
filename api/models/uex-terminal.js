/*
 UEX Terminal model mapped to Postgres table `public.uex_terminals` and
 wrapping the HTTP client in `api/uexApi.js` for the `/terminals/` endpoints.

 Fields (per schema; most are bigint in DB):
 - id (required for upsert)
 - id_star_system, id_planet, id_orbit, id_moon, id_space_station, id_outpost,
   id_poi, id_city, id_faction, id_company
 - name, nickname, code, type (varchar(100))
 - mcs, is_available, is_available_live, is_visible, is_default_system,
   is_affinity_influenceable, is_habitation, is_refinery, is_cargo_center,
   is_medical, is_food, is_shop_fps, is_shop_vehicle, is_refuel, is_repair,
   is_nqa, is_player_owned, is_auto_load, has_loading_dock, has_docking_port,
   has_freight_elevator, date_added, date_modified, max_container_size
 - star_system_name, planet_name, orbit_name, space_station_name,
   faction_name, company_name (varchar(100))

 Notes:
 - The DB uses bigint for many boolean-like flags; this model exposes those
   as booleans when reading (fromApiRow), but accepts booleans, numbers, or
   strings when writing and coerces to 0/1 for payloads.
 - String fields are trimmed to 100 chars, per schema.
*/

const uex = require('../uexApi');

const MAX_STR_LEN = 100;

// List of string-limited fields
const STR_FIELDS = [
  'name', 'nickname', 'code', 'type',
  'star_system_name', 'planet_name', 'orbit_name', 'space_station_name',
  'faction_name', 'company_name',
];

// List of bigint ID fields
const ID_FIELDS = [
  'id', 'id_star_system', 'id_planet', 'id_orbit', 'id_moon', 'id_space_station',
  'id_outpost', 'id_poi', 'id_city', 'id_faction', 'id_company',
];

// Boolean-like bigint flags
const FLAG_FIELDS = [
  'is_available', 'is_available_live', 'is_visible', 'is_default_system',
  'is_affinity_influenceable', 'is_habitation', 'is_refinery', 'is_cargo_center',
  'is_medical', 'is_food', 'is_shop_fps', 'is_shop_vehicle', 'is_refuel',
  'is_repair', 'is_nqa', 'is_player_owned', 'is_auto_load',
  'has_loading_dock', 'has_docking_port', 'has_freight_elevator',
];

// Other numeric fields
const NUM_FIELDS = [
  'mcs', 'date_added', 'date_modified', 'max_container_size',
];

function limit100(v) {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s.length > MAX_STR_LEN ? s.slice(0, MAX_STR_LEN) : s;
}

function toIntLike(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toFlag01(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).toLowerCase();
  if (s === 'true') return 1;
  if (s === 'false') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n >= 1 ? 1 : 0;
}

function fromFlag(v) {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n >= 1;
}

function toApiPayload(input) {
  const payload = {};

  // IDs
  for (const f of ID_FIELDS) {
    if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  }

  // Strings
  for (const f of STR_FIELDS) {
    if (input[f] !== undefined) payload[f] = limit100(input[f]);
  }

  // Flags (0/1)
  for (const f of FLAG_FIELDS) {
    if (input[f] !== undefined) payload[f] = toFlag01(input[f]);
  }

  // Other numbers
  for (const f of NUM_FIELDS) {
    if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  }

  return payload;
}

function validate(input) {
  const errors = [];
  const value = toApiPayload(input || {});

  // id required for createOrUpdate path used by API
  if (value.id === undefined) errors.push('id is required');

  // Length checks
  for (const f of STR_FIELDS) {
    if (value[f] && String(value[f]).length > MAX_STR_LEN) {
      errors.push(`${f} must be <= ${MAX_STR_LEN} chars`);
    }
  }

  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};

  // IDs
  for (const f of ID_FIELDS) out[f] = row[f] !== undefined ? row[f] : undefined;

  // Strings
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;

  // Flags as booleans for consumers
  for (const f of FLAG_FIELDS) out[f] = fromFlag(row[f]);

  // Other numbers
  for (const f of NUM_FIELDS) out[f] = row[f] !== undefined ? Number(row[f]) : undefined;

  return out;
}

const UexTerminalModel = {
  table: 'uex_terminals',
  limits: { strLen: MAX_STR_LEN },

  validate,
  toApiPayload,
  fromApiRow,

  async list() {
    const rows = await uex.getAllTerminals();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await uex.getTerminalById(id);
    return row ? fromApiRow(row) : null;
  },

  async upsert(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    // createOrUpdateTerminal has no return payload; treat success as ok
    try {
      await uex.createOrUpdateTerminal(value);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [e?.response?.data || e?.message || 'upsert failed'] };
    }
  },
};

module.exports = { UexTerminalModel };
