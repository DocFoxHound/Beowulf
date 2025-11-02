// New ChatGPT entrypoint: Responses-only flow (no Assistants/threads)

const { sendResponse } = require('../threads/send-response.js');
const { runWithResponses } = require('./responses-run.js');
const { getUserById } = require('../api/userlistApi.js');
const { getAllHitLogs } = require('../api/hitTrackerApi.js');
const { buildRecentConversationSnippet, buildRecentActivitySnapshot } = require('./context-builders');
const { listKnowledge } = require('../api/knowledgeApi.js');

async function handleBotConversation(message, client, openai, preloadedDbTables) {
  try {
    // Ignore own messages (defensive)
    const isBot = message.author.id === client.user.id;
    if (isBot) return;

  // Heuristic: treat questions/requests as info-seeking and retrieve org-wide snippets
  const looksInfoSeeking = /\b(what|how|why|where|when|who|rules?|policy|promotion|market|price|loadout|ship|quantanium|cargo|hit|hits|piracy|pirate|recent|lately|today|this\s+week|going\s+on)\b|\?/i.test(message.content || '');
  const asksRecentActivity = /(what\s+has\s+everyone\s+been\s+doing|what\s+is\s+everyone\s+doing|recent\s+activity|what\'s\s+been\s+going\s+on)/i.test(message.content || '');
  const asksLatestHit = /(latest|most\s*recent|last)\s+hit(s)?\b|recent\s+hit\b/i.test(message.content || '');

    // Prepare a readable message for the model (replace mentions with display names)
    const formattedMessage = await formatDiscordMessage(message);

  // If using Responses, skip thread creation entirely
  // No thread creation needed for Responses flow

  // Build minimal role context for routing: include only the user's rank label (if any)
  const rankLabel = deriveRankLabel(message.member);

  // Build recent conversation snippet for general banter context
  const recentSnippet = await buildRecentConversationSnippet(message);

  // AI intent router (fast heuristic + optional LLM) to guide retrieval
  const { routeIntent } = require('./intent-router');
  const routed = await routeIntent(openai, formattedMessage);
  const isPiracyIntent = Boolean((routed?.intent || '').startsWith('piracy.'));
  const isDogfightingIntent = Boolean((routed?.intent || '').startsWith('dogfighting.'));

  // Fast, factual handling for piracy.stats (e.g., "best hit recently")
  if (routed?.intent === 'piracy.stats') {
    try {
      const metric = routed?.filters?.metric || 'max_value';
      const ds = routed?.filters?.date_start ? new Date(routed.filters.date_start + 'T00:00:00Z') : null;
      const de = routed?.filters?.date_end ? new Date(routed.filters.date_end + 'T23:59:59Z') : null;
      const hits = await getAllHitLogs();
      const inRange = Array.isArray(hits) ? hits.filter(h => {
        const t = new Date(h.created_at || h.createdAt || Date.now());
        if (ds && t < ds) return false;
        if (de && t > de) return false;
        return true;
      }) : [];
      if (!inRange.length) {
        await sendResponse(message, 'No hits found in the requested timeframe.', true);
        return;
      }
      const getVal = (h) => Number(h.total_value ?? h.total_cut_value ?? 0) || 0;
      let answer = '';
      if (metric === 'count') {
        answer = `Hits in range: ${inRange.length}`;
      } else if (metric === 'total_value') {
        const sum = inRange.reduce((a,h)=>a+getVal(h),0);
        answer = `Total value in range: ${Math.round(sum).toLocaleString()} aUEC`;
      } else if (metric === 'avg_value') {
        const sum = inRange.reduce((a,h)=>a+getVal(h),0);
        const avg = sum / inRange.length;
        answer = `Average hit value: ${Math.round(avg).toLocaleString()} aUEC (n=${inRange.length})`;
      } else if (metric === 'min_value') {
        const min = inRange.reduce((m,h)=>getVal(h)<getVal(m)?h:m, inRange[0]);
        answer = `Smallest hit: "${min.title || ('#'+min.id)}" on ${(min.created_at||'').slice(0,10)} at ${Math.round(getVal(min)).toLocaleString()} aUEC`;
      } else { // max_value or unspecified
        const max = inRange.reduce((m,h)=>getVal(h)>getVal(m)?h:m, inRange[0]);
        answer = `Best hit: "${max.title || ('#'+max.id)}" on ${(max.created_at||'').slice(0,10)} worth ${Math.round(getVal(max)).toLocaleString()} aUEC`;
      }
      await sendResponse(message, answer, true);
      return;
    } catch (e) {
      console.error('piracy.stats handling failed:', e?.response?.data || e?.message || e);
      // fall through to normal flow
    }
  }

  // Deterministic recap of recent hits from knowledge for piracy.latest / piracy.summary
  if (routed?.intent === 'piracy.latest' || routed?.intent === 'piracy.summary') {
    try {
      const filters = routed?.filters || {};
      const limit = Math.max(1, Math.min(10, Number(filters.limit || (routed.intent === 'piracy.latest' ? 1 : 3))));
      const rows = await listKnowledge({ category: 'piracy', section: 'hit-log', limit: Math.max(limit * 3, 10), order: 'created_at.desc' }) || [];
      const ds = filters?.date_start ? new Date(filters.date_start + 'T00:00:00Z') : null;
      const de = filters?.date_end ? new Date(filters.date_end + 'T23:59:59Z') : null;
      const getDateFromTags = (r) => {
        try {
          const tag = Array.isArray(r.tags) ? (r.tags.find(t => String(t).startsWith('date:')) || '') : '';
          return tag ? tag.slice(5) : null; // YYYY-MM-DD
        } catch { return null; }
      };
      const withinRange = (r) => {
        if (!ds && !de) return true;
        const tagDate = getDateFromTags(r);
        const d = tagDate ? new Date(tagDate + 'T12:00:00Z') : (r.created_at ? new Date(r.created_at) : null);
        if (!d) return true;
        if (ds && d < ds) return false;
        if (de && d > de) return false;
        return true;
      };
      const pickSummaryLines = (content) => {
        try {
          const s = String(content || '');
          const idx = s.indexOf('Summary:');
          const block = idx >= 0 ? s.slice(idx + 8) : s; // 8 = 'Summary:'.length
          const lines = block.split(/\r?\n/).map(l => l.trim());
          // Prefer bullet lines first
          const bullets = lines.filter(l => /^[-•]/.test(l)).slice(0, 4);
          if (bullets.length) return bullets;
          // Fallback: take first few non-empty lines
          return lines.filter(Boolean).slice(0, 4);
        } catch { return []; }
      };
      const filtered = rows.filter(withinRange).slice(0, limit);
      if (!filtered.length) {
        await sendResponse(message, 'No recent hits found to summarize.', true);
        return;
      }
      const parts = [];
      parts.push(routed.intent === 'piracy.latest' ? 'Latest piracy hit:' : 'Recent piracy hits:');
      for (const r of filtered) {
        const dt = getDateFromTags(r) || (r.created_at ? String(r.created_at).slice(0,10) : 'recent');
        const title = r.title || 'Hit';
        const lines = pickSummaryLines(r.content);
        parts.push(`- ${dt} — ${title}`);
        for (const l of lines) parts.push(`  ${l}`);
      }
      await sendResponse(message, parts.join('\n'), true);
      return;
    } catch (e) {
      console.error('piracy.latest/summary handling failed:', e?.response?.data || e?.message || e);
      // fall through to normal flow
    }
  }

  // Prefer knowledge-based daily summaries for recent-activity queries; fallback to quick snapshot
  let recentActivity = '';
  if (asksRecentActivity) {
    recentActivity = await buildKnowledgeRecentActivitySnippet({
      guildId: message.guild?.id,
      channelId: message.channelId,
    });
    if (!recentActivity) {
      recentActivity = await buildRecentActivitySnapshot(message);
    }
  }
  // If user asks for the latest hit, fetch the most recent hit-log from knowledge
  let latestHit = '';
  if (asksLatestHit && (process.env.KNOWLEDGE_RETRIEVAL || 'true').toLowerCase() !== 'false') {
    try {
      const rows = await listKnowledge({ category: 'piracy', section: 'hit-log', limit: 1, order: 'created_at.desc' });
      if (Array.isArray(rows) && rows.length) {
        const r = rows[0];
        const dateTag = Array.isArray(r.tags) ? (r.tags.find(t => String(t).startsWith('date:')) || '').slice(5) : '';
        const date = dateTag || (r.created_at ? String(r.created_at).slice(0,10) : 'recent');
        const body = String(r.content || '').slice(0, 900);
        const title = r.title || 'Latest piracy hit';
        latestHit = `Latest piracy hit (${date}): ${title}\n${body}`;
      }
    } catch (e) {
      console.error('latest hit lookup failed:', e?.response?.data || e?.message || e);
    }
  }
  const { getTopK, getTopKFromKnowledgePiracy } = require('./retrieval');

  // Send typing indicator and run via Responses API
  message.channel.sendTyping();
  // Build context snippets with light logging for diagnostics
  const contextParts = [
        ...(latestHit ? [latestHit] : []),
        // For piracy-specific questions, avoid chat snippets to reduce noise
        ...(!isPiracyIntent && recentSnippet ? [recentSnippet] : []),
        ...(!isPiracyIntent && recentActivity ? [recentActivity] : []),
        // For dogfighting-related asks, pull targeted chat snippets first (prioritize messages)
        ...(isDogfightingIntent ? await getTopK({
          query: buildDogfightingQuery(message.content, routed?.intent, routed?.filters),
          k: 6,
          sources: ['messages'],
          openai,
          guildId: message.guild?.id,
          channelId: message.channelId,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: false,
        }) : []),
        // Optionally enrich with knowledge snippets for equipment/meta/ships
        ...((isDogfightingIntent && /dogfighting\.(equipment|meta|ships)/.test(routed?.intent || '')) ? await getTopK({
          query: buildDogfightingQuery(message.content, routed?.intent, routed?.filters),
          k: 3,
          sources: ['knowledge'],
          openai,
          guildId: message.guild?.id,
          channelId: message.channelId,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: false,
        }) : []),
        // If router says this is a piracy-related ask, add top piracy knowledge snippets (guild-wide)
        ...((routed?.intent || '').startsWith('piracy.') ? await getTopKFromKnowledgePiracy({
          query: message.content,
          k: 4,
          openai,
          guildId: message.guild?.id,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
        }) : []),
        // For piracy.advice, explicitly include chat snippets about piracy as well
        ...((routed?.intent === 'piracy.advice') ? await getTopK({
          query: /\bpiracy\b|\bpirate\b/.test(message.content) ? message.content : `${message.content} piracy`,
          k: 5,
          sources: ['messages'],
          openai,
          guildId: message.guild?.id,
          channelId: message.channelId,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: false,
        }) : []),
        // For general information-seeking intents, pull in retrieval context
        ...(((routed?.intent === 'general.info') || (!isPiracyIntent && looksInfoSeeking)) ? await getTopK({
          query: message.content,
          k: 6,
          sources: ['messages', 'knowledge'],
          openai,
          guildId: message.guild?.id,
          channelId: message.channelId,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: asksRecentActivity,
        }) : []),
  ];
  if ((process.env.DEBUG_RETRIEVAL || 'false').toLowerCase() === 'true') {
    try {
      console.log('[retrieval] intent=', routed?.intent, 'piracyIntent=', isPiracyIntent);
      console.log('[retrieval] contextParts count=', contextParts.length);
      for (let i = 0; i < Math.min(5, contextParts.length); i++) {
        console.log(`[retrieval] part[${i}]`, String(contextParts[i]).slice(0, 200));
      }
    } catch {}
  }

  const text = await runWithResponses({
    openai,
    formattedUserMessage: formattedMessage,
    guildId: message.guild?.id,
    channelId: message.channelId,
    rank: rankLabel || null,
      contextSnippets: contextParts,
  });
  if (text && text.trim()) {
    await sendResponse(message, text.trim(), true);
  } else {
    await message.reply('I could not complete that request right now.');
  }
  } catch (err) {
    console.error('chatgpt.handleBotConversation error:', err);
    try {
      await message.reply('There was an error processing this request.');
    } catch {}
  }
}

// Local formatter modeled after legacy behavior: replace user mentions with display names.
async function formatDiscordMessage(message) {
  const mentionRegex = /<@!?(\d+)>/g;
  try {
    const userIds = new Set();
    let m;
    while ((m = mentionRegex.exec(message.content)) !== null) {
      if (m[1]) userIds.add(m[1]);
    }
    const users = await Promise.all(Array.from(userIds).map((id) => getUserById(id)));
    const userMap = new Map();
    // Build a quick lookup: prefer nickname then username
    for (const u of users) {
      if (!u) continue;
      userMap.set(u.id, `@${u.nickname || u.username}`);
    }
  const readable = message.content.replace(mentionRegex, (_match, uid) => userMap.get(uid) || '@unknown-user');
  // Return only the user's content (no speaker labels) to prevent echoing names in the model's reply
  return readable;
  } catch (e) {
    console.error('formatDiscordMessage error:', e);
    return message.content;
  }
}

module.exports = {
  handleBotConversation,
};

// Helper: fetch latest daily summaries from knowledge and format a compact snippet
async function buildKnowledgeRecentActivitySnippet({ guildId, channelId, limit = 3, maxChars = 1400 }) {
  try {
    if ((process.env.KNOWLEDGE_RETRIEVAL || 'true').toLowerCase() === 'false') return '';
    const rows = await listKnowledge({ category: 'chat', guild_id: guildId, channel_id: channelId, limit: Math.max(1, limit), order: 'created_at.desc' });
    if (!Array.isArray(rows) || !rows.length) return '';
    const daily = rows.filter(r => (r.section || '') === 'daily-summary');
    const take = (daily.length ? daily : rows).slice(0, limit);
    const parts = ['Recent activity (daily summaries):'];
    for (const r of take) {
      const dateTag = Array.isArray(r.tags) ? (r.tags.find(t => String(t).startsWith('date:')) || '').slice(5) : '';
      const date = dateTag || (r.created_at ? String(r.created_at).slice(0, 10) : 'recent');
      const title = r.title || `#${r.channel_id} — ${date}`;
      const body = truncateText(String(r.content || ''), 600);
      parts.push(`- ${date}: ${title}`);
      if (body) parts.push(body);
    }
    const out = parts.join('\n');
    return out.length > maxChars ? out.slice(0, maxChars - 3) + '...' : out;
  } catch (e) {
    console.error('buildKnowledgeRecentActivitySnippet error:', e?.response?.data || e?.message || e);
    return '';
  }
}

function truncateText(s, n) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + '…';
}

