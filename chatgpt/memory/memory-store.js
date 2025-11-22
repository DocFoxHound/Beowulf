const { MemoriesModel } = require('../../api/models/memories');
const { getEmbedding } = require('../../common/embeddings');

const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

async function buildEmbedding(text, openai) {
  if (!text) return null;
  try {
    const helperEmbedding = await getEmbedding({ text, openai });
    if (Array.isArray(helperEmbedding) && helperEmbedding.length) {
      return helperEmbedding;
    }
  } catch (error) {
    console.error('[MemoryStore] embeddings helper failed:', error?.message || error);
  }
  if (!openai) return null;
  try {
    const resp = await openai.embeddings.create({
      model: DEFAULT_EMBEDDING_MODEL,
      input: String(text).slice(0, 8000),
    });
    const directEmbedding = resp?.data?.[0]?.embedding;
    return Array.isArray(directEmbedding) ? directEmbedding : null;
  } catch (error) {
    console.error('[MemoryStore] direct embedding failed:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function saveMemoryEntry({
  content,
  type = 'episodic',
  importance = 1,
  tags = [],
  guildId,
  channelId,
  userId,
  openai,
}) {
  if (!content || !guildId) {
    return { ok: false, errors: ['missing-content-or-guild'] };
  }
  const payload = {
    guild_id: String(guildId),
    channel_id: channelId ? String(channelId) : null,
    user_id: userId ? String(userId) : null,
    type,
    content: String(content).slice(0, MemoriesModel.limits.content || 8000),
    tags: Array.isArray(tags) ? tags.slice(0, MemoriesModel.limits.tags || 24) : [],
    importance: Number.isFinite(importance) ? importance : 1,
  };
  const embedding = await buildEmbedding(payload.content, openai);

  try {
    const result = await MemoriesModel.create(payload);
    if (!result?.ok) {
      console.warn('[MemoryStore] Memory create failed:', result?.errors || 'unknown-error');
      return result;
    }
    if (embedding && result?.data?.id) {
      try {
        const updated = await MemoriesModel.updateEmbedding(result.data.id, embedding);
        if (!updated) {
          console.warn('[MemoryStore] Embedding update failed for memory', result.data.id);
        }
      } catch (error) {
        console.error('[MemoryStore] Embedding update threw:', error?.response?.data || error?.message || error);
      }
    }
    return result;
  } catch (error) {
    console.error('[MemoryStore] Memory create threw:', error?.response?.data || error?.message || error);
    return { ok: false, errors: [error?.message || 'memory-create-failed'] };
  }
}

module.exports = {
  saveMemoryEntry,
};
