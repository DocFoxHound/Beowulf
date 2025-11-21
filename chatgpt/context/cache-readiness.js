const { hydrateLeaderboardsFromDb } = require('../../common/leaderboard-cache.js');
const { hydrateUexCachesFromDb } = require('../../common/uex-cache.js');
const { hydratePlayerStatsCacheFromDb } = require('../../common/player-stats-cache.js');
const { hydrateHitCacheFromDb } = require('../../common/hit-cache.js');

function logHydration(stage, fn) {
  return async () => {
    const start = Date.now();
    console.log(`[ChatGPT][CacheReady] Hydrating ${stage}…`);
    await fn();
    console.log(`[ChatGPT][CacheReady] ${stage} hydrated in ${Date.now() - start}ms`);
  };
}

async function ensureLeaderboardCacheReady() {
  try {
    const cache = globalThis.leaderboardCache;
    const loaded = Array.isArray(cache?.getPlayers?.()) && cache.getPlayers().length > 0;
    if (loaded) return;
    await logHydration('leaderboard cache', hydrateLeaderboardsFromDb)();
  } catch (error) {
    console.error('[ChatGPT][CacheReady] Failed to hydrate leaderboard cache:', error?.message || error);
  }
}

async function ensureUexCacheReady() {
  try {
    const cache = globalThis.uexCache;
    const hasTerminalPrices = Array.isArray(cache?.getRecords?.('terminal_prices')) && cache.getRecords('terminal_prices').length > 0;
    const hasCommodities = Array.isArray(cache?.getRecords?.('commodities')) && cache.getRecords('commodities').length > 0;
    if (hasTerminalPrices || hasCommodities) return;
    await logHydration('UEX cache', () => hydrateUexCachesFromDb({ labels: ['terminal_prices', 'commodities'] }))();
  } catch (error) {
    console.error('[ChatGPT][CacheReady] Failed to hydrate UEX cache:', error?.message || error);
  }
}

async function ensurePlayerStatsCacheReady() {
  try {
    const stats = globalThis.playerStatsCache?.getAll?.();
    if (Array.isArray(stats) && stats.length) return;
    await logHydration('player stats cache', hydratePlayerStatsCacheFromDb)();
  } catch (error) {
    console.error('[ChatGPT][CacheReady] Failed to hydrate player stats cache:', error?.message || error);
  }
}

async function ensureHitCacheReady() {
  try {
    const hits = globalThis.hitCache?.getAll?.();
    if (Array.isArray(hits) && hits.length) return;
    await logHydration('hit cache', hydrateHitCacheFromDb)();
  } catch (error) {
    console.error('[ChatGPT][CacheReady] Failed to hydrate hit cache:', error?.message || error);
  }
}

async function ensureCachesReady() {
  await Promise.all([
    ensureLeaderboardCacheReady(),
    ensureUexCacheReady(),
    ensurePlayerStatsCacheReady(),
    ensureHitCacheReady(),
  ]);
}

module.exports = {
  ensureCachesReady,
  ensureLeaderboardCacheReady,
  ensureUexCacheReady,
  ensurePlayerStatsCacheReady,
  ensureHitCacheReady,
};
