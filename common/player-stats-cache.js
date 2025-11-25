const { getAllPlayerStats, refreshPlayerStatsView } = require('../api/playerStatsApi.js');

const playerStatsState = {
  records: [],
  lastUpdated: null,
  source: null,
  meta: null,
};

function setPlayerStatsState(records, meta = {}) {
  playerStatsState.records = Array.isArray(records) ? records : [];
  playerStatsState.lastUpdated = new Date().toISOString();
  playerStatsState.source = meta.source || 'runtime';
  playerStatsState.meta = meta;
  return playerStatsState;
}

async function hydratePlayerStatsCacheFromDb() {
  try {
    const stats = await getAllPlayerStats();
    return setPlayerStatsState(stats || [], { source: 'database' });
  } catch (e) {
    console.error('[PlayerStatsCache] Failed to hydrate from DB:', e?.message || e);
    return setPlayerStatsState([], { source: 'database-error', error: e?.message || String(e) });
  }
}

async function refreshPlayerStatsCache({ skipViewRefresh = false } = {}) {
  if (!skipViewRefresh) {
    try {
      await refreshPlayerStatsView();
    } catch (e) {
      console.error('[PlayerStatsCache] refreshPlayerStatsView failed:', e?.message || e);
    }
  }
  try {
    const stats = await getAllPlayerStats();
    return setPlayerStatsState(stats || [], { source: skipViewRefresh ? 'database' : 'view-refresh' });
  } catch (e) {
    console.error('[PlayerStatsCache] Failed to fetch stats:', e?.message || e);
    return setPlayerStatsState([], { source: 'fetch-error', error: e?.message || String(e) });
  }
}

function getPlayerStatsCache() {
  return playerStatsState.records;
}

function getPlayerStatsCacheState() {
  return playerStatsState;
}

module.exports = {
  hydratePlayerStatsCacheFromDb,
  refreshPlayerStatsCache,
  getPlayerStatsCache,
  getPlayerStatsCacheState,
};
