// Lightweight ingest helpers to avoid ReferenceError and provide extension points.
// These can be expanded to write Knowledge entries and embeddings when desired.

const { KnowledgeModel } = require('../api/models/knowledge');
const { ChatLogsModel } = require('../api/models/chat-logs');
const { getAllHitLogs } = require('../api/hitTrackerApi');
const { getAllPlayerStats } = require('../api/playerStatsApi');
const OpenAI = require('openai');

const ENABLE_CHAT_SUMMARY = (process.env.CHAT_SUMMARY_ENABLE || 'false').toLowerCase() === 'true';
const ENABLE_HIT_INGEST = (process.env.HIT_INGEST_ENABLE || 'false').toLowerCase() === 'true';
const ENABLE_PLAYER_STATS_INGEST = (process.env.PLAYER_STATS_INGEST_ENABLE || 'false').toLowerCase() === 'true';

function fmt(n) { const x = Number(n||0); return Number.isFinite(x) ? x.toLocaleString() : String(n); }

async function tryCreateKnowledge(doc) {
  try {
    const res = await KnowledgeModel.create(doc);
    return !!res?.ok;
  } catch (e) {
    return false;
  }
}

// Idempotent upsert by (url, category, section):
// - If a row with the same dedupe key exists, update title/content/tags instead of creating.
// - Optionally refresh embedding based on provided content.
async function upsertKnowledgeDoc({ doc, openai = null, withEmbedding = false }) {
  try {
    const existing = await KnowledgeModel.findByUrl({ url: doc.url, category: doc.category, section: doc.section });
    if (existing && existing.id) {
      // Update content/title/tags in place
      await KnowledgeModel.update(existing.id, {
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        category: doc.category,
        section: doc.section,
      });
      if (withEmbedding && openai) {
        const emb = await basicEmbed(openai, doc.content);
        if (Array.isArray(emb)) {
          try { await KnowledgeModel.updateEmbedding(existing.id, emb); } catch {}
        }
      }
      return true;
    }
    // Create new
    const created = await KnowledgeModel.create(doc);
    const id = created?.data?.id;
    if (withEmbedding && openai && id) {
      const emb = await basicEmbed(openai, doc.content);
      if (Array.isArray(emb)) {
        try { await KnowledgeModel.updateEmbedding(id, emb); } catch {}
      }
    }
    return !!created?.ok;
  } catch (e) {
    return false;
  }
}

async function basicEmbed(openai, text) {
  try {
    const input = String(text || '').slice(0, 8000);
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input });
    return resp?.data?.[0]?.embedding;
  } catch { return null; }
}

async function ingestDailyChatSummaries(client, openaiClient) {
  if (!ENABLE_CHAT_SUMMARY) {
    console.log('[Ingest] Chat summaries disabled (CHAT_SUMMARY_ENABLE=false).');
    return;
  }
  const openai = openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const rows = await ChatLogsModel.list();
  const count = Array.isArray(rows) ? rows.length : 0;
  const content = `Daily chat snapshot: ${fmt(count)} messages currently stored. This is a placeholder summary.\n` +
                  `Use chat-ingest for full per-message vectorization.`;
  const doc = {
    source: 'discord',
    category: 'summary',
    section: 'daily-chat',
    title: 'Daily Chat Snapshot',
    content,
    url: 'discord://summary/daily-chat',
    tags: ['summary','chat'],
  };
  await upsertKnowledgeDoc({ doc, openai, withEmbedding: true });
}

async function ingestHitLogs(client, openaiClient) {
  if (!ENABLE_HIT_INGEST) {
    console.log('[Ingest] Hit logs ingest disabled (HIT_INGEST_ENABLE=false).');
    return;
  }
  const openai = openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const hits = await getAllHitLogs();
  const count = Array.isArray(hits) ? hits.length : 0;
  const content = `HitTracker snapshot: ${fmt(count)} total hit log entries indexed. Placeholder summary.`;
  const doc = {
    source: 'discord',
    category: 'summary',
    section: 'hit-logs',
    title: 'HitTracker Snapshot',
    content,
    url: 'discord://summary/hit-logs',
    tags: ['summary','hitlogs'],
  };
  await upsertKnowledgeDoc({ doc, openai, withEmbedding: true });
}

async function ingestPlayerStats(client) {
  if (!ENABLE_PLAYER_STATS_INGEST) {
    console.log('[Ingest] Player stats ingest disabled (PLAYER_STATS_INGEST_ENABLE=false).');
    return;
  }
  const stats = await getAllPlayerStats();
  const count = Array.isArray(stats) ? stats.length : 0;
  const content = `Player stats snapshot: ${fmt(count)} player_stat rows available. Placeholder summary.`;
  const doc = {
    source: 'discord',
    category: 'summary',
    section: 'player-stats',
    title: 'Player Stats Snapshot',
    content,
    url: 'discord://summary/player-stats',
    tags: ['summary','playerstats'],
  };
  await upsertKnowledgeDoc({ doc, withEmbedding: false });
  // embeddings optional here; summaries are small and retrievable by text search
}

module.exports = {
  ingestDailyChatSummaries,
  ingestHitLogs,
  ingestPlayerStats,
};
