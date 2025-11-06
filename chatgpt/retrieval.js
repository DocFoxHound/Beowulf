// Retrieval over stored chat messages and knowledge DB.
// - Messages: keyword + recency scoring.
// - Knowledge: vector search (pgvector) with fallback to FTS via backend API.

const { getMessages } = require('../api/messageApi');
const { listKnowledge, vectorSearchKnowledge } = require('../api/knowledgeApi');

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreDoc(queryTokens, doc, now = Date.now()) {
  const text = doc.content || doc.text || '';
  const tokens = tokenize(text);
  const tokenSet = new Set(tokens);
  let score = 0;
  for (const qt of queryTokens) {
    if (tokenSet.has(qt)) score += 1;
  }
  // recency boost: 0.0..0.5 over ~30 days
  const ts = new Date(doc.createdAt || doc.timestamp || doc.created_at || 0).getTime();
  if (ts) {
    const ageDays = Math.max(0, (now - ts) / 86400000);
    const boost = Math.max(0, 0.5 - Math.min(ageDays, 30) * (0.5 / 30));
    score += boost;
  }
  return score;
}

function toSnippet(doc) {
  const author = doc.username || doc.author || doc.user || 'unknown';
  const channel = doc.channelName || doc.channel || '';
  const content = (doc.content || doc.text || '').slice(0, 600);
  const meta = channel ? `#${channel}` : '';
  return `[Chat ${meta}] ${author}: ${content}`;
}

