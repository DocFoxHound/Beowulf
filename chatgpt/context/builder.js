const {
  getRecentChatForChannel,
  getUserProfileFromCache,
  getLeaderboardSnapshot,
  getPlayerStatsSnapshot,
  getMarketSnapshotFromCache,
  getHitActivitySummary,
} = require('../tools');
const { ensureCachesReady } = require('./cache-readiness');
const { fetchKnowledgeSnippets } = require('./knowledge-search');

const RECENT_CHAT_LIMIT = Number(process.env.CHATGPT_RECENT_CHAT_LIMIT || 8);
const MARKET_FILLER_WORDS = new Set(['what', 'is', 'the', 'current', 'price', 'for', 'of', 'a', 'an', 'anyone', 'know']);
const GENERIC_MARKET_WORDS = new Set(['highest', 'value', 'values', 'trade', 'trades', 'route', 'routes', 'profit', 'profits', 'haul', 'hauls', 'cargo', 'run', 'runs', 'best', 'top', 'great', 'good', 'money', 'credits', 'right', 'now', 'today', 'tonight', 'currently', 'biggest', 'largest', 'most', 'high', 'higher', 'low', 'lower']);

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

async function buildContext({ message, meta, intent }) {
  await ensureCachesReady();
  const channelId = meta.channelId;
  const userId = meta.authorId;
  const content = sanitizeContent(message?.content);
  const lowerContent = (content || '').toLowerCase();

  const recentChat = getRecentChatForChannel(channelId, RECENT_CHAT_LIMIT);
  const userProfile = getUserProfileFromCache(userId);
  const playerStats = getPlayerStatsSnapshot(userId);

  const includeLeaderboard = intent.intent === 'user_stats' || /leaderboard|rank|score|promotion|prestige/.test(lowerContent);
  const leaderboard = includeLeaderboard ? getLeaderboardSnapshot(userId) : null;

  const includeMarket = intent.intent === 'price_query' || /price|market|sell|buy|commodity|terminal|trade|haul|cargo/.test(lowerContent);
  const marketQueryMeta = extractMarketQuery(content);
  const marketSnapshot = includeMarket
    ? getMarketSnapshotFromCache(marketQueryMeta.query, {
        limit: 5,
        requestedQuery: marketQueryMeta.requested,
        isGeneric: marketQueryMeta.isGeneric,
      })
    : null;

  const includeHitSummary = /piracy|pirate|hit track|hittrack|hittracker|bounty|raid|ambush|cargo|haul/.test(lowerContent);
  const hitSummary = includeHitSummary ? getHitActivitySummary() : [];

  const knowledgeSnippets = await fetchKnowledgeSnippets({ content, guildId: meta.guildId, channelId });
  const includeKnowledge = true;

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
    knowledgeSnippets,
    sections: {
      includeRecent: true,
      includeProfile: true,
      includeStats: true,
      includeKnowledge,
      includeLeaderboard: Boolean(leaderboard),
      includeMarket: Boolean(marketSnapshot),
      includeHitSummary: includeHitSummary && hitSummary.length > 0,
    },
    externalData: {
      userProfileLoaded: Boolean(userProfile),
      leaderboardLoaded: Boolean(leaderboard),
      statsLoaded: Boolean(playerStats),
      marketLoaded: Boolean(marketSnapshot),
      hitSummaryLoaded: hitSummary.length > 0,
    },
  };
}

module.exports = {
  buildContext,
};
