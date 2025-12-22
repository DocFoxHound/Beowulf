const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const VOTES_PATH = path.join(DATA_DIR, 'prospect-votes.json');

const CYCLE_TTL_MS = 24 * 60 * 60 * 1000;

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function atomicWriteJson(filePath, data) {
  ensureDataDir();
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function normalizeUserId(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.replace(/\D+/g, '');
}

function normalizeGuildId(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.replace(/\D+/g, '') || null;
}

function normalizeChannelId(value) {
  return normalizeGuildId(value);
}

function nowIso() {
  return new Date().toISOString();
}

function parseIso(value) {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? new Date(t) : null;
}

function emptyState() {
  return {
    version: 2,
    cycle_started_at: null,
    cycle_expires_at: null,
    votes: {},
    lists: {},
  };
}

function coerceState(parsed) {
  const state = emptyState();
  if (!parsed || typeof parsed !== 'object') return state;

  if (parsed.votes && typeof parsed.votes === 'object') state.votes = parsed.votes;
  if (parsed.lists && typeof parsed.lists === 'object') state.lists = parsed.lists;
  if (parsed.cycle_started_at) state.cycle_started_at = String(parsed.cycle_started_at);
  if (parsed.cycle_expires_at) state.cycle_expires_at = String(parsed.cycle_expires_at);
  return state;
}

function isCycleExpired(state) {
  const expires = parseIso(state?.cycle_expires_at);
  if (!expires) return true;
  return Date.now() > expires.getTime();
}

function clearCycle(state) {
  return {
    ...state,
    cycle_started_at: null,
    cycle_expires_at: null,
    votes: {},
  };
}

function startNewCycle(state) {
  const started = new Date();
  const expires = new Date(started.getTime() + CYCLE_TTL_MS);
  return {
    ...state,
    cycle_started_at: started.toISOString(),
    cycle_expires_at: expires.toISOString(),
    votes: {},
  };
}

function loadVotesState({ ensureActiveCycle = false } = {}) {
  const parsed = safeReadJson(VOTES_PATH);
  let state = coerceState(parsed);

  // Auto-clear expired votes so a fresh list shows cleared counts.
  if (state.cycle_expires_at && isCycleExpired(state)) {
    state = clearCycle(state);
    atomicWriteJson(VOTES_PATH, state);
  }

  if (ensureActiveCycle) {
    if (!state.cycle_expires_at || isCycleExpired(state)) {
      state = startNewCycle(state);
      atomicWriteJson(VOTES_PATH, state);
    }
  }

  return state;
}

function getCountsForProspect(state, prospectId) {
  const pid = normalizeUserId(prospectId);
  if (!pid) return { up: 0, down: 0 };
  const entry = state?.votes?.[pid];
  const up = Array.isArray(entry?.up) ? entry.up.length : 0;
  const down = Array.isArray(entry?.down) ? entry.down.length : 0;
  return { up, down };
}

function getCycleInfo(state) {
  return {
    started_at: state?.cycle_started_at || null,
    expires_at: state?.cycle_expires_at || null,
  };
}

function setListMessages({ guildId, channelId, messageIds = [] }) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeChannelId(channelId);
  const mids = Array.isArray(messageIds)
    ? messageIds.map((m) => normalizeGuildId(m)).filter(Boolean)
    : [];
  if (!gid || !cid || !mids.length) return { ok: false, reason: 'Invalid list reference' };

  const state = loadVotesState();
  state.lists = state.lists && typeof state.lists === 'object' ? state.lists : {};
  state.lists[gid] = {
    channelId: cid,
    messageIds: mids,
    updated_at: nowIso(),
  };
  atomicWriteJson(VOTES_PATH, state);
  return { ok: true };
}

function getListMessages(state, guildId) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return null;
  const entry = state?.lists?.[gid];
  if (!entry) return null;
  const channelId = normalizeChannelId(entry.channelId);
  const messageIds = Array.isArray(entry.messageIds)
    ? entry.messageIds.map((m) => normalizeGuildId(m)).filter(Boolean)
    : [];
  if (!channelId || !messageIds.length) return null;
  return { guildId: gid, channelId, messageIds };
}

function setVote({ prospectId, voterId, vote }) {
  const pid = normalizeUserId(prospectId);
  const vid = normalizeUserId(voterId);
  const dir = String(vote || '').toLowerCase();
  if (!pid || !vid) return { ok: false, reason: 'Invalid ids' };
  if (dir !== 'up' && dir !== 'down') return { ok: false, reason: 'Invalid vote' };

  // Ensure we are within an active 24h cycle; start a fresh one if needed.
  const state = loadVotesState({ ensureActiveCycle: true });
  if (!state.votes[pid]) state.votes[pid] = { up: [], down: [], updated_at: null };
  const entry = state.votes[pid];
  entry.up = Array.isArray(entry.up) ? entry.up : [];
  entry.down = Array.isArray(entry.down) ? entry.down : [];

  // Remove from both first (idempotent)
  entry.up = entry.up.filter((x) => String(x) !== vid);
  entry.down = entry.down.filter((x) => String(x) !== vid);

  if (dir === 'up') entry.up.push(vid);
  if (dir === 'down') entry.down.push(vid);
  entry.updated_at = nowIso();

  atomicWriteJson(VOTES_PATH, state);
  return { ok: true, counts: getCountsForProspect(state, pid), cycle: getCycleInfo(state) };
}

module.exports = {
  loadVotesState,
  getCountsForProspect,
  setVote,
  getCycleInfo,
  setListMessages,
  getListMessages,
  VOTES_PATH,
};
