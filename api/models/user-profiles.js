/* Model for public.user_profiles wrapping userProfilesApi.js */
const api = require('../userProfilesApi');
const { limitStr, toJson } = require('./_utils');

const MAX_NICKNAME_LEN = 120;
const TEASE_MIN = 0;
const TEASE_MAX = 100;

function clampTeaseLevel(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(TEASE_MIN, Math.min(TEASE_MAX, Math.round(n)));
}

function toApiPayload(input = {}) {
  const payload = {};
  if (input.user_id !== undefined) payload.user_id = input.user_id === null ? null : String(input.user_id);
  if (input.nickname !== undefined) payload.nickname = limitStr(input.nickname, MAX_NICKNAME_LEN);
  if (input.tease_level !== undefined) payload.tease_level = clampTeaseLevel(input.tease_level);
  if (input.style_preferences !== undefined) {
    const prefs = toJson(input.style_preferences);
    if (prefs !== undefined) payload.style_preferences = prefs;
  }
  if (input.stats_json !== undefined) {
    const stats = toJson(input.stats_json);
    if (stats !== undefined) payload.stats_json = stats;
  }
  return payload;
}

function validate(input, { partial = false } = {}) {
  const value = toApiPayload(input || {});
  const errors = [];

  if (!partial && !value.user_id) {
    errors.push('user_id is required');
  }

  if (value.nickname && value.nickname.length > MAX_NICKNAME_LEN) {
    errors.push(`nickname must be <= ${MAX_NICKNAME_LEN} characters`);
  }

  if (value.tease_level !== undefined && value.tease_level !== null) {
    if (value.tease_level < TEASE_MIN || value.tease_level > TEASE_MAX) {
      errors.push(`tease_level must be between ${TEASE_MIN} and ${TEASE_MAX}`);
    }
  }

  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    user_id: row.user_id,
    nickname: row.nickname,
    tease_level: row.tease_level !== undefined && row.tease_level !== null ? Number(row.tease_level) : undefined,
    style_preferences: row.style_preferences,
    stats_json: row.stats_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const UserProfilesModel = {
  table: 'user_profiles',
  limits: {
    nickname: MAX_NICKNAME_LEN,
    teaseLevel: [TEASE_MIN, TEASE_MAX],
  },

  validate,
  toApiPayload,
  fromApiRow,

  async list(params = {}) {
    const rows = await api.listUserProfiles(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(userId) {
    const row = await api.getUserProfile(userId);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const created = await api.createUserProfile(value);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async replace(userId, doc) {
    const { ok, errors, value } = validate({ ...doc, user_id: userId });
    if (!ok) return { ok: false, errors };
    const updated = await api.updateUserProfile(userId, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async update(userId, patch) {
    const { ok, errors, value } = validate(patch, { partial: true });
    if (!ok) return { ok: false, errors };
    const updated = await api.updateUserProfile(userId, value);
    return updated ? { ok: true, data: fromApiRow(updated) || updated } : { ok: false, errors: ['update failed'] };
  },

  async upsert(doc) {
    if (!doc || !doc.user_id) {
      return { ok: false, errors: ['user_id is required for upsert'] };
    }
    const { ok, errors, value } = validate(doc, { partial: false });
    if (!ok) return { ok: false, errors };
    const saved = await api.updateUserProfile(value.user_id, value);
    return saved ? { ok: true, data: fromApiRow(saved) || saved } : { ok: false, errors: ['upsert failed'] };
  },

  async remove(userId) {
    return !!(await api.deleteUserProfile(userId));
  },
};

module.exports = { UserProfilesModel };
