/* Model for public.chat_logs wrapping messageApi.js */
const api = require('../messageApi');
const { toIntLike } = require('./_utils');

const ID_FIELDS = ['id'];
const STR_FIELDS = ['channel_name'];

function toApiPayload(input) {
  const payload = {};
  for (const f of ID_FIELDS) if (input[f] !== undefined) payload[f] = toIntLike(input[f]);
  if (input.message !== undefined) payload.message = input.message; // JSON object
  for (const f of STR_FIELDS) if (input[f] !== undefined) payload[f] = String(input[f]);
  return payload;
}

function validate(input) {
  const value = toApiPayload(input || {});
  const errors = [];
  // id may be assigned externally; not strictly required to create
  return { ok: errors.length === 0, errors, value };
}

function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const f of ID_FIELDS) out[f] = row[f] !== undefined ? toIntLike(row[f]) : undefined;
  out.message = row.message;
  for (const f of STR_FIELDS) out[f] = row[f] !== undefined ? String(row[f]) : undefined;
  return out;
}

const ChatLogsModel = {
  table: 'chat_logs',
  validate, toApiPayload, fromApiRow,

  async list() {
    const rows = await api.getMessages();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async create(doc) {
    const { value } = validate(doc);
    return !!(await api.createMessage(value));
  },

  async deleteOlderThan(days = 30) {
    // messageApi uses a fixed 30 days; this wrapper calls it directly
    return !!(await api.deleteMessagesBeforeDate());
  },

  async deleteLast(channel, count) {
    return !!(await api.deleteMessagesByCount(channel, count));
  },
};

module.exports = { ChatLogsModel };
