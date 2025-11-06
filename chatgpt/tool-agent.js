// General tool-calling agent that lets the LLM judge intent and choose tools
// Covers: hit creation, market queries, piracy route advice, and general replies

const { sendResponse } = require('../threads/send-response.js');
const { createHitLog } = require('../api/hitTrackerApi.js');
const { getHitLogsByPatch, getAllHitLogs } = require('../api/hitTrackerApi.js');
const { getAllSummarizedItems, getAllSummarizedCommodities } = require('../api/uexApi.js');
const { getAllGameVersions } = require('../api/gameVersionApi.js');
const { handleHitPost } = require('../functions/post-new-hit.js');
const { bestBuyLocations, bestSellLocations, spotFor, bestProfitRoutes, mostActiveTerminals, bestOverallProfitRoute, mostMovement, summarizeMarket, bestBuyLocationsInSystem, bestSellLocationsInSystem, combinedProfitSuggestion, terminalDetail } = require('./market-answerer');
const { runWithResponses } = require('./responses-run.js');
const { piracyAdviceForRoute } = require('./piracy-route-advice');
const { getTopKFromKnowledgePiracy } = require('./retrieval');
const { getTopKPiracyMessages } = require('./retrieval');

// Lightweight per-user/channel session for multi-turn slot-filling
const sessions = new Map(); // key -> { messages, ts }
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessionKey = (message) => `${message.channelId}:${message.author?.id}`;
const getSession = (message) => {
  const s = sessions.get(sessionKey(message));
  if (!s) return null;
  if (Date.now() - (s.ts || 0) > SESSION_TTL_MS) { sessions.delete(sessionKey(message)); return null; }
  return s;
};
const rememberSession = (message, messages) => sessions.set(sessionKey(message), { messages, ts: Date.now() });
const clearSession = (message) => sessions.delete(sessionKey(message));

