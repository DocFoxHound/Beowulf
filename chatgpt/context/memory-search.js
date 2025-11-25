const { MemoriesModel } = require('../../api/models/memories');
const { getEmbedding } = require('../../common/embeddings');

const MEMORY_LOOKUP_ENABLED = (process.env.CHATGPT_MEMORIES_LOOKUP || 'true').toLowerCase() === 'true';
const MEMORY_LIMIT = Number(process.env.CHATGPT_MEMORIES_LIMIT || 4);
const MEMORY_MIN_SCORE = Number(process.env.CHATGPT_MEMORIES_MIN_SCORE || 0.15);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

function sanitizeQuery(text) {
  if (!text) return '';
  return String(text)
    .replace(/<@!?\d+>/g, '')
    .replace(/<#[0-9]+>/g, '')
    .replace(/<@&[0-9]+>/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .trim();
}

function formatMemoryResult(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry.row || entry;
  if (!row || typeof row !== 'object') return null;
  const tags = Array.isArray(row.tags) ? row.tags.slice(0, 8) : [];
  return {
    id: row.id,
    type: row.type || 'memory',
    content: (row.content || '').slice(0, 600),
    tags,
    importance: row.importance ?? null,
    score: entry.score ?? null,
    lastUsedAt: row.last_used_at || row.updated_at || row.created_at || null,
  };
}

async function computeQueryEmbedding({ text, openai }) {
  try {
    const embedding = await getEmbedding({ text, openai });
    if (Array.isArray(embedding) && embedding.length) return embedding;
  } catch (error) {
    console.error('[ChatGPT][MemorySearch] embeddings helper failed:', error?.message || error);
  }
  if (!openai) return null;
  try {
    const resp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: String(text || '').slice(0, 8000) });
    const fallbackEmbedding = resp?.data?.[0]?.embedding;
    return Array.isArray(fallbackEmbedding) ? fallbackEmbedding : null;
  } catch (error) {
    console.error('[ChatGPT][MemorySearch] direct embedding failed:', error?.message || error);
    return null;
  }
}

async function fetchMemorySnippets({ content, guildId, channelId, userId, openai, limit = MEMORY_LIMIT } = {}) {
  if (!MEMORY_LOOKUP_ENABLED) return [];
  const query = sanitizeQuery(content).slice(0, 500);
  if (!query) return [];
  const embedding = await computeQueryEmbedding({ text: query, openai });
  if (!Array.isArray(embedding) || embedding.length !== MemoriesModel.vectorDim) return [];

  const body = { queryEmbedding: embedding, limit };
  if (guildId) body.filter_guild_id = String(guildId);
  if (channelId) body.filter_channel_id = String(channelId);
  if (userId) body.filter_user_id = String(userId);

  let results;
  try {
    results = await MemoriesModel.vectorSearch(body);
  } catch (error) {
    console.error('[ChatGPT][MemorySearch] vector lookup failed:', error?.message || error);
    return [];
  }
  if (!Array.isArray(results) || !results.length) return [];

  return results
    .filter((entry) => (entry?.score ?? 0) >= MEMORY_MIN_SCORE)
    .slice(0, limit)
    .map(formatMemoryResult)
    .filter(Boolean);
}

module.exports = {
  fetchMemorySnippets,
};
