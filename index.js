const { Client, GatewayIntentBits, Collection, Events, ChannelType, Partials } = require("discord.js");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// const threadHandler = require("./thread-handler");
const { preloadFromDb } = require("./common/preload-from-db.js");
// const queueReminderCheck = require("./queue-functions/queue-controller.js").queueReminderCheck
const { processUEXData } = require("./common/process-uex-data.js")
const { handleMessage } = require('./threads/thread-handler.js');
const { handleBotConversation } = require('./chatgpt/handler.js');
const { createUser } = require('./api/userlistApi.js');
const { getUserById } = require('./api/userlistApi.js');
const { editUser } = require('./api/userlistApi.js');
const { getUserRank } = require('./userlist-functions/userlist-controller.js')
const { refreshUserlist } = require("./common/refresh-userlist.js");
const { refreshUserListCache } = require('./common/userlist-cache.js');
const { saveMessage } = require("./common/message-saver.js");
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
const { automatedAwards } = require("./common/automated-awards.js");
const { promotePlayerNotify } = require("./common/promote-player-notify.js");
const { notifyForAward } = require("./common/bot-notify.js");
const { grantPrestigeNotify } = require("./common/grant-prestige-notify.js");
const { getPrestigeRanks } = require("./userlist-functions/userlist-controller.js");
const { processLeaderboardLogs } = require('./functions/process-leaderboard-logs.js');
const { processOrgLeaderboards } = require('./functions/process-leaderboards.js');
const { verifyUser } = require('./functions/verify-user.js');
const { handleNewGuildMember } = require('./common/new-user.js');
const { userlistEvents, USERLIST_CHANGED } = require('./common/userlist-events.js');
const { handleSimpleWelcomeProspect, handleSimpleWelcomeGuest, handleSimpleJoin } = require("./common/inprocessing-verify-handle.js");
const { refreshPlayerStatsView } = require('./api/playerStatsApi.js');
const { removeProspectFromFriendlies } = require('./common/remove-prospect-from-friendly.js');
const { syncSkillLevelsFromGuild, updateSkillOnMemberChange } = require('./common/skill-level-assigner.js');
const { makeMember, updateMemberOnMemberChange } = require('./common/make-member.js');
// Preloaders for location and market caches
const { loadSystems } = require('./chatgpt/star-systems-answerer.js');
const { loadStations } = require('./chatgpt/space-stations-answerer.js');
const { loadPlanets } = require('./chatgpt/planets-answerer.js');
const { loadOutposts } = require('./chatgpt/outposts-answerer.js');
const { primeMarketCache } = require('./chatgpt/market-answerer.js');


// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = ".env";
if (args.length === 1) {
  envFile = `${args[0]}`;
}
dotenv.config({
  path: envFile,
});

// Coalesce DB-driven userlist changes into a debounced cache refresh
let _userlistCacheTimer = null;
function scheduleUserlistCacheRefresh(delayMs = 1500) {
  try { if (_userlistCacheTimer) clearTimeout(_userlistCacheTimer); } catch {}
  _userlistCacheTimer = setTimeout(async () => {
    try { await refreshUserListCache(); } catch (e) { console.error('[UserlistEvents] cache refresh failed:', e?.message || e); }
  }, delayMs);
}
try { userlistEvents.on(USERLIST_CHANGED, () => scheduleUserlistCacheRefresh(1500)); } catch {}

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

client.commands = new Collection();

//collect all of the commands
// const foldersPath = 'commands';
const foldersPath = path.join(__dirname, '/commands/');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.error(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }
}

// Set channels
channelIds = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CHANNELS.split(",") : process.env.TEST_CHANNELS.split(",");
// Ensure HITTRACK forum channel is included in allowed parent list
try {
  const hitForumId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.HITTRACK_CHANNEL_ID : process.env.TEST_HITTRACK_CHANNEL_ID;
  if (hitForumId && !channelIds.includes(hitForumId)) channelIds.push(hitForumId);
} catch {}
channelIdAndName = [];

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

// // Retrieve the bot assistant (read: personality)
// myAssistant = openai.beta.assistants;
// async function retrieveAssistant() {
//   myAssistant = await openai.beta.assistants.retrieve(
//     process.env.ASSISTANT_KEY
//   );
// }

// //---------------------------------------------------------------------------------//

// //retrieve the chatGPT assistant
// retrieveAssistant();

