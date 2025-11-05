// Tool-calling agent for hit creation via Chat Completions function-calling
// Keeps a short per-user session to support multi-turn slot filling.

const { sendResponse } = require('../threads/send-response.js');
const { createHitLog } = require('../api/hitTrackerApi.js');
const { getAllSummarizedItems, getAllSummarizedCommodities } = require('../api/uexApi.js');
const { getAllGameVersions } = require('../api/gameVersionApi.js');
const { handleHitPost } = require('../functions/post-new-hit.js');
const { runWithResponses } = require('./responses-run.js');

// In-memory session store: channelId:userId -> { messages, ts }
const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000;

function sessionKey(message) {
  return `${message.channelId}:${message.author?.id}`;
}

function getSession(message) {
  const key = sessionKey(message);
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() - (s.ts || 0) > SESSION_TTL_MS) { sessions.delete(key); return null; }
  return s;
}

function rememberSession(message, messages) {
  const key = sessionKey(message);
  sessions.set(key, { messages, ts: Date.now() });
}

function clearSession(message) {
  const key = sessionKey(message);
  sessions.delete(key);
}

// Helpers for pricing/valuation similar to handler.js
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
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
    console.error('getPriceCatalog (tool agent) failed:', e?.message || e);
    return new Map();
  }
}

async function computeTotalsAndEnrichCargo(cargoList, priceCatalog) {
  const enriched = [];
  let totalValue = 0;
  let totalSCU = 0;
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
  } catch (e) { return null; }
}

function mentionsFromContent(text) {
  try {
    return Array.from(String(text || '').matchAll(/<@!?(\d+)>/g)).map(m => m[1]);
  } catch { return []; }
}

// Optional heuristic (no longer used by default). Kept for reference or fallback.
function looksLikeHitMessage(text) {
  const s = String(text || '').toLowerCase();
  return /(\bhit\b|\bpiracy\b|\bscu\b|\bcargo\b)/.test(s);
}

