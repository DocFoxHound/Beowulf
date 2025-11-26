const { Client, GatewayIntentBits, Events, ChannelType, Partials } = require("discord.js");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { preloadFromDb } = require("./common/preload-from-db.js");
// const queueReminderCheck = require("./queue-functions/queue-controller.js").queueReminderCheck
const { processUEXData } = require("./common/process-uex-data.js")
const {
  hydrateUexCachesFromDb,
  getUexCache,
  getUexCacheRecords,
  getUexCacheState,
  getUexCacheLabels,
  primeUexCacheFromSnapshot,
} = require('./common/uex-cache.js');
const {
  hydratePlayerStatsCacheFromDb,
  refreshPlayerStatsCache,
  getPlayerStatsCache,
  getPlayerStatsCacheState,
} = require('./common/player-stats-cache.js');
const {
  hydrateLeaderboardsFromDb,
  getPlayerLeaderboardCache,
  getOrgLeaderboardCache,
  getLeaderboardCacheState,
} = require('./common/leaderboard-cache.js');
const {
  hydrateHitCacheFromDb,
  getHitCache,
  getHitCacheState,
} = require('./common/hit-cache.js');
const { createUser } = require('./api/userlistApi.js');
const { getUserById } = require('./api/userlistApi.js');
const { editUser } = require('./api/userlistApi.js');
const { getUserRank } = require('./userlist-functions/userlist-controller.js')
const { refreshUserlist } = require("./common/refresh-userlist.js");
const {
  refreshUserListCache,
  getUserListCache,
  getUserListMeta,
  getUserFromCacheById,
  getUserFromCacheByName,
  getUserListCacheState,
} = require('./common/userlist-cache.js');
const { saveMessage, buildContentFromMessage } = require("./common/message-saver.js");
const { freshLoadChatMessages } = require("./scripts/fresh-load-chat-messages.js");
const {
  addChatMessageToCache,
  preloadCachedChatMessages,
  getCachedMessagesForChannel,
  getChatCacheState,
} = require("./common/chat-cache.js");
const { loadChatlogs } = require("./vector-handling/vector-handler.js");
const { trimChatLogs } = require("./vector-handling/vector-handler.js");
const { main: ingestChatBatch, ingestChatMessage } = require('./vector-handling/chat-ingest.js');
const { ingestDailyChatSummaries, ingestHitLogs, ingestPlayerStats } = require('./vector-handling/extra-ingest.js');
const { checkRecentGatherings } = require("./common/recent-gatherings.js");
const bodyParser = require('body-parser');
const { handleHitPost } = require('./functions/post-new-hit.js');
const { handleHitPostDelete } = require('./functions/post-delete-hit.js');
const { handleFleetLogPost } = require('./functions/post-new-fleet-log.js');
const { handleFleetCreatePost } = require('./functions/post-new-fleet-create.js');
const { handleScheduleCreate } = require('./functions/create-new-schedule.js');
const { handleScheduleUpdate } = require('./functions/update-schedule.js');
const { updateSchedule } = require('./api/scheduleApi.js');
const { manageEvents } = require('./common/event-management.js');
const { handleFleetCommanderChange } = require('./functions/fleet-commander-change.js');
const { handleFleetMemberChange } = require('./functions/fleet-member-change.js');
const { processPlayerLeaderboards } = require('./functions/process-leaderboards.js');
const { voiceChannelSessions } = require("./common/voice-channel-sessions.js");
const { repairVoiceSessionsWithNullMinutes } = require("./common/voice-session-repair.js");
const { automatedAwards } = require("./common/automated-awards.js");
const { promotePlayerNotify } = require('./common/promote-player-notify.js');
const { notifyForAward } = require('./common/bot-notify.js');
const { grantPrestigeNotify } = require("./common/grant-prestige-notify.js");
const { getPrestigeRanks } = require("./userlist-functions/userlist-controller.js");
const { processLeaderboardLogs } = require('./functions/process-leaderboard-logs.js');
const { processOrgLeaderboards } = require('./functions/process-leaderboards.js');
const { verifyUser } = require('./functions/verify-user.js');
const { handleNewGuildMember } = require('./common/new-user.js');
const { userlistEvents, USERLIST_CHANGED } = require('./common/userlist-events.js');
const { handleSimpleWelcomeProspect, handleSimpleWelcomeGuest, handleSimpleJoin } = require("./common/inprocessing-verify-handle.js");
const { removeProspectFromFriendlies } = require('./common/remove-prospect-from-friendly.js');
const { syncSkillLevelsFromGuild, updateSkillOnMemberChange } = require('./common/skill-level-assigner.js');
const { makeMember, updateMemberOnMemberChange } = require('./common/make-member.js');
const { handleChatGptInteraction } = require('./chatgpt/orchestrator');
const { handleSlashCommand } = require('./commands');
const { startMemoryBatchWorker, trackLiveMessageForMemories } = require('./chatgpt/memory/batch-runner');
const {
  refreshUserProfilesCache,
  getUserProfilesCacheState,
  getUserProfileFromCache: getPersonaProfileFromCache,
  upsertUserProfileInCache,
} = require('./common/user-profiles-cache.js');


// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = ".env";
if (args.length === 1) {
  envFile = `${args[0]}`;
}
dotenv.config({
  path: envFile,
});

const AUTO_FIX_COMMODITIES = (process.env.UEX_AUTO_FIX_COMMODITIES || 'true').toLowerCase() === 'true';
const MIN_COMMODITY_ROWS = Number(process.env.UEX_MIN_COMMODITY_ROWS || 25);
let commoditiesAutoRefreshPromise = null;
const SHOULD_SAVE_MESSAGES = (process.env.SAVE_MESSAGES || 'false').toLowerCase() === 'true';
const USER_PROFILES_REFRESH_INTERVAL_MS = (() => {
  const raw = Number(process.env.USER_PROFILES_REFRESH_INTERVAL_MS || 1800000);
  if (!Number.isFinite(raw)) return 1800000;
  if (raw <= 0) return 0; // allow disabling via 0 or negative values
  return Math.max(300000, raw); // enforce a 5-minute minimum when enabled
})();

// Coalesce DB-driven userlist changes into a debounced cache refresh
let _userlistCacheTimer = null;
function scheduleUserlistCacheRefresh(delayMs = 1500) {
  try { if (_userlistCacheTimer) clearTimeout(_userlistCacheTimer); } catch {}
  _userlistCacheTimer = setTimeout(async () => {
    try { await refreshUserListCache(); } catch (e) { console.error('[UserlistEvents] cache refresh failed:', e?.message || e); }
  }, delayMs);
}
try { userlistEvents.on(USERLIST_CHANGED, () => scheduleUserlistCacheRefresh(1500)); } catch {}

async function shouldEngageChatGpt(message, client) {
  if (!message || !client) return false;
  if (!message.guild) return false;
  const botId = client.user?.id;
  if (!botId) return false;
  if (message.author?.id === botId) return false;
  const mentioned = message.mentions?.users?.has(botId);
  if (mentioned) return true;
  const repliedUserId = message.mentions?.repliedUser?.id;
  if (repliedUserId && repliedUserId === botId) return true;
  if (message.reference?.messageId && message.channel?.messages?.fetch) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      if (referenced?.author?.id === botId) return true;
    } catch (_) {}
  }
  return false;
}

async function ensureCommoditiesDatasetHealthy(reason = 'startup') {
  if (!AUTO_FIX_COMMODITIES) return;
  if (commoditiesAutoRefreshPromise) return commoditiesAutoRefreshPromise;
  const commoditiesEntry = getUexCache('commodities');
  const currentCount = Array.isArray(commoditiesEntry?.records) ? commoditiesEntry.records.length : 0;
  if (currentCount >= MIN_COMMODITY_ROWS) return;
  console.warn(`[UEX] Commodities dataset thin (${currentCount} records). Triggering refresh (reason=${reason}).`);
  commoditiesAutoRefreshPromise = (async () => {
    await processUEXData('commodities');
    await hydrateUexCachesFromDb({ labels: ['commodities', 'summarizedcommodities'] });
    console.log('[UEX] Commodities dataset refreshed via processUEXData("commodities").');
  })()
    .catch((e) => {
      console.error('[UEX] Commodities auto-refresh failed:', e?.message || e);
    })
    .finally(() => {
      commoditiesAutoRefreshPromise = null;
    });
  return commoditiesAutoRefreshPromise;
}

// Single-instance guard: prevent running multiple bot processes on the same machine
(() => {
  try {
    if ((process.env.BOT_SINGLE_INSTANCE || 'true') !== 'true') return; // allow override
    const lockName = `beowulf-bot-${process.env.LIVE_ENVIRONMENT === 'true' ? 'live' : 'test'}.lock`;
    const lockPath = path.join(os.tmpdir(), lockName);
    const acquire = () => {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeFileSync(fd, String(process.pid));
        fs.closeSync(fd);
        return true;
      } catch (e) {
        // If lock exists, check if the PID is still alive; if not, reclaim.
        try {
          const pidTxt = fs.readFileSync(lockPath, 'utf8').trim();
          const otherPid = Number(pidTxt);
          if (otherPid && otherPid !== process.pid) {
            try {
              process.kill(otherPid, 0); // throws if not running
              console.error(`[single-instance] Another bot instance detected (pid=${otherPid}). Exiting.`);
              process.exit(1);
            } catch {
              // stale lock; remove and retry
              fs.unlinkSync(lockPath);
              return acquire();
            }
          }
        } catch {
          // Could not read; best effort: remove and retry
          try { fs.unlinkSync(lockPath); } catch {}
          return acquire();
        }
      }
    };
    if (!acquire()) {
      console.error('[single-instance] Could not acquire lock. Exiting.');
      process.exit(1);
    }
    const cleanup = () => { try { fs.unlinkSync(lockPath); } catch {} };
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(130); });
    process.on('SIGTERM', () => { cleanup(); process.exit(143); });
    process.on('uncaughtException', (err) => { console.error(err); cleanup(); process.exit(1); });
  } catch (e) {
    console.error('[single-instance] Lock setup error:', e?.message || e);
  }
})();

