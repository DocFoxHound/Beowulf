/* Model for public.chat_messages wrapping chatMessagesApi.js */
const api = require('../chatMessagesApi');
const { limitStr } = require('./_utils');

const MAX_CONTENT_LEN = 4000;

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toApiPayload(input = {}) {
  const payload = {};
  if (input.id !== undefined) payload.id = String(input.id);
  if (input.guild_id !== undefined) payload.guild_id = String(input.guild_id);
  if (input.channel_id !== undefined) payload.channel_id = String(input.channel_id);
  if (input.user_id !== undefined) payload.user_id = String(input.user_id);
  if (input.content !== undefined) payload.content = limitStr(input.content, MAX_CONTENT_LEN);
  if (input.timestamp !== undefined) payload.timestamp = normalizeTimestamp(input.timestamp);
  return payload;
}

function validate(input, { partial = false } = {}) {
  const value = toApiPayload(input || {});
  const errors = [];

  if (!partial) {
    if (!value.guild_id) errors.push('guild_id is required');
    if (!value.channel_id) errors.push('channel_id is required');
    if (!value.user_id) errors.push('user_id is required');
    if (!value.content) errors.push('content is required');
  }

  if (value.content && value.content.length > MAX_CONTENT_LEN) {
    errors.push(`content must be <= ${MAX_CONTENT_LEN} characters`);
  }

  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    content: row.content,
    timestamp: row.timestamp,
  };
}

const ChatMessagesModel = {
  table: 'chat_messages',
  limits: {
    content: MAX_CONTENT_LEN,
  },

  validate,
  toApiPayload,
  fromApiRow,

  async list(params = {}) {
    const rows = await api.listChatMessages(params);
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getById(id) {
    const row = await api.getChatMessageById(id);
    return row ? fromApiRow(row) : null;
  },

  async create(doc) {
    const { ok, errors, value } = validate(doc);
    if (!ok) return { ok: false, errors };
    const created = await api.createChatMessage(value);
    return created ? { ok: true, data: fromApiRow(created) || created } : { ok: false, errors: ['create failed'] };
  },

  async remove(id) {
    return !!(await api.deleteChatMessage(id));
  },

  async pruneBefore({ before, guild_id, channel_id, user_id }) {
    const beforeIso = normalizeTimestamp(before);
    if (!beforeIso) return false;
    return !!(await api.deleteChatMessagesBefore({ before: beforeIso, guild_id, channel_id, user_id }));
  },
};

module.exports = { ChatMessagesModel };