// --- Shared helpers (hit valuation) ---
const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function levenshtein(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function findBestCommodityMatch(name, catalogList) {
  const q = normalizeName(name);
  if (!q) return null;
  let exact = catalogList.find(c => c.norm === q);
  if (exact) return exact;
  let contains = catalogList.find(c => c.norm.includes(q) || q.includes(c.norm));
  if (contains) return contains;
  let best = null, bestDist = Infinity;
  for (const c of catalogList) {
    const d = levenshtein(q, c.norm);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  const threshold = Math.max(1, Math.floor(Math.min(q.length, best?.norm?.length || 0) * 0.35));
  if (best && bestDist <= threshold) return best;
  return null;
}
async function getPriceCatalog() {
  try {
    const [commodities, items] = await Promise.all([
      getAllSummarizedCommodities(),
      getAllSummarizedItems(),
    ]);
    const list = ([]).concat(commodities || [], items || []);
    const map = new Map();
    for (const it of list) {
      const name = it?.commodity_name || it?.name || '';
      const code = it?.commodity_code || it?.code || '';
      const normName = normalizeName(name);
      const normCode = normalizeName(code);
      if (normName) map.set(normName, it);
      if (normCode) map.set(normCode, it);
    }
    return map;
  } catch (e) {
    console.error('getPriceCatalog (tool-agent) failed:', e?.message || e);
    return new Map();
  }
}
async function computeTotalsAndEnrichCargo(cargoList, priceCatalog) {
  const enriched = [];
  let totalValue = 0, totalSCU = 0;
  const catalogList = Array.from(priceCatalog.entries()).map(([norm, entry]) => ({ norm, entry }));
  for (const it of cargoList || []) {
    const match = findBestCommodityMatch(it.commodity_name, catalogList);
    const entry = match?.entry || null;
    const avg = entry ? (Number(entry.price_sell_avg) === 0 ? Number(entry.price_buy_avg) : Number(entry.price_sell_avg)) : 0;
    const value = avg * Number(it.scuAmount || 0);
    totalSCU += Number(it.scuAmount || 0);
    totalValue += value;
    const officialName = entry?.commodity_name || entry?.name || it.commodity_name;
    const officialCode = entry?.commodity_code || entry?.code || null;
    enriched.push({ commodity_name: officialName, commodity_code: officialCode, scuAmount: Number(it.scuAmount || 0), avg_price: avg });
  }
  return { enrichedCargo: enriched, totalValue, totalSCU };
}
async function getLatestPatch() {
  try {
    const patches = await getAllGameVersions();
    if (!Array.isArray(patches) || !patches.length) return null;
    const latest = [...patches].sort((a,b) => (b.id||0) - (a.id||0))[0];
    return latest?.version || null;
  } catch { return null; }
}
const mentionsFromContent = (text) => {
  try { return Array.from(String(text || '').matchAll(/<@!?(\d+)>/g)).map(m => m[1]); } catch { return []; }
};

// Build the tool schema set
function getToolsSpec() {
  return [
    {
      type: 'function',
      function: {
        name: 'market_auto',
        description: 'Let the bot parse a free-form market/world question and choose the right dataset and metric automatically (buy/sell/spot/routes/activity/list).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The user\'s raw market/world question.' },
            top: { type: 'integer', minimum: 1, maximum: 20, default: 6 },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_catalog',
        description: 'Retrieve a slice of the cached item catalog and item categories for disambiguation. Provide optional prefix or keyword to filter. Use when user asks broadly for an armor set or vague item (e.g., just brand/set).',
        parameters: {
          type: 'object',
          properties: {
            prefix: { type: 'string', nullable: true, description: 'Optional case-insensitive prefix/keyword to narrow item names (e.g., Morozov)' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 60 },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_hit',
        description: 'Create a piracy hit-log entry. Ask the user for missing fields first.',
        parameters: {
          type: 'object',
          properties: {
            air_or_ground: { type: 'string', enum: ['Air', 'Ground', 'Mixed'] },
            cargo: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  commodity_name: { type: 'string' },
                  scuAmount: { type: 'number', minimum: 0.01 },
                },
                required: ['commodity_name', 'scuAmount'],
              },
            },
            assists: { type: 'array', items: { type: 'string' } },
            victims: { type: 'array', items: { type: 'string' }, description: 'Victim player names or orgs' },
            video_link: { type: 'string', nullable: true },
            patch: { type: 'string', nullable: true, description: 'Optional. Auto-fill with current game patch; do NOT ask the user for this.' },
          },
          required: ['air_or_ground', 'cargo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_summary',
        description: 'Combined market summary (buys, sells, routes) from a single consistent dataset.',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string' },
            location: { type: 'string', nullable: true },
            area_type: { type: 'string', nullable: true, enum: ['terminal','station','outpost','city','planet'] },
            top_buys: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
            top_sells: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
            top_routes: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
          required: ['item_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_best_buy',
        description: 'Top buy locations for a commodity/item.',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string' },
            location: { type: 'string', nullable: true },
            area_type: { type: 'string', nullable: true, enum: ['terminal','station','outpost','city','planet'], description: 'Limit results to specific area types' },
            top: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
          required: ['item_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_best_sell',
        description: 'Top sell locations for a commodity/item.',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string' },
            location: { type: 'string', nullable: true },
            area_type: { type: 'string', nullable: true, enum: ['terminal','station','outpost','city','planet'], description: 'Limit results to specific area types' },
            top: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
          required: ['item_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_terminal_detail',
        description: 'Detailed view for a single terminal about a specific item: prices, report counts, and SCU caps/stock. Use when user asks for reports or SCU volume at a named terminal.',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string' },
            terminal: { type: 'string', description: 'Terminal name or label (e.g., CRU-L5, MIC-L2, Shubin SCD-1)' },
            system: { type: 'string', nullable: true, description: 'Optional star system to disambiguate (e.g., Stanton)' },
            area_type: { type: 'string', nullable: true, enum: ['terminal','station','outpost','city','planet'] },
          },
          required: ['item_name', 'terminal'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_spot',
        description: 'Spot prices and locations for an item.',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string' },
            location: { type: 'string', nullable: true },
            area_type: { type: 'string', nullable: true, enum: ['terminal','station','outpost','city','planet'], description: 'Limit results to specific area types' },
            top: { type: 'integer', minimum: 1, maximum: 10, default: 6 },
          },
          required: ['item_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_route',
        description: 'Best profit routes for an item or overall if item_name="*".',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string', description: 'Commodity/item name or "*" for overall' },
            location: { type: 'string', nullable: true },
            area_type: { type: 'string', nullable: true, enum: ['terminal','station','outpost','city','planet'], description: 'Require both endpoints to match the area type' },
            top: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
          required: ['item_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'market_activity',
        description: 'Summarize market activity: busiest commodities or most active terminals (visitation frequency).',
        parameters: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['commodity','terminal'], default: 'terminal', description: 'terminal -> visitation frequency; commodity -> transaction volume' },
            location: { type: 'string', nullable: true },
            top: { type: 'integer', minimum: 1, maximum: 20, default: 7 },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'piracy_advice_for_route',
        description: 'Piracy advice for a route between two locations, optionally targeting an item.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            item_name: { type: 'string', nullable: true },
          },
          required: ['from', 'to'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'piracy_hotspots',
        description: 'Summarize recent piracy hotspots (active terminals likely to see freighter traffic). Use when the user asks generally for good pirate spots or where we have been pirating lately.',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', nullable: true, description: 'Optional system or area to filter by (e.g., Stanton, Pyro, Ruin Station).'},
            top: { type: 'integer', minimum: 1, maximum: 20, default: 7 },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'piracy_recent_hits',
        description: 'List the most recent piracy hits. Prefer filtering by the latest game patch automatically; do NOT ask the user for the patch.',
        parameters: {
          type: 'object',
          properties: {
            top: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
            // Optional override; normally auto-filled to latest patch
            patch: { type: 'string', nullable: true },
          },
          required: [],
        },
      },
    },
  ];
}

function buildSystemPrompt(extraContext = '') {
  return `You are RoboHound, a Discord bot for IronPoint operations. Judge intent and either:
- Answer directly in one or two short sentences (banter or simple info), OR
- Call exactly one tool with well-formed arguments.

Hit logging: If missing, ALWAYS ask whether the hit was Air, Ground, or Mixed, and collect cargo details. Prompt for victims if relevant. NEVER ask for patch/version; auto-fill the current patch.

Market questions:
1. Determine intent: best buy, best sell, spot prices, profit routes, refinery yields (refining/mining/ores), or activity.
2. If the user wants both pricing (buy/sell) and routes, prefer market_summary.
3. Item/commodity disambiguation MUST be LLM-driven: first normalize the user’s raw name (trim, lowercase). If unclear or could map to multiple items/variants (armor sets, gear families), call market_catalog with a prefix (e.g., brand or set) to retrieve candidates. Then:
   - If a close match exists (string similarity or semantic proximity) but confidence < ~0.85, ask the user to confirm: “Did you mean <A>, <B>, or something else?”.
   - If only one plausible candidate remains, proceed automatically.
   - Do NOT guess silently if multiple are plausible—ask for clarification briefly.
4. For misspellings (e.g., “Quantainium” vs “Quantanium”), attempt correction via catalog comparison BEFORE tool calls. If you correct, explicitly acknowledge once: “Assuming you meant Quantanium.”
5. If phrasing is broad or ambiguous, call market_auto with the raw question.
6. For refining/mining/ore yield questions, call market_auto.

 Terminal/quantity-specific queries:
 - If the user asks about a specific terminal’s report counts or SCU buy/sell volume/capacity for an item (e.g., “how many reports of X sold at CRU-L5?” or “what’s the total SCU sell volume at MIC-L2?”), call market_terminal_detail with item_name and terminal (optionally pass system if mentioned). The tool returns prices, report counts (price_buy_users_rows, price_sell_users_rows), and SCU caps/stock (scu_buy_max, scu_sell_max, scu_buy, scu_sell_stock). When the prices are averages, mention that explicitly by noting “(avg)” and include a brief confidence note.

Similarity guidance (LLM internal, do NOT expose formula): consider edit distance, token overlap, and semantic embedding. Favor exact token match > prefix > high semantic similarity. Reject candidates whose similarity is clearly lower than the best by a large margin (delta > 0.25).

Never hallucinate numeric market data—only report tool outputs. If tool output lacks structured per-terminal prices, you may summarize fallback guidance but do not invent terminals.

Piracy:
- If endpoints specified (from X to Y) and user seeks tactics/advice, call piracy_advice_for_route.
- If asking broadly for hotspots or where pirating occurs lately, call piracy_hotspots (pass system/location if mentioned).
- If asking for recent hits, call piracy_recent_hits (auto patch; don’t ask user).
If none fit, answer briefly using CONTEXT.
${extraContext ? `\nCONTEXT (snippets from org chat and knowledge—use as grounding, do not cite verbatim):\n${extraContext}` : ''}
Keep replies short and professional. Avoid pirate slang.`;
}

async function executeTool({ name, args, message, client, openai }) {
  try {
    if (name === 'market_auto') {
      const { autoAnswerMarketQuestion } = require('./market-dataset-router');
      if (!args.query) return { ok: false, error: 'query required' };
      const ans = await autoAnswerMarketQuestion({ query: args.query, top: Number(args.top || 6) });
      return { ok: true, text: ans.text, meta: ans.meta };
    }
    if (name === 'market_catalog') {
      const { getCache } = require('./data-cache');
      const cache = getCache();
      const norm = (s) => String(s||'').trim().toLowerCase();
      const prefix = norm(args?.prefix || '');
      const limit = Math.max(1, Math.min(200, Number(args?.limit || 60)));
      const items = Array.isArray(cache?.itemsCatalog) ? cache.itemsCatalog : [];
      const cats = Array.isArray(cache?.itemCategories) ? cache.itemCategories : [];
      // Filter items by prefix/keyword (in name or category_name)
      let filtered = items;
      if (prefix) {
        filtered = items.filter(it => {
          const name = norm(it?.name);
          const cat = norm(it?.category_name || '');
          const section = norm(it?.section || '');
          return name.includes(prefix) || cat.includes(prefix) || section.includes(prefix);
        });
      }
      // Map to compact shape
      const rows = filtered.slice(0, limit).map(it => ({
        id: it.id,
        name: it.name,
        category: it.category_name || null,
        section: it.section || null,
        type: it.type || null,
        is_commodity: Boolean(it.is_commodity),
        is_harvestable: Boolean(it.is_harvestable),
      }));
      // Categories compact list
      const categories = cats.map(c => ({ id: c.id, name: c.name, type: c.type, section: c.section, is_game_related: Boolean(c.is_game_related), is_mining: Boolean(c.is_mining) }));
      return { ok: true, json: { items: rows, categories } };
    }
    if (name === 'create_hit') {
      const missing = [];
      if (!args.air_or_ground) missing.push('air_or_ground');
      if (!Array.isArray(args.cargo) || !args.cargo.length) missing.push('cargo');
      if (missing.length) return { ok: false, error: `Missing required: ${missing.join(', ')}` };
      const priceCatalog = await getPriceCatalog();
      const { enrichedCargo, totalValue, totalSCU } = await computeTotalsAndEnrichCargo(args.cargo, priceCatalog);
      const latestPatch = args.patch || await getLatestPatch();
      // Build assists list first to compute shares correctly
      // Build and scrub assists list (remove the bot if present)
      const rawAssists = (Array.isArray(args.assists) && args.assists.length ? args.assists : mentionsFromContent(message.content)) || [];
      const botId = client?.user?.id ? String(client.user.id) : null;
      const assistsList = Array.from(new Set(rawAssists.filter(id => id && String(id) !== botId)));
      const shares = Math.max(1, (assistsList?.length || 0) + 1);
      const normalizedAOG = String(args.air_or_ground || '').trim().toLowerCase(); // 'air' | 'ground' | 'mixed'
      const totalCutValue = Number(totalValue || 0) / shares;
      const totalCutSCU = Number(totalSCU || 0) / shares;

      // Generate a brief story from the user's message
      let storyText = message.content || 'Logged via chat';
      try {
        const summary = await runWithResponses({
          openai,
          formattedUserMessage: `Summarize this hit as 2-3 concise sentences, neutral professional tone, no pirate slang. Include outcome and key cargo if relevant.\n\nUser description:\n${message.content || ''}`,
          guildId: message.guildId || message.guild?.id,
          channelId: message.channelId,
          rank: message.member?.roles?.highest?.name || undefined,
          contextSnippets: [
            `Air/Ground: ${normalizedAOG || 'unknown'}`,
            `Total SCU: ${Math.round(Number(totalSCU||0))}`,
            `Cargo: ${(enrichedCargo||[]).map(c=>`${c.scuAmount} SCU ${c.commodity_name}`).join(', ')}`,
          ],
        });
        if (typeof summary === 'string' && summary.trim()) storyText = summary.trim();
      } catch {}

      const payload = {
        id: Date.now(),
        user_id: message.author?.id,
        username: message.author?.username,
        nickname: message.member?.nickname || null,
        air_or_ground: normalizedAOG || args.air_or_ground,
        cargo: enrichedCargo,
        total_value: Math.round(Number(totalValue || 0)),
        total_cut_value: Math.round(totalCutValue * 100) / 100,
        total_scu: Math.round(Number(totalSCU || 0)),
        total_cut_scu: Math.round(totalCutSCU * 100) / 100,
        patch: latestPatch || undefined,
        assists: assistsList,
        victims: Array.isArray(args.victims) ? args.victims.filter(v=>v && String(v).trim()).map(String) : undefined,
        video_link: args.video_link || undefined,
        title: `Hit: ${Math.round(Number(totalSCU||0))} SCU ${enrichedCargo?.[0]?.commodity_name || ''}`.trim(),
        story: storyText,
        type_of_piracy: args.air_or_ground,
        timestamp: new Date().toISOString(),
        fleet_activity: false,
      };
      try {
        if (process.env.DEBUG_HIT_LOGS === '1') {
          const typeSummary = Object.fromEntries(Object.entries(payload).map(([k,v]) => [k, Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v)]));
          console.log('[tool-agent] create_hit payload types:', JSON.stringify(typeSummary));
          console.log('[tool-agent] create_hit payload snapshot:', JSON.stringify({
            id: payload.id,
            user_id: payload.user_id,
            air_or_ground: payload.air_or_ground,
            total_value: payload.total_value,
            total_cut_value: payload.total_cut_value,
            total_scu: payload.total_scu,
            total_cut_scu: payload.total_cut_scu,
            patch: payload.patch,
            cargo_len: Array.isArray(payload.cargo) ? payload.cargo.length : undefined,
            assists_len: Array.isArray(payload.assists) ? payload.assists.length : undefined,
          }));
        }
      } catch {}
      const created = await createHitLog(payload).catch(e => { console.error('[tool-agent] createHitLog threw:', e?.message || e); return null; });
      if (!created) {
        console.error('[tool-agent] createHitLog returned null (likely API 500). See previous logs for payload.');
        return { ok: false, error: 'API createHitLog failed' };
      }
      try {
        if (!created.thread_id && !created.threadId) {
          await handleHitPost(client, openai, { ...payload, ...created });
        }
      } catch (e) { console.error('handleHitPost (tool-agent) failed:', e?.message || e); }
      return { ok: true, created };
    }
    if (name === 'market_best_buy') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      // System-aware routing: if location looks like a star system, prefer system-scoped helper
      const locRaw = args.location || '';
      const locNorm = String(locRaw).trim().toLowerCase();
      const looksSystem = /stanton|pyro|nyx|terra|hurston|microtech|arcCorp|crusader/.test(locNorm);
      const ans = looksSystem
        ? await bestBuyLocationsInSystem({ name: args.item_name, system: locRaw, top: Number(args.top || 5), areaType: args.area_type || null })
        : await bestBuyLocations({ name: args.item_name, top: Number(args.top || 5), location: args.location || null, areaType: args.area_type || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_best_sell') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      const locRaw = args.location || '';
      const locNorm = String(locRaw).trim().toLowerCase();
      const looksSystem = /stanton|pyro|nyx|terra|hurston|microtech|arcCorp|crusader/.test(locNorm);
      const ans = looksSystem
        ? await bestSellLocationsInSystem({ name: args.item_name, system: locRaw, top: Number(args.top || 5), areaType: args.area_type || null })
        : await bestSellLocations({ name: args.item_name, top: Number(args.top || 5), location: args.location || null, areaType: args.area_type || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_terminal_detail') {
      if (!args.item_name || !args.terminal) return { ok: false, error: 'item_name and terminal required' };
      const ans = await terminalDetail({ name: args.item_name, terminal: args.terminal, system: args.system || null, areaType: args.area_type || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_spot') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      const ans = await spotFor({ name: args.item_name, top: Number(args.top || 6), location: args.location || null, areaType: args.area_type || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_route') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      if (args.item_name === '*') {
        const ans = await bestOverallProfitRoute({ top: Number(args.top || 5), location: args.location || null });
        return { ok: true, text: ans.text };
      }
      // If user passes location that's a system and wants a single-item profit suggestion, prefer combined suggestion (simpler route)
      const locRaw = args.location || '';
      const locNorm = String(locRaw).trim().toLowerCase();
      const looksSystem = /stanton|pyro|nyx|terra|hurston|microtech|arcCorp|crusader/.test(locNorm);
      // Parse SCU quantity from the user's message to scale margins
      const parseScu = (text) => {
        try {
          const t = String(text || '');
          const matches = Array.from(t.matchAll(/(\d+(?:\.\d+)?)\s*scu\b/ig)).map(m => Number(m[1]));
          if (matches.length) return Math.max(...matches.filter(n => isFinite(n)));
          return null;
        } catch { return null; }
      };
      const quantity = parseScu(message?.content || '');
      const ans = looksSystem
        ? await combinedProfitSuggestion({ name: args.item_name, system: locRaw, quantity })
        : await bestProfitRoutes({ name: args.item_name, top: Number(args.top || 5), location: args.location || null, areaType: args.area_type || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_summary') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      const ans = await summarizeMarket({
        name: args.item_name,
        location: args.location || null,
        areaType: args.area_type || null,
        topBuys: Number(args.top_buys || 5),
        topSells: Number(args.top_sells || 5),
        topRoutes: Number(args.top_routes || 5),
      });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_activity') {
      const scope = args.scope || 'terminal';
      const location = args.location || null;
      const top = Number(args.top || (scope === 'terminal' ? 10 : 7));
      if (scope === 'terminal') {
        const ans = await mostActiveTerminals({ top, location });
        return { ok: true, text: ans.text };
      }
      const ans = await mostMovement({ scope: 'commodity', top, location });
      return { ok: true, text: ans.text };
    }
    if (name === 'piracy_hotspots') {
      const location = args.location || null;
      const top = Number(args.top || 7);
      const ans = await mostActiveTerminals({ top, location });
      // Slightly relabel to make it fit piracy framing
      const lines = (ans.text || '').split('\n');
      if (lines.length > 0) lines[0] = 'Recent piracy hotspots (high-traffic terminals):';
      return { ok: true, text: lines.join('\n') };
    }
    if (name === 'piracy_recent_hits') {
      // Prefer latest patch; fall back to global latest hits
      const top = Math.max(1, Math.min(20, Number(args.top || 5)));
      let patch = args.patch || null;
      try { patch = patch || (await getLatestPatch()); } catch {}
      let rows = [];
      try {
        if (patch) rows = await getHitLogsByPatch(patch) || [];
        if (!rows || !rows.length) rows = await getAllHitLogs() || [];
      } catch {}
      if (!Array.isArray(rows) || !rows.length) return { ok: false, error: 'No hits available' };
      const getTime = (h) => { try { return new Date(h.created_at || h.createdAt || h.timestamp || 0).getTime(); } catch { return 0; } };
      const sorted = rows.slice().sort((a,b)=> getTime(b)-getTime(a));
      const take = sorted.slice(0, top);
      const parts = [];
      parts.push(`Most recent hits${patch ? ` (patch ${patch})` : ''}:`);
      for (const h of take) {
        const dt = (()=>{ try { const d = new Date(h.created_at || h.createdAt || h.timestamp); return isFinite(d) ? d.toISOString().slice(0,10) : ''; } catch { return ''; } })();
        const title = h.title || `Hit #${h.id}`;
        const val = Math.round(Number(h.total_value ?? h.total_cut_value ?? 0)).toLocaleString();
        const scu = Math.round(Number(h.total_scu ?? 0)).toLocaleString();
        parts.push(`- ${dt ? dt+' — ' : ''}${title}: ${val} aUEC over ${scu} SCU`);
      }
      return { ok: true, text: parts.join('\n') };
    }
    if (name === 'piracy_advice_for_route') {
      if (!args.from || !args.to) return { ok: false, error: 'from and to required' };
      const ans = await piracyAdviceForRoute({ from: args.from, to: args.to, item: args.item_name || null });
      return { ok: true, text: ans.text };
    }
    return { ok: false, error: `Unknown tool ${name}` };
  } catch (e) {
    return { ok: false, error: e?.message || 'Tool execution failed' };
  }
}

async function runToolAgent(message, client, openai) {
  try {
    if (!openai?.chat?.completions?.create) return false;
    // Lightweight piracy-advice detection and grounding context
    const content = String(message.content || '');
    const looksAdvice = /(advice|tips|how\s+do\s+i|how\s+should\s+i|best\s+way|where\s+should\s+i|what\s+should\s+i\s+do)/i.test(content);
    const looksPiracy = /(piracy|pirate|interdict|snare|ambush|camp|board|hit\b|freighter|hauler)/i.test(content);
    let extraContext = '';
    if (looksAdvice && looksPiracy) {
      try {
        const [msgSnips, knSnips] = await Promise.all([
          getTopKPiracyMessages(content, 4),
          getTopKFromKnowledgePiracy({ query: content, k: 3, openai, guildId: message.guild?.id, preferVector: true }),
        ]);
        const snippets = ([]).concat(msgSnips || [], knSnips || []);
        if (snippets.length) extraContext = snippets.join('\n');
      } catch {}
    }

    const system = buildSystemPrompt(extraContext);
    const tools = getToolsSpec();

    const s = getSession(message);
  const messages = [ { role: 'system', content: system } ];
    if (s?.messages && Array.isArray(s.messages)) messages.push(...s.messages);
    messages.push({ role: 'user', content: message.content || '' });

    let responded = false;
    for (let turn = 0; turn < 3; turn++) {
      const resp = await openai.chat.completions.create({
        model: process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
      });
      const msg = resp.choices?.[0]?.message;
      if (!msg) break;

      // If tool calls requested
      const calls = msg.tool_calls || [];
      if (calls.length > 0) {
        messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
        for (const call of calls) {
          const name = call.function?.name;
          let args = {};
          try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
          const result = await executeTool({ name, args, message, client, openai });
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result) });
        }
        continue; // let the model produce a final reply
      }

      // Normal text answer
      const text = (msg.content || '').trim();
      if (text) {
        await sendResponse(message, text, true);
        responded = true;
        const keep = /\?|reply|respond|confirm|air|ground|mixed|scu|cargo|buy|sell|route|price|market/i.test(text);
        const newHistory = (s?.messages || []).concat([{ role: 'user', content: message.content || '' }, { role: 'assistant', content: text }]);
        if (keep) rememberSession(message, newHistory.slice(-8)); else clearSession(message);
      }
      break;
    }

    return responded;
  } catch (e) {
    console.error('runToolAgent error:', e?.response?.data || e?.message || e);
    return false;
  }
}

module.exports = { runToolAgent };