// Setup OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create a new discord client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.DirectMessages, // Added intent for DMs
  ],
  // Enable partials so we can handle uncached thread/channel/message events
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

// Set channels
channelIds = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CHANNELS.split(",") : process.env.TEST_CHANNELS.split(",");
// Ensure HITTRACK forum channel is included in allowed parent list
try {
  const hitForumId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.HITTRACK_CHANNEL_ID : process.env.TEST_HITTRACK_CHANNEL_ID;
  if (hitForumId && !channelIds.includes(hitForumId)) channelIds.push(hitForumId);
} catch {}
channelIdAndName = [];

const clientToken = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CLIENT_TOKEN : process.env.TEST_CLIENT_TOKEN;
const VOICE_SESSION_REPAIR_ON_START = false

//json things to hold in memory
let preloadedDbTables;

//array of threads (one made per user)
// threadArray = [{channelId: "", threadId: "", isActive: Boolean, isRetrying: Boolean}];

//list of messages we need to add, queued
const messageAddQueue = [];

//array of stored messages to be processed
messageArray = [];

//used to store cache'd users, periodically refreshed
userCache = new Map();

//populate the messageArray as an array of messages grouped by the ChannelId as a key
channelIds.forEach((channel) => {
  messageArray.push({
    channelId: channel,
    conversation: [],
  });
});

function getActiveGuildId() {
  return process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
}

const shouldFreshLoadChatMessages = (process.env.CHAT_MESSAGES_FRESH_LOAD_ON_START || 'false').toLowerCase() === 'true';

const userListCacheAccessor = {
  getAll: () => getUserListCache(),
  getMeta: () => getUserListMeta(),
  getById: (id) => getUserFromCacheById(id),
  getByName: (name) => getUserFromCacheByName(name),
  getState: () => getUserListCacheState(),
};

const chatMessagesCacheAccessor = {
  getChannelIds: () => Array.from(getChatCacheState().keys()),
  getState: () => getChatCacheState(),
  getForChannel: (channelId) => getCachedMessagesForChannel(channelId),
};

const uexCacheAccessor = {
  labels: () => getUexCacheLabels(),
  get: (label) => getUexCache(label),
  getRecords: (label) => getUexCacheRecords(label),
  getState: () => getUexCacheState(),
};

const playerStatsCacheAccessor = {
  getAll: () => getPlayerStatsCache(),
  getState: () => getPlayerStatsCacheState(),
  refresh: () => refreshPlayerStatsCache(),
};

const leaderboardCacheAccessor = {
  getPlayers: () => getPlayerLeaderboardCache(),
  getOrgs: () => getOrgLeaderboardCache(),
  getState: () => getLeaderboardCacheState(),
};

const hitCacheAccessor = {
  getAll: () => getHitCache(),
  getState: () => getHitCacheState(),
};

const userProfilesCacheAccessor = {
  getById: (id) => getPersonaProfileFromCache(id),
  getState: () => getUserProfilesCacheState(),
  refresh: () => refreshUserProfilesCache(),
  upsertLocal: (profile) => upsertUserProfileInCache(profile),
};

globalThis.userListCache = userListCacheAccessor;
globalThis.chatMessagesCache = chatMessagesCacheAccessor;
globalThis.uexCache = uexCacheAccessor;
globalThis.playerStatsCache = playerStatsCacheAccessor;
globalThis.leaderboardCache = leaderboardCacheAccessor;
globalThis.hitCache = hitCacheAccessor;
globalThis.userProfilesCache = userProfilesCacheAccessor;

async function hydrateChatCache() {
  const guildId = getActiveGuildId();
  if (!guildId) {
    console.warn('[ChatCache] Missing guild id; skipping preload.');
    return;
  }
  await preloadCachedChatMessages({ channelIds, guildId });
}

