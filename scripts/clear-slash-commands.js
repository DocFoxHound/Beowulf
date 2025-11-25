#!/usr/bin/env node
const path = require('node:path');
const dotenv = require('dotenv');
const { REST, Routes } = require('discord.js');

const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.env');
dotenv.config({ path: envPath });

const configs = [
  {
    label: 'live',
    token: process.env.CLIENT_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
  },
  {
    label: 'test',
    token: process.env.TEST_CLIENT_TOKEN,
    clientId: process.env.TEST_CLIENT_ID,
    guildId: process.env.TEST_GUILD_ID,
  },
].filter(cfg => cfg.token && cfg.clientId);

if (!configs.length) {
  console.error('[clear-commands] Missing CLIENT_TOKEN/CLIENT_ID values. Aborting.');
  process.exit(1);
}

async function clearForConfig({ label, token, clientId, guildId }) {
  const rest = new REST({ version: '10' }).setToken(token);
  const cleared = [];
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      cleared.push(`guild:${guildId}`);
    }
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    cleared.push('global');
    console.log(`[clear-commands] Cleared ${cleared.join(' + ')} commands for ${label} (app ${clientId}).`);
  } catch (err) {
    console.error(`[clear-commands] Failed for ${label} (app ${clientId}).`, err?.message || err);
    throw err;
  }
}

(async () => {
  for (const cfg of configs) {
    await clearForConfig(cfg);
  }
  console.log('[clear-commands] Done.');
})().catch(() => process.exit(1));
