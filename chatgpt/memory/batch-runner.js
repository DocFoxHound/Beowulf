const { normalizeCacheRecord, getCachedMessagesForChannel } = require('../../common/chat-cache');
const { handleMemoryBatch } = require('./batch-processor');

const ENABLED = (process.env.MEMORY_BATCHER_ENABLE || process.env.KNOWLEDGE_INGEST_ENABLE || 'false').toLowerCase() === 'true';
const MIN_BATCH_COUNT = Math.max(1, Number(process.env.MEMORY_BATCH_MIN_MESSAGES || 10));
const DEFAULT_INTERVAL_MS = Math.max(15000, Number(process.env.MEMORY_BATCH_INTERVAL_MS || 180000));
const DEBUG_LOGGING = (process.env.MEMORY_BATCHER_DEBUG || 'false').toLowerCase() === 'true';

const channelState = new Map();
const pendingFlushes = new Set();
let intervalHandle = null;
let batchHandler = (payload) => handleMemoryBatch(payload);
let intervalMs = DEFAULT_INTERVAL_MS;
let sharedOpenAi = null;

function debugLog(message, ...args) {
  if (!DEBUG_LOGGING) return;
  console.log(`[MemoryBatcher][debug] ${message}`, ...args);
}

function getTimestampMs(value) {
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function getLatestCachedTimestamp(channelId) {
  try {
    const list = getCachedMessagesForChannel(channelId);
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[list.length - 1]?.timestamp || null;
  } catch {
    return null;
  }
}

function ensureChannelState(channelId) {
  if (!channelId) return null;
  if (!channelState.has(channelId)) {
    const latest = getLatestCachedTimestamp(channelId);
    channelState.set(channelId, {
      accumulated: 0,
      lastProcessedIso: latest,
      latestSeenIso: latest,
      lastFlushAt: Date.now(),
      isProcessing: false,
    });
    debugLog(`Registered channel ${channelId} (lastProcessed=${latest || 'none'})`);
  }
  return channelState.get(channelId);
}

function collectPendingMessages(channelId, lastProcessedIso) {
  const rows = getCachedMessagesForChannel(channelId) || [];
  if (!rows.length) return [];
  const lastTs = lastProcessedIso ? getTimestampMs(lastProcessedIso) : null;
  return rows
    .filter((row) => {
      if (!row?.timestamp) return false;
      if (!lastTs) return true;
      const ts = getTimestampMs(row.timestamp);
      return ts && ts > lastTs;
    })
    .sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
}

function queueFlush(channelId, reason = 'count-threshold') {
  if (!ENABLED || !channelId) return;
  if (pendingFlushes.has(channelId)) return;
  pendingFlushes.add(channelId);
  setImmediate(() => {
    pendingFlushes.delete(channelId);
    flushChannel(channelId, reason).catch((err) => {
      console.error(`[MemoryBatcher] Flush failed for channel ${channelId}:`, err?.message || err);
    });
  });
}

async function flushChannel(channelId, reason = 'interval') {
  if (!ENABLED) return null;
  const state = channelState.get(channelId);
  if (!state || state.isProcessing) return null;

  const pending = collectPendingMessages(channelId, state.lastProcessedIso);
  if (!pending.length) {
    state.accumulated = 0;
    state.lastFlushAt = Date.now();
    return null;
  }

  const shouldProcessPartial = reason === 'interval';
  if (!shouldProcessPartial && pending.length < MIN_BATCH_COUNT) {
    state.accumulated = pending.length;
    state.lastFlushAt = Date.now();
    return null;
  }

  const batch = pending;

  state.isProcessing = true;
  debugLog(`Flushing channel ${channelId} reason=${reason} count=${batch.length}`);
  try {
    await batchHandler({ channelId, reason, messages: batch });
    state.lastProcessedIso = batch[batch.length - 1]?.timestamp || state.lastProcessedIso;
    state.accumulated = 0;
  } catch (error) {
    console.error(`[MemoryBatcher] Failed to process batch for channel ${channelId}:`, error?.message || error);
  } finally {
    state.isProcessing = false;
    state.lastFlushAt = Date.now();
  }

  return batch;
}

async function sweepIntervalFlushes() {
  if (!ENABLED) return;
  const now = Date.now();
  for (const [channelId, state] of channelState.entries()) {
    if (!state) continue;
    const hasNewMessages = !!(state.latestSeenIso && (!state.lastProcessedIso || getTimestampMs(state.latestSeenIso) > getTimestampMs(state.lastProcessedIso)));
    if (!hasNewMessages) continue;
    if (state.isProcessing) continue;
    if (now - state.lastFlushAt < intervalMs) continue;
    await flushChannel(channelId, 'interval');
  }
}

function startIntervalTimer() {
  if (intervalHandle || !ENABLED) return;
  intervalHandle = setInterval(() => {
    sweepIntervalFlushes().catch((err) => {
      console.error('[MemoryBatcher] Interval sweep failed:', err?.message || err);
    });
  }, intervalMs);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
}

function startMemoryBatchWorker({ channelIds = [], onBatch, intervalMsOverride, replayFromHistory = false } = {}) {
  if (!ENABLED) {
    debugLog('Batcher disabled via env.');
    return false;
  }
  if (typeof onBatch === 'function') {
    batchHandler = onBatch;
  }
  if (intervalMsOverride) {
    intervalMs = Math.max(15000, Number(intervalMsOverride));
  }
  channelIds.forEach((id) => {
    const state = ensureChannelState(id);
    if (replayFromHistory && state) {
      state.lastProcessedIso = null;
    }
  });
  startIntervalTimer();
  console.log(`[MemoryBatcher] Started (channels=${channelState.size}, minBatch=${MIN_BATCH_COUNT}, interval=${intervalMs}ms).`);
  return true;
}

function trackLiveMessageForMemories(record, { fallbackChannelId, fallbackGuildId } = {}) {
  if (!ENABLED) return;
  const normalized = normalizeCacheRecord(record, fallbackChannelId, fallbackGuildId);
  if (!normalized) return;
  const state = ensureChannelState(normalized.channel_id);
  if (!state) return;
  state.accumulated += 1;
  state.latestSeenIso = normalized.timestamp;
  if (state.accumulated >= MIN_BATCH_COUNT) {
    queueFlush(normalized.channel_id, 'count-threshold');
  }
}

module.exports = {
  startMemoryBatchWorker,
  trackLiveMessageForMemories,
};