//Event Listener: login
client.on("ready", async () => {
  //fetch channels on a promise, reducing startup time
  const channelFetchPromises = channelIds.map(id => client.channels.fetch(id).catch(e => console.error(`Failed to fetch channel: ${id}`, e)));
  const channels = await Promise.all(channelFetchPromises);
  if (shouldFreshLoadChatMessages) {
    try {
      await freshLoadChatMessages({
        skipEnvLoad: true,
        configs: [{
          label: process.env.LIVE_ENVIRONMENT === "true" ? 'live' : 'test',
          guildId: getActiveGuildId(),
          channels: channelIds,
          client,
        }],
      });
    } catch (e) {
      console.error('[ChatCache] Fresh load run failed:', e?.message || e);
    }
  }
  try { await hydrateChatCache(); } catch (e) { console.error('[ChatCache] Preload failed:', e?.message || e); }
  try { await refreshUserProfilesCache(); } catch (e) { console.error('[UserProfilesCache] Preload failed:', e?.message || e); }
  try {
    startMemoryBatchWorker({ channelIds, openai });
  } catch (e) {
    console.error('[MemoryBatcher] Startup failed:', e?.message || e);
  }
  //preload some channelIDs and Names
  channelIdAndName = channels.map(channel => ({
    channelName: channel?.name,
    channelId: channel?.id
  })).filter(channel => channel.channelId);
  console.log(`Logged in as ${client.user.tag}!`);

  // Auto-join active threads under our allowed forum channels so we receive message events inside them
  try {
    const forumChannels = channels.filter(ch => ch && ch.type === ChannelType.GuildForum);
    for (const forum of forumChannels) {
      try {
        const active = await forum.threads.fetchActive();
        for (const [id, thread] of active.threads) {
          if (!thread.joined && thread.joinable) {
            await thread.join().catch(() => {});
          }
        }
      } catch (e) {
        console.error(`[Threads] Failed to fetch/join active threads for forum ${forum?.id}:`, e?.message || e);
      }
    }
  } catch (e) {
    console.error('[Threads] Startup auto-join failed:', e?.message || e);
  }


  preloadedDbTables = await preloadFromDb(); //leave on
  try {
    const primed = primeUexCacheFromSnapshot(preloadedDbTables, { source: 'database-preload', info: 'preloadFromDb' });
    if (primed) {
      console.log(`[UEXCache] Primed ${primed} datasets from preloaded DB tables.`);
    } else {
      console.warn('[UEXCache] Preloaded DB tables were empty; skipping cache prime.');
    }
  } catch (e) {
    console.error('[UEXCache] Failed to prime cache from preloaded tables:', e?.message || e);
  }
  await refreshUserlist(client, openai) //actually leave this here
  try { await refreshUserListCache(); } catch (e) { console.error('[Startup] userlist cache refresh failed:', e?.message || e); }
  try {
    await hydrateUexCachesFromDb();
    console.log('[UEXCache] Hydrated from database tables.');
  } catch (e) {
    console.error('[Startup] uex cache hydrate failed:', e?.message || e);
  }
  await ensureCommoditiesDatasetHealthy('startup-hydrate');
  try { await hydratePlayerStatsCacheFromDb(); } catch (e) { console.error('[Startup] player stats cache hydrate failed:', e?.message || e); }
  try { await hydrateLeaderboardsFromDb(); } catch (e) { console.error('[Startup] leaderboard cache hydrate failed:', e?.message || e); }
  try { await hydrateHitCacheFromDb(); } catch (e) { console.error('[Startup] hit cache hydrate failed:', e?.message || e); }

  // Sequential UEX refresh + cache warmup
  const DAY_MS = 86400000;
  let uexRefreshInProgress = false;
  const runUEXRefreshSequence = async () => {
    if (uexRefreshInProgress) {
      console.warn('UEX refresh already running; skipping this cycle.');
      return;
    }
    uexRefreshInProgress = true;
    try {
      // Ensure these run sequentially
      await processUEXData("terminal_prices");
      await processUEXData("items_by_terminal");
      await processUEXData("other_tables");
      console.log('[UEX] Refresh completed (chatgpt cache warm disabled).');
    } catch (e) {
      console.error('[UEX] Refresh sequence failed:', e);
    } finally {
      uexRefreshInProgress = false;
    }
  };
  // Run once at startup, then on a fixed interval
  // If enabled via env, perform a full fresh UEX load at startup (tables are cleared per category before insert)
  const FRESH_UEX_ON_START = (process.env.UEX_FRESH_LOAD_ON_START || 'false').toLowerCase() === 'true';
  if (FRESH_UEX_ON_START) {
    console.log('[UEX] Fresh load on start enabled. Running UEX refresh sequence now…');
    await runUEXRefreshSequence();
  } else {
    console.log('[Cache] Skipping legacy chatgpt cache warmup.');
  }
  // Indicate bot is fully ready only after caches are primed
  console.log("Ready")
  // After startup preloads: batch-ingest chat logs into knowledge vectors, then prune
  // Optional: batch-ingest historical chat logs into knowledge vectors at startup
  if ((process.env.KNOWLEDGE_INGEST_ENABLE || 'false').toLowerCase() === 'true' && (process.env.CHAT_VECTOR_INGEST_ON_START || 'false').toLowerCase() === 'true') {
    (async () => {
      try {
        console.log('[ChatIngest] Starting initial chat vector ingest…');
        await ingestChatBatch();
        console.log('[ChatIngest] Initial chat vector ingest complete.');
      } catch (e) {
        console.error('[ChatIngest] Initial ingest failed:', e?.message || e);
      }
    })();
  }
  setInterval(runUEXRefreshSequence, DAY_MS); // every 24 hours
  setInterval(async () => {
    try {
      preloadedDbTables = await preloadFromDb();
      const primed = primeUexCacheFromSnapshot(preloadedDbTables, { source: 'database-preload', info: 'preloadFromDb:interval' });
      if (primed) {
        console.log(`[UEXCache] Interval prime refreshed ${primed} datasets.`);
      }
    } catch (e) {
      console.error('[UEXCache] Interval preload failed:', e?.message || e);
    }
    await ensureCommoditiesDatasetHealthy('interval-prime');
  },
    21600000 //every 6 hours
  );
  setInterval(async () => {
    try { await refreshUserlist(client, openai); } catch (e) { console.error('[Interval] refreshUserlist failed:', e?.message || e); }
    try { await refreshUserListCache(); } catch (e) { console.error('[Interval] refreshUserListCache failed:', e?.message || e); }
  },
    43201000 //every 12 hours and 1 second
  );
  // setInterval(() => loadChatlogs(client, openai),
  //   60000 // every 1 minutes
  // );
    setInterval(() => voiceChannelSessions(client, openai),
    60000 //every 1 minute
  );
  //   setInterval(() => manageRecentFleets(client, openai),
  //   60000 //every 1 minute
  //   // 300000 //every 5 minutes
  // );
  // setInterval(() => trimChatLogs(),
  //   43200000 //every 12 hours
  // );
  setInterval(async () => {
    try { await refreshPlayerStatsCache(); } catch (e) { console.error('[Interval] player stats cache refresh failed:', e?.message || e); }
  },
    300000 // every 5 minutes
  );
  setInterval(async () => {
    try { await processPlayerLeaderboards(client, openai); } catch (e) { console.error('[Interval] processPlayerLeaderboards failed:', e?.message || e); }
  },
    14400000 //every 4 hours
  );
  setInterval(() => automatedAwards(client, openai),
    // 60000 //every 1 minute
    3600000 //every 1 hour
  );
  if (USER_PROFILES_REFRESH_INTERVAL_MS > 0) {
    setInterval(async () => {
      try {
        await refreshUserProfilesCache();
      } catch (e) {
        console.error('[UserProfilesCache] Interval refresh failed:', e?.message || e);
      }
    }, USER_PROFILES_REFRESH_INTERVAL_MS);
  }
  // Ingest daily chat summaries into knowledge base (every 6 hours)
  // Combined sequential ingest cycle (every 6 hours): chat summaries then hit logs
  const SIX_HOURS = 21600000;
  // setInterval(async () => {
  //   try {
  //     await ingestDailyChatSummaries(client, openai);
  //     await ingestHitLogs(client, openai);
  //   } catch (e) {
  //     console.error('Chat/Hit ingest cycle failed:', e);
  //   }
  // }, SIX_HOURS);
  // // Ingest player stats into knowledge base (every 6 hours)
  // setInterval(() => ingestPlayerStats(client),
  //   3600000 //every 1 hour  
  //   // 21600000 // every 6 hours
  // );
}),

