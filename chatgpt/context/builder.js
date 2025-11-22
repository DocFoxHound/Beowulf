const {
  getRecentChatForChannel,
  getUserProfileFromCache,
  getLeaderboardSnapshot,
  getPlayerStatsSnapshot,
  getMarketSnapshotFromCache,
  getLocationSnapshotFromCache,
  getHitActivitySummary,
  extractMarketTargets,
} = require('../tools');
const { ensureCachesReady } = require('./cache-readiness');
const { fetchKnowledgeSnippets } = require('./knowledge-search');
const { fetchMemorySnippets } = require('./memory-search');

const RECENT_CHAT_LIMIT = Number(process.env.CHATGPT_RECENT_CHAT_LIMIT || 8);
const MEMORY_PRIMARY_IMPORTANCE = Number(process.env.CHATGPT_MEMORY_PRIMARY_IMPORTANCE || 3);
const MEMORY_PRIMARY_SCORE = Number(process.env.CHATGPT_MEMORY_PRIMARY_SCORE || 0.28);
const MEMORY_KNOWLEDGE_LIMIT = Number(process.env.CHATGPT_MEMORY_KNOWLEDGE_LIMIT || 2);
const MARKET_DEBUG = (process.env.CHATGPT_MARKET_DEBUG || 'false').toLowerCase() === 'true';
const MARKET_FILLER_WORDS = new Set(['what', 'is', 'the', 'current', 'price', 'for', 'of', 'a', 'an', 'anyone', 'know']);
const GENERIC_MARKET_WORDS = new Set(['highest', 'value', 'values', 'trade', 'trades', 'route', 'routes', 'profit', 'profits', 'haul', 'hauls', 'cargo', 'run', 'runs', 'best', 'top', 'great', 'good', 'money', 'credits', 'right', 'now', 'today', 'tonight', 'currently', 'biggest', 'largest', 'most', 'high', 'higher', 'low', 'lower']);

function classifyMemoryImportance(memory) {
  if (!memory) return 'circumstantial';
  const importance = Number(memory.importance ?? 0);
  const score = typeof memory.score === 'number' ? memory.score : null;
  if (importance >= MEMORY_PRIMARY_IMPORTANCE) return 'primary';
  if (score != null && score >= MEMORY_PRIMARY_SCORE) return 'primary';
  if (memory.type && ['lore', 'profile', 'dogfighting_advice', 'piracy_advice'].includes(memory.type)) {
    return importance >= Math.max(1, MEMORY_PRIMARY_IMPORTANCE - 1) ? 'primary' : 'circumstantial';
  }
  return 'circumstantial';
}

function partitionMemories(memories = []) {
  const primary = [];
  const circumstantial = [];
  for (const entry of memories) {
    if (!entry) continue;
    (classifyMemoryImportance(entry) === 'primary' ? primary : circumstantial).push(entry);
  }
  return { primary, circumstantial };
}

function buildMemoryKnowledgeQuery(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) return null;
  const text = memories
    .map((memory) => memory?.content || memory?.summary || '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 800);
  return text.trim() || null;
}

function buildBanterFallbackProfile(message, meta) {
  if (!message) return null;
  const member = message.member;
  const roleNames = member?.roles?.cache
    ? Array.from(member.roles.cache.values()).map((role) => role?.name || role?.id).filter(Boolean)
    : [];
  const nickname = member?.displayName || message.author?.globalName || message.author?.username || null;
  const username = message.author?.username || message.author?.tag || meta?.authorTag || 'Unknown pirate';
  if (!username && !nickname) return null;
  return {
    id: meta?.authorId || message.author?.id || null,
    username,
    nickname,
    roles: roleNames,
    rank: member?.roles?.highest?.name || null,
  };
}

function sanitizeContent(content) {
  return (content || '').trim();
}

