const LOWER_TRUE = new Set(['true', '1', 'yes', 'on']);

function isLiveEnvironment() {
  return LOWER_TRUE.has(String(process.env.LIVE_ENVIRONMENT || 'true').toLowerCase());
}

function collectConfiguredBotIds() {
  const ids = new Set();
  const keys = ['BOT_USER_ID', 'BOT_ID', 'DISCORD_BOT_ID', 'APPLICATION_ID', 'CLIENT_ID', 'TEST_CLIENT_ID'];
  for (const key of keys) {
    const value = process.env[key];
    if (value) ids.add(String(value));
  }
  const extra = process.env.BOT_USER_IDS || process.env.BOT_AUTHOR_IDS;
  if (extra) {
    String(extra)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => ids.add(entry));
  }
  const live = isLiveEnvironment();
  if (live && process.env.CLIENT_ID) ids.add(String(process.env.CLIENT_ID));
  if (!live && process.env.TEST_CLIENT_ID) ids.add(String(process.env.TEST_CLIENT_ID));
  return ids;
}

const BOT_ID_SET = collectConfiguredBotIds();

function getBotUserIds() {
  return Array.from(BOT_ID_SET);
}

function isBotUser(userId) {
  if (!userId) return false;
  return BOT_ID_SET.has(String(userId));
}

module.exports = {
  getBotUserIds,
  isBotUser,
};
