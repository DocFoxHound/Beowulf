#!/usr/bin/env node
const path = require('node:path');
const dotenv = require('dotenv');
const { REST, Routes } = require('discord.js');
const { getSlashCommandData } = require('../commands');

const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.env');
dotenv.config({ path: envPath });

const commandData = getSlashCommandData();
if (!commandData.length) {
  console.error('[deploy-commands] No slash command definitions were found.');
  process.exit(1);
}

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
].filter((cfg) => cfg.token && cfg.clientId);

if (!configs.length) {
  console.error('[deploy-commands] Missing CLIENT_TOKEN/CLIENT_ID values. Aborting.');
  process.exit(1);
}

async function deployForConfig({ label, token, clientId, guildId }) {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
      console.log(`[deploy-commands] Updated guild commands for ${label} (guild ${guildId}).`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log(`[deploy-commands] Updated global commands for ${label}.`);
    }
  } catch (err) {
    console.error(`[deploy-commands] Failed for ${label}:`, err?.response?.data || err?.message || err);
    throw err;
  }
}

(async () => {
  for (const cfg of configs) {
    await deployForConfig(cfg);
  }
  console.log('[deploy-commands] Done.');
})().catch(() => process.exit(1));