// Helper: craft a focused retrieval query for dogfighting asks
function buildDogfightingQuery(content, intent, filters) {
  try {
    const s = String(content || '');
    const ship = String(filters?.ship_name || '').trim();
    let focus = '';
    if (/dogfighting\.equipment/.test(intent || '')) {
      focus = 'loadout equipment components guns cannons repeaters ballistic laser distortion gimballed fixed shield power cooler';
    } else if (/dogfighting\.ships/.test(intent || '')) {
      focus = 'best ship fighter choice vs matchup';
    } else if (/dogfighting\.meta/.test(intent || '')) {
      focus = 'pvp meta patch balance';
    } else if (/dogfighting\.training/.test(intent || '')) {
      focus = 'training piloting aim pip tracking strafing decouple practice';
    } else if (/dogfighting\./.test(intent || '')) {
      focus = 'strategy tactics approach engage disengage ambush joust turnfight boom and zoom';
    }
    return [ship, s, 'dogfighting', focus].filter(Boolean).join(' ');
  } catch {
    return String(content || '');
  }
}

// Helper: derive a single rank label from the member's roles using env role IDs
function deriveRankLabel(member) {
  try {
    if (!member?.roles?.cache) return null;
    const roleIds = new Set(member.roles.cache.map(r => r.id));
    const isLive = process.env.LIVE_ENVIRONMENT === 'true';
  // Explicitly prioritize Captain when multiple rank roles are present
  const captainRoleId = process.env[isLive ? 'CAPTAIN_ROLE' : 'TEST_CAPTAIN_ROLE'];
  if (captainRoleId && roleIds.has(captainRoleId)) return 'Captain';
    const ranks = [
      { live: 'BLOODED_ROLE', test: 'TEST_BLOODED_ROLE', label: 'Blooded' },
      { live: 'MARAUDER_ROLE', test: 'TEST_MARAUDER_ROLE', label: 'Marauder' },
      { live: 'CREW_ROLE', test: 'TEST_CREW_ROLE', label: 'Crew' },
      { live: 'PROSPECT_ROLE', test: 'TEST_PROSPECT_ROLE', label: 'Prospect' },
      { live: 'FRIENDLY_ROLE', test: 'TEST_FRIENDLY_ROLE', label: 'Friendly' },
    ];

    for (const r of ranks) {
      const id = process.env[isLive ? r.live : r.test];
      if (id && roleIds.has(id)) return r.label;
    }
    return null;
  } catch (e) {
    console.error('deriveRankLabel error:', e);
    return null;
  }
}
