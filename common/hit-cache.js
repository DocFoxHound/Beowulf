const HitTrackerApi = require('../api/hitTrackerApi.js');

const hitCacheState = {
  records: [],
  lastUpdated: null,
  source: null,
  meta: null,
};

function replaceHitCache(records, meta = {}) {
  hitCacheState.records = Array.isArray(records) ? records : [];
  hitCacheState.lastUpdated = new Date().toISOString();
  hitCacheState.source = meta.source || 'runtime';
  hitCacheState.meta = meta;
  return hitCacheState;
}

async function hydrateHitCacheFromDb() {
  try {
    const hits = await HitTrackerApi.getAllHitLogs();
    return replaceHitCache(hits || [], { source: 'database' });
  } catch (e) {
    console.error('[HitCache] Failed to hydrate from DB:', e?.message || e);
    return replaceHitCache([], { source: 'database-error', error: e?.message || String(e) });
  }
}

function upsertHitInCache(hit, meta = {}) {
  if (!hit) return hitCacheState;
  const normalizedId = hit.id != null ? String(hit.id) : null;
  const index = normalizedId !== null
    ? hitCacheState.records.findIndex((entry) => String(entry.id) === normalizedId)
    : -1;
  if (index >= 0) {
    hitCacheState.records[index] = { ...hitCacheState.records[index], ...hit };
  } else {
    hitCacheState.records.push(hit);
  }
  hitCacheState.lastUpdated = new Date().toISOString();
  hitCacheState.source = meta.source || 'runtime';
  hitCacheState.meta = meta;
  return hitCacheState;
}

function removeHitFromCache(hitId, meta = {}) {
  if (hitId == null) return hitCacheState;
  const before = hitCacheState.records.length;
  hitCacheState.records = hitCacheState.records.filter((entry) => String(entry.id) !== String(hitId));
  if (hitCacheState.records.length !== before) {
    hitCacheState.lastUpdated = new Date().toISOString();
    hitCacheState.source = meta.source || 'runtime';
    hitCacheState.meta = meta;
  }
  return hitCacheState;
}

function getHitCache() {
  return hitCacheState.records;
}

function getHitCacheState() {
  return hitCacheState;
}

module.exports = {
  hydrateHitCacheFromDb,
  upsertHitInCache,
  removeHitFromCache,
  getHitCache,
  getHitCacheState,
};
