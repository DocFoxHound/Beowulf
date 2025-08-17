const SAFE_INTENTS = [
  // Piracy-focused intents
  'piracy.latest',        // user wants the most recent hit
  'piracy.find',          // user wants specific hits (by patch/owner/date/keywords)
  'piracy.stats',         // user wants counts or value aggregates over hits
  // Chat/General
  'chat.banter',          // casual banter; keep light, no heavy retrieval
  'chat.recent',          // recent activity in this channel
  'general.info',         // broad info-seeking, let retrieval decide
  'other',                // none of the above
  // Users
  'user.opinion',
  'user.activity',
  'user.stats',
  // Market
  'market.route',
  'market.spot',
  'market.best',
  'market.recommend',
  'item.sell',
  'item.buy',
  'location.activity',
  'location.items',
  // Dogfighting
  'dogfighting.ships',
  'dogfighting.meta',
  'dogfighting.equipment',
  'dogfighting.training',
  'dogfighting.strategies',
];

function parseTimeframe(s) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lower = s.toLowerCase();
  const toIso = (d) => d.toISOString().slice(0,10);
  if (/today\b/.test(lower)) {
    return { date_start: toIso(today), date_end: toIso(today) };
  }
  if (/yesterday\b/.test(lower)) {
    const y = new Date(today.getTime() - 86400000);
    return { date_start: toIso(y), date_end: toIso(y) };
  }
  if (/(recent|recently|lately)\b/.test(lower)) {
    const start = new Date(today.getTime() - 14*86400000);
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/this\s+week\b/.test(lower)) {
    const day = today.getUTCDay() || 7; // 1..7
    const start = new Date(today.getTime() - (day-1)*86400000);
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/last\s+week\b/.test(lower)) {
    const day = today.getUTCDay() || 7;
    const start = new Date(today.getTime() - (day-1 + 7)*86400000);
    const end = new Date(start.getTime() + 6*86400000);
    return { date_start: toIso(start), date_end: toIso(end) };
  }
  if (/this\s+month\b/.test(lower)) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/last\s+month\b/.test(lower)) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth()-1, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { date_start: toIso(start), date_end: toIso(end) };
  }
  return {};
}

function quickHeuristic(text) {
  const s = String(text || '').toLowerCase();
  const isPiracy = /(\bhit\b|\bhits\b|\bpiracy\b|\bpirate\b)/.test(s);
  if (isPiracy && /(latest|most\s*recent|last)\s+hit/.test(s)) {
    return { intent: 'piracy.latest', confidence: 0.95, filters: {} };
  }
  if (isPiracy && /(how many|count|sum|total|average|avg|highest|max|lowest|min|best|biggest|largest|most\s+valuable)/.test(s)) {
    let metric = undefined;
    if (/(highest|max|best|biggest|largest|most\s+valuable)/.test(s)) metric = 'max_value';
    if (/(lowest|min|least\s+valuable|smallest)/.test(s)) metric = metric || 'min_value';
    if (/(average|avg|mean)/.test(s)) metric = metric || 'avg_value';
    if (/(sum|total)/.test(s)) metric = metric || 'total_value';
    if (/(how many|count)/.test(s)) metric = metric || 'count';
    return { intent: 'piracy.stats', confidence: 0.85, filters: { metric, ...parseTimeframe(s) } };
  }
  if (isPiracy) {
    const patch = (s.match(/\b(\d+\.\d+(?:\.\d+)?)\b/) || [])[1] || null;
    return { intent: 'piracy.find', confidence: 0.7, filters: { patch, ...parseTimeframe(s) } };
  }
  // Market: item buy/sell
  if (/(where\s+to\s+buy|where\s+can\s+i\s+buy|\bbuy\b)/.test(s)) {
    const m = s.match(/buy\s+([a-z0-9\-\s]{3,40})/i);
    const item_name = m ? m[1].trim() : null;
    return { intent: 'item.buy', confidence: 0.75, filters: { item_name, ...parseTimeframe(s) } };
  }
  if (/(where\s+to\s+sell|where\s+can\s+i\s+sell|\bsell\b)/.test(s)) {
    const m = s.match(/sell\s+([a-z0-9\-\s]{3,40})/i);
    const item_name = m ? m[1].trim() : null;
    return { intent: 'item.sell', confidence: 0.75, filters: { item_name, ...parseTimeframe(s) } };
  }
  if (/\broute\b/.test(s)) {
    return { intent: 'market.route', confidence: 0.7, filters: { ...parseTimeframe(s) } };
  }
  if (/\bspot\b|\bspot\s+price\b/.test(s)) {
    return { intent: 'market.spot', confidence: 0.7, filters: { ...parseTimeframe(s) } };
  }
  if (/\b(best|optimal)\b/.test(s) && /\b(price|profit|route)\b/.test(s)) {
    return { intent: 'market.best', confidence: 0.7, filters: { ...parseTimeframe(s) } };
  }
  // Dogfighting
  if (/\bdogfight|\bpvp\b|\bvtol\b|\bloadout\b|\bmeta\b|\bstrat|\btactic|\btraining\b/.test(s)) {
    if (/\bloadout|guns|cannon|shield|power|cooler|components?\b/.test(s)) {
      return { intent: 'dogfighting.equipment', confidence: 0.75, filters: {} };
    }
    if (/\bmeta\b/.test(s)) {
      return { intent: 'dogfighting.meta', confidence: 0.75, filters: {} };
    }
    if (/\btraining\b/.test(s)) {
      return { intent: 'dogfighting.training', confidence: 0.7, filters: {} };
    }
    return { intent: 'dogfighting.strategies', confidence: 0.7, filters: {} };
  }
  // User-focused
  if (/<@!?\d+>/.test(text) || /\buser\b|\bmember\b|\bstats\b/.test(s)) {
    const m = text.match(/<@!?(\d+)>/);
    const owner_id = m ? m[1] : null;
    if (/\bstats?\b/.test(s)) return { intent: 'user.stats', confidence: 0.7, filters: { owner_id, ...parseTimeframe(s) } };
    if (/\b(activity|did|doing)\b/.test(s)) return { intent: 'user.activity', confidence: 0.7, filters: { owner_id, ...parseTimeframe(s) } };
    return { intent: 'user.opinion', confidence: 0.6, filters: { owner_id } };
  }
  // Banter: short, casual, emoji/laughter/greetings without strong question cues
  const isShort = s.length <= 120;
  const hasLaugh = /(\blol\b|\blmao\b|\brofl\b|haha|hehe|lmao|lmfao|xd)/.test(s);
  const hasGreeting = /(\bhey\b|\bhi\b|\byo\b|\bsup\b|\bhiya\b|\bgm\b|\bgn\b|\bgg\b)/.test(s);
  const hasCustomEmoji = /<a?:\w+:\d+>|:\w+:/i.test(text || '');
  const hasUnicodeEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text || '');
  const hasQuestion = /\?/.test(s);
  if ((isShort && (hasLaugh || hasGreeting || hasCustomEmoji || hasUnicodeEmoji)) && !hasQuestion) {
    return { intent: 'chat.banter', confidence: 0.8, filters: {} };
  }
  if (/(what\s+has\s+everyone\s+been\s+doing|recent\s+activity|what\'s\s+been\s+going\s+on)/.test(s)) {
    return { intent: 'chat.recent', confidence: 0.8, filters: {} };
  }
  if (/[?]/.test(s) || /(what|how|why|where|when|who|rules?|policy)/.test(s)) {
    return { intent: 'general.info', confidence: 0.6, filters: {} };
  }
  return { intent: 'other', confidence: 0.5, filters: {} };
}

