# Global Cache Registry

This project maintains several in-memory caches that are exposed through `globalThis` so that scheduled jobs, slash commands, and ad-hoc scripts can reuse already-loaded data. This document summarizes each cache, their backing data sources, hydration routines, and the modules responsible for keeping them in sync.

> **Runtime access:** inside any module, you can read these caches via `globalThis.<cacheName>`. Each accessor exposes helper methods (e.g., `getAll`, `getState`) so you do not need to reach into private module variables directly.

## userListCache
- **Accessor:** `globalThis.userListCache`
- **Source:** `common/userlist-cache.js` (DB snapshot of userlist service)
- **Structure:**
  - `getAll()` returns an array of normalized user rows:
    ```ts
    {
      id: string;
      username: string | null;
      nickname: string | null;
      rank: string | number | null;
      roles: string[];
      raptor_level?: number | null;
      corsair_level?: number | null;
      raider_level?: number | null;
      joined_date?: string | null;
      promote_date?: string | null;
      rsi_handle?: string | null;
      rsi_display_name?: string | null;
      player_org?: string | null;
      fleet?: string | null;
      _raw: OriginalApiRow;
    }
    ```
  - `getState()` exposes `{ users, loadedAt, byId, byUsername, byNickname }`
- **Hydration:**
  - On startup: `refreshUserListCache()` in `index.js`
  - On demand: `globalThis.userListCache.getAll()` returns the latest Map, `getState()` exposes metadata
- **Updates:**
  - `common/refresh-userlist.js` reloads from the API
  - `userlistEvents` emits `USERLIST_CHANGED`, leading to a debounced refresh via `scheduleUserlistCacheRefresh`

## chatMessagesCache
- **Accessor:** `globalThis.chatMessagesCache`
- **Source:** `common/chat-cache.js` (chatMessages API)
- **Structure:**
  - Cache is a `Map<channelId, ChatMessage[]>`
  - Each `ChatMessage` looks like:
    ```ts
    {
      channel_id: string;
      guild_id: string;
      user_id: string;
      content: string; // trimmed text content
      timestamp: string; // ISO string
    }
    ```
  - `getState()` returns the backing `Map`, `getForChannel(id)` clones the array (max 1000 entries)
- **Hydration:**
  - Startup preload via `preloadCachedChatMessages` inside `hydrateChatCache()` in `index.js`
  - Optional fresh-load script (`scripts/fresh-load-chat-messages.js`) when `CHAT_MESSAGES_FRESH_LOAD_ON_START=true`
- **Updates:**
  - `common/message-saver.js` persists new Discord events and calls `addChatMessageToCache`
  - Manual accessors: `getForChannel(channelId)` for per-channel conversations

## uexCache
- **Accessor:** `globalThis.uexCache`
- **Source:** `common/uex-cache.js` (UEX tables via `api/uexApi.js`)
- **Structure:**
  - Backed by a `Map<label, CacheEntry>` where `label` matches dataset IDs (e.g., `terminals`, `items_by_terminal`)
  - `CacheEntry`:
    ```ts
    {
      label: string;
      records: any[];   // flattened `data` arrays from the API payload
      raw: any;         // original payload
      lastUpdated: string; // ISO timestamp
      source: 'database' | 'remote-api' | string;
      info?: string;
    }
    ```
  - `getState()` returns the `Map` so advanced consumers can inspect all entries
- **Hydration:**
  - Startup: `hydrateUexCachesFromDb()` executed in `index.js`
  - Manual hydrate accepts optional label filtering
- **Updates:**
  - `common/process-uex-data.js` calls `refreshUexCache(label, payload)` after each API payload is persisted for `processUEXData("terminal_prices" | "items_by_terminal" | "other_tables")`
- **Datasets:** currently hydrated/maintained labels (keys)
  - `marketplace_averages`
  - `commodities`
  - `terminals`
  - `terminal_prices`
  - `commodities_by_terminal`
  - `item_categories`
  - `items`
  - `items_by_terminal`
  - `cities`
  - `outposts`
  - `planets`
  - `space_stations`
  - `star_systems`
  - `moons`
  - `refineries_yields`
  - (additional labels can be added by `DATASET_LOADERS` in `common/uex-cache.js`)
- **Access Examples:**
  ```js
  // list all labels
  const labels = globalThis.uexCache.labels();

  // get the entire entry (records + metadata) for terminals
  const terminals = globalThis.uexCache.get('terminals');

  // just the flattened rows for terminal prices
  const terminalPrices = globalThis.uexCache.getRecords('terminal_prices');

  // inspect the raw payload for marketplace averages
  const rawMarket = globalThis.uexCache.get('marketplace_averages').raw;
  ```