client.on("messageCreate", async (message) => {
  // Listen for DMs for verification
  // if (message.channel.type === ChannelType.DM) {
  //   const dbUser = await getUserById(message.author.id);
  //   const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
  //   if(dbUser.roles && dbUser.roles.includes(newUserRole)){
  //     await handleDMVerificationResponse(message, client, openai, dbUser);
  //   }
  //   return;
  // }
  // Allow messages in: (a) our configured top-level channels OR (b) threads whose parent is one of those channels
  if (!message.guild || message.system) return;
  if (message.author?.id && client.user?.id && message.author.id === client.user.id) return;
  let inAllowedChannel = channelIds.includes(message.channelId);
  const channel = message.channel;
  const isThread = typeof channel?.isThread === 'function' ? channel.isThread() : (channel?.type === 11 || channel?.type === 12);
  if (!inAllowedChannel && isThread) {
    const parentId = channel?.parentId || channel?.parent?.id;
    inAllowedChannel = parentId ? channelIds.includes(parentId) : false;
    // Best effort: join the thread so we continue to receive events
    if (inAllowedChannel) {
      try {
        if (channel.joinable && !channel.joined) await channel.join();
      } catch {}
    }
  }
  if (!inAllowedChannel) return;
  // Optionally persist messages to the backend for retrieval scoring
  const authorLabel = message.member?.displayName || message.author?.username || 'user';
  const channelName = message.channel?.name || message.channel?.parent?.name || 'unknown-channel';
  let cachedRecord = null;
  if (SHOULD_SAVE_MESSAGES) {
    try {
      cachedRecord = await saveMessage(message);
    } catch (e) {
      console.error('[ChatCache] Failed to save message:', e?.message || e);
    }
  }
  if (!cachedRecord) {
    const fallbackContent = buildContentFromMessage(message);
    cachedRecord = fallbackContent ? {
      guild_id: message.guildId || message.guild?.id,
      channel_id: message.channelId,
      user_id: message.author?.id,
      username: authorLabel,
      channel_name: channelName,
      message_id: message.id,
      content: fallbackContent,
      timestamp: message.createdAt?.toISOString?.() || new Date().toISOString(),
    } : null;
  }
  if (cachedRecord) {
    cachedRecord.channel_name = cachedRecord.channel_name || channelName;
    cachedRecord.username = cachedRecord.username || authorLabel;
    cachedRecord.message_id = cachedRecord.message_id || cachedRecord.id || message.id;
    addChatMessageToCache(cachedRecord, { fallbackChannelId: message.channelId, fallbackGuildId: message.guildId });
    trackLiveMessageForMemories(cachedRecord, { fallbackChannelId: message.channelId, fallbackGuildId: message.guildId });
  }

  // Ingest each new message into knowledge vectors (advice/opinion grounding)
  if ((process.env.KNOWLEDGE_INGEST_ENABLE || 'false').toLowerCase() === 'true' && (process.env.CHAT_VECTOR_INGEST_LIVE || 'false').toLowerCase() === 'true') {
    try {
      const payload = {
        id: message.id,
        content: message.content,
        username: message.author?.username,
        channel_name: message.channel?.name,
        timestamp: message.createdAt,
      };
      // Non-blocking: do not await, but catch errors
      Promise.resolve(ingestChatMessage(payload)).catch((e) => console.error('[ChatIngest] live ingest error:', e?.message || e));
    } catch (e) {
      console.error('[ChatIngest] failed to schedule live ingest:', e?.message || e);
    }
  }

  if (await shouldEngageChatGpt(message, client)) {
    await handleChatGptInteraction({ message, client, openai });
  }

});

