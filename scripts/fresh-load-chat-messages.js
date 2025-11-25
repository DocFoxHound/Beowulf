#!/usr/bin/env node
const path = require('node:path');
const { once } = require('node:events');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const { saveMessage } = require('../common/message-saver');

const MAX_MESSAGES_PER_CHANNEL = 1000;

function parseChannels(raw, extraId) {
  const base = (raw || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (extraId && !base.includes(extraId)) base.push(extraId);
  return base;
}

function buildDefaultConfigs() {
  return [
    {
      label: 'live',
      token: process.env.CLIENT_TOKEN,
      guildId: process.env.GUILD_ID,
      channels: parseChannels(process.env.CHANNELS, process.env.HITTRACK_CHANNEL_ID),
    },
    {
      label: 'test',
      token: process.env.TEST_CLIENT_TOKEN,
      guildId: process.env.TEST_GUILD_ID,
      channels: parseChannels(process.env.TEST_CHANNELS, process.env.TEST_HITTRACK_CHANNEL_ID),
    },
  ].filter((cfg) => (cfg.token || cfg.client) && cfg.guildId && cfg.channels?.length);
}

function isTextChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') {
    return channel.isTextBased() && channel.type !== ChannelType.GuildForum;
  }
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildPublicThread || channel.type === ChannelType.GuildPrivateThread;
}

async function fetchRecentMessages(channel, maxCount) {
  const collected = [];
  let before;
  while (collected.length < maxCount) {
    const limit = Math.min(100, maxCount - collected.length);
    const batch = await channel.messages.fetch({ limit, before });
    if (!batch?.size) break;
    const batchValues = Array.from(batch.values());
    collected.push(...batchValues);
    const oldest = batchValues[batchValues.length - 1];
    before = oldest?.id;
    if (!before || batch.size < limit) break;
  }
  return collected
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .slice(-maxCount);
}

async function runFreshLoadForConfig(cfg) {
  console.log(`[fresh-load] Starting for ${cfg.label} (${cfg.channels.length} channels).`);
  let client = cfg.client;
  let teardown = async () => {};

  if (!client) {
    client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      partials: [Partials.Channel, Partials.Message],
    });
    const readyPromise = once(client, 'ready');
    await client.login(cfg.token);
    await readyPromise;
    console.log(`[fresh-load] Logged in as ${client.user?.tag || client.user?.id} for ${cfg.label}.`);
    teardown = async () => { await client.destroy().catch(() => {}); };
  } else {
    console.log(`[fresh-load] Using existing client for ${cfg.label}.`);
  }

  try {
    for (const channelId of cfg.channels) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!isTextChannel(channel)) {
          console.log(`[fresh-load] Skipping non-text channel ${channelId} for ${cfg.label}.`);
          continue;
        }
        const messages = await fetchRecentMessages(channel, MAX_MESSAGES_PER_CHANNEL);
        let savedCount = 0;
        for (const message of messages) {
          const result = await saveMessage(message);
          if (result) savedCount += 1;
        }
        console.log(`[fresh-load] ${cfg.label} channel ${channel?.name || channelId}: saved ${savedCount}/${messages.length} messages.`);
      } catch (err) {
        console.error(`[fresh-load] Failed to process channel ${channelId} for ${cfg.label}:`, err?.message || err);
      }
    }
  } finally {
    await teardown();
  }
}

async function freshLoadChatMessages(options = {}) {
  const {
    envPath,
    skipEnvLoad = false,
    configs: overrideConfigs,
  } = options;

  if (!skipEnvLoad) {
    const configPath = envPath ? path.resolve(envPath) : path.resolve('.env');
    dotenv.config({ path: configPath });
  }

  const configs = (overrideConfigs && overrideConfigs.length ? overrideConfigs : buildDefaultConfigs());

  if (!configs.length) {
    console.error('[fresh-load] No valid configs found. Ensure tokens, guild IDs, and channel lists are configured.');
    return false;
  }

  for (const cfg of configs) {
    try {
      await runFreshLoadForConfig(cfg);
    } catch (err) {
      console.error(`[fresh-load] ${cfg.label} run failed:`, err?.message || err);
    }
  }
  console.log('[fresh-load] Completed.');
  return true;
}

module.exports = { freshLoadChatMessages, MAX_MESSAGES_PER_CHANNEL, parseChannels };

if (require.main === module) {
  const envArg = process.argv[2];
  freshLoadChatMessages({ envPath: envArg })
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error('[fresh-load] Fatal error:', err?.message || err);
      process.exit(1);
    });
}