## playerStatsCache
- **Accessor:** `globalThis.playerStatsCache`
- **Source:** `common/player-stats-cache.js` (materialized player stats view via `api/playerStatsApi.js`)
- **Structure:**
  - `getAll()` → array of player stat rows exactly as returned by `getAllPlayerStats()` (see API schema)
  - `getState()` →
    ```ts
    {
      records: PlayerStatsRow[];
      lastUpdated: string | null;
      source: 'database' | 'view-refresh' | 'fetch-error' | string;
      meta: { source?: string; error?: string } | null;
    }
    ```
  - `refresh()` returns the updated state promise
- **Hydration:**
  - Startup: `hydratePlayerStatsCacheFromDb()` inside `index.js`
- **Updates:**
  - Interval (every 5 minutes): `refreshPlayerStatsCache()` which runs `refreshPlayerStatsView()` then reloads the table
  - Manual: call `globalThis.playerStatsCache.refresh()` to force an update

## leaderboardCache
- **Accessor:** `globalThis.leaderboardCache`
- **Source:** `common/leaderboard-cache.js` (player/org leaderboards via `api/leaderboardSBApi.js`)
- **Structure:**
  - `getPlayers()` / `getOrgs()` return arrays containing the leaderboard API rows (each row has RSI `displayname`, scores, rank, etc.)
  - `getState()` returns:
    ```ts
    {
      players: { records: PlayerLeaderboardRow[]; lastUpdated: string | null; source: string | null; meta: any };
      orgs:    { records: OrgLeaderboardRow[];    lastUpdated: string | null; source: string | null; meta: any };
    }
    ```
- **Hydration:**
  - Startup: `hydrateLeaderboardsFromDb()` in `index.js`
- **Updates:**
  - `functions/process-leaderboards.js` refreshes player/org caches (`setPlayerLeaderboardCache`, `setOrgLeaderboardCache`) after recomputing datasets (runs every 4h)

## hitCache
- **Accessor:** `globalThis.hitCache`
- **Source:** `common/hit-cache.js` (pirate hit tracker entries via `api/hitTrackerApi.js`)
- **Structure:**
  - `getAll()` returns the raw hit tracker records pulled from `getAllHitLogs()` (same shape used by embeds / `HitTrackerModel`)
  - `getState()` exposes:
    ```ts
    {
      records: HitLogRow[];
      lastUpdated: string | null;
      source: 'database' | 'handleHitPost' | 'handleHitPostUpdate' | 'handleHitPostDelete' | string;
      meta: { source?: string; error?: string } | null;
    }
    ```
- **Hydration:**
  - Startup: `hydrateHitCacheFromDb()` in `index.js`
- **Updates:**
  - `functions/post-new-hit.js`
    - `handleHitPost` and `handleHitPostUpdate` call `upsertHitInCache`
    - `handleHitPostDelete` invokes `removeHitFromCache`
  - Other modules may call `upsertHitInCache` if they mutate hit records

  ## userProfilesCache
  - **Accessor:** `globalThis.userProfilesCache`
  - **Source:** `common/user-profiles-cache.js` (wraps `UserProfilesModel` / `/api/userprofiles`)
  - **Structure:**
    - `getById(userId)` returns the saved persona row `{ user_id, nickname, tease_level, style_preferences, stats_json, created_at, updated_at }`
    - `getState()` exposes `{ count, lastUpdated, meta }`
    - `refresh()` re-pulls all rows from the API; `upsertLocal(profile)` lets the memory processor update the cache immediately after a write
    - `stats_json.persona_details` holds bio fields like profession, known_for, favorite_topics, notable_quotes, achievements, relationship_notes, etc.
  - **Hydration:**
    - Startup: `refreshUserProfilesCache()` runs inside `index.js`
    - Interval: refresh repeats every `USER_PROFILES_REFRESH_INTERVAL_MS` (default 30 minutes)
  - **Usage:**
    - `chatgpt/context/builder.js` prefers this cache for persona prompts
    - `chatgpt/memory/batch-processor.js` writes adjustments (nickname, tease level, style prefs) and feeds them back into the cache via `upsertLocal`

## Access Patterns & Diagnostics
- Each cache exposes a `getState()` method returning `{ records, lastUpdated, source, meta }` for quick health checks.
- When API calls fail, caches log `[...Cache]` errors and typically fall back to empty arrays with `source` describing the failure (e.g., `database-error`).
- To inspect data interactively, attach a Node REPL to the running bot and run commands like:
  ```js
  globalThis.uexCache.get('terminals')
  globalThis.playerStatsCache.getState()
  globalThis.hitCache.getAll().length
  ```

## Related Files
- `index.js` — bootstraps and exposes all global caches, schedules refresh intervals
- `common/*-cache.js` — cache-specific helpers described above
- `common/process-uex-data.js`, `scripts/fresh-load-chat-messages.js`, `functions/post-new-hit.js`, etc. — modules that keep caches current while executing their primary responsibilities