function extractMarketQuery(text) {
  const cleaned = (text || '')
    .replace(/<@!?(\d+)>/g, '')
    .replace(/<#[0-9]+>/g, '')
    .replace(/<@&[0-9]+>/g, '')
    .replace(/[^a-z0-9\s'\-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  if (!tokens.length) return { query: '', requested: cleaned, isGeneric: true };
  const filtered = tokens.filter((token) => !MARKET_FILLER_WORDS.has(token.toLowerCase()));
  const informative = filtered.filter((token) => !GENERIC_MARKET_WORDS.has(token.toLowerCase()));
  const queryTokens = informative.length ? informative : (filtered.length ? filtered : tokens);
  const query = queryTokens.join(' ');
  return {
    query,
    requested: cleaned,
    isGeneric: informative.length === 0,
  };
}

async function buildContext({ message, meta, intent, openai }) {
  await ensureCachesReady();
  const channelId = meta.channelId;
  const userId = meta.authorId;
  const content = sanitizeContent(message?.content);
  const lowerContent = (content || '').toLowerCase();
  const intentLabel = intent?.intent || 'banter';
  const intentIsBanter = intentLabel === 'banter';

  const recentChat = getRecentChatForChannel(channelId, RECENT_CHAT_LIMIT);
  let userProfile = getUserProfileFromCache(userId);
  if (!userProfile && intentIsBanter) {
    userProfile = buildBanterFallbackProfile(message, meta) || null;
  }
  const playerStats = getPlayerStatsSnapshot(userId);

  const includeLeaderboard = intent.intent === 'user_stats' || /leaderboard|rank|score|promotion|prestige/.test(lowerContent);
  const leaderboard = includeLeaderboard ? getLeaderboardSnapshot(userId) : null;

  const includeMarket = intent.intent === 'price_query' || /price|market|sell|buy|commodity|terminal|trade|haul|cargo|refine|refinery|refining|yield|processing/.test(lowerContent);
  const includeLocationInfo = intent.intent === 'location_info';
  const marketQueryMeta = extractMarketQuery(content);
  const shouldExtractTargets = includeMarket || includeLocationInfo;
  const emptyTargets = {
    marketType: 'overview',
    commodityName: null,
    commodityDataset: null,
    locationName: null,
    locationDataset: null,
    locationType: null,
    locationRecord: null,
    hasRefineryKeyword: false,
    datasetPreference: null,
    locationTerminals: null,
    locationTerminalIds: [],
    locationTerminalNames: [],
    locationTerminalCount: 0,
    locationTerminalSample: [],
    locationTerminalFallbackUsed: false,
    catalogSummary: null,
  };
  const extractedTargets = shouldExtractTargets ? extractMarketTargets(content) : null;
  const marketTargets = includeMarket ? (extractedTargets || emptyTargets) : emptyTargets;
  const locationTargets = includeLocationInfo ? extractedTargets : null;
  const marketSnapshot = includeMarket
    ? getMarketSnapshotFromCache(marketQueryMeta.query, {
        limit: 5,
        requestedQuery: marketQueryMeta.requested,
        isGeneric: marketQueryMeta.isGeneric,
        marketType: marketTargets.marketType,
        commodityName: marketTargets.commodityName,
        locationName: marketTargets.locationName,
        commodityDataset: marketTargets.commodityDataset,
        datasetPreference: marketTargets.datasetPreference,
        terminalIds: marketTargets.locationTerminalIds,
        locationDescriptor: marketTargets.locationTerminals
          ? {
              locationName: marketTargets.locationName,
              locationDataset: marketTargets.locationDataset,
              terminalIds: marketTargets.locationTerminalIds,
              terminalNames: marketTargets.locationTerminalNames,
              terminalCount: marketTargets.locationTerminalCount,
              sampleTerminals: marketTargets.locationTerminalSample,
              fallbackUsed: marketTargets.locationTerminalFallbackUsed,
            }
          : null,
      })
    : null;

  if (MARKET_DEBUG) {
    if (marketSnapshot) {
      const datasetDiagnostics = Array.isArray(marketSnapshot.datasetSnapshots)
        ? marketSnapshot.datasetSnapshots.map((entry) => ({
            dataset: entry?.dataset,
            label: entry?.label,
            matches: entry?.snapshot?.matches,
            sampleCount: entry?.snapshot?.sample?.length || 0,
            fallbackUsed: entry?.snapshot?.fallbackUsed || false,
            filters: entry?.snapshot?.filters || null,
          }))
        : [];
      console.log('[ChatGPT][MarketDebug] snapshot_ready', {
        timestamp: new Date().toISOString(),
        requested: marketQueryMeta.requested,
        resolvedQuery: marketSnapshot.query,
        marketType: marketSnapshot.marketType,
        dataset: marketSnapshot.dataset,
        terminalFilterApplied: marketSnapshot.terminalFilterApplied,
        terminalFilterCount: marketSnapshot.terminalFilterCount,
        datasetDiagnostics,
      });
    } else if (includeMarket) {
      console.log('[ChatGPT][MarketDebug] snapshot_missing', {
        timestamp: new Date().toISOString(),
        requested: marketQueryMeta.requested,
        includeMarket,
      });
    }
  }
  const marketCatalogSummary = includeMarket ? marketTargets.catalogSummary : null;
  const marketQuery = includeMarket ? { ...marketQueryMeta, ...marketTargets } : null;

  const locationSnapshot = includeLocationInfo && locationTargets?.locationName
    ? getLocationSnapshotFromCache({
        locationName: locationTargets.locationName,
        locationDataset: locationTargets.locationDataset,
        locationRecord: locationTargets.locationRecord,
      })
    : null;
  const locationQuery = includeLocationInfo ? locationTargets : null;

  const includeHitSummary = /piracy|pirate|hit track|hittrack|hittracker|bounty|raid|ambush|cargo|haul/.test(lowerContent);
  const hitSummary = includeHitSummary ? getHitActivitySummary() : [];

  const knowledgeSnippets = await fetchKnowledgeSnippets({ content, guildId: meta.guildId, channelId }) || [];
  const rawMemories = await fetchMemorySnippets({
    content,
    guildId: meta.guildId,
    channelId,
    userId,
    openai,
  }) || [];
  const { primary: primaryMemories, circumstantial: circumstantialMemories } = partitionMemories(rawMemories);
  const hasRichData = Boolean(
    (knowledgeSnippets?.length || 0) > 0
    || marketSnapshot
    || leaderboard
    || playerStats
    || (hitSummary?.length || 0) > 0
    || locationSnapshot
  );
  const allowCircumstantialMemories = intentIsBanter || !hasRichData;
  const selectedMemories = allowCircumstantialMemories
    ? primaryMemories.concat(circumstantialMemories)
    : primaryMemories;
  const memoryKnowledgeSource = primaryMemories.length
    ? primaryMemories
    : (allowCircumstantialMemories ? circumstantialMemories : []);
  const memoryKnowledgeQuery = buildMemoryKnowledgeQuery(memoryKnowledgeSource);
  const memoryKnowledgeSnippets = memoryKnowledgeQuery
    ? (await fetchKnowledgeSnippets({
        content: memoryKnowledgeQuery,
        guildId: meta.guildId,
        channelId,
        limit: MEMORY_KNOWLEDGE_LIMIT,
      }) || [])
    : [];
  const includeKnowledge = knowledgeSnippets.length > 0;
  const memoryContext = {
    primary: primaryMemories,
    circumstantial: circumstantialMemories,
    allowCircumstantial: allowCircumstantialMemories,
    fallbackApplied: allowCircumstantialMemories && !primaryMemories.length && circumstantialMemories.length > 0,
    relatedKnowledge: memoryKnowledgeSnippets,
  };

  return {
    request: {
      ...meta,
      content,
    },
    intent,
    recentChat,
    userProfile,
    leaderboard,
    playerStats,
    hitSummary,
    marketSnapshot,
    marketQuery,
    marketCatalogSummary,
    locationSnapshot,
    locationQuery,
    knowledgeSnippets,
    longTermMemories: selectedMemories,
    memoryContext,
    sections: {
      includeRecent: true,
      includeProfile: true,
      includeStats: true,
      includeKnowledge,
      includeMemories: Boolean(selectedMemories.length),
      includeLeaderboard: Boolean(leaderboard),
      includeMarket: Boolean(marketSnapshot),
      includeMarketCatalog: Boolean(marketCatalogSummary),
      includeLocation: Boolean(locationSnapshot),
      includeHitSummary: includeHitSummary && hitSummary.length > 0,
    },
    externalData: {
      userProfileLoaded: Boolean(userProfile),
      leaderboardLoaded: Boolean(leaderboard),
      statsLoaded: Boolean(playerStats),
      marketLoaded: Boolean(marketSnapshot),
      marketCatalogLoaded: Boolean(marketCatalogSummary),
      locationLoaded: Boolean(locationSnapshot),
      hitSummaryLoaded: hitSummary.length > 0,
      memoriesLoaded: selectedMemories.length > 0,
      memoryFallbackApplied: memoryContext.fallbackApplied,
    },
  };
}

module.exports = {
  buildContext,
};
