const {
  getAllPlayerLeaderboardEntries,
  getAllOrgLeaderboardEntries,
} = require('../api/leaderboardSBApi.js');

const leaderboardState = {
  players: { records: [], lastUpdated: null, source: null, meta: null },
  orgs: { records: [], lastUpdated: null, source: null, meta: null },
};

function setPlayerLeaderboardCache(records, meta = {}) {
  leaderboardState.players = {
    records: Array.isArray(records) ? records : [],
    lastUpdated: new Date().toISOString(),
    source: meta.source || 'runtime',
    meta,
  };
  return leaderboardState.players;
}

function setOrgLeaderboardCache(records, meta = {}) {
  leaderboardState.orgs = {
    records: Array.isArray(records) ? records : [],
    lastUpdated: new Date().toISOString(),
    source: meta.source || 'runtime',
    meta,
  };
  return leaderboardState.orgs;
}

async function hydrateLeaderboardsFromDb() {
  const [players, orgs] = await Promise.all([
    getAllPlayerLeaderboardEntries().catch((e) => {
      console.error('[LeaderboardCache] Failed to load player entries:', e?.message || e);
      return [];
    }),
    getAllOrgLeaderboardEntries().catch((e) => {
      console.error('[LeaderboardCache] Failed to load org entries:', e?.message || e);
      return [];
    }),
  ]);
  setPlayerLeaderboardCache(players || [], { source: 'database' });
  setOrgLeaderboardCache(orgs || [], { source: 'database' });
  return leaderboardState;
}

function getPlayerLeaderboardCache() {
  return leaderboardState.players.records;
}

function getOrgLeaderboardCache() {
  return leaderboardState.orgs.records;
}

function getLeaderboardCacheState() {
  return leaderboardState;
}

module.exports = {
  hydrateLeaderboardsFromDb,
  setPlayerLeaderboardCache,
  setOrgLeaderboardCache,
  getPlayerLeaderboardCache,
  getOrgLeaderboardCache,
  getLeaderboardCacheState,
};