async function llmRouteIntent(openai, model, text) {
  if (!openai || !model) return null;
  const system = 'You are an intent router for a Discord bot. Classify the user message into one of a small set of intents and extract simple filters. Output ONLY compact JSON matching the schema. Keep it strict and avoid extra fields.';
  const schema = {
    intent: 'one of: ' + SAFE_INTENTS.join(', '),
    confidence: '0.0..1.0',
    filters: {
      patch: 'optional string like 3.23 or 3.23.1',
      owner_name: 'optional string',
      owner_id: 'optional string',
      hit_id: 'optional string or number',
  timeframe: 'optional string (today|yesterday|this week|last week|this month|last month)',
      date_start: 'optional ISO date YYYY-MM-DD',
      date_end: 'optional ISO date YYYY-MM-DD',
      keywords: 'optional array of strings',
      metric: 'for piracy.stats: count|total_value|max_value|min_value|avg_value',
      group_by: 'for piracy.stats: day|week|patch|owner',
  item_name: 'for item.buy/sell: commodity/item name',
  location_name: 'for market/location: place, station, or area name',
  ship_name: 'for dogfighting.equipment/strategies/meta: ship name',
  opponent_ship: 'for dogfighting: opponent ship type (optional)',
    },
  };
  const user = `Message: ${text}\n\nReturn JSON only with fields: { intent, confidence, filters }.`;
  try {
    if (openai?.responses?.create) {
      const res = await openai.responses.create({
        model,
        input: [
          { role: 'system', content: [{ type: 'text', text: system }] },
          { role: 'user', content: [{ type: 'text', text: `Allowed intents: ${SAFE_INTENTS.join(', ')}` }] },
          { role: 'user', content: [{ type: 'text', text: `Schema: ${JSON.stringify(schema)}` }] },
          { role: 'user', content: [{ type: 'text', text: user }] },
        ],
      });
      const out = res.output_text?.trim?.() || '';
      try { return JSON.parse(out); } catch { return null; }
    }
    if (openai?.chat?.completions?.create) {
      const resp = await openai.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Allowed intents: ${SAFE_INTENTS.join(', ')}` },
          { role: 'user', content: `Schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: user },
        ],
      });
      const out = resp.choices?.[0]?.message?.content?.trim() || '';
      try { return JSON.parse(out); } catch { return null; }
    }
    return null;
  } catch (e) {
    console.error('llmRouteIntent error:', e?.response?.data || e?.message || e);
    return null;
  }
}

async function routeIntent(openai, text) {
  const heuristic = quickHeuristic(text);
  // If high enough confidence, skip LLM for speed
  if (heuristic.confidence >= 0.9) return heuristic;
  try {
    const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
    const llm = await llmRouteIntent(openai, model, text);
    if (llm && SAFE_INTENTS.includes(llm.intent)) return llm;
  } catch (e) {}
  return heuristic;
}

module.exports = {
  SAFE_INTENTS,
  routeIntent,
};