//Event Listener: login
client.on("ready", async () => {
  //fetch channels on a promise, reducing startup time
  const channelFetchPromises = channelIds.map(id => client.channels.fetch(id).catch(e => console.error(`Failed to fetch channel: ${id}`, e)));
  const channels = await Promise.all(channelFetchPromises);
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
  // await removeProspectFromFriendlies(client);
  await refreshUserlist(client, openai) //actually leave this here
  try { await refreshUserListCache(); } catch (e) { console.error('[Startup] userlist cache refresh failed:', e?.message || e); }
  // Ensure SKILL_LEVEL_* roles are aligned at startup based on live Discord roles (RAPTOR/RAIDER)
  // try { await syncSkillLevelsFromGuild(client); } catch (e) { console.error('[Startup] Skill role sync failed:', e?.message || e); }
  // Ensure MEMBER role is aligned at startup based on CREW/MARAUDER/BLOODED
  // try { await makeMember(client); } catch (e) { console.error('[Startup] Member role sync failed:', e?.message || e); }
  try { await ingestDailyChatSummaries(client, openai); } catch (e) { console.error('Initial chat ingest failed:', e); }
  try { await ingestHitLogs(client, openai); } catch (e) { console.error('Initial hit ingest failed:', e); }
  try { await ingestPlayerStats(client); } catch (e) { console.error('Initial player-stats ingest failed:', e); }
  // await processPlayerLeaderboards(client, openai)
  // Sequential UEX refresh + cache warmup
  const DAY_MS = 86400000;
  let uexRefreshInProgress = false;
  const primeLocationAndMarketCaches = async () => {
    try {
      // Do a single forced DB refresh via market cache, then non-blocking warms for the rest
      await primeMarketCache({ force: true });
      await Promise.allSettled([
        loadSystems({ force: false }),
        loadStations({ force: false }),
        loadPlanets({ force: false }),
        loadOutposts({ force: false }),
      ]);
    } catch (e) {
      console.error('Cache prime failed:', e);
    }
  };
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
      // Only after all three complete, warm caches into memory
      await primeLocationAndMarketCaches();
      console.log('[UEX] Refresh + cache prime completed.');
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
    // Default: only warm caches from existing DB data (no external refresh)
    await primeLocationAndMarketCaches();
    console.log('[Cache] Initial in-memory caches primed from DB.');
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
  setInterval(async () => preloadedDbTables = preloadFromDb(),
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
  setInterval(() => manageEvents(client, openai),
    300000 // every 5 minutes
  );
  setInterval(() => refreshPlayerStatsView(client, openai),
    300000 // every 5 minutes
  );
  setInterval(() => processPlayerLeaderboards(client, openai),
    14400000 //every 4 hours
  );
  setInterval(() => automatedAwards(client, openai),
    // 60000 //every 1 minute
    3600000 //every 1 hour
  );
  // Ingest daily chat summaries into knowledge base (every 6 hours)
  // Combined sequential ingest cycle (every 6 hours): chat summaries then hit logs
  const SIX_HOURS = 21600000;
  setInterval(async () => {
    try {
      await ingestDailyChatSummaries(client, openai);
      await ingestHitLogs(client, openai);
    } catch (e) {
      console.error('Chat/Hit ingest cycle failed:', e);
    }
  }, SIX_HOURS);
  // Ingest player stats into knowledge base (every 6 hours)
  setInterval(() => ingestPlayerStats(client),
    3600000 //every 1 hour  
    // 21600000 // every 6 hours
  );
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
  if ((process.env.SAVE_MESSAGES || 'false').toLowerCase() === 'true') {
    try { await saveMessage(message, client); } catch {}
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

  // Detect if this message is directed at the bot: mention or reply to bot
  const isMentioningBot = message.mentions?.users?.has?.(client.user.id);
  const isReplyToBot = Boolean(
    message.reference?.messageId &&
    message.mentions?.repliedUser &&
    message.mentions.repliedUser.id === client.user.id
  );

  if (isMentioningBot || isReplyToBot) {
    // Route to the new chatgpt handler (delegates to legacy for now)
    try {
      await handleBotConversation(message, client, openai, preloadedDbTables);
    } catch (e) {
      console.error('chatgpt handler failed, falling back to legacy handler:', e);
      handleMessage(message, openai, client, preloadedDbTables);
    }
    return;
  }

  // Otherwise keep legacy behavior
  // handleMessage(message, openai, client, preloadedDbTables);

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

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction, client, openai);
  } catch (error) {
    console.error(error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    // command handling
  } else if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.autocomplete(interaction, client, openai);
    } catch (error) {
      console.error(error);
    }
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
    // ...existing code...
    // Fetch the user's existing data
    const user = await getUserById(newMember.user.id) || null;
    if (!user) {
      console.log("Member update had no user identified, returning");
      return;
    }

    // Get the member's rank and prestige levels
    const memberRoles = newMember.roles.cache.map(role => role.id);
    const prospectRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.PROSPECT_ROLE : process.env.TEST_PROSPECT_ROLE;
    const friendlyRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_ROLE : process.env.TEST_FRIENDLY_ROLE;
    const verifiedRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.VERIFIED_ROLE : process.env.TEST_VERIFIED_ROLE;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const userRank = await getUserRank(memberRoles);

    // Fetch prestige roles for level calculation
    const prestigeRanks = await getPrestigeRanks(memberRoles);

    // Check if user gained the verifiedRole
    const oldRoles = oldMember.roles.cache.map(role => role.id);
    if (!oldRoles.includes(prospectRole) && memberRoles.includes(prospectRole) && memberRoles.includes(newUserRole)) {
      // User just gained the prospectRole
      await handleSimpleWelcomeProspect(newMember, client, openai);
    }
    if (!oldRoles.includes(friendlyRole) && memberRoles.includes(friendlyRole) && memberRoles.includes(newUserRole)) {
      // User just gained the prospectRole
      await handleSimpleWelcomeGuest(newMember, client, openai);
    }

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
  if (interaction.isButton()) {
    // Handle DM verification buttons for join_member and join_guest
    // if (interaction.customId === 'join_member' || interaction.customId === 'join_guest') {
    //   try {
    //     await handleMemberOrGuestJoin(interaction, client, openai);
    //   } catch (err) {
    //     console.error('Error handling member/guest join:', err);
    //     await interaction.reply({ content: 'There was an error processing your request.', ephemeral: true });
    //   }
    //   return;
    // }
  }

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

  const type = match[1];
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
  client.login(process.env.LIVE_ENVIRONMENT === "true" ? process.env.CLIENT_TOKEN : process.env.TEST_CLIENT_TOKEN);
});

//logs the bot in
client.login(process.env.LIVE_ENVIRONMENT === "true" ? process.env.CLIENT_TOKEN : process.env.TEST_CLIENT_TOKEN);

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