const { listChatMessages } = require("../api/chatMessagesApi.js");

const MAX_CACHED_MESSAGES_PER_CHANNEL = 1000;
const cachedChatMessages = new Map();

function normalizeCacheRecord(record = {}, fallbackChannelId, fallbackGuildId) {
  if (!record) return null;
  const channelId = record.channel_id || record.channelId || fallbackChannelId;
  const guildId = record.guild_id || record.guildId || fallbackGuildId;
  const userId = record.user_id || record.userId;
  const rawContent = typeof record.content === "string" ? record.content : "";
  const content = rawContent.trim();
  const tsSource = record.timestamp || record.created_at || record.createdAt;
  const timestamp = tsSource ? new Date(tsSource).toISOString() : new Date().toISOString();
  if (!channelId || !guildId || !userId || !content) return null;
  return { channel_id: channelId, guild_id: guildId, user_id: userId, content, timestamp };
}

function addChatMessageToCache(record, { fallbackChannelId, fallbackGuildId } = {}) {
  const normalized = normalizeCacheRecord(record, fallbackChannelId, fallbackGuildId);
  if (!normalized) return;
  const channelId = normalized.channel_id;
  const channelMessages = cachedChatMessages.get(channelId) || [];
  channelMessages.push(normalized);
  if (channelMessages.length > MAX_CACHED_MESSAGES_PER_CHANNEL) {
    channelMessages.splice(0, channelMessages.length - MAX_CACHED_MESSAGES_PER_CHANNEL);
  }
  cachedChatMessages.set(channelId, channelMessages);
}

async function preloadCachedChatMessages({ channelIds = [], guildId } = {}) {
  if (!guildId) {
    console.warn("[ChatCache] Missing guild id; skipping preload.");
    return;
  }

  for (const channelId of channelIds) {
    if (!channelId) continue;
    try {
      const rows = (await listChatMessages({
        guild_id: guildId,
        channel_id: channelId,
        limit: MAX_CACHED_MESSAGES_PER_CHANNEL,
        direction: "desc",
      })) || [];
      const normalized = rows
        .map((row) => normalizeCacheRecord(row, channelId, guildId))
        .filter(Boolean)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      cachedChatMessages.set(channelId, normalized);
      console.log(`[ChatCache] Loaded ${normalized.length} cached messages for channel ${channelId}.`);
    } catch (e) {
      console.error(`[ChatCache] Failed to preload channel ${channelId}:`, e?.message || e);
    }
  }
}

function getCachedMessagesForChannel(channelId) {
  if (!channelId) return [];
  const list = cachedChatMessages.get(channelId);
  return Array.isArray(list) ? list.slice() : [];
}

function getChatCacheState() {
  return cachedChatMessages;
}

module.exports = {
  MAX_CACHED_MESSAGES_PER_CHANNEL,
  cachedChatMessages,
  normalizeCacheRecord,
  addChatMessageToCache,
  preloadCachedChatMessages,
  getCachedMessagesForChannel,
  getChatCacheState,
};
