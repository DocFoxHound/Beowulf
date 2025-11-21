const FALLBACK_LIMIT = 8;
const ITEM_NAME_FIELDS = ['item_name', 'item', 'commodity_name', 'commodity', 'commodityName', 'name', 'label'];
const LOCATION_FIELDS = ['terminal_name', 'terminal', 'location', 'station', 'space_station_name', 'outpost_name', 'city_name', 'moon_name', 'planet_name'];
const BUY_PRICE_FIELDS = ['buy_price', 'buy', 'best_buy', 'price', 'price_buy', 'price_buy_avg', 'price_buy_max', 'price_buy_min'];
const SELL_PRICE_FIELDS = ['sell_price', 'sell', 'best_sell', 'median_price', 'price_sell', 'price_sell_avg', 'price_sell_max', 'price_sell_min'];

function safeJson(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

function takeLast(arr, limit = FALLBACK_LIMIT) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const start = Math.max(0, arr.length - limit);
  return arr.slice(start);
}

function getRecentChatForChannel(channelId, limit = 10) {
  try {
    const cache = globalThis.chatMessagesCache;
    if (!cache || typeof cache.getForChannel !== 'function') return [];
    const entries = cache.getForChannel(channelId) || [];
    return takeLast(entries, limit).map((entry) => ({
      channel_id: entry.channel_id,
      guild_id: entry.guild_id,
      user_id: entry.user_id,
      content: entry.content,
      timestamp: entry.timestamp,
    }));
  } catch (error) {
    console.error('[ChatGPT][Tools] recent chat lookup failed:', error?.message || error);
    return [];
  }
}

function getUserProfileFromCache(userId) {
  try {
    if (!userId) return null;
    const cache = globalThis.userListCache;
    if (!cache || typeof cache.getById !== 'function') return null;
    const row = cache.getById(userId);
    return row ? safeJson(row) : null;
  } catch (error) {
    console.error('[ChatGPT][Tools] user profile lookup failed:', error?.message || error);
    return null;
  }
}

function normalizeId(value) {
  return value == null ? null : String(value);
}

function findRowByDiscordId(rows, userId) {
  const target = normalizeId(userId);
  if (!target) return null;
  return rows.find((row) => {
    return [row.discord_id, row.discordId, row.user_id, row.userId, row.discordId].some((field) => normalizeId(field) === target);
  }) || null;
}

function getLeaderboardSnapshot(userId) {
  try {
    const cache = globalThis.leaderboardCache;
    if (!cache || typeof cache.getPlayers !== 'function') return null;
    const players = cache.getPlayers() || [];
    const row = findRowByDiscordId(players, userId);
    return row ? safeJson(row) : null;
  } catch (error) {
    console.error('[ChatGPT][Tools] leaderboard lookup failed:', error?.message || error);
    return null;
  }
}

function getPlayerStatsSnapshot(userId) {
  try {
    const stats = globalThis.playerStatsCache?.getAll?.();
    if (!Array.isArray(stats)) return null;
    const target = normalizeId(userId);
    if (!target) return null;
    const row = stats.find((entry) => [entry.discord_id, entry.user_id, entry.discordId].some((field) => normalizeId(field) === target));
    return row ? safeJson(row) : null;
  } catch (error) {
    console.error('[ChatGPT][Tools] player stats lookup failed:', error?.message || error);
    return null;
  }
}

function getStringField(entry, keys) {
  for (const key of keys) {
    if (entry && entry[key]) return String(entry[key]);
  }
  return null;
}

function getNumberField(entry, keys) {
  for (const key of keys) {
    if (entry && entry[key] !== undefined && entry[key] !== null) {
      const num = Number(entry[key]);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

function formatUpdatedAt(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

function projectMarketEntry(entry) {
  const item = getStringField(entry, ITEM_NAME_FIELDS) || 'Unknown item';
  const location = getStringField(entry, LOCATION_FIELDS) || 'Unknown terminal';
  const buyPrice = getNumberField(entry, BUY_PRICE_FIELDS);
  const sellPrice = getNumberField(entry, SELL_PRICE_FIELDS);
  const updatedAtRaw = entry.updated_at || entry.last_updated || entry.timestamp || entry.date_modified || entry.date_added || null;
  return { item, location, buyPrice, sellPrice, updatedAt: formatUpdatedAt(updatedAtRaw) };
}

function sortByValueDesc(a, b) {
  const valueA = (a.sellPrice ?? a.buyPrice ?? 0);
  const valueB = (b.sellPrice ?? b.buyPrice ?? 0);
  return valueB - valueA;
}

function getMarketSnapshotFromCache(query, { limit = 5, requestedQuery = null, isGeneric = false } = {}) {
  try {
    const cache = globalThis.uexCache;
    if (!cache || typeof cache.getRecords !== 'function') return null;
    const priceRecords = cache.getRecords('terminal_prices') || [];
    const fallback = cache.getRecords('commodities') || [];
    const records = priceRecords.length ? priceRecords : fallback;
    if (!records.length) return null;

    const normalizedQuery = (query || '').trim();
    const normalizedQueryLower = normalizedQuery.toLowerCase();
    const shouldFilter = Boolean(normalizedQuery) && !isGeneric;
    const filtered = shouldFilter
      ? records.filter((entry) => {
          const fields = [
            getStringField(entry, ITEM_NAME_FIELDS),
            getStringField(entry, LOCATION_FIELDS),
          ].filter(Boolean).map((value) => value.toLowerCase());
          return fields.some((value) => value.includes(normalizedQueryLower));
        })
      : records;

    const fallbackUsed = shouldFilter && filtered.length === 0;
    const rowsForSampling = fallbackUsed ? records : filtered;
    const projected = rowsForSampling.map(projectMarketEntry).sort(sortByValueDesc);
    const sample = projected.slice(0, limit);

    return {
      query: fallbackUsed ? null : (normalizedQuery || null),
      requestedQuery: requestedQuery || normalizedQuery || null,
      matches: shouldFilter ? filtered.length : rowsForSampling.length,
      totalRecords: records.length,
      fallbackUsed,
      isGenericRequest: Boolean(isGeneric),
      sample,
    };
  } catch (error) {
    console.error('[ChatGPT][Tools] market snapshot lookup failed:', error?.message || error);
    return null;
  }
}

function getHitActivitySummary(limit = 4) {
  try {
    const hits = globalThis.hitCache?.getAll?.();
    if (!Array.isArray(hits) || !hits.length) return [];
    return takeLast(hits, limit).map((entry) => ({
      target: entry.target || entry.pilot || entry.player || 'Unknown target',
      ship: entry.ship || entry.ship_type || null,
      reward: entry.reward || entry.credits || null,
      total_value: entry.total_value ?? entry.totalValue ?? null,
      cargo: entry.cargo || entry.cargo_manifest || null,
      timestamp: entry.created_at || entry.timestamp || entry.updated_at || null,
      status: entry.status || entry.outcome || 'logged',
    }));
  } catch (error) {
    console.error('[ChatGPT][Tools] hit summary lookup failed:', error?.message || error);
    return [];
  }
}

module.exports = {
  getRecentChatForChannel,
  getUserProfileFromCache,
  getLeaderboardSnapshot,
  getPlayerStatsSnapshot,
  getMarketSnapshotFromCache,
  getHitActivitySummary,
};
