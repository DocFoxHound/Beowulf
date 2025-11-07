// New ChatGPT entrypoint: Responses-only flow (no Assistants/threads)

const { sendResponse } = require('../threads/send-response.js');
const { runWithResponses } = require('./responses-run.js');
const { getUserById } = require('../api/userlistApi.js');
const { ChatLogsModel } = require('../api/models/chat-logs');
const { getAllHitLogs, getHitLogByThreadId, getHitLogsByUserId, getHitLogByEntryId, editHitLog, deleteHitLog } = require('../api/hitTrackerApi.js');
const { listKnowledge } = require('../api/knowledgeApi.js');
const { createHitLog } = require('../api/hitTrackerApi.js');
const { getAllGameVersions } = require('../api/gameVersionApi.js');
const { getAllSummarizedItems, getAllSummarizedCommodities } = require('../api/uexApi.js');
const { handleHitPost, handleHitPostUpdate } = require('../functions/post-new-hit.js');
const { handleHitPostDelete } = require('../functions/post-new-hit.js');
// Cache helpers for categories/items and fallback summaries
const { maybeLoadOnce: cacheMaybeLoadOnce, refreshFromUex: cacheRefreshFromUex, getCache } = require('./data-cache');

// Lightweight memory to reduce repetitive quick-replies in banter flows
const lastQuickReplies = new Map(); // key: channelId:userId -> { text, ts }
// Remember last market query context per user/channel for follow-up questions like "and in Pyro?"
const lastMarketContext = new Map(); // key: channelId:userId -> { intent, item_name, location, ts }
// Maintain conversational hit-drafts per user/channel to complete missing fields across messages
const lastHitDrafts = new Map(); // key: channelId:userId -> { draft, awaiting, ts }
const editHitSessions = new Map(); // key: threadChannelId -> { hit, patch, awaiting, ts, user_id }

function marketContextKey(message) {
  return `${message.channelId}:${message.author?.id}`;
}

function rememberMarketContext(message, intent, item_name, location) {
  try {
    const key = marketContextKey(message);
    lastMarketContext.set(key, { intent, item_name, location: location || null, ts: Date.now() });
  } catch {}
}

function hitDraftKey(message) {
  return `${message.channelId}:${message.author?.id}`;
}

function rememberHitDraft(message, draft) {
  try {
    const key = hitDraftKey(message);
    lastHitDrafts.set(key, { ...draft, ts: Date.now() });
  } catch {}
}

function getHitDraft(message) {
  const key = hitDraftKey(message);
  const entry = lastHitDrafts.get(key);
  if (!entry) return null;
  // TTL 10 minutes
  if (Date.now() - (entry.ts || 0) > 10 * 60 * 1000) {
    lastHitDrafts.delete(key);
    return null;
  }
  return entry;
}

function clearHitDraft(message) {
  const key = hitDraftKey(message);
  lastHitDrafts.delete(key);
}

function getEditSession(message) {
  return editHitSessions.get(message.channelId) || null;
}
function rememberEditSession(message, sess) {
  if (!sess) return;
  editHitSessions.set(message.channelId, { ...sess, ts: Date.now() });
}
function clearEditSession(message) {
  editHitSessions.delete(message.channelId);
}

// Permission helper: Blooded role elevated rights
function hasBloodedRole(member) {
  try {
    if (!member?.roles?.cache) return false;
    const isLive = process.env.LIVE_ENVIRONMENT === 'true';
    const roleId = process.env[isLive ? 'BLOODED_ROLE' : 'TEST_BLOODED_ROLE'];
    if (!roleId) return false;
    return member.roles.cache.has(roleId);
  } catch { return false; }
}

// Helpers for hit parsing/valuation
const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function getPriceCatalog() {
  try {
    const [commodities, items] = await Promise.all([
      getAllSummarizedCommodities(),
      getAllSummarizedItems(),
    ]);
    let list = ([]).concat(commodities || [], items || []);
    // Fallback to in-memory cache summaries if API/DB returns nothing
    if (!list.length) {
      try {
        await cacheMaybeLoadOnce();
        const cache = getCache();
        const cs = Array.isArray(cache?.commoditiesSummary) ? cache.commoditiesSummary : [];
        const is = Array.isArray(cache?.itemsSummary) ? cache.itemsSummary : [];
        list = ([]).concat(cs, is);
        if (!list.length) {
          // Try a direct UEX refresh as last resort
          await cacheRefreshFromUex();
          const cache2 = getCache();
          const cs2 = Array.isArray(cache2?.commoditiesSummary) ? cache2.commoditiesSummary : [];
          const is2 = Array.isArray(cache2?.itemsSummary) ? cache2.itemsSummary : [];
          list = ([]).concat(cs2, is2);
        }
      } catch {}
    }
    const map = new Map();
    for (const it of list) {
      const key = normalizeName(it.commodity_name || it.name);
      if (!key) continue;
      map.set(key, it);
    }
    return map;
  } catch (e) {
    console.error('getPriceCatalog failed:', e?.message || e);
    return new Map();
  }
}