// Main entry: returns true if it responded (handled), else false
async function runHitToolAgent(message, client, openai) {
  try {
    if (!openai?.chat?.completions?.create) return false; // require tool calling via Chat Completions

  // Engage unconditionally so the LLM can judge the intent.
  // If not hit-related, the model must respond with the exact token __NO_HIT__,
  // and we will yield control back to the legacy handler.

    // Build tools spec
    const tools = [
      {
        type: 'function',
        function: {
          name: 'create_hit',
          description: 'Create a piracy hit-log entry. Ask the user for any missing fields before calling this.',
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
              assists: { type: 'array', items: { type: 'string' }, description: 'Discord user IDs' },
              victims: { type: 'array', items: { type: 'string' }, description: 'Victim player names or orgs' },
              video_link: { type: 'string', nullable: true },
              patch: { type: 'string', nullable: true, description: 'Optional. Auto-fill with current game patch; do NOT ask the user.' },
            },
            required: ['air_or_ground', 'cargo'],
          },
        },
      },
    ];

    // System: coach the model to do slot-filling then tool call
  const system = `You are RoboHound, a Discord bot for Star Citizen piracy ops.
- Judge intent yourself.
- For hit logging, ALWAYS confirm whether the hit was Air, Ground, or Mixed. Collect cargo details. Ask for victim names if mentioned or relevant. Then call create_hit once ready.
- Never ask the user for the patch/version. You will auto-fill the current patch from the game versions.
- If the message is NOT about creating/logging a piracy hit, reply with exactly this token and nothing else: __NO_HIT__
- Keep replies short and professional. Avoid pirate slang.`;

    // Load session if any
    const s = getSession(message);
    const messages = [ { role: 'system', content: system } ];
    if (s?.messages && Array.isArray(s.messages)) messages.push(...s.messages);
    messages.push({ role: 'user', content: message.content || '' });

    // Run up to 3 tool-calling turns in this invocation
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

      // Tool calls
      const calls = msg.tool_calls || [];
      if (calls.length > 0) {
        messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
        for (const call of calls) {
          const name = call.function?.name;
          let args = {};
          try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}

          if (name === 'create_hit') {
            // If missing required args, return an error so the model asks for them
            const missing = [];
            if (!args.air_or_ground) missing.push('air_or_ground');
            if (!Array.isArray(args.cargo) || !args.cargo.length) missing.push('cargo');
            if (missing.length) {
              messages.push({
                role: 'tool',
                tool_call_id: call.id,
                name,
                content: JSON.stringify({ ok: false, error: `Missing required: ${missing.join(', ')}` }),
              });
              continue;
            }

            // Compute totals and enrich
            const priceCatalog = await getPriceCatalog();
            const { enrichedCargo, totalValue, totalSCU } = await computeTotalsAndEnrichCargo(args.cargo, priceCatalog);
            const latestPatch = args.patch || await getLatestPatch();

            // Build assists list and compute shares/cuts
            const rawAssists = (Array.isArray(args.assists) && args.assists.length ? args.assists : mentionsFromContent(message.content)) || [];
            const botId = client?.user?.id ? String(client.user.id) : null;
            const assistsList = Array.from(new Set(rawAssists.filter(id => id && String(id) !== botId)));
            const shares = Math.max(1, (assistsList.length || 0) + 1);
            const normalizedAOG = String(args.air_or_ground || '').trim().toLowerCase();
            const totalCutValue = Number(totalValue || 0) / shares;
            const totalCutSCU = Number(totalSCU || 0) / shares;

            // Build payload for your API
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
              story: message.content || 'Logged via chat',
              type_of_piracy: args.air_or_ground,
              timestamp: new Date().toISOString(),
              fleet_activity: false,
            };

            let created = null;
            try {
              // Generate a concise story before sending
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
                if (typeof summary === 'string' && summary.trim()) payload.story = summary.trim();
              } catch {}
              try {
                if (process.env.DEBUG_HIT_LOGS === '1') {
                  const typeSummary = Object.fromEntries(Object.entries(payload).map(([k,v]) => [k, Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v)]));
                  console.log('[tool-hit-agent] create_hit payload types:', JSON.stringify(typeSummary));
                  console.log('[tool-hit-agent] create_hit payload snapshot:', JSON.stringify({
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
              created = await createHitLog(payload);
            } catch (e) {
              messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify({ ok: false, error: e?.message || 'Failed to create hit.' }) });
              continue;
            }
            if (!created) {
              console.error('[tool-hit-agent] createHitLog returned null (likely API 500). Check payload logs above.');
              messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify({ ok: false, error: 'API createHitLog failed' }) });
              continue;
            }

            try {
              if (!created.thread_id && !created.threadId) {
                await handleHitPost(client, openai, { ...payload, ...created });
              }
            } catch (e) { console.error('handleHitPost (tool agent) failed:', e?.message || e); }

            messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify({ ok: true, created }) });
          } else {
            messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify({ ok: false, error: `Unknown tool ${name}` }) });
          }
        }
        // Continue to let the model synthesize a reply after tools
        continue;
      }

      // No tool calls: normal assistant text
      if (typeof msg.content === 'string' && msg.content.trim()) {
        const text = msg.content.trim();
        if (text === '__NO_HIT__') {
          // Not a hit intent; do not respond here. Let legacy handler proceed.
          responded = false;
          // Do not alter session for non-hit intents
        } else {
          await sendResponse(message, text, true);
          responded = true;
          // Keep the session if the model appears to be asking a follow-up (contains '?'), else clear
          const keep = /\?|reply|respond|confirm|air|ground|mixed|scu|cargo/i.test(text);
          const newHistory = (s?.messages || []).concat([{ role: 'user', content: message.content || '' }, { role: 'assistant', content: text }]);
          if (keep) rememberSession(message, newHistory.slice(-8)); else clearSession(message);
        }
        break;
      }

      break;
    }

    return responded;
  } catch (e) {
    console.error('runHitToolAgent error:', e?.response?.data || e?.message || e);
    return false;
  }
}

module.exports = { runHitToolAgent };