// Auto-join new threads created under our allowed forum channels
client.on(Events.ThreadCreate, async (thread) => {
  try {
    const parentId = thread?.parentId || thread?.parent?.id;
    if (parentId && channelIds.includes(parentId)) {
      if (thread.joinable && !thread.joined) await thread.join();
    }
  } catch (e) {
    console.error('[Threads] Failed to join new thread:', e?.message || e);
  }
});


// Event Listener: new member joins the server
client.on('guildMemberAdd', async (member) => {
  handleNewGuildMember(member, client, openai)
  try { await refreshUserListCache(); } catch (e) { console.error('[GuildMemberAdd] userlist cache refresh failed:', e?.message || e); }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    // Adjust SKILL_LEVEL_* role when RAPTOR/RAIDER prestige roles change
    try { await updateSkillOnMemberChange(oldMember, newMember); } catch (e) { console.error('[SkillRoles] live update failed:', e?.message || e); }
    // Ensure MEMBER role is aligned with CREW/MARAUDER/BLOODED changes
    try { await updateMemberOnMemberChange(oldMember, newMember); } catch (e) { console.error('[MemberRole] live update failed:', e?.message || e); }
    // Compute role changes first (independent of DB state)
    const memberRoles = newMember.roles.cache.map(role => role.id);
    const prospectRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.PROSPECT_ROLE : process.env.TEST_PROSPECT_ROLE;
    const friendlyRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_ROLE : process.env.TEST_FRIENDLY_ROLE;
    const verifiedRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.VERIFIED_ROLE : process.env.TEST_VERIFIED_ROLE;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const oldRoles = oldMember.roles.cache.map(role => role.id);

    // Trigger welcomes when the role is newly gained (do not require NEW_USER_ROLE)
    if (!oldRoles.includes(prospectRole) && memberRoles.includes(prospectRole)) {
      try { await handleSimpleWelcomeProspect(newMember, client, openai); } catch (e) { console.error('[WelcomeProspect] failed:', e?.message || e); }
    }
    if (!oldRoles.includes(friendlyRole) && memberRoles.includes(friendlyRole)) {
      try { await handleSimpleWelcomeGuest(newMember, client, openai); } catch (e) { console.error('[WelcomeGuest] failed:', e?.message || e); }
    }

    // ...existing code...
    // Fetch the user's existing data for DB updates (welcomes already handled above)
    const user = await getUserById(newMember.user.id) || null;
    if (!user) {
      console.log("Member update had no user identified; skipping DB update.");
      return;
    }

    // Get the member's rank and prestige levels
    const userRank = await getUserRank(memberRoles);

    // Fetch prestige roles for level calculation
    const prestigeRanks = await getPrestigeRanks(memberRoles);

    // Initialize the updatedUser object
    const updatedUser = {
      id: user.id,
      username: newMember.user.username,
      nickname: newMember.nickname,
      rank: userRank,
      roles: memberRoles,
      raptor_level: prestigeRanks.raptor_level,
      corsair_level: prestigeRanks.corsair_level,
      raider_level: prestigeRanks.raider_level,
    };

    // If member gained one of the promotion roles, update promote_date to now (UTC ISO)
    try {
      const isLive = process.env.LIVE_ENVIRONMENT === "true";
      const watchedRoleIds = [
        isLive ? process.env.PROSPECT_ROLE : process.env.TEST_PROSPECT_ROLE,
        isLive ? process.env.CREW_ROLE : process.env.TEST_CREW_ROLE,
        isLive ? process.env.MARAUDER_ROLE : process.env.TEST_MARAUDER_ROLE,
        isLive ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE,
      ].filter(Boolean);
      const oldRoleIds = new Set(oldMember.roles.cache.map(r => r.id));
      const gainedPromotion = watchedRoleIds.some(rid => !oldRoleIds.has(rid) && memberRoles.includes(rid));
      if (gainedPromotion) {
        updatedUser.promote_date = new Date().toISOString(); // Postgres timestamptz-compatible
      }
    } catch (e) {
      console.error('[PromoteDate] detection failed:', e?.message || e);
    }

    // ...existing code...
    // Update the user's data in the database
    await editUser(user.id, updatedUser);
    // Refresh cached userlist after individual update
    try { await refreshUserListCache(); } catch (e) { console.error('[GuildMemberUpdate] userlist cache refresh failed:', e?.message || e); }
  } catch (error) {
    console.error("Error updating user:", error);
  }
});