async function getTopKFromMessages(query, k = 3) {
  try {
    const data = await getMessages();
    if (!Array.isArray(data) || data.length === 0) return [];
    const qTokens = tokenize(query).filter(t => t.length > 2);
    if (qTokens.length === 0) return [];
    const now = Date.now();
    const scored = data.map(d => ({ d, s: scoreDoc(qTokens, d, now) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map(x => toSnippet(x.d));
    return scored;
  } catch (e) {
    console.error('getTopKFromMessages error:', e);
    return [];
  }
}

function toKnowledgeSnippet(row) {
  const cat = row.category || 'general';
  const title = row.title || row.section || '';
  const prefix = title ? `${cat} | ${title}` : cat;
  const content = String(row.content || '').slice(0, 700);
  const source = row.source ? ` source:${row.source}` : '';
  const url = row.url ? ` url:${row.url}` : '';
  return `[Knowledge ${prefix}] ${content}${source}${url}`.trim();
}

async function computeQueryEmbedding(openai, text) {
  if (!openai) return null;
  try {
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: text.slice(0, 8000) });
    return resp?.data?.[0]?.embedding || null;
  } catch (e) {
    console.error('computeQueryEmbedding error:', e.message || e);
    return null;
  }
}

async function getTopKFromKnowledge({ query, k = 3, openai, guildId, channelId, preferVector = true, temporalHint = false }) {
  try {
    let rows = [];
    if (preferVector) {
      const embedding = await computeQueryEmbedding(openai, query);
      if (embedding) {
        const vec = await vectorSearchKnowledge({ queryEmbedding: embedding, limit: Math.max(1, k), filter_guild_id: guildId, filter_channel_id: channelId });
        if (Array.isArray(vec) && vec.length) rows = vec;
      }
    }
    if (!rows.length) {
      const fts = await listKnowledge({ q: query, guild_id: guildId, channel_id: channelId, limit: Math.max(1, k) });
      if (Array.isArray(fts) && fts.length) rows = fts;
    }
    const snippets = [];
    if (temporalHint) {
      // Prepend latest daily summaries for the channel (if any)
      const recent = await listKnowledge({ category: 'chat', guild_id: guildId, channel_id: channelId, limit: 3, order: 'created_at.desc' }) || [];
      const dailies = Array.isArray(recent) ? recent.filter(r => (r.section || '') === 'daily-summary') : [];
      for (const r of dailies.slice(0, 2)) snippets.push(toKnowledgeSnippet(r));
    }
    if (Array.isArray(rows) && rows.length) {
      snippets.push(...rows.slice(0, k).map(toKnowledgeSnippet));
    }
    // Deduplicate and cap to k (keeping any prepended recent items at the front)
    const seen = new Set();
    const unique = [];
    for (const s of snippets) { if (!seen.has(s)) { seen.add(s); unique.push(s); } }
    return unique.slice(0, k);
  } catch (e) {
    console.error('getTopKFromKnowledge error:', e);
    return [];
  }
}

// Piracy/hit specific retrieval across the whole guild (no channel filter)
async function getTopKFromKnowledgePiracy({ query, k = 5, openai, guildId, preferVector = true }) {
  try {
    let rows = [];
    if (preferVector) {
      const embedding = await computeQueryEmbedding(openai, query);
      if (embedding) {
        const vec = await vectorSearchKnowledge({ queryEmbedding: embedding, limit: Math.max(1, k * 2), filter_guild_id: guildId, filter_category: 'piracy' });
        if (Array.isArray(vec) && vec.length) rows = vec;
      }
    }
    if (!rows.length) {
      const fts = await listKnowledge({ q: query, category: 'piracy', guild_id: guildId, limit: Math.max(1, k * 2) });
      if (Array.isArray(fts) && fts.length) rows = fts;
      // If still empty and no query, just take most recent
      if ((!rows || !rows.length) && (!query || !query.trim())) {
        const recent = await listKnowledge({ category: 'piracy', guild_id: guildId, limit: Math.max(1, k * 2), order: 'created_at.desc' }) || [];
        if (recent.length) rows = recent;
      }
    }
    // Prefer hit-tracker hit-log entries first
    const isHit = (r) => (r.source === 'hit-tracker') && ((r.section || '') === 'hit-log');
    const hits = Array.isArray(rows) ? rows.filter(isHit) : [];
    const others = Array.isArray(rows) ? rows.filter(r => !isHit(r)) : [];
    const ordered = [...hits, ...others].slice(0, k);
    return ordered.map(toKnowledgeSnippet);
  } catch (e) {
    console.error('getTopKFromKnowledgePiracy error:', e);
    return [];
  }
}

async function getTopK({ query, k = 5, sources = ['messages'], openai, guildId, channelId, preferVector = true, temporalHint = false }) {
  const snippets = [];
  const perSource = Math.max(1, Math.floor(k));
  const knowledgeEnabled = (process.env.KNOWLEDGE_RETRIEVAL || 'true').toLowerCase() !== 'false';
  const preferVec = (process.env.KNOWLEDGE_PREFER_VECTOR || (preferVector ? 'true' : 'false')).toLowerCase() === 'true';
  if (knowledgeEnabled && sources.includes('knowledge')) {
    const knSnips = await getTopKFromKnowledge({ query, k: perSource, openai, guildId, channelId, preferVector: preferVec, temporalHint });
    snippets.push(...knSnips);
  }
  if (sources.includes('messages')) {
    const msgSnips = await getTopKFromMessages(query, perSource);
    snippets.push(...msgSnips);
  }
  // Dedup and cap
  const seen = new Set();
  const unique = [];
  for (const s of snippets) { if (!seen.has(s)) { seen.add(s); unique.push(s); } }
  return unique.slice(0, k);
}

// Targeted piracy-focused retrieval from messages: prefers piracy-related content and channels
function looksPiracyText(s) {
  try {
    const lc = String(s || '').toLowerCase();
    return /(piracy|pirate|interdict|snare|hit\b|board|ambush|camp|loot|hauler|freighter|qt|quantum|armistice|security|fps|ground raid|tractor|cutlass|corsair|mule|salvage)/.test(lc);
  } catch { return false; }
}

async function getTopKPiracyMessages(query, k = 5) {
  try {
    const data = await getMessages();
    if (!Array.isArray(data) || data.length === 0) return [];
    const qTokens = tokenize(query).filter(t => t.length > 2);
    const now = Date.now();
    // Score with piracy bias and recency
    const scored = [];
    for (const d of data) {
      const base = scoreDoc(qTokens, d, now);
      if (base <= 0 && !looksPiracyText(d?.content || d?.text || '')) continue;
      let s = base;
      // piracy keyword boost
      if (looksPiracyText(d?.content || d?.text || '')) s += 1.2;
      // channel name hints
      const ch = String(d?.channelName || d?.channel || '').toLowerCase();
      if (/advice|piracy|ops|hit/.test(ch)) s += 0.4;
      // longer informative lines get a small boost
      const len = String(d?.content || d?.text || '').length;
      if (len > 120) s += 0.1;
      if (s > 0) scored.push({ d, s });
    }
    const top = scored
      .sort((a, b) => b.s - a.s)
      .slice(0, Math.max(1, k))
      .map(x => toSnippet(x.d));
    return top;
  } catch (e) {
    console.error('getTopKPiracyMessages error:', e?.message || e);
    return [];
  }
}

module.exports = {
  getTopK,
  getTopKFromKnowledgePiracy,
  getTopKPiracyMessages,
};
