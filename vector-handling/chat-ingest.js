// Chat ingestion script: pull chat logs, create Knowledge rows, compute embeddings, and store in vector column.
// Usage:
//   node vector-handling/chat-ingest.js            # ingests all (or limited via INGEST_MAX)
//   INGEST_MAX=200 INGEST_CONCURRENCY=3 node vector-handling/chat-ingest.js

require('dotenv').config();
const OpenAI = require('openai');
const { ChatLogsModel } = require('../api/models/chat-logs');
const { KnowledgeModel } = require('../api/models/knowledge');
const { listKnowledge, deleteKnowledge } = require('../api/knowledgeApi');

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const MAX = Number(process.env.INGEST_MAX || 0); // 0 = all
const CONC = Math.max(1, Math.min(8, Number(process.env.INGEST_CONCURRENCY || 2)));

function toIso(ts) {
  try { return new Date(ts).toISOString(); } catch { return null; }
}

function safeStr(v) { return (v === undefined || v === null) ? '' : String(v); }

function renderMessageRow(row) {
  const m = row?.message || {};
  const content = safeStr(m.content || m.text || m.message || row?.message_text || '');
  const user = safeStr(m.username || m.author || m.user || m.authorUsername || 'user');
  const channel = safeStr(row?.channel_name || m.channelName || m.channel || '');
  const ts = toIso(m.timestamp || m.createdAt || m.created_at || row?.created_at || Date.now());
  const headBits = [ts ? `[${ts}]` : null, channel ? `#${channel}` : null, user ? `${user}:` : null].filter(Boolean).join(' ');
  const header = headBits ? (headBits + ' ') : '';
  const text = (header + content).trim();
  return {
    title: user && channel ? `${user} in #${channel}` : (user || channel || 'Chat message'),
    text,
    channel,
    user,
    ts,
  };
}

// Render from a direct payload (e.g., live Discord event)
function renderDirectMessage({ content, username, channel_name, timestamp }) {
  const ts = toIso(timestamp || Date.now());
  const user = safeStr(username || 'user');
  const channel = safeStr(channel_name || '');
  const headBits = [ts ? `[${ts}]` : null, channel ? `#${channel}` : null, user ? `${user}:` : null].filter(Boolean).join(' ');
  const header = headBits ? (headBits + ' ') : '';
  const text = (header + safeStr(content)).trim();
  return {
    title: user && channel ? `${user} in #${channel}` : (user || channel || 'Chat message'),
    text,
    channel,
    user,
    ts,
  };
}

async function embed(openai, text) {
  const input = String(text || '').slice(0, 8000);
  const resp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
  return resp?.data?.[0]?.embedding;
}

async function ingestOne(openai, row) {
  const { title, text, channel, user, ts } = renderMessageRow(row);
  if (!text) return { ok: false, reason: 'empty-text' };
  const url = `discord://chatlog/${row.id || Math.random().toString(36).slice(2)}`;
  const doc = {
    source: 'discord',
    category: 'chat',
    section: 'message',
    title,
    content: text,
    url,
    tags: [ 'chatlog' ].concat(channel ? [`channel:${channel}`] : []).concat(user ? [`user:${user}`] : []),
  };
  // 1) Create knowledge (server may dedupe by URL)
  const created = await KnowledgeModel.create(doc);
  if (!created.ok) return { ok: false, reason: 'create-failed', errors: created.errors };
  const rowId = created?.data?.id;
  if (!rowId) return { ok: false, reason: 'no-id' };
  // 2) Compute embedding and store
  const vec = await embed(openai, text);
  if (!Array.isArray(vec)) return { ok: false, reason: 'embed-failed' };
  const updated = await KnowledgeModel.updateEmbedding(rowId, vec);
  return { ok: !!updated, id: rowId };
}