// Keep cache in sync when members leave the guild
client.on('guildMemberRemove', async (member) => {
  try { await refreshUserListCache(); } catch (e) { console.error('[GuildMemberRemove] userlist cache refresh failed:', e?.message || e); }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    try {
      const handled = await handleSlashCommand(interaction, { client, openai });
      if (!handled && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'This command is not supported yet.', ephemeral: true });
      }
    } catch (err) {
      console.error(`[SlashCommand] ${interaction.commandName || interaction.commandId} failed:`, err?.message || err);
      const errorMessage = 'Something went wrong while running that command.';
      if (interaction.deferred || interaction.replied) {
        try {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } catch {}
      } else {
        try {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        } catch {}
      }
    }
    return;
  }

  if (!interaction.isButton()) return;

  // Only allow in specific event channels for RSVP buttons
  const allowedChannels = [
    process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_PUBLIC_CHANNEL : process.env.TEST_EVENTS_PUBLIC_CHANNEL,
    process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_PROSPECT_CHANNEL : process.env.TEST_EVENTS_PROSPECT_CHANNEL,
    process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_CREW_CHANNEL : process.env.TEST_EVENTS_CREW_CHANNEL,
    process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_MARAUDER_CHANNEL : process.env.TEST_EVENTS_MARAUDER_CHANNEL,
  ];
  if (!allowedChannels.includes(interaction.channelId)) return;
  // Parse customId in the format: type_scheduleId_buttonId_optName (e.g., rsvp_5267609524_11758094_Yes)
  const match = interaction.customId.match(/^([^_]+)_([^_]+)_(.+)$/);
  if (!match) return;

  const scheduleId = match[2];
  const optName = match[3];
  const userId = interaction.user.id;

  // Fetch the schedule
  let schedule;
  try {
    schedule = await require('./api/scheduleApi').getScheduleById(scheduleId);
  } catch (e) {
    await interaction.reply({ content: 'Could not fetch event.', ephemeral: true });
    return;
  }
  if (!schedule) {
    await interaction.reply({ content: 'Event not found.', ephemeral: true });
    return;
  }

  // Call handleScheduleUpdate to update the embed/message and DB
  try {
    await require('./functions/update-schedule.js').handleScheduleUpdate(
      client,
      openai,
      schedule,
      userId,
      optName
    );
    await interaction.reply({ content: `You have RSVP'd as "${optName}".`, ephemeral: true });
  } catch (err) {
    console.error('Failed to update RSVP:', err);
    await interaction.reply({ content: 'Failed to update RSVP.', ephemeral: true });
  }
});

// Error handling to prevent crashes
client.on("error", (e) => {
  console.error("Discord client error!", e);
});

// Attempt to auto-reconnect on disconnection
client.on("disconnect", () => {
  console.log("Disconnected! Trying to reconnect...");
  client.login(clientToken);
});

// Run voice session repairs before logging the bot in
(async () => {
  try {
    const guildId = getActiveGuildId();
    if (!VOICE_SESSION_REPAIR_ON_START) {
      console.info('[VoiceSessionRepair] Startup repair disabled via VOICE_SESSION_REPAIR_ON_START=false.');
    } else if (guildId) {
      await repairVoiceSessionsWithNullMinutes(guildId);
    } else {
      console.warn('[VoiceSessionRepair] Skipping startup repair; missing guild id.');
    }
  } catch (error) {
    console.error('[VoiceSessionRepair] Startup repair failed:', error?.message || error);
  } finally {
    client.login(clientToken);
  }
})();

