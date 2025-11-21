const DEFAULT_INTENT = {
  intent: 'banter',
  needsTool: false,
  confidence: 0.35,
  rationale: 'fallback-default',
};

const KEYWORD_RULES = [
  { intent: 'price_query', needsTool: true, keywords: ['price', 'worth', 'sell', 'buy', 'market', 'commodity', 'trade'], minConfidence: 0.55 },
  { intent: 'user_stats', needsTool: true, keywords: ['stat', 'score', 'leaderboard', 'rank', 'prestige', 'progress'], minConfidence: 0.55 },
  { intent: 'help', needsTool: false, keywords: ['help', 'how do', 'explain', 'what is', 'can you remind'], minConfidence: 0.5 },
  { intent: 'admin', needsTool: false, keywords: ['promote', 'verify', 'approve', 'ban', 'flag'], minConfidence: 0.45 },
  { intent: 'serious_info', needsTool: false, keywords: ['policy', 'rule', 'schedule', 'operation', 'ops', 'mission'], minConfidence: 0.5 },
];

const ALLOWED_INTENTS = ['banter', 'price_query', 'user_stats', 'serious_info', 'help', 'admin', 'other'];
const TOOL_DEFAULTS = new Set(['price_query', 'user_stats', 'admin']);
const INTENT_MODEL = process.env.CHATGPT_INTENT_MODEL || 'gpt-3.5-turbo';
const USE_MODEL = (process.env.CHATGPT_INTENT_USE_MODEL || 'true').toLowerCase() === 'true';

function normalizeContent(text) {
  return (text || '').toLowerCase();
}

function scoreRule(content, rule) {
  let hits = 0;
  for (const keyword of rule.keywords) {
    if (content.includes(keyword)) hits += 1;
  }
  return rule.keywords.length ? hits / rule.keywords.length : 0;
}

function classifyWithHeuristics(content) {
  if (!content) {
    return { ...DEFAULT_INTENT, rationale: 'empty-message' };
  }
  let best = { ...DEFAULT_INTENT };
  for (const rule of KEYWORD_RULES) {
    const score = scoreRule(content, rule);
    if (score >= (rule.minConfidence || 0.5) && score > best.confidence) {
      best = {
        intent: rule.intent,
        needsTool: !!rule.needsTool,
        confidence: score,
        rationale: `keyword:${rule.intent}`,
      };
    }
  }
  if (best.intent === 'banter' && /^(hey|hi|yo|sup|hello)\b/.test(content)) {
    return { intent: 'banter', needsTool: false, confidence: 0.45, rationale: 'greeting' };
  }
  return best;
}

function parseIntentResponse(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeModelIntent(result, fallback) {
  if (!result) return fallback;
  const intent = ALLOWED_INTENTS.includes(result.intent) ? result.intent : fallback.intent;
  const confidence = Math.max(0, Math.min(1, Number(result.confidence ?? fallback.confidence ?? 0.4)));
  const needsTool = typeof result.needsTool === 'boolean'
    ? result.needsTool
    : fallback.needsTool ?? TOOL_DEFAULTS.has(intent);
  const rationale = result.reason || `model:${intent}`;
  return { intent, needsTool, confidence, rationale };
}

async function classifyIntent({ message, meta = {}, openai }) {
  const rawContent = message?.content || '';
  const content = normalizeContent(rawContent);
  const heuristicResult = classifyWithHeuristics(content);
  if (!USE_MODEL || !openai || !rawContent.trim()) {
    return heuristicResult;
  }
  try {
    const completion = await openai.chat.completions.create({
      model: INTENT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You classify Discord messages into intents: banter, price_query, user_stats, serious_info, help, admin, other. Respond with JSON {"intent":"...","needsTool":true|false,"confidence":0-1,"reason":"..."}. needsTool is true when external data must be fetched (markets, stats, admin actions).',
        },
        {
          role: 'user',
          content: `Guild: ${meta.guildName || 'unknown'}\nChannel: ${meta.channelName || 'unknown'}\nMessage: ${rawContent}`,
        },
      ],
    });
    const text = completion?.choices?.[0]?.message?.content;
    const parsed = parseIntentResponse(text);
    const normalized = normalizeModelIntent(parsed, heuristicResult);
    normalized.rationale = `model:${parsed?.reason || normalized.intent}`;
    return normalized;
  } catch (error) {
    console.error('[ChatGPT][Intent] Model classification failed:', error?.message || error);
    return { ...heuristicResult, rationale: `${heuristicResult.rationale}|model-fallback` };
  }
}

module.exports = {
  classifyIntent,
};
