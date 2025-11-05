// General tool-calling agent that lets the LLM judge intent and choose tools
// Covers: hit creation, market queries, piracy route advice, and general replies

const { sendResponse } = require('../threads/send-response.js');
const { createHitLog } = require('../api/hitTrackerApi.js');
const { getAllSummarizedItems, getAllSummarizedCommodities } = require('../api/uexApi.js');
const { getAllGameVersions } = require('../api/gameVersionApi.js');
const { handleHitPost } = require('../functions/post-new-hit.js');
const { bestBuyLocations, bestSellLocations, spotFor, bestProfitRoutes, mostActiveTerminals, bestOverallProfitRoute } = require('./market-answerer');
const { runWithResponses } = require('./responses-run.js');
const { piracyAdviceForRoute } = require('./piracy-route-advice');

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
        name: 'market_best_buy',
        description: 'Top buy locations for a commodity/item.',
        parameters: {
          type: 'object',
          properties: {
            item_name: { type: 'string' },
            location: { type: 'string', nullable: true },
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
            top: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
          required: ['item_name'],
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
            top: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
          required: ['item_name'],
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
  ];
}

function buildSystemPrompt() {
  return `You are RoboHound, a Discord bot for IronPoint operations. Judge the user's intent and either:
- Answer directly in one or two short sentences (banter or simple info), or
- Call exactly one tool with well-formed arguments.
For hit logging: if missing, ALWAYS ask the user to confirm whether the hit was Air, Ground, or Mixed, and collect cargo details. Prompt for victim names if mentioned or relevant. NEVER ask for patch/version; auto-fill the current patch.
Keep replies short and professional. Avoid pirate slang.`;
}

async function executeTool({ name, args, message, client, openai }) {
  try {
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
      const ans = await bestBuyLocations({ name: args.item_name, top: Number(args.top || 5), location: args.location || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_best_sell') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      const ans = await bestSellLocations({ name: args.item_name, top: Number(args.top || 5), location: args.location || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_spot') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      const ans = await spotFor({ name: args.item_name, top: Number(args.top || 6), location: args.location || null });
      return { ok: true, text: ans.text };
    }
    if (name === 'market_route') {
      if (!args.item_name) return { ok: false, error: 'item_name required' };
      if (args.item_name === '*') {
        const ans = await bestOverallProfitRoute({ top: Number(args.top || 5), location: args.location || null });
        return { ok: true, text: ans.text };
      }
      const ans = await bestProfitRoutes({ name: args.item_name, top: Number(args.top || 5), location: args.location || null });
      return { ok: true, text: ans.text };
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

    const system = buildSystemPrompt();
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
