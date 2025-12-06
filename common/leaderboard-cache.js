const {
  getAllPlayerLeaderboardEntries,
  getAllOrgLeaderboardEntries,
} = require('../api/leaderboardSBApi.js');

const leaderboardState = {
  players: { records: [], lastUpdated: null, source: null, meta: null },
  orgs: { records: [], lastUpdated: null, source: null, meta: null },
};

function normalizeHandle(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function playerEntryMatchesId(entry, userId) {
  if (!entry || userId == null) return false;
  const target = String(userId);
  const candidateFields = [entry.discord_id, entry.discordId, entry.user_id, entry.userId];
  return candidateFields.some((value) => value != null && String(value) === target);
}

function playerEntryMatchesHandle(entry, handles = []) {
  if (!entry || !handles.length) return false;
  const entryHandles = [
    entry.displayname,
    entry.display_name,
    entry.player_name,
    entry.nickname,
    entry.username,
    entry.handle,
    entry.rsi_handle,
  ].map(normalizeHandle).filter(Boolean);
  if (!entryHandles.length) return false;
  return entryHandles.some((value) => handles.includes(value));
}

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

function findPlayerLeaderboardEntry({ userId, handles = [] } = {}) {
  const records = leaderboardState.players.records || [];
  if (!records.length) return null;
  const normalizedHandles = handles
    .map(normalizeHandle)
    .filter(Boolean);

  if (userId != null) {
    const byId = records.find((entry) => playerEntryMatchesId(entry, userId));
    if (byId) return byId;
  }

  if (normalizedHandles.length) {
    const byHandle = records.find((entry) => playerEntryMatchesHandle(entry, normalizedHandles));
    if (byHandle) return byHandle;
  }

  return null;
}

module.exports = {
  hydrateLeaderboardsFromDb,
  setPlayerLeaderboardCache,
  setOrgLeaderboardCache,
  getPlayerLeaderboardCache,
  getOrgLeaderboardCache,
  getLeaderboardCacheState,
  findPlayerLeaderboardEntry,
};
