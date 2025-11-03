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
  const isPiracySpots = routed?.intent === 'piracy.spots';
  const useAutoRouter = ((process.env.AUTO_ROUTER_ENABLED || 'true').toLowerCase() === 'true') && (!routed?.intent || routed.intent === 'other' || (Number(routed?.confidence || 0) < 0.7));
  const autoPlan = useAutoRouter ? await autoPlanRetrieval(openai, formattedMessage) : null;

  // Small talk / banter: reply lightly without retrieval or knowledge search
  if (routed?.intent === 'chat.banter') {
    const s = String(message.content || '').toLowerCase();
    const reply = (function() {
      // Thanks / gratitude
      if (/(^|\b)(thanks|thank\s*you|ty|thx|appreciate\s*it|much\s*appreciated)(\b|!|\.)/i.test(s)) {
        return "You're welcome! o7";
      }
      // Apologies
      if (/(^|\b)(sorry|my\s*bad|oops|whoops)(\b|!|\.)/i.test(s)) {
        return "No worries.";
      }
      // Farewells
      if (/(^|\b)(bye|good\s*night|goodnight|gn|good\s*morning|gm|good\s*evening|ge|cya|see\s*ya|later|l8r|brb|gtg|g2g)(\b|!|\.)/i.test(s)) {
        return "Catch you later!";
      }
      // Jokes
      if (/(tell\s*me\s*a\s*joke|make\s*me\s*laugh|another\s*joke|got\s*jokes?)/i.test(s)) {
        const jokes = [
          "Why did the developer go broke? Because they used up all their cache.",
          "I told my rig a joke about UDP… it didn't get it, but maybe it will later.",
          "What do you call 8 hobbits? A hobbyte.",
        ];
        return jokes[(new Date().getSeconds()) % jokes.length];
      }
      // Persona / preferences (keep concise)
      if (/(who\s*are\s*you|what\s*are\s*you|are\s*you\s*(alive|real)|do\s*you\s*sleep|do\s*you\s*eat)/i.test(s)) {
        return "I'm Beowulf — here to help with org info, piracy logs, market lookups, and quick answers.";
      }
      if (/(what\s*(is|\'s)\s*your\s*favo(u)?rite|do\s*you\s*like|what\s*do\s*you\s*think\s*about)/i.test(s)) {
        return "I don't have personal tastes, but I'm happy to help you decide.";
      }
      // Roasts / light insults — keep it friendly and deflect
      if (/(noob|trash|garbage|skill\s*issue|git\s*gud|cope|seethe|mald|ratio\b|cry\s*about\s*it|you\s*suck|loser|clown|bozo|npc\b|ez\b|u\s*mad)/i.test(s)) {
        return "Keeping it friendly over here. Need anything useful from me?";
      }
      // General small talk
      if (/(how\s*(are|r)\s*(you|ya)|how\s*('?s| is)\s*(it|it going|things|everything)|how\s*(you|ya)\s*(doing|doin')|how\s*are\s*you\s*handling\s*(today|tonight|this))/i.test(s)) {
        const opts = [
          "Doing well and ready to help — what can I do for you?",
          "All systems green. How can I help today?",
          "Holding steady. Need anything?",
        ];
        return opts[(new Date().getSeconds()) % opts.length];
      }
      // Default light banter
      const defaults = [
        "Here and listening. How can I help?",
        "I'm here. Need a hand with anything?",
        "Present and accounted for. What's up?",
      ];
      return defaults[(new Date().getSeconds()) % defaults.length];
    })();

    await sendResponse(message, reply, true);
    return;
  }

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
  const { bestBuyLocations, bestSellLocations, spotFor, mostMovement, bestProfitRoutes } = require('./market-answerer');
  const {
    starSystemDetails,
    listStarSystems,
    searchStarSystems,
    recentStarSystemChanges,
    starSystemFactionSummary,
    starSystemJurisdictionSummary,
  } = require('./star-systems-answerer');
  const {
    spaceStationDetails,
    listSpaceStations,
    searchSpaceStations,
    recentSpaceStationChanges,
  } = require('./space-stations-answerer');
  const {
    planetDetails,
    listPlanets,
    searchPlanets,
    recentPlanetChanges,
    planetFactionSummary,
    planetJurisdictionSummary,
  } = require('./planets-answerer');
  const {
    outpostDetails,
    listOutposts,
    searchOutposts,
    recentOutpostChanges,
    outpostFactionSummary,
    outpostJurisdictionSummary,
  } = require('./outposts-answerer');

  // Track retrieval results by bucket for grounding decisions
  let autoPlanMessages = [];
  let autoPlanKnowledge = [];
  let dogfightMessages = [];
  let dogfightKnowledge = [];
  let generalMessages = [];
  let generalKnowledge = [];

  // Pre-fetch targeted retrieval for piracy.spots so we can enforce grounding if nothing found
  let piracySpotsMessages = [];
  let piracySpotsKnowledge = [];
  if (isPiracySpots) {
    try {
      piracySpotsMessages = await getTopK({
        query: buildPiracySpotsQuery(message.content, routed?.filters),
        k: 8,
        sources: ['messages'],
        openai,
        guildId: message.guild?.id,
        // Search org-wide for spot discussions; do not constrain to channel
        preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
        temporalHint: true,
      });
    } catch {}
    try {
      piracySpotsKnowledge = await getTopKFromKnowledgePiracy({
        query: buildPiracySpotsQuery(message.content, routed?.filters),
        k: 4,
        openai,
        guildId: message.guild?.id,
        preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
      });
    } catch {}
  }

  // Market and items: direct API answers (non-vector) for structured queries
  if (routed?.intent === 'item.buy') {
    const name = routed?.filters?.item_name || '';
    const location = routed?.filters?.location_name || null;
    if (!name) {
      await sendResponse(message, 'What item or commodity do you want to buy?', true);
      return;
    }
    try {
      const ans = await bestBuyLocations({ name, top: 5, location });
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('item.buy failed:', e?.response?.data || e?.message || e);
    }
  }
  if (routed?.intent === 'item.sell') {
    const name = routed?.filters?.item_name || '';
    const location = routed?.filters?.location_name || null;
    if (!name) {
      await sendResponse(message, 'What item or commodity do you want to sell?', true);
      return;
    }
    try {
      const ans = await bestSellLocations({ name, top: 5, location });
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('item.sell failed:', e?.response?.data || e?.message || e);
    }
  }
  if (routed?.intent === 'market.spot') {
    const name = routed?.filters?.item_name || '';
    const location = routed?.filters?.location_name || null;
    if (!name) {
      await sendResponse(message, 'Which item or commodity do you want spot prices for?', true);
      return;
    }
    try {
      const ans = await spotFor({ name, top: 6, location });
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('market.spot failed:', e?.response?.data || e?.message || e);
    }
  }
  if (routed?.intent === 'market.route') {
    const name = routed?.filters?.item_name || '';
    const location = routed?.filters?.location_name || null;
    if (!name) {
      await sendResponse(message, 'Which item or commodity do you want a profit route for?', true);
      return;
    }
    try {
      const ans = await bestProfitRoutes({ name, top: 5, location });
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('market.route failed:', e?.response?.data || e?.message || e);
    }
  }
  if (routed?.intent === 'market.activity' || /most\s+(movement|active)|transactions?/.test(message.content || '')) {
    try {
      const location = routed?.filters?.location_name || null;
      const scope = routed?.filters?.scope || (/(?:\bby\s+terminal\b|\bper\s+terminal\b|\bterminals?\b|\bstations?\b)/i.test(message.content || '') ? 'terminal' : 'commodity');
      const ans = await mostMovement({ scope, top: 7, location });
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('market.activity failed:', e?.response?.data || e?.message || e);
    }
  }

  // Star systems: info, lists, availability, wiki, faction/jurisdiction, search, changes, default
  if (routed?.intent && routed.intent.startsWith('starsystem.')) {
    try {
      if (routed.intent === 'starsystem.info' || routed.intent === 'starsystem.wiki' || routed.intent === 'starsystem.availability') {
        const system_name = routed?.filters?.system_name || null;
        const system_code = routed?.filters?.system_code || null;
        const ans = await starSystemDetails({ name: system_name, code: system_code });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'starsystem.list' || routed.intent === 'starsystem.default') {
        const liveOnly = Boolean(routed?.filters?.live_only);
        const visibleOnly = Boolean(routed?.filters?.visible_only);
        const defaultOnly = routed.intent === 'starsystem.default' ? true : Boolean(routed?.filters?.default_only);
        const ans = await listStarSystems({ liveOnly, visibleOnly, defaultOnly, top: 50 });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'starsystem.search') {
        const q = routed?.filters?.query || routed?.filters?.system_name || '';
        const ans = await searchStarSystems({ query: q, top: 12 });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'starsystem.changes') {
        const { date_start, date_end } = routed?.filters || {};
        const ans = await recentStarSystemChanges({ date_start, date_end });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'starsystem.faction') {
        const system_name = routed?.filters?.system_name || null;
        if (system_name) {
          const ans = await starSystemDetails({ name: system_name });
          await sendResponse(message, ans.text, true);
        } else {
          const ans = await starSystemFactionSummary();
          await sendResponse(message, ans.text, true);
        }
        return;
      }
      if (routed.intent === 'starsystem.jurisdiction') {
        const system_name = routed?.filters?.system_name || null;
        if (system_name) {
          const ans = await starSystemDetails({ name: system_name });
          await sendResponse(message, ans.text, true);
        } else {
          const ans = await starSystemJurisdictionSummary();
          await sendResponse(message, ans.text, true);
        }
        return;
      }
    } catch (e) {
      console.error('starsystem handling failed:', e?.response?.data || e?.message || e);
      // fall through
    }
  }

  // Space stations: info, lists, availability/features, search, changes, default
  if (routed?.intent && routed.intent.startsWith('spacestation.')) {
    try {
      if (routed.intent === 'spacestation.info' || routed.intent === 'spacestation.availability') {
        const station_name = routed?.filters?.station_name || null;
        const ans = await spaceStationDetails({ name: station_name });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'spacestation.list' || routed.intent === 'spacestation.default') {
        const filters = { ...routed?.filters };
        if (routed.intent === 'spacestation.default') filters.is_default = true;
        const ans = await listSpaceStations({ filters, top: 50 });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'spacestation.features') {
        const station_name = routed?.filters?.station_name || null;
        if (station_name) {
          const ans = await spaceStationDetails({ name: station_name });
          await sendResponse(message, ans.text, true);
        } else {
          const filters = { ...routed?.filters };
          const ans = await listSpaceStations({ filters, top: 30 });
          await sendResponse(message, ans.text, true);
        }
        return;
      }
      if (routed.intent === 'spacestation.search') {
        const q = routed?.filters?.query || routed?.filters?.station_name || '';
        const location_name = routed?.filters?.location_name || null;
        const ans = await searchSpaceStations({ query: q, top: 12, location_name });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'spacestation.changes') {
        const { date_start, date_end } = routed?.filters || {};
        const ans = await recentSpaceStationChanges({ date_start, date_end });
        await sendResponse(message, ans.text, true);
        return;
      }
    } catch (e) {
      console.error('spacestation handling failed:', e?.response?.data || e?.message || e);
      // fall through
    }
  }

  // Planets: info, list, availability, search, changes, default, faction/jurisdiction
  if (routed?.intent && routed.intent.startsWith('planet.')) {
    try {
      if (routed.intent === 'planet.info' || routed.intent === 'planet.availability') {
        const planet_name = routed?.filters?.planet_name || null;
        const planet_code = routed?.filters?.planet_code || null;
        const system_name = routed?.filters?.system_name || null;
        const ans = await planetDetails({ name: planet_name, code: planet_code, system_name });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'planet.list' || routed.intent === 'planet.default') {
        const filters = { ...routed?.filters };
        if (routed.intent === 'planet.default') filters.is_default = true;
        const ans = await listPlanets({ filters, top: 50 });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'planet.search') {
        const q = routed?.filters?.query || routed?.filters?.planet_name || '';
        const system_name = routed?.filters?.system_name || null;
        const ans = await searchPlanets({ query: q, top: 12, system_name });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'planet.changes') {
        const { date_start, date_end } = routed?.filters || {};
        const ans = await recentPlanetChanges({ date_start, date_end });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'planet.faction') {
        const planet_name = routed?.filters?.planet_name || null;
        if (planet_name) {
          const ans = await planetDetails({ name: planet_name });
          await sendResponse(message, ans.text, true);
        } else {
          const ans = await planetFactionSummary();
          await sendResponse(message, ans.text, true);
        }
        return;
      }
      if (routed.intent === 'planet.jurisdiction') {
        const planet_name = routed?.filters?.planet_name || null;
        if (planet_name) {
          const ans = await planetDetails({ name: planet_name });
          await sendResponse(message, ans.text, true);
        } else {
          const ans = await planetJurisdictionSummary();
          await sendResponse(message, ans.text, true);
        }
        return;
      }
    } catch (e) {
      console.error('planet handling failed:', e?.response?.data || e?.message || e);
      // fall through
    }
  }

  // Outposts: info, list, availability, features, search, changes, default, faction/jurisdiction
  if (routed?.intent && routed.intent.startsWith('outpost.')) {
    try {
      if (routed.intent === 'outpost.info' || routed.intent === 'outpost.availability') {
        const outpost_name = routed?.filters?.outpost_name || null;
        const ans = await outpostDetails({ name: outpost_name });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'outpost.list' || routed.intent === 'outpost.default') {
        const filters = { ...routed?.filters };
        if (routed.intent === 'outpost.default') filters.is_default = true;
        const ans = await listOutposts({ filters, top: 50 });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'outpost.features') {
        const outpost_name = routed?.filters?.outpost_name || null;
        if (outpost_name) {
          const ans = await outpostDetails({ name: outpost_name });
          await sendResponse(message, ans.text, true);
        } else {
          const filters = { ...routed?.filters };
          const ans = await listOutposts({ filters, top: 30 });
          await sendResponse(message, ans.text, true);
        }
        return;
      }
      if (routed.intent === 'outpost.search') {
        const q = routed?.filters?.query || routed?.filters?.outpost_name || '';
        const location_name = routed?.filters?.location_name || null;
        const ans = await searchOutposts({ query: q, top: 12, location_name });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'outpost.changes') {
        const { date_start, date_end } = routed?.filters || {};
        const ans = await recentOutpostChanges({ date_start, date_end });
        await sendResponse(message, ans.text, true);
        return;
      }
      if (routed.intent === 'outpost.faction') {
        const outpost_name = routed?.filters?.outpost_name || null;
        if (outpost_name) {
          const ans = await outpostDetails({ name: outpost_name });
          await sendResponse(message, ans.text, true);
        } else {
          const ans = await outpostFactionSummary();
          await sendResponse(message, ans.text, true);
        }
        return;
      }
      if (routed.intent === 'outpost.jurisdiction') {
        const outpost_name = routed?.filters?.outpost_name || null;
        if (outpost_name) {
          const ans = await outpostDetails({ name: outpost_name });
          await sendResponse(message, ans.text, true);
        } else {
          const ans = await outpostJurisdictionSummary();
          await sendResponse(message, ans.text, true);
        }
        return;
      }
    } catch (e) {
      console.error('outpost handling failed:', e?.response?.data || e?.message || e);
      // fall through
    }
  }


  // Auto-router driven retrieval (messages first, then knowledge) when applicable
  if (autoPlan) {
    try {
      if (autoPlan.sources?.includes('messages')) {
        autoPlanMessages = await getTopK({
          query: autoPlan.query || message.content,
          k: autoPlan.k_messages || 6,
          sources: ['messages'],
          openai,
          guildId: message.guild?.id,
          channelId: autoPlan.prefer_channel ? message.channelId : undefined,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: Boolean(autoPlan.temporalHint),
        });
      }
    } catch {}
    try {
      if (autoPlan.sources?.includes('knowledge')) {
        autoPlanKnowledge = await getTopK({
          query: autoPlan.query || message.content,
          k: autoPlan.k_knowledge || 4,
          sources: ['knowledge'],
          openai,
          guildId: message.guild?.id,
          channelId: message.channelId,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: Boolean(autoPlan.temporalHint),
        });
      }
    } catch {}
  }

  // Dogfighting specific retrieval buckets
  if (isDogfightingIntent) {
    try {
      dogfightMessages = await getTopK({
        query: buildDogfightingQuery(message.content, routed?.intent, routed?.filters),
        k: 6,
        sources: ['messages'],
        openai,
        guildId: message.guild?.id,
        channelId: message.channelId,
        preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
        temporalHint: false,
      });
    } catch {}
    try {
      if (/dogfighting\.(equipment|meta|ships)/.test(routed?.intent || '')) {
        dogfightKnowledge = await getTopK({
          query: buildDogfightingQuery(message.content, routed?.intent, routed?.filters),
          k: 3,
          sources: ['knowledge'],
          openai,
          guildId: message.guild?.id,
          channelId: message.channelId,
          preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
          temporalHint: false,
        });
      }
    } catch {}
  }

  // General info retrieval split across messages and knowledge for better grounding and counts
  if ((routed?.intent === 'general.info') || (!isPiracyIntent && looksInfoSeeking)) {
    try {
      generalMessages = await getTopK({
        query: message.content,
        k: 4,
        sources: ['messages'],
        openai,
        guildId: message.guild?.id,
        channelId: message.channelId,
        preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
        temporalHint: asksRecentActivity,
      });
    } catch {}
    try {
      generalKnowledge = await getTopK({
        query: message.content,
        k: 3,
        sources: ['knowledge'],
        openai,
        guildId: message.guild?.id,
        channelId: message.channelId,
        preferVector: (process.env.KNOWLEDGE_PREFER_VECTOR || 'true').toLowerCase() === 'true',
        temporalHint: asksRecentActivity,
      });
    } catch {}
  }

  const anyRetrieval = [
    piracySpotsMessages, piracySpotsKnowledge,
    autoPlanMessages, autoPlanKnowledge,
    dogfightMessages, dogfightKnowledge,
    generalMessages, generalKnowledge,
  ].some(arr => Array.isArray(arr) && arr.length > 0);

  // Send typing indicator and run via Responses API
  message.channel.sendTyping();
  // Build context snippets with light logging for diagnostics
  const contextParts = [
        // Grounding instruction for any retrieval-backed answer
        ...(anyRetrieval ? [
          'Grounding: Use only information found in the following snippets from chat and knowledge. If nothing relevant is found to answer the question, say you do not have enough recent info instead of guessing.',
        ] : []),
        ...(latestHit ? [latestHit] : []),
        // For piracy-specific questions, avoid chat snippets to reduce noise
        ...(!isPiracyIntent && recentSnippet ? [recentSnippet] : []),
        ...(!isPiracyIntent && recentActivity ? [recentActivity] : []),
        // For piracy.spots, include targeted results explicitly
        ...(isPiracySpots ? piracySpotsMessages : []),
        ...(isPiracySpots ? piracySpotsKnowledge : []),
        // Auto-plan results
        ...(autoPlanMessages || []),
        ...(autoPlanKnowledge || []),
        // Dogfighting buckets
        ...(dogfightMessages || []),
        ...(dogfightKnowledge || []),
        // If router says this is a piracy-related ask, add top piracy knowledge snippets (guild-wide)
        ...((routed?.intent || '').startsWith('piracy.') && !isPiracySpots ? await getTopKFromKnowledgePiracy({
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
        // General info buckets
        ...(generalMessages || []),
        ...(generalKnowledge || []),
  ];
  if ((process.env.DEBUG_RETRIEVAL || 'false').toLowerCase() === 'true') {
    try {
      console.log('[retrieval] intent=', routed?.intent, 'conf=', routed?.confidence, 'piracyIntent=', isPiracyIntent, 'piracySpots=', isPiracySpots, 'dogfightingIntent=', isDogfightingIntent, 'autoUsed=', Boolean(autoPlan));
      console.log('[retrieval] counts:', {
        piracySpotsMessages: piracySpotsMessages.length,
        piracySpotsKnowledge: piracySpotsKnowledge.length,
        autoPlanMessages: autoPlanMessages.length,
        autoPlanKnowledge: autoPlanKnowledge.length,
        dogfightMessages: dogfightMessages.length,
        dogfightKnowledge: dogfightKnowledge.length,
        generalMessages: generalMessages.length,
        generalKnowledge: generalKnowledge.length,
      });
      console.log('[retrieval] contextParts count=', contextParts.length);
      for (let i = 0; i < Math.min(5, contextParts.length); i++) {
        console.log(`[retrieval] part[${i}]`, String(contextParts[i]).slice(0, 200));
      }
    } catch {}
  }

  // If this was a piracy.spots ask and we found no relevant context, avoid fabricating
  if (isPiracySpots && (!piracySpotsMessages?.length && !piracySpotsKnowledge?.length)) {
    await sendResponse(message, 'I couldn\'t find recent chat or knowledge about current piracy spots. If you can hint a region, system, or route, I can look again.', true);
    return;
  }

  // Generic guardrail: for info-seeking asks with zero retrieval results, avoid guessing
  const intentName = routed?.intent || '';
  const likelyInfoSeeking = looksInfoSeeking || /^(general\.info|market\.|item\.|location\.|dogfighting\.|piracy\.)/.test(intentName);
  const excludedHandled = intentName === 'piracy.stats' || intentName === 'piracy.latest' || intentName === 'piracy.summary';
  if (likelyInfoSeeking && !excludedHandled && !anyRetrieval) {
    await sendResponse(message, 'I couldn\'t find enough relevant chat or knowledge to answer confidently. Add a timeframe, location, or specific target and I\'ll search again.', true);
    return;
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

// Helper: focused query for piracy spot discovery
function buildPiracySpotsQuery(content, filters) {
  try {
    const s = String(content || '');
    const time = (filters?.date_start && filters?.date_end) ? `time:${filters.date_start}..${filters.date_end}` : 'recent';
    const focus = 'piracy spot spots hotspot hot spots location route lane where to pirate targets shipping lanes';
    const loc = String(filters?.location_name || '').trim();
    const locTag = loc ? `loc:${loc}` : '';
    return [s, focus, time, locTag].filter(Boolean).join(' ');
  } catch {
    return String(content || '');
  }
}

// LLM self-query auto-router: judges category and retrieval plan, produces enriched query
async function autoPlanRetrieval(openai, content) {
  try {
    if (!openai) return null;
    const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
    const system = 'You are a retrieval planner for a Discord bot. Classify the user message into a broad category and decide whether to search recent chats, knowledge docs, or both. Extract concise keywords and entities (e.g., ship names, item names) and produce one focused search query string. Output compact JSON only.';
    const schema = {
      category: 'one of: dogfighting, piracy, market, chat, users, general',
      sources: 'array including any of: messages, knowledge',
      prefer_channel: 'boolean if channel-local chat should be prioritized',
      temporalHint: 'boolean if recency matters based on phrasing (today, this week, etc.)',
      query: 'string to use for retrieval',
      keywords: 'array of short keywords',
      ship_name: 'optional string',
      item_name: 'optional string',
      k_messages: 'optional integer 1..10',
      k_knowledge: 'optional integer 1..10',
    };
    const user = `Message: ${content}\nReturn JSON with fields: ${JSON.stringify(Object.keys(schema))}.`;
    let out = null;
    if (openai?.responses?.create) {
      const res = await openai.responses.create({
        model,
        input: [
          { role: 'system', content: [{ type: 'text', text: system }] },
          { role: 'user', content: [{ type: 'text', text: `Schema: ${JSON.stringify(schema)}` }] },
          { role: 'user', content: [{ type: 'text', text: user }] },
        ],
      });
      out = res.output_text?.trim?.();
    } else if (openai?.chat?.completions?.create) {
      const resp = await openai.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: user },
        ],
      });
      out = resp.choices?.[0]?.message?.content?.trim();
    }
    if (!out) return null;
    try {
      const plan = JSON.parse(out);
      // Normalize sources
      const sources = Array.isArray(plan.sources) ? plan.sources.filter(v => v === 'messages' || v === 'knowledge') : ['messages'];
      return {
        category: plan.category || 'general',
        sources: sources.length ? sources : ['messages'],
        prefer_channel: Boolean(plan.prefer_channel),
        temporalHint: Boolean(plan.temporalHint),
        query: String(plan.query || '').slice(0, 400) || String(content || ''),
        keywords: Array.isArray(plan.keywords) ? plan.keywords.slice(0, 8) : [],
        ship_name: plan.ship_name || null,
        item_name: plan.item_name || null,
        k_messages: Math.max(1, Math.min(10, Number(plan.k_messages || 6))) || 6,
        k_knowledge: Math.max(1, Math.min(10, Number(plan.k_knowledge || 4))) || 4,
      };
    } catch {
      return null;
    }
  } catch (e) {
    console.error('autoPlanRetrieval error:', e?.response?.data || e?.message || e);
    return null;
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