// Ingest a single live message payload (content, username, channel_name, timestamp, id)
async function ingestChatMessage(payload, openaiClient = null) {
  const openai = openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { title, text, channel, user } = renderDirectMessage(payload || {});
  if (!text) return { ok: false, reason: 'empty-text' };
  const msgId = payload?.id || payload?.message_id || null;
  const url = msgId ? `discord://chatlog/${msgId}` : `discord://chatlive/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const doc = {
    source: 'discord',
    category: 'chat',
    section: 'message',
    title,
    content: text,
    url,
    tags: [ 'chatlog' ]
      .concat(channel ? [`channel:${channel}`] : [])
      .concat(user ? [`user:${user}`] : [])
      .concat(msgId ? [`msg:${msgId}`] : []),
  };
  const created = await KnowledgeModel.create(doc);
  if (!created.ok) return { ok: false, reason: 'create-failed', errors: created.errors };
  const rowId = created?.data?.id;
  if (!rowId) return { ok: false, reason: 'no-id' };
  const vec = await embed(openai, text);
  if (!Array.isArray(vec)) return { ok: false, reason: 'embed-failed' };
  const updated = await KnowledgeModel.updateEmbedding(rowId, vec);
  // Optional: prune oldest beyond threshold on each live ingest
  const maxKeep = Number(process.env.CHAT_VECTOR_MAX || 2000);
  if (maxKeep > 0) {
    try { await pruneChatKnowledge(maxKeep); } catch {}
  }
  return { ok: !!updated, id: rowId };
}

// Prune oldest chat knowledge to keep at most `max` rows
async function pruneChatKnowledge(max = 2000, pageSize = 500) {
  let offset = 0;
  let toDelete = [];
  while (true) {
    const params = { category: 'chat', section: 'message', order: 'created_at.desc', limit: pageSize, offset };
    const rows = await listKnowledge(params);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (let i = 0; i < rows.length; i++) {
      const globalIdx = offset + i;
      if (globalIdx >= max) {
        const id = rows[i]?.id;
        if (id !== undefined && id !== null) toDelete.push(id);
      }
    }
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  if (!toDelete.length) return { deleted: 0 };
  let deleted = 0;
  for (const id of toDelete) {
    try { const ok = await deleteKnowledge(id); if (ok) deleted++; } catch {}
  }
  return { deleted };
}

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('[chat-ingest] listing chat logs…');
  const rows = await ChatLogsModel.list();
  const total = Array.isArray(rows) ? rows.length : 0;
  if (!total) {
    console.log('[chat-ingest] no chat logs found');
    return;
  }
  const limit = (MAX && MAX > 0) ? Math.min(MAX, total) : total;
  console.log(`[chat-ingest] found ${total}; ingesting ${limit} messages with concurrency ${CONC}`);

  let done = 0, ok = 0, fail = 0;
  const queue = rows.slice(0, limit);

  // Simple concurrency pool
  async function worker(idx) {
    while (true) {
      const row = queue.shift();
      if (!row) break;
      try {
        const res = await ingestOne(openai, row);
        ok += res.ok ? 1 : 0;
        fail += res.ok ? 0 : 1;
      } catch (e) {
        fail += 1;
      } finally {
        done += 1;
        if (done % 20 === 0) console.log(`[chat-ingest] progress ${done}/${limit} (ok=${ok}, fail=${fail})`);
        // small jitter to be nice to APIs
        await new Promise(r => setTimeout(r, 30 + Math.floor(Math.random()*40)));
      }
    }
  }

  const workers = Array.from({ length: CONC }, (_, i) => worker(i));
  await Promise.all(workers);
  console.log(`[chat-ingest] complete: ok=${ok}, fail=${fail}`);
  // Prune oldest beyond threshold
  const maxKeep = Number(process.env.CHAT_VECTOR_MAX || 2000);
  const pr = await pruneChatKnowledge(maxKeep);
  console.log(`[chat-ingest] prune: deleted ${pr.deleted} old chat vectors (kept <= ${maxKeep})`);
}

if (require.main === module) {
  main().catch((e) => { console.error('[chat-ingest] fatal error:', e?.response?.data || e?.message || e); process.exit(1); });
}

module.exports = { main, ingestChatMessage, pruneChatKnowledge };
