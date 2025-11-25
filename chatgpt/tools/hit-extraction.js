const DEFAULT_EXTRACTION = {
  action: 'ignore',
  confidence: 0,
  cargo: [],
  assists: [],
  guests: [],
  victims: [],
  title: null,
  story: null,
  type_of_piracy: null,
  timestamp: null,
  missing_fields: [],
  notes: null,
};

const EXTRACTION_MODEL = process.env.HIT_EXTRACTION_MODEL || process.env.CHATGPT_HIT_EXTRACTION_MODEL || 'gpt-4o-mini';
const EXTRACTION_ENABLED = (process.env.HIT_EXTRACTION_USE_MODEL || process.env.CHATGPT_HIT_EXTRACTION_USE_MODEL || 'true').toLowerCase() === 'true';
const EXTRACTION_TEMPERATURE = Number(process.env.HIT_EXTRACTION_TEMPERATURE || 0.2);
const EXTRACTION_MAX_TOKENS = Number(process.env.HIT_EXTRACTION_MAX_TOKENS || 600);

function stripCodeFences(text) {
  if (!text) return '';
  return text.replace(/```json|```/gi, '').trim();
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(stripCodeFences(text));
  } catch {
    return null;
  }
}

function coerceNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function coerceString(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function coerceTimestamp(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

function normalizeCargoEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const rawName = coerceString(entry.name || entry.item || entry.commodity || entry.commodity_name || entry.label);
  const quantity = coerceNumber(entry.quantity ?? entry.amount ?? entry.qty ?? entry.scu ?? entry.scu_amount);
  if (!rawName || !quantity || quantity <= 0) return null;
  const unit = coerceString(entry.unit || entry.units) || 'scu';
  return { name: rawName, quantity, unit: unit.toLowerCase() };
}

function normalizeExtractionPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ...DEFAULT_EXTRACTION, raw: null };
  const action = payload.action === 'hit_create' ? 'hit_create' : 'ignore';
  const confidence = Math.max(0, Math.min(1, Number(payload.confidence ?? payload.score ?? 0)));
  const cargo = Array.isArray(payload.cargo)
    ? payload.cargo.map(normalizeCargoEntry).filter(Boolean)
    : [];
  const assists = Array.isArray(payload.assists)
    ? payload.assists.map(coerceString).filter(Boolean)
    : [];
  const guests = Array.isArray(payload.guests)
    ? payload.guests.map(coerceString).filter(Boolean)
    : [];
  const victims = Array.isArray(payload.victims)
    ? payload.victims.map(coerceString).filter(Boolean)
    : [];
  const missing = Array.isArray(payload.missing_fields)
    ? payload.missing_fields.map(coerceString).filter(Boolean)
    : [];
  return {
    action,
    confidence,
    cargo,
    assists,
    guests,
    victims,
    title: coerceString(payload.title),
    story: coerceString(payload.story || payload.summary),
    type_of_piracy: coerceString(payload.type_of_piracy || payload.piracy_type),
    timestamp: coerceTimestamp(payload.timestamp || payload.time || payload.date),
    missing_fields: missing,
    notes: coerceString(payload.notes || payload.reason),
    raw: payload,
  };
}

async function extractHitIntentFields({ message, meta = {}, openai }) {
  if (!EXTRACTION_ENABLED || !openai) return null;
  const content = message?.content?.trim();
  if (!content) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      temperature: EXTRACTION_TEMPERATURE,
      max_tokens: EXTRACTION_MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: [
            'You extract structured pirate hit reports from Discord messages.',
            'Return JSON only, no prose.',
            'Required fields: action ("hit_create" or "ignore"), confidence (0-1), cargo array (name + quantity + unit), assists array, guests array, victims array, title, story, type_of_piracy, timestamp (ISO if present), missing_fields array, notes.',
            'If the user is clearly logging a hit or describing stolen cargo, set action="hit_create" even if some fields are missing.',
            'If cargo quantities are not provided, leave quantity null and list "cargo" in missing_fields.',
            'Do not invent people or cargo. Preserve SCU units when available.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `Guild: ${meta.guildName || 'unknown'}`,
            `Channel: ${meta.channelName || 'unknown'}`,
            `Author: ${message.author?.tag || message.author?.username || meta.authorTag || 'unknown'}`,
            'Message:',
            content,
          ].join('\n'),
        },
      ],
    });
    const text = completion?.choices?.[0]?.message?.content;
    const parsed = parseJson(text);
    if (!parsed) return null;
    return normalizeExtractionPayload(parsed);
  } catch (error) {
    console.error('[ChatGPT][HitExtraction] model call failed:', error?.message || error);
    return null;
  }
}

module.exports = {
  extractHitIntentFields,
};
