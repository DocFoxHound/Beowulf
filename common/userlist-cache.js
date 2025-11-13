// In-memory cache of the complete userlist from backend DB
// Keeps an array of normalized user rows and quick lookup maps.

try { require('dotenv').config(); } catch {}

const { getUsers } = require('../api/userlistApi');

const state = {
  loadedAt: 0,
  users: [],
  byId: new Map(),
  byUsername: new Map(),
  byNickname: new Map(),
};

function normalizeUserRow(row) {
  if (!row || typeof row !== 'object') return null;
  // Store essential fields; keep original for flexibility
  return {
    id: String(row.id || ''),
    username: row.username || null,
    nickname: row.nickname || null,
    rank: row.rank !== undefined ? row.rank : null,
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    raptor_level: row.raptor_level ?? null,
    corsair_level: row.corsair_level ?? null,
    raider_level: row.raider_level ?? null,
    joined_date: row.joined_date || null,
    promote_date: row.promote_date || null,
    rsi_handle: row.rsi_handle || null,
    rsi_display_name: row.rsi_display_name || null,
    player_org: row.player_org || null,
    fleet: row.fleet ?? null,
    _raw: row,
  };
}

function rebuildIndexes(list) {
  state.byId = new Map();
  state.byUsername = new Map();
  state.byNickname = new Map();
  for (const u of list) {
    if (!u) continue;
    if (u.id) state.byId.set(String(u.id), u);
    if (u.username) state.byUsername.set(String(u.username).toLowerCase(), u);
    if (u.nickname) state.byNickname.set(String(u.nickname).toLowerCase(), u);
  }
}

async function refreshUserListCache() {
  try {
    const rows = await getUsers();
    if (!Array.isArray(rows)) return false;
    const list = rows.map(normalizeUserRow).filter(Boolean);
    state.users = list;
    state.loadedAt = Date.now();
    rebuildIndexes(list);
    if ((process.env.DEBUG_USERLIST_CACHE || 'false').toLowerCase() === 'true') {
      console.log(`[userlist-cache] refreshed: ${list.length} users`);
    }
    return true;
  } catch (e) {
    console.error('[userlist-cache] refresh failed:', e?.response?.data || e?.message || e);
    return false;
  }
}

function getUserListCache() {
  return state.users.slice();
}

function getUserFromCacheById(id) {
  return state.byId.get(String(id)) || null;
}

function getUserFromCacheByName(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return null;
  return state.byUsername.get(s) || state.byNickname.get(s) || null;
}

function getUserListMeta() {
  return { loadedAt: state.loadedAt, count: state.users.length };
}

module.exports = {
  refreshUserListCache,
  getUserListCache,
  getUserListMeta,
  getUserFromCacheById,
  getUserFromCacheByName,
};