const express = require('express');
const app = express();
app.use(bodyParser.json());
app.use(express.json());
// Expose /hittrack endpoint for API to POST new HitTrack objects
app.post('/hittrackcreate', async (req, res) => {
  try {
    const hitTrack = req.body;
    // You can add validation here if needed
    await handleHitPost(client, openai, hitTrack);

    res.status(200).json({ message: 'HitTrack received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /hittrack:', error);
    res.status(500).json({ error: 'Failed to process HitTrack.' });
  }
});

// Expose /hittrack endpoint for API to POST new HitTrack objects
app.post('/hittrackdelete', async (req, res) => {
  try {
    const payload = req.body || {};
    const hit = payload.hit || payload;
    // Propagate deleter identity when present (e.g., API caller or service)
    const meta = {
      deleted_by: payload.deleted_by || payload.user_id || null,
      deleted_by_username: payload.deleted_by_username || payload.username || null,
      deleted_by_nickname: payload.deleted_by_nickname || payload.nickname || null,
    };
    await handleHitPostDelete(client, openai, { ...hit, ...meta });
    res.status(200).json({ message: 'HitTrackdelete processed.' });
  } catch (error) {
    console.error('Error handling /hittrackdelete:', error);
    res.status(500).json({ error: 'Failed to process HitTrackdelete.' });
  }
});

// Expose /fleetlog endpoint for API to POST new ShipLog objects
app.post('/fleetlog', async (req, res) => {
  try {
    const shipLog = req.body;
    // You can add validation here if needed
    await handleFleetLogPost(client, openai, shipLog);

    res.status(200).json({ message: 'FleetLog received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetlog:', error);
    res.status(500).json({ error: 'Failed to process FleetLog.' });
  }
});

// Expose /fleetcreated endpoint for API to POST new Fleet objects
app.post('/fleetcreated', async (req, res) => {
  try {
    const fleet = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleFleetCreatePost(client, openai, fleet);

    res.status(200).json({ message: 'Fleet creation received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetcreated:', error);
    res.status(500).json({ error: 'Failed to process fleet creation.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/createschedule', async (req, res) => {
  try {
    const schedule = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleScheduleCreate(client, openai, schedule);

    res.status(200).json({ message: 'Schedule creation received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /createschedule:', error);
    res.status(500).json({ error: 'Failed to process schedule creation.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/updateschedule', async (req, res) => {
  try {
    const schedule = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleScheduleUpdate(client, openai, schedule);

    res.status(200).json({ message: 'Schedule update received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /updateschedule:', error);
    res.status(500).json({ error: 'Failed to process schedule update.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/fleetcommanderchange', async (req, res) => {
  try {
    const fleet = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleFleetCommanderChange(client, openai, fleet);

    res.status(200).json({ message: 'Commander update received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetcommanderchange:', error);
    res.status(500).json({ error: 'Failed to process fleet command updates.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/fleetmemberchange', async (req, res) => {
  try {
    const fleet = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleFleetMemberChange(client, openai, fleet);

    res.status(200).json({ message: 'Commander update received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetcommanderchange:', error);
    res.status(500).json({ error: 'Failed to process fleet command updates.' });
  }
});

// Expose /emojidata endpoint for API to GET emoji data from Discord
app.get('/emojidata', async (req, res) => {
  try {
    const allEmojis = [];
    for (const [guildId, guild] of client.guilds.cache) {
      const emojis = await guild.emojis.fetch();
      emojis.forEach(emoji => {
        allEmojis.push({
          id: emoji.id,
          name: emoji.name,
          url: emoji.url,
          animated: emoji.animated,
          guild: guild.name,
        });
      });
    }
    res.status(200).json(allEmojis);
  } catch (error) {
    console.error('Error handling /emojidata:', error);
    res.status(500).json({ error: 'Failed to fetch emoji data.' });
  }
});

// Expose /promote endpoint for API to GET promote action for a user
app.get('/promote', async (req, res) => {
  try {
    const user_id = req.query.user_id || req.body.user_id;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }
    // Call the promotion handler
    const result = await promotePlayerNotify(client, openai, user_id);
    if (result === true) {
      return res.status(200).json("TRUE");
    } else {
      return res.status(500).json({ error: 'Promotion failed' });
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Expose /notifyaward endpoint for API to GET notify award action for a user
app.get('/notifyaward', async (req, res) => {
  try {
    const badgeName = req.query.badgeName || req.body.badgeName;
    const badgeDescription = req.query.badgeDescription || req.body.badgeDescription;
    const userName = req.query.userName || req.body.userName;
    const userId = req.query.userId || req.body.userId;
    if (!badgeName || !badgeDescription || !userName || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await notifyForAward(badgeName, badgeDescription, userName, userId, openai, client);
    if (result === true) {
      return res.status(200).json("TRUE");
    } else {
      return res.status(500).json({ error: 'Award notification failed' });
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Expose /grantprestige endpoint for API to POST grant prestige action for a user
app.post('/grantprestige', async (req, res) => {
  try {
    const { user_id, prestige_name, prestige_level } = req.body;
    if (!user_id || !prestige_name || prestige_level === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await grantPrestigeNotify(user_id, prestige_name, prestige_level, openai, client);
    if (result === true) {
      return res.status(200).json("TRUE");
    } else {
      return res.status(500).json({ error: 'Prestige grant failed' });
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Expose /verifyuser endpoint for API to POST RSI handle and userId for verification
app.post('/verifyuser', async (req, res) => {
  try {
    const { handle, userId } = req.body;
    if (!handle || !userId) {
      return res.status(400).json({ error: 'Missing required fields: handle and userId' });
    }
    const result = await verifyUser(handle, userId);
    if (typeof result === 'string' && result.includes('Success!')) {
      return res.status(200).json({ message: result });
    } else {
      return res.status(400).json({ error: result });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the HTTP server on a configurable port
const PORT = process.env.BOT_HTTP_PORT;
app.listen(PORT, () => {
  console.log(`Discord bot HTTP server listening on port ${PORT}`);
});