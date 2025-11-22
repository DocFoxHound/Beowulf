const { UserProfilesModel } = require('../api/models/user-profiles');

const DEFAULT_CACHE_STATE = {
  records: [],
  byId: new Map(),
  lastUpdated: null,
  meta: null,
};

let cache = { ...DEFAULT_CACHE_STATE };

function snapshotRecordsToMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row || !row.user_id) continue;
    map.set(String(row.user_id), row);
  }
  return map;
}

function getUserProfilesCacheState() {
  return {
    count: cache.records.length,
    lastUpdated: cache.lastUpdated,
    meta: cache.meta,
  };
}

function getUserProfileFromCache(userId) {
  if (!userId) return null;
  return cache.byId.get(String(userId)) || null;
}

function upsertUserProfileInCache(profile) {
  if (!profile || !profile.user_id) return null;
  const userId = String(profile.user_id);
  cache.byId.set(userId, profile);
  const idx = cache.records.findIndex((row) => String(row.user_id) === userId);
  if (idx >= 0) {
    cache.records[idx] = profile;
  } else {
    cache.records.push(profile);
  }
  cache.lastUpdated = new Date().toISOString();
  cache.meta = { source: 'memory-upsert' };
  return profile;
}

async function refreshUserProfilesCache() {
  try {
    const rows = await UserProfilesModel.list();
    const normalized = Array.isArray(rows) ? rows : [];
    cache = {
      records: normalized,
      byId: snapshotRecordsToMap(normalized),
      lastUpdated: new Date().toISOString(),
      meta: { source: 'api', error: null },
    };
    return cache;
  } catch (error) {
    console.error('[UserProfilesCache] refresh failed:', error?.message || error);
    cache.meta = { source: 'api', error: error?.message || String(error) };
    return cache;
  }
}

module.exports = {
  refreshUserProfilesCache,
  getUserProfilesCacheState,
  getUserProfileFromCache,
  upsertUserProfileInCache,
};
