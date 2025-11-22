#!/usr/bin/env node
const path = require('node:path');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { listChatMessages } = require('../api/chatMessagesApi');
const { handleMemoryBatch } = require('../chatgpt/memory/batch-processor');
const { refreshUserProfilesCache } = require('../common/user-profiles-cache');
const { parseChannels } = require('./fresh-load-chat-messages');

const HISTORY_LIMIT = Number(process.env.MEMORY_PRELOAD_CHANNEL_LIMIT || 1000);
const CHUNK_SIZE = Math.max(1, Number(process.env.MEMORY_PRELOAD_CHUNK_SIZE || 10));
const BETWEEN_BATCH_DELAY_MS = Math.max(0, Number(process.env.MEMORY_PRELOAD_BATCH_DELAY_MS || 500));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getActiveGuildId() {
  const live = (process.env.LIVE_ENVIRONMENT || 'true').toLowerCase() === 'true';
  return live ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
}

function getChannelIds() {
  const live = (process.env.LIVE_ENVIRONMENT || 'true').toLowerCase() === 'true';
  const raw = live ? process.env.CHANNELS : process.env.TEST_CHANNELS;
  const extra = live ? process.env.HITTRACK_CHANNEL_ID : process.env.TEST_HITTRACK_CHANNEL_ID;
  return parseChannels(raw, extra);
}

function chunkMessages(list, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function normalizeMessage(row, { guildId, channelId, channelName }) {
  if (!row || !row.content) return null;
  return {
    id: row.id,
    guild_id: row.guild_id || guildId,
    channel_id: row.channel_id || channelId,
    channel_name: channelName || channelId,
    user_id: row.user_id,
    username: row.username || row.user_id || 'user',
    content: row.content,
    timestamp: row.timestamp,
  };
}

async function fetchChannelHistory(channelId, guildId) {
  try {
    const rows = await listChatMessages({
      guild_id: guildId,
      channel_id: channelId,
      limit: HISTORY_LIMIT,
      direction: 'desc',
    });
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows
      .map((row) => normalizeMessage(row, { guildId, channelId }))
      .filter(Boolean)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (error) {
    console.error(`[MemoryPreload] Failed to fetch history for ${channelId}:`, error?.message || error);
    return [];
  }
}

async function processChannel({ channelId, channelName, guildId, openai }) {
  const history = await fetchChannelHistory(channelId, guildId);
  if (!history.length) {
    console.log(`[MemoryPreload] No cached messages for channel ${channelId}.`);
    return { batches: 0, messages: 0 };
  }
  const chunks = chunkMessages(history, CHUNK_SIZE);
  let processed = 0;
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    await handleMemoryBatch({
      channelId,
      reason: 'preload',
      messages: chunk,
      openai,
    });
    processed += chunk.length;
    if (BETWEEN_BATCH_DELAY_MS > 0) {
      await sleep(BETWEEN_BATCH_DELAY_MS);
    }
  }
  return { batches: chunks.length, messages: processed };
}

async function main() {
  const envArg = process.argv[2];
  const envPath = envArg ? path.resolve(envArg) : path.resolve('.env');
  dotenv.config({ path: envPath });

  if (!process.env.OPENAI_API_KEY) {
    console.error('[MemoryPreload] OPENAI_API_KEY is required.');
    process.exit(1);
  }

  const guildId = getActiveGuildId();
  if (!guildId) {
    console.error('[MemoryPreload] Missing guild ID for current environment.');
    process.exit(1);
  }

  const channelIds = getChannelIds();
  if (!channelIds.length) {
    console.error('[MemoryPreload] No channel IDs configured. Check CHANNELS / TEST_CHANNELS env.');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await refreshUserProfilesCache();

  console.log(`[MemoryPreload] Starting seed run for ${channelIds.length} channels (guild ${guildId}).`);
  for (const channelId of channelIds) {
    try {
      const result = await processChannel({ channelId, guildId, openai });
      console.log(`[MemoryPreload] Channel ${channelId}: processed ${result.messages} messages across ${result.batches} batches.`);
    } catch (error) {
      console.error(`[MemoryPreload] Channel ${channelId} failed:`, error?.message || error);
    }
  }
  console.log('[MemoryPreload] Completed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[MemoryPreload] Fatal error:', error?.message || error);
    process.exit(1);
  });
}