function extractCargoFromText(text) {
  const s = String(text || '');
  const items = [];
  try {
    // 120 scu of quantanium
    const re1 = /(\d{1,6}(?:\.\d+)?)\s*(?:scu|u|units)\s*(?:of\s+)?([a-z][a-z0-9\- '\/]{2,40})/gi;
    let m;
    while ((m = re1.exec(s)) !== null) items.push({ commodity_name: m[2].trim(), scuAmount: Number(m[1]) });
    // quantanium x 120 scu
    const re2 = /\b([a-z][a-z0-9\- '\/]{2,40})\b\s*[x×*]\s*(\d{1,6}(?:\.\d+)?)\s*(?:scu|u|units)\b/gi;
    while ((m = re2.exec(s)) !== null) items.push({ commodity_name: m[1].trim(), scuAmount: Number(m[2]) });
  } catch {}
  // Merge duplicates of same commodity
  const byName = new Map();
  for (const it of items) {
    const key = normalizeName(it.commodity_name);
    const prev = byName.get(key);
    if (prev) prev.scuAmount += it.scuAmount; else byName.set(key, { ...it });
  }
  return Array.from(byName.values());
}

function detectAirOrGround(text) {
  const s = String(text || '').toLowerCase();
  const g = /(\bfps\b|\bfoot\b|\bground\b|\bon\s*foot\b|\bon\s*the\s*ground\b)/.test(s);
  const a = /(\bspace\b|\bair\b|\bflight\b|\bflying\b|\bship\b|\binterdict(?:ed|ion)?\b|\bsnare\b)/.test(s);
  if (/\bmixed\b/.test(s) || (g && a)) return 'Mixed';
  if (g) return 'Ground';
  if (a) return 'Air';
  return undefined;
}

function extractMentionsFromContent(text) {
  try {
    return Array.from(String(text || '').matchAll(/<@!?(\d+)>/g)).map(m => m[1]);
  } catch { return []; }
}

function extractVideoLink(text) {
  return (String(text || '').match(/https?:\/\/\S+/i) || [])[0] || null;
}

async function getLatestPatch() {
  try {
    const patches = await getAllGameVersions();
    if (!Array.isArray(patches) || !patches.length) return null;
    const latest = [...patches].sort((a,b) => (b.id||0) - (a.id||0))[0];
    return latest?.version || null;
  } catch { return null; }
}

// --- Quick edit parsing (single-message intents like "edit the total value to 14000") ---
function parseQuickEdit(text) {
  const raw = String(text || '');
  // Remove mentions/channels/roles to avoid grabbing snowflake IDs
  const cleaned = raw
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/https?:\/\/\S+/gi, '');

  // Prefer patterns where the number appears AFTER the target field keyword
  const valAfter = cleaned.match(/(?:^|\b)(?:total\s*value|value)\s*(?:to|=|:)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (valAfter) {
    const n = Number(valAfter[1].replace(/,/g, ''));
    if (Number.isFinite(n) && String(Math.trunc(n)).length < 13) {
      return { field: 'total_value', value: Math.round(n) };
    }
  }
  // Or the number appears BEFORE the keyword (e.g., "14000 value")
  const valBefore = cleaned.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:total\s*value|value)\b/i);
  if (valBefore) {
    const n = Number(valBefore[1].replace(/,/g, ''));
    if (Number.isFinite(n) && String(Math.trunc(n)).length < 13) {
      return { field: 'total_value', value: Math.round(n) };
    }
  }

  // SCU edits
  const scuAfter = cleaned.match(/(?:^|\b)(?:total\s*scu|scu\s*total|total\s*units?|scu)\s*(?:to|=|:)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (scuAfter) {
    const n = Number(scuAfter[1].replace(/,/g, ''));
    if (Number.isFinite(n) && String(Math.trunc(n)).length < 10) {
      return { field: 'total_scu', value: Math.round(n) };
    }
  }
  const scuBefore = cleaned.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:total\s*scu|scu\s*total|total\s*units?|scu)\b/i);
  if (scuBefore) {
    const n = Number(scuBefore[1].replace(/,/g, ''));
    if (Number.isFinite(n) && String(Math.trunc(n)).length < 10) {
      return { field: 'total_scu', value: Math.round(n) };
    }
  }
  return null;
}

function parseHitId(text) {
  const m = String(text || '').match(/\b(?:hit\s*#?|id\s*#?|#)(\d{3,})\b/i);
  return m ? Number(m[1]) : null;
}

// Robustly extract a numeric Hit ID from varied API shapes
function getResolvedHitId(hit) {
  try {
    const candidates = [
      hit?.id,
      hit?.entry_id,
      hit?.entryId,
      hit?.HitTrackId,
      hit?.HitLogId,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  } catch {
    return null;
  }
}

// Basic Levenshtein distance for fuzzy matching
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
  // exact first
  let exact = catalogList.find(c => c.norm === q);
  if (exact) return exact;
  // contains/starts-with heuristics
  let contains = catalogList.find(c => c.norm.includes(q) || q.includes(c.norm));
  if (contains) return contains;
  // Levenshtein with threshold relative to length
  let best = null, bestDist = Infinity;
  for (const c of catalogList) {
    const d = levenshtein(q, c.norm);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  const threshold = Math.max(1, Math.floor(Math.min(q.length, best?.norm?.length || 0) * 0.35));
  if (best && bestDist <= threshold) return best;
  return null;
}

function getTopSuggestions(name, catalogList, topN = 5) {
  const q = normalizeName(name);
  const scored = catalogList.map(c => ({ c, d: levenshtein(q, c.norm) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, topN)
    .map(({ c, d }) => ({
      commodity_name: c.entry?.commodity_name || c.entry?.name || c.norm,
      commodity_code: c.entry?.commodity_code || c.entry?.code || null,
      norm: c.norm,
      distance: d,
    }));
  return scored;
}

async function computeTotalsAndEnrichCargo(cargoList, priceCatalog) {
  const enriched = [];
  let unknown = [];
  let ambiguous = [];
  let totalValue = 0;
  let totalSCU = 0;
  // Build list view from map for fuzzy search
  const catalogList = Array.from(priceCatalog.entries()).map(([norm, entry]) => ({ norm, entry }));
  for (const it of cargoList || []) {
    const match = findBestCommodityMatch(it.commodity_name, catalogList);
    const entry = match?.entry || null;
    const avg = entry ? (Number(entry.price_sell_avg) === 0 ? Number(entry.price_buy_avg) : Number(entry.price_sell_avg)) : 0;
    const value = avg * Number(it.scuAmount || 0);
    totalSCU += Number(it.scuAmount || 0);
    totalValue += value;
    // Prefer catalog's official name/code if we matched; include both name and code
    const officialName = entry?.commodity_name || entry?.name || it.commodity_name;
    const officialCode = entry?.commodity_code || entry?.code || null;
    enriched.push({ commodity_name: officialName, commodity_code: officialCode, scuAmount: it.scuAmount, avg_price: avg });
    if (!entry) {
      unknown.push(it.commodity_name);
      // prepare suggestions (top 5)
      const suggestions = getTopSuggestions(it.commodity_name, catalogList, 5);
      ambiguous.push({ input_name: it.commodity_name, norm: normalizeName(it.commodity_name), suggestions });
    }
  }
  return { enrichedCargo: enriched, totalValue, totalSCU, unknownItems: Array.from(new Set(unknown)), ambiguous };
}

// LLM-based extractor to enrich hit details from free-form text
async function llmExtractHitFields(openai, content) {
  try {
    if ((process.env.HIT_LLM_EXTRACT || 'true').toLowerCase() === 'false') return null;
    const sys = 'You extract structured hit log details from casual chat. Output STRICT JSON with fields: { air_or_ground: "Air|Ground|Mixed|null", cargo: [{ name: string, scu: number }], video_link: string|null, title: string|null, story: string|null }. \n- Infer Air vs Ground vs Mixed from context; if unsure, null.\n- Parse cargo like "120 scu quant", "quant x 120 scu" into items. Sum duplicates. Use plain commodity names, no codes.\n- video_link: a URL if present, else null.\n- title/story: brief and clean; keep story under 280 chars.';
    const usr = `Message:\n${content}`;
    // Prefer Responses API when available; fall back to Chat Completions
    if (openai?.responses?.create) {
      const res = await openai.responses.create({
        model: process.env.OPENAI_RESPONSES_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        input: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
      });
      const txt = res?.output?.[0]?.content?.[0]?.text || res?.output_text || '';
      try {
        const obj = JSON.parse(txt);
        const cargo = Array.isArray(obj?.cargo) ? obj.cargo.map(i => ({ commodity_name: String(i.name||'').trim(), scuAmount: Number(i.scu)||0 })).filter(i=>i.commodity_name && i.scuAmount>0) : [];
        const aog = obj?.air_or_ground && ['Air','Ground','Mixed'].includes(obj.air_or_ground) ? obj.air_or_ground : null;
        const video = obj?.video_link && /^https?:\/\//i.test(obj.video_link) ? obj.video_link : null;
        const title = obj?.title ? String(obj.title).slice(0, 80) : null;
        const story = obj?.story ? String(obj.story).slice(0, 280) : null;
        return { air_or_ground: aog, cargo, video_link: video, title, story };
      } catch { return null; }
    } else if (openai?.chat?.completions?.create) {
      const resp = await openai.chat.completions.create({
        model: process.env.OPENAI_RESPONSES_MODEL || process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
      });
      const out = resp?.choices?.[0]?.message?.content || '';
      try {
        const obj = JSON.parse(out);
        const cargo = Array.isArray(obj?.cargo) ? obj.cargo.map(i => ({ commodity_name: String(i.name||'').trim(), scuAmount: Number(i.scu)||0 })).filter(i=>i.commodity_name && i.scuAmount>0) : [];
        const aog = obj?.air_or_ground && ['Air','Ground','Mixed'].includes(obj.air_or_ground) ? obj.air_or_ground : null;
        const video = obj?.video_link && /^https?:\/\//i.test(obj.video_link) ? obj.video_link : null;
        const title = obj?.title ? String(obj.title).slice(0, 80) : null;
        const story = obj?.story ? String(obj.story).slice(0, 280) : null;
        return { air_or_ground: aog, cargo, video_link: video, title, story };
      } catch { return null; }
    } else {
      // No compatible OpenAI client available
      return null;
    }
  } catch (e) {
    console.error('llmExtractHitFields failed:', e?.message || e);
    return null;
  }
}

function pickDifferent(arr, avoid) {
  if (!Array.isArray(arr) || !arr.length) return '';
  if (!avoid) return arr[Math.floor(Math.random() * arr.length)];
  const filtered = arr.filter(v => v !== avoid);
  if (filtered.length === 0) return arr[Math.floor(Math.random() * arr.length)];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

async function handleBotConversation(message, client, openai, preloadedDbTables) {
  try {
    // Ignore own messages (defensive)
    const isBot = message.author.id === client.user.id;
    if (isBot) return;

  // Ultra-fast quick-edit lane anywhere: only trigger when there's an explicit edit verb
    try {
      const contentStr = String(message.content || '');
      const looksEditVerb = /(\b|^)(edit|update|change|fix|adjust|modify)(\b|$)/i.test(contentStr);
      if (looksEditVerb) {
        const quick = parseQuickEdit(contentStr);
        if (quick) {
        // Resolve target hit: preference order -> current thread -> explicit id in text -> most recent hit by this user
        let hit = null;
        // If this channel is a thread that equals a hit thread_id
        try { hit = await getHitLogByThreadId(message.channelId); } catch {}
        if (!hit) {
          const id = parseHitId(contentStr);
          if (id) {
            try { hit = await getHitLogByEntryId(id); } catch {}
          }
        }
        if (!hit) {
          try {
            const list = await getHitLogsByUserId(message.author?.id);
            if (Array.isArray(list) && list.length) {
              hit = list.slice().sort((a,b)=>{
                const ta = new Date(a.created_at || a.createdAt || 0).getTime();
                const tb = new Date(b.created_at || b.createdAt || 0).getTime();
                if (tb !== ta) return tb - ta;
                return (Number(b.id||0) - Number(a.id||0));
              })[0];
            }
          } catch {}
        }
        if (!hit) {
          // No target: fall through to normal flows
          } else {
          const ownerId = String(hit.user_id || '');
          const authorId = String(message.author?.id || '');
          if (!ownerId || (ownerId !== authorId && !hasBloodedRole(message.member))) {
            await sendResponse(message, 'Only the original author or Blooded role can edit this hit.', true);
            return;
          }
          // Build patch and recompute cuts based on current assists
          const patch = {};
          if (quick.field === 'total_value') {
            patch.total_value = quick.value;
            try {
              const assists = Array.isArray(hit.assists) ? hit.assists : [];
              const botId = client?.user?.id ? String(client.user.id) : null;
              const cleanAssists = botId ? assists.filter(id => String(id) !== botId) : assists;
              const shares = Math.max(1, (cleanAssists.length || 0) + 1);
              patch.total_cut_value = Math.round((quick.value / shares) * 100) / 100;
            } catch {}
          }
          if (quick.field === 'total_scu') {
            patch.total_scu = quick.value;
            try {
              const assists = Array.isArray(hit.assists) ? hit.assists : [];
              const botId = client?.user?.id ? String(client.user.id) : null;
              const cleanAssists = botId ? assists.filter(id => String(id) !== botId) : assists;
              const shares = Math.max(1, (cleanAssists.length || 0) + 1);
              patch.total_cut_scu = Math.round((quick.value / shares) * 100) / 100;
            } catch {}
          }
          const resolvedId = getResolvedHitId(hit);
          const ok = resolvedId ? await editHitLog(resolvedId, patch).catch(()=>false) : false;
          if (ok) {
            try { const { handleHitPostUpdate } = require('../functions/post-new-hit.js'); await handleHitPostUpdate(client, hit, { ...hit, ...patch }); } catch {}
            await sendResponse(message, `Updated hit #${hit.id}: set ${quick.field.replace('_',' ')} to ${quick.value}.`, true);
          } else {
            await sendResponse(message, 'I could not update that right now. Try again shortly.', true);
          }
          return; // handled
          }
        }
      }
    } catch (e) { /* non-fatal */ }

    // Quick delete lane: recognize "delete/remove hit" and act if owner
    try {
      const contentStr = String(message.content || '');
      const looksDeleteVerb = /(\b|^)(delete|remove|erase|drop)(\b|$)/i.test(contentStr) && /(\bhit\b|\bhit\s*#?\d+)/i.test(contentStr);
      if (looksDeleteVerb) {
        // Resolve target hit: prefer current thread, then explicit id, then most recent by user
        let hit = null;
        try { hit = await getHitLogByThreadId(message.channelId); } catch {}
        // Fallback: if direct thread lookup failed, scan all for matching thread_id
        if (!hit) {
          try {
            const all = await getAllHitLogs();
            if (Array.isArray(all)) {
              hit = all.find(h => String(h.thread_id || h.threadId || '') === String(message.channelId));
            }
          } catch {}
        }
        if (!hit) {
          const id = parseHitId(contentStr);
          if (id) {
            try { hit = await getHitLogByEntryId(id); } catch {}
          }
        }
        if (!hit) {
          try {
            const list = await getHitLogsByUserId(message.author?.id);
            if (Array.isArray(list) && list.length) {
              hit = list.slice().sort((a,b)=>{
                const ta = new Date(a.created_at || a.createdAt || 0).getTime();
                const tb = new Date(b.created_at || b.createdAt || 0).getTime();
                if (tb !== ta) return tb - ta;
                return (Number(b.id||0) - Number(a.id||0));
              })[0];
            }
          } catch {}
        }
        if (!hit) {
          await sendResponse(message, "I couldn't find a hit to delete. Try this inside the hit's thread or say 'delete hit #<id>'.", true);
          return; // handled
        }
        const ownerId = String(hit.user_id || '');
        const authorId = String(message.author?.id || '');
        if (!ownerId || (ownerId !== authorId && !hasBloodedRole(message.member))) {
          await sendResponse(message, 'Only the original author or Blooded role can delete this hit.', true);
          return; // handled
        }
        const resolvedId = getResolvedHitId(hit);
        if (!resolvedId) {
          if (process.env.DEBUG_HIT_LOGS === '1') {
            console.error('[deleteHit] Could not resolve hit id from object:', {
              id: hit?.id, entry_id: hit?.entry_id, entryId: hit?.entryId,
              thread_id: hit?.thread_id || hit?.threadId,
            });
          }
          await sendResponse(message, "I couldn't determine the hit ID for deletion. Please try 'delete hit #<id>'.", true);
          return;
        }
        const ok = await deleteHitLog(resolvedId).catch(()=>false);
        if (ok) {
          try {
            await handleHitPostDelete(client, { ...hit, deleted_by: message.author?.id, deleted_by_username: message.author?.username, deleted_by_nickname: message.member?.nickname || null });
          } catch (e) { console.error('post delete embed failed:', e?.message || e); }
          await sendResponse(message, `Removed hit #${resolvedId} from the database. The thread remains for history.`, true);
        } else {
          await sendResponse(message, 'I could not delete that right now. Try again shortly.', true);
        }
        return; // handled
      }
    } catch (e) { /* non-fatal */ }

    // Fast-path: if user asks to edit/update and we're in a hit thread, start edit session BEFORE multi-tool agent
    try {
      const looksEditAsk = /(edit|update|fix|change)\s+(this\s+)?hit\b|^\s*(edit|update)\b/i.test(message.content || '');
      if (looksEditAsk) {
        let hit = await getHitLogByThreadId(message.channelId).catch(()=>null);
        if (!hit) {
          try {
            const all = await getAllHitLogs();
            if (Array.isArray(all)) {
              hit = all.find(h => String(h.thread_id || h.threadId || '') === String(message.channelId));
            }
          } catch {}
        }
        if (hit && (String(hit.thread_id||'') === String(message.channelId))) {
          const ownerId = String(hit.user_id || '');
          const authorId = String(message.author?.id || '');
          if (ownerId && (ownerId === authorId || hasBloodedRole(message.member))) {
            rememberEditSession(message, { hit, patch: {}, awaiting: 'field', user_id: ownerId });
            await sendResponse(message, "You have permission to edit this hit. What would you like to change? Options: value, SCU, cargo, type (air/ground/mixed), assists, victims, title, story, video. Reply 'submit' to save or 'cancel' to abort.", true);
            return; // intercept so tool-agent doesn't start a new create flow
          }
        }
      }
    } catch (e) { /* non-fatal */ }

  // Primary: LLM multi-tool agent handles all intents (hit, market, piracy advice, banter, etc.)
  try {
    if ((process.env.TOOL_AGENT_ENABLED || 'true').toLowerCase() !== 'false') {
      const { runToolAgent } = require('./tool-agent');
      const handled = await runToolAgent(message, client, openai);
      if (handled) return; // Agent responded; skip legacy flow
      // Fallback: if this looks like a hit logging ask, try the dedicated hit tool agent
      const looksLikeHitAsk = /(\blog\s+(a\s+)?hit\b|\bhit\s+log\b|\blog\b.*\bhit\b|\b(scus?|units)\b.*\b(of|\d)|\bhit\b.*\bcargo\b|\bpiracy\b.*\bhit\b)/i.test(message.content || '');
      if (looksLikeHitAsk) {
        try {
          const { runHitToolAgent } = require('./tool-hit-agent');
          const hitHandled = await runHitToolAgent(message, client, openai);
          if (hitHandled) return;
        } catch (e2) {
          console.error('tool-hit-agent fallback failed:', e2?.message || e2);
        }
      }
    }
  } catch (e) {
    console.error('tool-agent path failed:', e?.message || e);
  }

  // Edit-hit flow: if in a hit forum thread and user asks to edit/update, manage an edit session
  try {
    const looksEditAsk = /(edit|update|fix|change)\s+(this\s+)?hit\b|\bedit\b/i.test(message.content || '');
    let sess = getEditSession(message);
    if (!sess && (looksEditAsk || /\b(edit|update|change)\b/i.test(message.content || ''))) {
      // Attempt to fetch hit by thread_id = channelId
      let hit = await getHitLogByThreadId(message.channelId).catch(()=>null);
      if (!hit) {
        try {
          const all = await getAllHitLogs();
          if (Array.isArray(all)) {
            hit = all.find(h => String(h.thread_id || h.threadId || '') === String(message.channelId));
          }
        } catch {}
      }
      if (hit && (String(hit.thread_id||'') === String(message.channelId))) {
        const ownerId = String(hit.user_id || '');
        const authorId = String(message.author?.id || '');
        if (ownerId && (ownerId === authorId || hasBloodedRole(message.member))) {
          sess = { hit, patch: {}, awaiting: 'field', user_id: ownerId };
          rememberEditSession(message, sess);
          await sendResponse(message, "You have permission to edit this hit. What would you like to change? Options: value, SCU, cargo, type (air/ground/mixed), assists, victims, title, story, video. Reply 'submit' to save or 'cancel' to abort.", true);
          return;
        } else if (ownerId) {
          await sendResponse(message, 'Only the original author or Blooded role can edit this hit.', true);
          // Do not start session
        }
      }
    } else if (sess) {
      // Session ongoing: interpret this message as an edit command/value
      const text = String(message.content || '').trim();
      const lower = text.toLowerCase();
      if (/^(cancel|stop|abort)$/i.test(lower)) {
        clearEditSession(message);
        await sendResponse(message, 'Canceled. No changes were made.', true);
        return;
      }
  if (/^(submit|save|apply)$/i.test(lower)) {
        // finalize
        const patch = { ...sess.patch };
        // Recompute totals if cargo or assists changed
        try {
          let cargoChanged = Array.isArray(patch.cargo) && patch.cargo.length;
          let assists = Array.isArray(patch.assists) ? patch.assists : sess.hit.assists || [];
          // Remove bot id from assists
          const botId = client?.user?.id ? String(client.user.id) : null;
          if (botId) assists = assists.filter(id => String(id) !== botId);
          if (cargoChanged) {
            const priceCatalog = await getPriceCatalog();
            const { enrichedCargo, totalValue, totalSCU } = await computeTotalsAndEnrichCargo(patch.cargo, priceCatalog);
            patch.cargo = enrichedCargo;
            const shares = Math.max(1, (assists.length || 0) + 1);
            patch.total_value = Math.round(Number(totalValue||0));
            patch.total_scu = Math.round(Number(totalSCU||0));
            patch.total_cut_value = Math.round((Number(totalValue||0)/shares) * 100) / 100;
            patch.total_cut_scu = Math.round((Number(totalSCU||0)/shares) * 100) / 100;
          }
        } catch (e) { console.error('edit recompute failed:', e?.message || e); }
        // Build the final merged object for display/update post
        const merged = { ...sess.hit, ...patch };
        const resolvedId = getResolvedHitId(sess.hit);
        const ok = resolvedId ? await editHitLog(resolvedId, patch).catch(()=>false) : false;
        if (ok) {
          try { await handleHitPostUpdate(client, sess.hit, merged); } catch (e) { console.error('post update embed failed:', e?.message || e); }
          clearEditSession(message);
          await sendResponse(message, 'Updated the hit and posted the changes in the thread.', true);
        } else {
          await sendResponse(message, 'I could not update that right now. Try again shortly.', true);
        }
        return;
      }
      // Parse field-specific updates
      let updated = false;
      // cargo: look for explicit prefix or parse SCU patterns
      if (/^cargo\s*[:=-]/i.test(text) || /(\d+\s*(?:scu|units?)\b)/i.test(text)) {
        const list = extractCargoFromText(text.replace(/^cargo\s*[:=-]/i,''));
        if (list.length) { sess.patch.cargo = list; updated = true; }
        else { await sendResponse(message, "I didn't catch the cargo. Example: 'cargo: 120 scu quantanium, 50 scu scrap'", true); return; }
      }
      // type
      if (/^(type|air|ground|mixed)\b/i.test(lower)) {
        const type = detectAirOrGround(text) || (/\bmixed\b/i.test(text) ? 'Mixed' : null) || (/\bair\b/i.test(text) ? 'Air' : null) || (/\bground\b|\bfps\b|\bfoot\b/i.test(text) ? 'Ground' : null);
        if (type) { sess.patch.air_or_ground = type; updated = true; } else { await sendResponse(message, "Please specify 'Air', 'Ground', or 'Mixed'.", true); return; }
      }
      // totals: total value, total SCU, and optionally cut values
      const numFrom = (s) => {
        const m = String(s||'').match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
        if (!m) return null; const n = Number(m[1].replace(/,/g, '')); return Number.isFinite(n) ? n : null;
      };
      // total value
      if (/(^|\b)(total\s*value|value)\b/i.test(text)) {
        const val = numFrom(text);
        if (val !== null) {
          sess.patch.total_value = Math.round(val);
          // Recompute cut value based on current assists if present
          try {
            const assists = Array.isArray(sess.patch.assists) ? sess.patch.assists : (Array.isArray(sess.hit.assists) ? sess.hit.assists : []);
            const botId = client?.user?.id ? String(client.user.id) : null;
            const cleanAssists = botId ? assists.filter(id => String(id) !== botId) : assists;
            const shares = Math.max(1, (cleanAssists.length || 0) + 1);
            sess.patch.total_cut_value = Math.round((val / shares) * 100) / 100;
          } catch {}
          updated = true;
        }
      }
      // total SCU
      if (/(^|\b)(total\s*scu|scu\s*total|total\s*units?)\b/i.test(text)) {
        const scu = numFrom(text);
        if (scu !== null) {
          sess.patch.total_scu = Math.round(scu);
          try {
            const assists = Array.isArray(sess.patch.assists) ? sess.patch.assists : (Array.isArray(sess.hit.assists) ? sess.hit.assists : []);
            const botId = client?.user?.id ? String(client.user.id) : null;
            const cleanAssists = botId ? assists.filter(id => String(id) !== botId) : assists;
            const shares = Math.max(1, (cleanAssists.length || 0) + 1);
            sess.patch.total_cut_scu = Math.round((scu / shares) * 100) / 100;
          } catch {}
          updated = true;
        }
      }
      // direct cut fields, if specified
      if (/(^|\b)(cut\s*value|value\s*per\s*(?:player|person|share))\b/i.test(text)) {
        const v = numFrom(text); if (v !== null) { sess.patch.total_cut_value = Math.round(v * 100) / 100; updated = true; }
      }
      if (/(^|\b)(cut\s*scu|scu\s*per\s*(?:player|person|share))\b/i.test(text)) {
        const v = numFrom(text); if (v !== null) { sess.patch.total_cut_scu = Math.round(v * 100) / 100; updated = true; }
      }
      // assists via mentions
      if (/^assists?\s*[:=-]/i.test(text) || /<@!?\d+>/.test(text)) {
        const ids = extractMentionsFromContent(text);
        if (ids.length) { sess.patch.assists = ids; updated = true; }
      }
      // victims
      if (/^victims?\s*[:=-]/i.test(text)) {
        const body = text.replace(/^victims?\s*[:=-]/i,'');
        const arr = body.split(/[;,\n]+/).map(s=>s.trim()).filter(Boolean).slice(0, 16);
        if (arr.length) { sess.patch.victims = arr; updated = true; }
      }
      // title
      if (/^title\s*[:=-]/i.test(text)) {
        const t = text.replace(/^title\s*[:=-]/i,'').trim().slice(0, 120);
        if (t) { sess.patch.title = t; updated = true; }
      }
      // story (or regenerate)
      if (/^story\s*[:=-]/i.test(text) || /^regenerate\b/i.test(lower)) {
        const explicit = /^story\s*[:=-]/i.test(text) ? text.replace(/^story\s*[:=-]/i,'').trim() : '';
        if (explicit) { sess.patch.story = explicit.slice(0, 1000); updated = true; }
        else {
          try {
            const summary = await runWithResponses({
              openai,
              formattedUserMessage: `Summarize this hit as 2-3 concise sentences, neutral professional tone. Use no pirate slang.\n\nOriginal:\n${sess.hit.story || ''}\n\nUpdate notes:\n${message.content}`,
              guildId: message.guild?.id,
              channelId: message.channelId,
              rank: deriveRankLabel(message.member) || null,
              contextSnippets: [],
            });
            if (summary && summary.trim()) { sess.patch.story = summary.trim(); updated = true; }
          } catch {}
        }
      }
      // video
      if (/^video\s*[:=-]/i.test(text) || /https?:\/\//i.test(text)) {
        const v = extractVideoLink(text);
        if (v) { sess.patch.video_link = v; updated = true; }
      }
      if (updated) {
        rememberEditSession(message, sess);
        await sendResponse(message, "Noted. You can add more changes or type 'submit' to save.", true);
        return;
      } else {
        await sendResponse(message, "Tell me what to change: value, SCU, cargo, type, assists, victims, title, story, or video. Or type 'submit' to save.", true);
        return;
      }
    }
  } catch (e) {
    console.error('edit-hit flow failed:', e?.message || e);
  }

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
  // Legacy intent router (fallback only). Disable by default.
  let routed = { intent: 'other', confidence: 0, filters: {} };
  if ((process.env.LEGACY_INTENT_ROUTER || 'false').toLowerCase() === 'true') {
    const { routeIntent } = require('./intent-router');
    routed = await routeIntent(openai, formattedMessage);
  }
  const isPiracyIntent = Boolean((routed?.intent || '').startsWith('piracy.'));
  const isDogfightingIntent = Boolean((routed?.intent || '').startsWith('dogfighting.'));
  const isPiracySpots = routed?.intent === 'piracy.spots';
  const useAutoRouter = ((process.env.AUTO_ROUTER_ENABLED || 'true').toLowerCase() === 'true') && (!routed?.intent || routed.intent === 'other' || (Number(routed?.confidence || 0) < 0.7));
  const autoPlan = useAutoRouter ? await autoPlanRetrieval(openai, formattedMessage) : null;

  // Quick user/org profile ask detection (e.g., "tell me about DocHound", "who is DocHound", "describe DocHound/Beowulf")
  const userQueryMatch = (() => {
    const s0 = String(message.content || '').trim();
    // Remove leading bot mention if present for clean matching
    const s = s0.replace(/^<@!?\d+>\s*/, '');
    const m1 = s.match(/^(?:tell\s+me\s+about|who\s+is|who\'s|whos|info\s+on|about|describe|how\s+would\s+you\s+describe)\s+([A-Za-z0-9_\-]{2,64})\b/i);
    if (m1 && m1[1]) return m1[1];
    return null;
  })();
  if (userQueryMatch) {
    try {
      const target = userQueryMatch;
      // If asking about the bot or org name, handle specially
      const botName = (client?.user?.username || '').trim().toLowerCase();
      const tLower = String(target).trim().toLowerCase();
      if (botName && (tLower === botName || tLower === 'robohound')) {
  const selfDesc = 'I\'m RoboHound — a Discord bot for Star Citizen ops. I can summarize recent activity, answer market questions (UEX-backed), list systems/planets/moons/stations/outposts/cities, and fetch piracy stats and summaries from our knowledge.';
        await sendResponse(message, selfDesc, true);
        return;
      }
      if (tLower === 'beowulf') {
        const org = await buildOrgSummary('Beowulf');
        if (org) { await sendResponse(message, org, true); return; }
      }
      // Prefer an opinionated take over a raw profile summary
  const opinion = await buildUserOpinionSummary(target, openai);
      if (opinion) { await sendResponse(message, opinion, true); return; }
      // Fallback to a factual profile if we couldn't form an opinion
      const prof = await buildUserProfileSummary(target);
      if (prof) { await sendResponse(message, prof, true); return; }
    } catch (e) {
      console.error('user profile lookup failed:', e?.response?.data || e?.message || e);
      // fall through
    }
  }

  // Small talk / banter: prefer LLM-generated responses unless disabled
  if (routed?.intent === 'chat.banter') {
    const useLLMBanter = ((process.env.BANTER_USE_LLM || 'true').toLowerCase() !== 'false');
    const displayName = message.member?.displayName || message.author?.username || 'friend';
    try { message.channel.sendTyping(); } catch {}

    if (useLLMBanter) {
      try {
        const banterStyle = 'Banter mode: respond briefly (1–2 sentences), friendly, avoid profanity, deflect insults politely, and don\'t over-explain. Use a casual tone but no role-play. Do not start with interjections like "Ah,", "Well,", "So,", "Okay,". No pirate jargon (ahoy, aye, matey, ye, booty, plunder, shanty, arr).';
        const txt = await runWithResponses({
          openai,
          formattedUserMessage: await formatDiscordMessage(message),
          guildId: message.guild?.id,
          channelId: message.channelId,
          rank: deriveRankLabel(message.member) || null,
          contextSnippets: [banterStyle].concat(await buildRecentConversationSnippet(message) ? [await buildRecentConversationSnippet(message)] : []),
        });
        const reply = (txt && txt.trim()) ? txt.trim() : `Here if you need me, ${displayName}.`;
        const key = `${message.channelId}:${message.author?.id}`;
        const last = lastQuickReplies.get(key);
        let finalReply = reply;
        if (last && last.text === reply && Date.now() - last.ts < 60_000) {
          const alts = [
            `What can I do for you, ${displayName}?`,
            "Want me to check something?",
            "Here if you need me.",
          ];
          finalReply = pickDifferent(alts, last.text);
        }
        lastQuickReplies.set(key, { text: finalReply, ts: Date.now() });
        try { await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 400))); } catch {}
        await sendResponse(message, finalReply, true);
        return;
      } catch (e) {
        // Fall through to lightweight canned banter if LLM path fails
      }
    }

    // Lightweight fallback banter (used only if BANTER_USE_LLM=false or LLM fails)
    const s = String(message.content || '').toLowerCase();
    const reply = (function() {
      if (/(^|\b)(thanks|thank\s*you|ty|thx|appreciate\s*it|much\s*appreciated)(\b|!|\.)/i.test(s)) return "You're welcome! o7";
      if (/(^|\b)(sorry|my\s*bad|oops|whoops)(\b|!|\.)/i.test(s)) return "No worries.";
      if (/(^|\b)(bye|good\s*night|goodnight|gn|good\s*morning|gm|good\s*evening|ge|cya|see\s*ya|later|l8r|brb|gtg|g2g)(\b|!|\.)/i.test(s)) return "Catch you later!";
      if (/(\bfuck\b\s*(you|u)|\bstfu\b|asshole|dickhead|\bbitch\b|\bcunt\b|\bwtf\b)/i.test(s)) return `Let's keep it friendly, ${displayName}. What can I help with?`;
      return `Listening, ${displayName}. How can I help?`;
    })();
    const key = `${message.channelId}:${message.author?.id}`;
    const last = lastQuickReplies.get(key);
    let finalReply = reply;
    if (last && last.text === reply && Date.now() - last.ts < 60_000) {
      finalReply = (reply === "Catch you later!") ? "See you around." : `Here if you need me, ${displayName}.`;
    }
    lastQuickReplies.set(key, { text: finalReply, ts: Date.now() });
    try { await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 400))); } catch {}
    await sendResponse(message, finalReply, true);
    return;
  }

  // Conversational hit creation flow: detect and guide user to log a new hit
  if (routed?.intent === 'piracy.hit.create' || getHitDraft(message)) {
    try {
      // Load or initialize draft
      let draft = getHitDraft(message) || { awaiting: null };
      const filters = routed?.filters || {};
      // If this is a fresh start, seed from routed filters
      if (!draft?.seeded) {
        const assists = Array.isArray(filters.assists) ? filters.assists : extractMentionsFromContent(message.content);
        draft = {
          seeded: true,
          awaiting: null,
          user_id: message.author?.id,
          username: message.author?.username,
          nickname: message.member?.nickname || null,
          air_or_ground: filters.air_or_ground || detectAirOrGround(message.content) || null,
          cargo: Array.isArray(filters.cargo) ? filters.cargo.map(c => ({ commodity_name: c.commodity_name, scuAmount: Number(c.scu) || Number(c.scuAmount) || 0 })).filter(c => c.scuAmount > 0) : extractCargoFromText(message.content),
          assists: assists || [],
          video_link: filters.video_link || extractVideoLink(message.content) || null,
          source_text: message.content,
        };
      } else {
        // Existing draft: interpret this message as an answer to the last question
        if (draft.awaiting === 'cargo') {
          const added = extractCargoFromText(message.content);
          if (added.length) {
            // merge
            const byName = new Map(draft.cargo.map(it => [normalizeName(it.commodity_name), { ...it }]));
            for (const it of added) {
              const k = normalizeName(it.commodity_name);
              const prev = byName.get(k);
              if (prev) prev.scuAmount += it.scuAmount; else byName.set(k, { ...it });
            }
            draft.cargo = Array.from(byName.values());
          }
        } else if (draft.awaiting === 'air_or_ground') {
          const aog = detectAirOrGround(message.content) || (/\b(air|space)\b/i.test(message.content) ? 'Air' : (/\b(ground|fps|foot)\b/i.test(message.content) ? 'Ground' : (/\bmixed\b/i.test(message.content) ? 'Mixed' : null)));
          if (aog) draft.air_or_ground = aog;
        } else if (draft.awaiting === 'confirm') {
          const s = String(message.content || '').trim().toLowerCase();
          if (/^(y|yes|confirm|ok|okay|create|submit)$/i.test(s)) {
            draft.confirmed = true;
          } else if (/^(n|no|cancel|stop|abort)$/i.test(s)) {
            await sendResponse(message, 'Canceled. I did not create the hit.', true);
            clearHitDraft(message);
            return;
          } else {
            await sendResponse(message, "Please reply 'confirm' to create the hit or 'cancel' to abort.", true);
            rememberHitDraft(message, draft);
            return;
          }
        } else if (draft.awaiting === 'cargo_disambiguate' && draft._disambigPending) {
          // Parse mappings like: "quant=1, scrap=2" or allow "name idx"
          const txt = String(message.content || '').toLowerCase();
          const pairs = txt.split(/[;,\n]+/).map(s => s.trim()).filter(Boolean);
          const selections = new Map();
          for (const p of pairs) {
            let m = p.match(/^([^=]+)\s*[=:]\s*(\d+|none|skip)$/i) || p.match(/^(.+?)\s+(\d+|none|skip)$/i);
            if (!m) continue;
            const key = normalizeName(m[1]);
            const val = String(m[2]).toLowerCase();
            selections.set(key, val);
          }
          if (selections.size === 0) {
            await sendResponse(message, "Please reply like 'quant=1, scrap=2' or 'name=none' to skip.", true);
            rememberHitDraft(message, draft);
            return;
          }
          const pending = draft._disambigPending.items || [];
          for (const amb of pending) {
            const choice = selections.get(amb.norm);
            if (!choice) continue;
            if (choice === 'none' || choice === 'skip') continue; // leave unvalued
            const idx = Number(choice) - 1;
            if (Number.isFinite(idx) && idx >= 0 && idx < amb.suggestions.length) {
              const picked = amb.suggestions[idx];
              const ci = draft.cargo.findIndex(x => normalizeName(x.commodity_name) === amb.norm);
              if (ci >= 0) draft.cargo[ci].commodity_name = picked.commodity_name;
            }
          }
          delete draft._disambigPending;
          draft.awaiting = null;
        }
        // Always capture any new mentions/video links in follow-ups
        const newMentions = extractMentionsFromContent(message.content);
        if (Array.isArray(newMentions) && newMentions.length) {
          const set = new Set([...(draft.assists || []), ...newMentions]);
          draft.assists = Array.from(set);
        }
        draft.video_link = draft.video_link || extractVideoLink(message.content) || null;
      }

      // LLM enrichment pass (optional): try to fill missing cargo/type/story from this message
      if ((process.env.HIT_LLM_EXTRACT || 'true').toLowerCase() !== 'false') {
        try {
          const llm = await llmExtractHitFields(openai, formattedMessage);
          if (llm) {
            // merge air_or_ground if missing
            if (!draft.air_or_ground && llm.air_or_ground) draft.air_or_ground = llm.air_or_ground;
            // merge cargo if none captured yet
            if ((!Array.isArray(draft.cargo) || draft.cargo.length === 0) && Array.isArray(llm.cargo) && llm.cargo.length) {
              draft.cargo = llm.cargo;
            }
            // narrative fields (optional, used as defaults)
            if (!draft.title && llm.title) draft.title = llm.title;
            if (!draft.story && llm.story) draft.story = llm.story;
            if (!draft.video_link && llm.video_link) draft.video_link = llm.video_link;
          }
        } catch (e) { console.error('LLM enrichment pass failed:', e?.message || e); }
      }

      // Determine missing required pieces
      const missing = [];
      if (!Array.isArray(draft.cargo) || draft.cargo.length === 0) missing.push('cargo');
      if (!draft.air_or_ground) missing.push('air_or_ground');

      if (missing.length) {
        draft.awaiting = missing[0];
        rememberHitDraft(message, draft);
        if (draft.awaiting === 'cargo') {
          await sendResponse(message,
            "Nice work! I can log this hit. What's the cargo? Reply like: '120 scu quantanium, 50 scu scrap' or 'quantanium x 120 scu'.",
            true);
        } else if (draft.awaiting === 'air_or_ground') {
          await sendResponse(message,
            "Got it. Was this Air, Ground (FPS), or Mixed? Reply with 'Air', 'Ground', or 'Mixed'.",
            true);
        }
        return;
      }

      // We have enough; compute totals and confirm with the user first
      const [priceCatalog, latestPatch] = await Promise.all([
        getPriceCatalog(),
        getLatestPatch(),
      ]);
      const { enrichedCargo, totalValue, totalSCU, unknownItems, ambiguous } = await computeTotalsAndEnrichCargo(draft.cargo, priceCatalog);
      // If we have ambiguous items and haven't resolved them, prompt user
      if (Array.isArray(ambiguous) && ambiguous.length && !draft._disambigPending && !draft.confirmed) {
        draft._disambigPending = { items: ambiguous };
        draft.awaiting = 'cargo_disambiguate';
        rememberHitDraft(message, draft);
        const parts = [];
        parts.push("I couldn't confidently match some cargo names. Pick the closest option by replying like 'quant=1, scrap=2' or 'name=none' to leave unvalued.");
        for (const amb of ambiguous) {
          parts.push(`For "${amb.input_name}":`);
          amb.suggestions.forEach((sug, idx) => {
            parts.push(`  ${idx + 1}) ${sug.commodity_name}${sug.commodity_code ? ` [${sug.commodity_code}]` : ''}`);
          });
        }
        await sendResponse(message, parts.join('\n'), true);
        return;
      }
      const totalCutValue = Math.round(Number(totalValue || 0) / (Number(draft.assists?.length || 0) + 1));
      // Prepare a human summary and ask for confirmation
      const cargoLines = enrichedCargo.map(c => `- ${c.commodity_name}${c.commodity_code ? ` [${c.commodity_code}]` : ''}: ${c.scuAmount} SCU`).join('\n');
      const assistText = (draft.assists||[]).length ? draft.assists.map(id=>`<@${id}>`).join(', ') : 'None';
      const notes = unknownItems?.length ? `\nNote: value for ${unknownItems.join(', ')} wasn't found; counted at 0 aUEC.` : '';
      await sendResponse(message,
        `Review this hit before I create it:\n`+
        `- Type: ${draft.air_or_ground}\n`+
        `- Patch: ${latestPatch || 'N/A'}\n`+
        `- Cargo (total ${Math.round(totalSCU)} SCU):\n${cargoLines}\n`+
        `- Total Value: ${Math.round(totalValue).toLocaleString()} aUEC\n`+
        `- Split Value (per pirate): ${Math.round(totalCutValue).toLocaleString()} aUEC\n`+
        `- Crew: ${assistText}\n`+
        `${draft.video_link ? `- Video: ${draft.video_link}\n` : ''}`+
        `${notes}\n\n`+
        `Type 'confirm' to create or 'cancel' to abort.`,
        true);
      draft.awaiting = 'confirm';
      draft._computed = { enrichedCargo, totalValue: Math.round(totalValue), totalSCU: Math.round(totalSCU), totalCutValue, latestPatch };
      rememberHitDraft(message, draft);
      if (!draft.confirmed) return;

      // User confirmed; persist now
      const parentId = Date.now();
      const dbUser = await getUserById(message.author?.id).catch(() => null);
      const payload = {
        id: parentId,
        user_id: message.author?.id,
        username: dbUser?.username || message.author?.username,
        nickname: dbUser?.nickname || message.member?.nickname || null,
        air_or_ground: draft.air_or_ground,
        cargo: draft._computed.enrichedCargo,
        total_value: draft._computed.totalValue,
        total_cut_value: draft._computed.totalCutValue,
        total_scu: draft._computed.totalSCU,
        patch: draft._computed.latestPatch || undefined,
        assists: Array.isArray(draft.assists) ? draft.assists : [],
        video_link: draft.video_link || undefined,
        title: `Hit: ${draft._computed.totalSCU} SCU ${draft._computed.enrichedCargo[0]?.commodity_name || ''}`.trim(),
        story: draft.source_text || 'Logged via chat',
        type_of_piracy: draft.air_or_ground, // allow 'Air', 'Ground', or 'Mixed'
        timestamp: new Date().toISOString(),
        fleet_activity: false,
      };
      const created = await createHitLog(payload);
      if (!created) {
        await sendResponse(message, 'I couldn\'t create the hit right now. Please try again in a bit.', true);
        rememberHitDraft(message, draft); // keep for retry
        return;
      }
      try {
        if (!created.thread_id && !created.threadId) {
          await handleHitPost(client, openai, { ...payload, ...created });
        }
      } catch (e) { console.error('handleHitPost failed:', e?.message || e); }
      clearHitDraft(message);
      await sendResponse(
        message,
        `Logged hit #${created.id || payload.id}: ${Math.round(payload.total_value).toLocaleString()} aUEC over ${Math.round(payload.total_scu)} SCU. Crew: ${(payload.assists||[]).length ? payload.assists.map(id=>`<@${id}>`).join(', ') : 'None'}.`,
        true
      );
      return;
    } catch (e) {
      console.error('piracy.hit.create handling failed:', e?.response?.data || e?.message || e);
    }
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

  // Deterministic route-focused piracy advice using world graph + terminal activity
  if (routed?.intent === 'piracy.advice') {
    try {
      const filters = routed?.filters || {};
      let from = filters.route_from || filters.from || null;
      let to = filters.route_to || filters.to || null;
      const item = filters.item_name || null;
      // Fallback parse in case router missed endpoints
      const s = String(message.content || '');
      if (!from || !to) {
        const mBetween = s.match(/\bbetween\s+([a-z0-9\-\' ]{2,30})\s+and\s+([a-z0-9\-\' ]{2,30})\b/i);
        const mFromTo = s.match(/\bfrom\s+([a-z0-9\-\' ]{2,30})\s+to\s+([a-z0-9\-\' ]{2,30})\b/i);
        if (mBetween || mFromTo) {
          from = from || (mBetween ? mBetween[1] : mFromTo[1]);
          to = to || (mBetween ? mBetween[2] : mFromTo[2]);
        }
      }
      const ans = await piracyAdviceForRoute({ from, to, item });
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('piracy.advice handling failed:', e?.response?.data || e?.message || e);
      // fall through to retrieval path if deterministic fails
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
  const { getTopK, getTopKFromKnowledgePiracy, getTopKPiracyMessages } = require('./retrieval');
  const { bestBuyLocations, bestSellLocations, spotFor, mostMovement, bestProfitRoutes, mostActiveTerminals, bestOverallProfitRoute, bestCrossSystemRoutes } = require('./market-answerer');
  const { piracyAdviceForRoute } = require('./piracy-route-advice');
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

  // Conversational market follow-up handler: e.g., "and in Pyro?" reuses last item/intent
  try {
    const s = String(message.content || '').trim();
    const likelyFollowUp = /^(?:and\s+)?(?:(?:in|at|near)\s+.+|[A-Za-z][\w\s'\-]{1,30}\??)$/.test(s.toLowerCase());
    const mentionsOnlyLocation = /(\band\b\s+)?\b(in|at|near)\b\s+(.+)/i.exec(s);
    // If router didn't explicitly classify as a market/item ask, attempt follow-up reuse
    if (!/^item\.|^market\./.test(routed?.intent || '') && (likelyFollowUp || mentionsOnlyLocation)) {
      const key = `${message.channelId}:${message.author?.id}`;
      const ctx = lastMarketContext.get(key);
      if (ctx && ctx.item_name && /^market\.|^item\./.test(ctx.intent || '')) {
        const loc = mentionsOnlyLocation ? (mentionsOnlyLocation[3] || '').replace(/[?!.]+$/,'').trim() : s.replace(/^and\s+/i, '').replace(/[?!.]+$/,'').trim();
        if (loc) {
          try {
            if (ctx.intent === 'item.buy') {
              const ans = await bestBuyLocations({ name: ctx.item_name, top: 5, location: loc });
              rememberMarketContext(message, ctx.intent, ctx.item_name, loc);
              await sendResponse(message, ans.text, true);
              return;
            } else if (ctx.intent === 'item.sell') {
              const ans = await bestSellLocations({ name: ctx.item_name, top: 5, location: loc });
              rememberMarketContext(message, ctx.intent, ctx.item_name, loc);
              await sendResponse(message, ans.text, true);
              return;
            } else if (ctx.intent === 'market.route') {
              const ans = (ctx.item_name === '*')
                ? await bestOverallProfitRoute({ top: 5, location: loc })
                : await bestProfitRoutes({ name: ctx.item_name, top: 5, location: loc });
              rememberMarketContext(message, ctx.intent, ctx.item_name, loc);
              await sendResponse(message, ans.text, true);
              return;
            } else if (ctx.intent === 'market.spot') {
              const ans = await spotFor({ name: ctx.item_name, top: 6, location: loc });
              rememberMarketContext(message, ctx.intent, ctx.item_name, loc);
              await sendResponse(message, ans.text, true);
              return;
            }
          } catch (e) {
            console.error('market follow-up reuse failed:', e?.response?.data || e?.message || e);
          }
        }
      }
    }
  } catch {}

  // Follow-up after variant clarification: if previous reply asked to specify a variant/piece, and the user only says
  // something like "buy locations" or repeats generic ask without a slot/variant, prompt again with guidance.
  try {
    const text = String(message.content || '').trim();
    const lower = text.toLowerCase();
    const looksGenericBuySell = /^(buy|sell)\s*(locations?)?$/i.test(text) || /^(where\s+to\s+buy|best\s+buy|best\s+sell)$/i.test(lower);
    if (looksGenericBuySell) {
      const key = marketContextKey(message);
      const prev = lastMarketContext.get(key);
      if (prev && prev.intent === 'clarify.variants' && prev.item_name) {
        await sendResponse(message, `Please specify the exact piece or variant for "${prev.item_name}" (e.g., helmet, chest, or the named variant) so I can list buy locations.`, true);
        return;
      }
    }
  } catch {}

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
      rememberMarketContext(message, 'item.buy', name, location);
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
      rememberMarketContext(message, 'item.sell', name, location);
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
      rememberMarketContext(message, 'market.spot', name, location);
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('market.spot failed:', e?.response?.data || e?.message || e);
    }
  }
  if (routed?.intent === 'market.route') {
    let name = routed?.filters?.item_name || '';
    let location = routed?.filters?.location_name || null;
    const s = String(message.content || '');
    // Detect cross-system ask: "between X and Y" or "from X to Y"
    const mBetween = s.match(/\bbetween\s+([a-z0-9\-\' ]{2,30})\s+and\s+([a-z0-9\-\' ]{2,30})\b/i);
    const mFromTo = s.match(/\bfrom\s+([a-z0-9\-\' ]{2,30})\s+to\s+([a-z0-9\-\' ]{2,30})\b/i);
    if (mBetween || mFromTo) {
      const from = (mBetween ? mBetween[1] : mFromTo[1]).trim();
      const to = (mBetween ? mBetween[2] : mFromTo[2]).trim();
      try {
        const ans = await bestCrossSystemRoutes({ from, to, top: 6 });
        rememberMarketContext(message, 'market.route', '*', `${from} -> ${to}`);
        await sendResponse(message, ans.text, true);
        return;
      } catch (e) {
        console.error('market.route cross-system failed:', e?.response?.data || e?.message || e);
      }
    }
    const wantsOverall = !name || /\b(any|all|overall)\b/i.test(name) || /(overall|any|all)\s+(best\s+)?(trade\s+)?route/i.test(s);
    try {
      if (wantsOverall) {
        const ans = await bestOverallProfitRoute({ top: 5, location });
        rememberMarketContext(message, 'market.route', '*', location);
        await sendResponse(message, ans.text, true);
        return;
      }
      const ans = await bestProfitRoutes({ name, top: 5, location });
      rememberMarketContext(message, 'market.route', name, location);
      await sendResponse(message, ans.text, true);
      return;
    } catch (e) {
      console.error('market.route failed:', e?.response?.data || e?.message || e);
    }
  }
  if (routed?.intent === 'market.activity' || /most\s+(movement|active)|transactions?/.test(message.content || '')) {
    try {
      const location = routed?.filters?.location_name || null;
      const wantTerminalScope = (/(?:\bby\s+terminal\b|\bper\s+terminal\b|\bterminals?\b)/i.test(message.content || '')) || String(routed?.filters?.scope || '') === 'terminal';
      const mentionsReportsOrActive = /(report|reports|most\s+active)/i.test(message.content || '');
      if (wantTerminalScope || mentionsReportsOrActive) {
        const ans = await mostActiveTerminals({ top: 10, location });
        await sendResponse(message, ans.text, true);
        return;
      }
      const scope = routed?.filters?.scope || (/(?:\bby\s+terminal\b|\bper\s+terminal\b|\bterminals?\b|\bstations?\b|\boutposts?\b)/i.test(message.content || '') ? 'terminal' : 'commodity');
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

  // General / user-focused retrieval split across messages and knowledge for better grounding and counts
  if ((routed?.intent === 'general.info') || (String(routed?.intent || '').startsWith('user.')) || (!isPiracyIntent && looksInfoSeeking)) {
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

  // If router classified as user.* with an owner_name, return a deterministic profile summary
  if ((routed?.intent && routed.intent.startsWith('user.')) && (routed?.filters?.owner_name || routed?.filters?.owner_id)) {
    try {
      const name = routed?.filters?.owner_name || null;
      if (name) {
        const prof = await buildUserProfileSummary(name);
        if (prof) {
          await sendResponse(message, prof, true);
          return;
        }
      }
    } catch (e) {
      console.error('user.* deterministic profile failed:', e?.response?.data || e?.message || e);
    }
    // If deterministic fails, allow the normal retrieval flow below to proceed
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
        // For piracy.advice, explicitly include chat snippets about piracy as well (topic-focused)
        ...((routed?.intent === 'piracy.advice') ? await getTopKPiracyMessages(
          /\bpiracy\b|\bpirate\b/.test(message.content) ? message.content : `${message.content} piracy`,
          5
        ) : []),
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

// Helper: pull last ~5 minutes of chat in this channel for lightweight context
async function buildRecentConversationSnippet(message, opts = {}) {
  try {
    const maxMinutes = Number(opts.minutes || 5);
    const maxItems = Math.max(3, Math.min(15, Number(opts.maxItems || 10)));
    const maxChars = Math.max(200, Math.min(1800, Number(opts.maxChars || 900)));
    const channelName = message?.channel?.name || '';
    if (!channelName) return '';

    // Fetch chat logs and filter by channel and recency
    const rows = await ChatLogsModel.list();
    if (!Array.isArray(rows) || !rows.length) return '';
    const now = Date.now();
    const cutoff = now - maxMinutes * 60_000;

    const recent = rows
      .filter(r => {
        try {
          const meta = r?.message?.metadata || {};
          const ch = String(r?.channel_name || meta.channel || '');
          if (ch !== channelName) return false;
          const ts = new Date(meta.date || r?.message?.timestamp || r?.created_at || 0).getTime();
          return ts && ts >= cutoff && ts <= now;
        } catch { return false; }
      })
      // sort ascending by time for natural reading order
      .sort((a,b) => {
        const ta = new Date(a?.message?.metadata?.date || 0).getTime();
        const tb = new Date(b?.message?.metadata?.date || 0).getTime();
        return ta - tb;
      })
      .slice(-maxItems);

    if (!recent.length) return '';

    const lines = [];
    for (const r of recent) {
      const meta = r?.message?.metadata || {};
      const role = String(r?.message?.role || '').toLowerCase();
      const isBot = role === 'assistant';
      const user = String(meta.user || '').trim();
      // Message content is saved like: "@user: 'text'"; strip label and quotes
      let content = String(r?.message?.content || '')
        .replace(/^@[^:]+:\s*/i, '')
        .replace(/^['“”"]|['“”"]$/g, '')
        .replace(/<@!?\d+>/g, '@user');
      // Trim line
      content = content.replace(/\s+/g, ' ').trim();
      if (!content) continue;
      // timestamp HH:MM
      let hhmm = '';
      try {
        const d = new Date(meta.date || Date.now());
        hhmm = d.toISOString().slice(11,16);
      } catch {}
      const speaker = user || (isBot ? 'bot' : 'user');
      const line = `- [${hhmm}] ${speaker}: ${content}`;
      lines.push(line.length > 220 ? line.slice(0, 217) + '…' : line);
      // Safety cap on total chars
      const total = lines.join('\n');
      if (total.length > maxChars) break;
    }

    if (!lines.length) return '';
    // Important instruction so model treats this as background only
    const header = `Recent channel chatter (last ${Math.min(maxMinutes, 60)}m in #${channelName}) — background only; answer the user's latest message, do not reply to these lines:`;
    return [header].concat(lines).join('\n');
  } catch (e) {
    console.error('buildRecentConversationSnippet error:', e?.message || e);
    return '';
  }
}

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

// Fallback snapshot when knowledge summaries aren't available; focuses on channel-local last 5m
async function buildRecentActivitySnapshot(message, opts = {}) {
  try {
    const maxMinutes = Number(opts.minutes || 5);
    const maxItems = Math.max(3, Math.min(20, Number(opts.maxItems || 12)));
    const maxChars = Math.max(200, Math.min(1800, Number(opts.maxChars || 1100)));
    const channelName = message?.channel?.name || '';
    if (!channelName) return '';
    const rows = await ChatLogsModel.list();
    if (!Array.isArray(rows) || !rows.length) return '';
    const now = Date.now();
    const cutoff = now - maxMinutes * 60_000;
    const recent = rows
      .filter(r => {
        try {
          const ch = String(r?.channel_name || r?.message?.metadata?.channel || '');
          if (ch !== channelName) return false;
          const ts = new Date(r?.message?.metadata?.date || 0).getTime();
          return ts && ts >= cutoff && ts <= now;
        } catch { return false; }
      })
      .sort((a,b) => new Date(a?.message?.metadata?.date||0) - new Date(b?.message?.metadata?.date||0))
      .slice(-maxItems);
    if (!recent.length) return '';

    // Basic stats
    const users = new Set();
    for (const r of recent) {
      const u = String(r?.message?.metadata?.user || '').trim();
      if (u) users.add(u);
    }
    const header = `Recent activity (last ${Math.min(maxMinutes,60)}m) in #${channelName}: ${recent.length} messages by ${users.size} users`;
    const lines = [];
    for (const r of recent.slice(-8)) { // show up to 8 examples
      const meta = r?.message?.metadata || {};
      const user = String(meta.user || '').trim();
      let content = String(r?.message?.content || '')
        .replace(/^@[^:]+:\s*/i, '')
        .replace(/^['“”"]|['“”"]$/g, '')
        .replace(/<@!?\d+>/g, '@user')
        .replace(/\s+/g, ' ') // compact
        .trim();
      if (!content) continue;
      const snippet = content.length > 140 ? content.slice(0, 137) + '…' : content;
      lines.push(`- ${user || 'user'}: ${snippet}`);
      const total = (header + '\n' + lines.join('\n')).length;
      if (total > maxChars) break;
    }
    return [header].concat(lines).join('\n');
  } catch (e) {
    console.error('buildRecentActivitySnapshot error:', e?.message || e);
    return '';
  }
}
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

// Build a compact, natural profile summary for a given username/nickname from chat logs
async function buildUserProfileSummary(name) {
  try {
    const target = String(name || '').trim();
    if (!target) return '';
    const { getUsers } = require('../api/userlistApi.js');
    const users = await getUsers().catch(()=>null);
    let userRow = null;
    if (Array.isArray(users) && users.length) {
      const norm = (s) => String(s || '').trim().toLowerCase();
      const tn = norm(target);
      userRow = users.find(u => norm(u.username || u.nickname || u.name) === tn) ||
                users.find(u => norm(u.username || '') === tn) ||
                users.find(u => norm(u.nickname || '') === tn) || null;
    }
    const rows = await ChatLogsModel.list();
    const now = Date.now();
    const daysToMs = (d) => d * 24 * 60 * 60 * 1000;
    let windowDays = 30;
    let since = now - daysToMs(windowDays);
    // Canonicalize names to compare consistently
    const canon = (s) => {
      const x = String(s || '').trim();
      if (!x) return '';
      // Strip leading @ and optional brackets like [TAG]
      const noAt = x.replace(/^@+/, '');
      const noTag = noAt.replace(/^\[[^\]]+\]\s*/, '');
      return noTag.toLowerCase().replace(/\s+/g, ' ');
    };
    // Build a robust set of name tokens for matching and mentions
    const nameTokens = (() => {
      const raw = new Set();
      const add = (s) => { const v = String(s || '').trim(); if (v) raw.add(v); };
      add(target);
      if (userRow) {
        add(userRow.username);
        add(userRow.nickname);
        add(userRow.name);
        if (userRow.id) {
          raw.add(`<@${userRow.id}>`);
          raw.add(`<@!${userRow.id}>`);
        }
      }
      const out = new Set();
      for (const t of raw) {
        const s = String(t).trim();
        if (!s) continue;
        out.add(s);
        out.add(s.toLowerCase());
        out.add(s.replace(/\s+/g, ''));
        out.add(s.toLowerCase().replace(/\s+/g, ''));
        out.add('@' + s);
        out.add('@' + s.toLowerCase());
        // Strip bracket tags like [IRONPOINT] dochound -> dochound
        const stripTag = s.replace(/^\[[^\]]+\]\s*/, '');
        if (stripTag !== s) {
          out.add(stripTag);
          out.add(stripTag.toLowerCase());
        }
      }
      return Array.from(out).filter(Boolean);
    })();
    const matchUser = (u) => {
      const v = canon(u);
      if (!v) return false;
      return nameTokens.some(tok => canon(tok) === v);
    };
    const contentMentionsTarget = (content) => {
      const s = String(content || '');
      const lc = s.toLowerCase();
      // Also consider explicit Discord mention forms if we have an id
      const idForms = (userRow?.id) ? [
        `<@${userRow.id}>`,
        `<@!${userRow.id}>`,
      ] : [];
      if (idForms.some(m => lc.includes(m.toLowerCase()))) return true;
      return nameTokens.some(tok => lc.includes(String(tok).toLowerCase()));
    };
    const getUserMsgs = (sinceTs) => (Array.isArray(rows) ? rows : []).filter(r => {
      try {
        const meta = r?.message?.metadata || {};
        const ts = new Date(meta.date || r?.created_at || 0).getTime();
        // Also attempt to parse speaker from content prefix "@name: " if metadata is missing
        let saidBy = String(meta.user || '').trim();
        if (!saidBy) {
          const m = String(r?.message?.content || '').match(/^@([^:]{2,64}):/);
          saidBy = m ? m[1].trim() : '';
        }
        return matchUser(saidBy) && ts && ts >= sinceTs && ts <= now;
      } catch { return false; }
    });
    // Collect messages ABOUT the user (mentions), excluding the user's own lines
    const getAboutMsgs = (sinceTs) => (Array.isArray(rows) ? rows : []).filter(r => {
      try {
        const meta = r?.message?.metadata || {};
        const ts = new Date(meta.date || r?.created_at || 0).getTime();
        if (!(ts && ts >= sinceTs && ts <= now)) return false;
        const raw = String(r?.message?.content || '');
        // Strip the leading speaker label for content checks
        const body = raw.replace(/^@[^:]+:\s*/i, '');
        if (!contentMentionsTarget(raw) && !contentMentionsTarget(body)) return false;
        // Exclude if spoken by the target user
        const saidBy = String(meta.user || '').trim();
        const prefixMatch = raw.match(/^@([^:]{2,64}):/);
        const speaker = saidBy || (prefixMatch ? prefixMatch[1].trim() : '');
        if (speaker && matchUser(speaker)) return false;
        return true;
      } catch { return false; }
    });
    // First pass: 30-day window
    let userMsgs = getUserMsgs(since);
    let aboutMsgs = getAboutMsgs(since);
    // If nothing found, widen the window to 90 days to avoid "0"-only summaries
    if ((!userMsgs.length && !aboutMsgs.length)) {
      windowDays = 90;
      since = now - daysToMs(windowDays);
      userMsgs = getUserMsgs(since);
      aboutMsgs = getAboutMsgs(since);
    }
    // Stats: counts and top channels
    const totalAuthored = userMsgs.length;
    const totalMentions = aboutMsgs.length;
    const byChannel = new Map();
    for (const r of userMsgs) {
      const ch = String(r?.channel_name || r?.message?.metadata?.channel || 'unknown');
      byChannel.set(ch, (byChannel.get(ch) || 0) + 1);
    }
    const topChannels = Array.from(byChannel.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 3);
    // Recent samples
    const samples = userMsgs
      .sort((a,b)=> new Date(b?.message?.metadata?.date || 0) - new Date(a?.message?.metadata?.date || 0))
      .slice(0, 5)
      .map(r => {
        const meta = r?.message?.metadata || {};
        const when = (()=>{ try { return String(meta.date || '').slice(0, 16).replace('T',' ');} catch { return ''; } })();
        const text = String(r?.message?.content || '')
          .replace(/^@[^:]+:\s*/i, '')
          .replace(/^[‘’'“”"]|[‘’'“”"]$/g, '')
          .replace(/<@!?.+?>/g, '@user')
          .replace(/\s+/g, ' ')
          .trim();
        return `- [${when}] #${r?.channel_name || meta.channel || '?'}: ${text.length > 160 ? text.slice(0,157)+'…' : text}`;
      });
    const aboutSamples = aboutMsgs
      .sort((a,b)=> new Date(b?.message?.metadata?.date || 0) - new Date(a?.message?.metadata?.date || 0))
      .slice(0, 5)
      .map(r => {
        const meta = r?.message?.metadata || {};
        const when = (()=>{ try { return String(meta.date || '').slice(0, 16).replace('T',' ');} catch { return ''; } })();
        const raw = String(r?.message?.content || '');
        const speaker = String(meta.user || (raw.match(/^@([^:]{2,64}):/)?.[1] || 'user')).trim();
        const text = raw
          .replace(/^@[^:]+:\s*/i, '')
          .replace(/^[‘’'“”"]|[‘’'“”"]$/g, '')
          .replace(/<@!?.+?>/g, '@user')
          .replace(/\s+/g, ' ')
          .trim();
        return `- [${when}] ${speaker}: ${text.length > 160 ? text.slice(0,157)+'…' : text}`;
      });

    const parts = [];
    const display = userRow?.nickname || userRow?.username || target;
    const windowLabel = windowDays === 30 ? 'last month' : `last ${windowDays} days`;

    // Headline
    parts.push(`Here’s a quick look at ${display} over the ${windowLabel}:`);
    // Lightweight context
    if (userRow && (userRow.joined_at || userRow.joinedAt)) {
      parts.push(`- joined: ${(userRow.joined_at||userRow.joinedAt).slice(0,10)}`);
    }
    // Core stats
    const channelStr = topChannels.length ? ` — top channels: ${topChannels.map(([c,n])=>`#${c} (${n})`).join(', ')}` : '';
    parts.push(`- messages: ${totalAuthored}${channelStr}`);
    if (totalMentions) parts.push(`- mentioned by others: ${totalMentions}`);

    // Recent samples, trimmed to keep it readable
    if (samples.length) {
      parts.push('Recent lines:');
      parts.push(...samples.slice(0, 3));
    }
    if (aboutSamples.length) {
      parts.push('People talking about them:');
      parts.push(...aboutSamples.slice(0, 3));
    }
    // Keep the tone organic, avoid debug-ish footers
    return parts.join('\n');
  } catch (e) {
    console.error('buildUserProfileSummary error:', e?.response?.data || e?.message || e);
    return '';
  }
}

// Build an opinionated, concise take on a user derived from authored lines and how others mention them
async function buildUserOpinionSummary(name, openai) {
  try {
    const target = String(name || '').trim();
    if (!target) return '';
    const { getUsers } = require('../api/userlistApi.js');
    const users = await getUsers().catch(()=>null);
    let userRow = null;
    if (Array.isArray(users) && users.length) {
      const norm = (s) => String(s || '').trim().toLowerCase();
      const tn = norm(target);
      userRow = users.find(u => norm(u.username || u.nickname || u.name) === tn) ||
                users.find(u => norm(u.username || '') === tn) ||
                users.find(u => norm(u.nickname || '') === tn) || null;
    }
    const rows = await ChatLogsModel.list();
    const now = Date.now();
    const daysToMs = (d) => d * 24 * 60 * 60 * 1000;
    let windowDays = 30;
    let since = now - daysToMs(windowDays);

    // helpers
    const canon = (s) => {
      const x = String(s || '').trim();
      if (!x) return '';
      const noAt = x.replace(/^@+/, '');
      const noTag = noAt.replace(/^\[[^\]]+\]\s*/, '');
      return noTag.toLowerCase().replace(/\s+/g, ' ');
    };
    const nameTokens = (() => {
      const raw = new Set();
      const add = (s) => { const v = String(s || '').trim(); if (v) raw.add(v); };
      add(target);
      if (userRow) {
        add(userRow.username); add(userRow.nickname); add(userRow.name);
        if (userRow.id) { raw.add(`<@${userRow.id}>`); raw.add(`<@!${userRow.id}>`); }
      }
      const out = new Set();
      for (const t of raw) {
        const s = String(t).trim(); if (!s) continue;
        out.add(s); out.add(s.toLowerCase()); out.add(s.replace(/\s+/g, ''));
        out.add(s.toLowerCase().replace(/\s+/g, ''));
        out.add('@' + s); out.add('@' + s.toLowerCase());
        const stripTag = s.replace(/^\[[^\]]+\]\s*/, '');
        if (stripTag !== s) { out.add(stripTag); out.add(stripTag.toLowerCase()); }
      }
      return Array.from(out).filter(Boolean);
    })();
    const matchUser = (u) => {
      const v = canon(u); if (!v) return false;
      return nameTokens.some(tok => canon(tok) === v);
    };
    const contentMentionsTarget = (content) => {
      const s = String(content || '');
      const lc = s.toLowerCase();
      const idForms = (userRow?.id) ? [`<@${userRow.id}>`, `<@!${userRow.id}>`] : [];
      if (idForms.some(m => lc.includes(m.toLowerCase()))) return true;
      return nameTokens.some(tok => lc.includes(String(tok).toLowerCase()));
    };
    const getUserMsgs = (sinceTs) => (Array.isArray(rows) ? rows : []).filter(r => {
      try {
        const meta = r?.message?.metadata || {};
        const ts = new Date(meta.date || r?.created_at || 0).getTime();
        let saidBy = String(meta.user || '').trim();
        if (!saidBy) {
          const m = String(r?.message?.content || '').match(/^@([^:]{2,64}):/);
          saidBy = m ? m[1].trim() : '';
        }
        return matchUser(saidBy) && ts && ts >= sinceTs && ts <= now;
      } catch { return false; }
    });
    const getAboutMsgs = (sinceTs) => (Array.isArray(rows) ? rows : []).filter(r => {
      try {
        const meta = r?.message?.metadata || {};
        const ts = new Date(meta.date || r?.created_at || 0).getTime();
        if (!(ts && ts >= sinceTs && ts <= now)) return false;
        const raw = String(r?.message?.content || '');
        const body = raw.replace(/^@[^:]+:\s*/i, '');
        if (!contentMentionsTarget(raw) && !contentMentionsTarget(body)) return false;
        const saidBy = String(meta.user || '').trim();
        const prefixMatch = raw.match(/^@([^:]{2,64}):/);
        const speaker = saidBy || (prefixMatch ? prefixMatch[1].trim() : '');
        if (speaker && matchUser(speaker)) return false;
        return true;
      } catch { return false; }
    });

    let userMsgs = getUserMsgs(since);
    let aboutMsgs = getAboutMsgs(since);
    if (!userMsgs.length && !aboutMsgs.length) {
      windowDays = 90; since = now - daysToMs(windowDays);
      userMsgs = getUserMsgs(since);
      aboutMsgs = getAboutMsgs(since);
    }

    // If still nothing, bail out
    if (!userMsgs.length && !aboutMsgs.length) return '';

    // Extract clean text bodies
    const cleanBody = (raw) => String(raw || '')
      .replace(/^@[^:]+:\s*/i, '')
      .replace(/<@!?.+?>/g, '@user')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[`*_>~]/g, '')
      .trim();
    const userTexts = userMsgs.map(r => cleanBody(r?.message?.content));
    const aboutTexts = aboutMsgs.map(r => cleanBody(r?.message?.content));

    // Simple style and theme analysis
    const tokens = (s) => (String(s || '').toLowerCase().match(/[a-z][a-z0-9'\-]{1,}/g) || []);
    const STOP = new Set(['the','a','an','and','or','but','if','then','so','to','of','in','on','for','with','at','by','from','as','is','are','was','were','be','been','it','this','that','these','those','i','you','we','they','he','she','them','his','her','our','your','their','my','me','us','do','did','does','just','like','get','got','going','gonna','yeah','nah','ok','okay','right','left','up','down','here','there','today','tonight','now','nowadays','lol','lmao','xd','o7','gg']);
    const countFreq = (arr) => {
      const m = new Map();
      for (const t of arr) { if (!STOP.has(t)) m.set(t, (m.get(t)||0)+1); }
      return m;
    };
    const userTok = countFreq(userTexts.flatMap(tokens));
    const aboutTok = countFreq(aboutTexts.flatMap(tokens));
    const topK = (m, k=5) => Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([w])=>w);
    const topUserThemes = topK(userTok, 5);
    const topAboutThemes = topK(aboutTok, 5);

    // Style metrics
    const avgLen = userTexts.length ? Math.round(userTexts.reduce((a,s)=>a+(s||'').length,0)/userTexts.length) : 0;
    const qRate = userTexts.length ? userTexts.filter(s=>s.includes('?')).length / userTexts.length : 0;
    const eRate = userTexts.length ? userTexts.filter(s=>s.includes('!')).length / userTexts.length : 0;
    const curseList = [/\b(fuck|shit|damn|ass|bitch|wtf)\b/i];
    const curseRate = userTexts.length ? userTexts.filter(s=>curseList.some(rx=>rx.test(s))).length / userTexts.length : 0;
    const helpfulRate = userTexts.length ? userTexts.filter(s=>/(thanks|thank you|ty|appreciate|help|welcome)/i.test(s)).length / userTexts.length : 0;

    // Mentions sentiment heuristic
    const mentionsPraise = aboutTexts.filter(s=>/(thanks|props|good|nice|leader|helpful|welcome|great|gg|well done)/i.test(s)).length;
    const mentionsCritic = aboutTexts.filter(s=>/(bad|wrong|blame|issue|problem|annoying|toxic)/i.test(s)).length;
    const mentionTone = mentionsPraise > mentionsCritic + 1 ? 'positive' : (mentionsCritic > mentionsPraise + 1 ? 'mixed' : (mentionsPraise+mentionsCritic>0 ? 'neutral' : 'sparse'));

    // Build adjectives
    const adjectives = [];
    if (qRate >= 0.25) adjectives.push('inquisitive');
    if (eRate >= 0.25) adjectives.push('energetic');
    if (curseRate >= 0.08) adjectives.push('blunt');
    if (helpfulRate >= 0.08) adjectives.push('helpful');
    if (!adjectives.length) adjectives.push('straightforward');

    // Top channels
    const byChannel = new Map();
    for (const r of userMsgs) {
      const ch = String(r?.channel_name || r?.message?.metadata?.channel || 'general');
      byChannel.set(ch, (byChannel.get(ch)||0)+1);
    }
    const topChannels = Array.from(byChannel.entries()).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([c])=>`#${c}`);

    // Pick a short example line (avoid pings/links)
    const example = userTexts.find(s => s && s.length >= 10) || userTexts[0] || '';
    const exShort = example && example.length > 140 ? example.slice(0,137)+'…' : example;

    const display = userRow?.nickname || userRow?.username || target;
    const windowLabel = windowDays === 30 ? 'last month' : `last ${windowDays} days`;

    // Optional: Use LLM to craft persona-aligned opinion using only provided facts
    const useLLM = ((process.env.USER_OPINION_USE_LLM || 'true').toLowerCase() !== 'false');
    if (useLLM && openai) {
      try {
        const facts = [
          `name: ${display}`,
          `window: ${windowLabel}`,
          `adjectives: ${adjectives.slice(0,3).join(', ')}`,
          `avg_len_chars: ${avgLen}`,
          `question_rate: ${(qRate*100).toFixed(0)}%`,
          `exclaim_rate: ${(eRate*100).toFixed(0)}%`,
          `curse_rate: ${(curseRate*100).toFixed(0)}%`,
          `helpful_rate: ${(helpfulRate*100).toFixed(0)}%`,
          `top_channels: ${topChannels.join(', ') || '#general'}`,
          `themes_self: ${topUserThemes.join(', ')}`,
          `themes_mentions: ${topAboutThemes.join(', ')}`,
          `mentions_tone: ${mentionTone}`,
          exShort ? `example: ${exShort.replace(/^[‘’'“”"]|[‘’'“”"]$/g, '')}` : null,
        ].filter(Boolean).join('\n');

        const persona = 'RoboHound: witty, succinct, operations-focused vibe; never toxic; no profanity; 2–4 sentences; confident but grounded. No role-play or pirate jargon. Avoid interjection openers.';
        const guardrails = 'Use ONLY the provided facts. Do not invent achievements or relationships. No usernames beyond the target. No links. Keep it conversational, not a report. Answer directly; do not restate the request.';
        const txt = await runWithResponses({
          openai,
          formattedUserMessage: `Summarize ${display}.`,
          guildId: null,
          channelId: null,
          rank: null,
          contextSnippets: [persona, guardrails, `Facts:\n${facts}`],
        });
        const out = (txt || '').trim();
        if (out) return out;
      } catch (e) {
        // fall back to deterministic persona text
      }
    }

    // Deterministic, persona-laced fallback (no LLM)
    const openers = [
      `${display}? Here’s my read:`,
      `Quick take on ${display}:`,
      `Gut check on ${display}:`,
    ];
    const lenLabel = avgLen < 60 ? 'short and to-the-point' : (avgLen < 140 ? 'medium-length' : 'long-form');
    const tones = [];
    if (qRate>=0.25) tones.push('curious');
    if (eRate>=0.25) tones.push('animated');
    if (curseRate>=0.08) tones.push('blunt');
    if (helpfulRate>=0.08) tones.push('helpful');
    const toneStr = tones.length ? `Feels ${tones.join(' and ')}.` : '';
    const chStr = topChannels.length ? `They live mostly in ${topChannels.join(' and ')}.` : '';
    const themeStr = topUserThemes.length ? `Talk track leans ${topUserThemes.slice(0,3).join(', ')}.` : '';
    const mentionStr = aboutMsgs.length
      ? (mentionTone === 'positive' ? 'Crew callouts skew positive.' : (mentionTone === 'mixed' ? 'Crew chatter is a mix of props and pushback.' : 'Mentions are sparse.'))
      : '';
    const exampleStr = exShort ? `Example: “${exShort.replace(/^[‘’'“”"]|[‘’'“”"]$/g, '')}”` : '';
    const closer = pickDifferent([
      'Net take: solid presence, keeps the channel moving.',
      'Bottom line: reliable voice when ops heat up.',
      'TL;DR: consistent signal in the noise.',
    ]);
    return [
      pickDifferent(openers),
      `${adjectives.slice(0,2).join(' and ')} overall; ${lenLabel}.`,
      [chStr, themeStr, toneStr, mentionStr].filter(Boolean).join(' '),
      exampleStr,
      closer,
    ].filter(Boolean).join(' ');
  } catch (e) {
    console.error('buildUserOpinionSummary error:', e?.response?.data || e?.message || e);
    return '';
  }
}

// Build a brief org summary; prefer knowledge entries if available
async function buildOrgSummary(name) {
  try {
    const label = String(name || '').trim();
    // Try knowledge docs first
    const rows = await listKnowledge({ category: 'about', section: 'org', limit: 1, order: 'created_at.desc' }).catch(()=>[]);
    if (Array.isArray(rows) && rows.length) {
      const r = rows[0];
      const title = r.title || label;
      const body = truncateText(String(r.content || ''), 700);
      return `${title}:\n${body}`;
    }
    // Fallback minimal description
    return `${label}: our Star Citizen org focused on coordinated operations, market intel, and piracy ops. Ask me for systems, stations, routes, or recent activity.`;
  } catch {
    return '';
  }
}
