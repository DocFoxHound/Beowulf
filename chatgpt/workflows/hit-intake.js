const { HitTrackerModel } = require('../../api/models/hit-tracker');
const { ensureUexCacheReady } = require('../context/cache-readiness');
const { handleHitPost } = require('../../functions/post-new-hit');
const { getUserFromCacheByName } = require('../../common/userlist-cache');
const { extractHitIntentFields } = require('../tools/hit-extraction');

const SESSION_TTL_MS = Number(process.env.HIT_INTAKE_SESSION_TTL_MS || 15 * 60 * 1000);
const MAX_MEDIA_LINKS = Number(process.env.HIT_INTAKE_MAX_MEDIA_LINKS || 4);
const sessions = new Map();

const SESSION_INTENT = {
  intent: 'hit_create',
  needsTool: true,
  confidence: 0.92,
  rationale: 'workflow:hit-create',
};

const CARGO_SPLIT_REGEX = /[\n;,]+/;
const UNIT_LABEL_PATTERN = '(?:scu|u|unit|units|box|boxes|crate|crates)';
const FREEFORM_BOUNDARY_PATTERN = '(?:\band\b|,|;|\.|\n|$)';
const FREEFORM_PATTERNS = [
  new RegExp(String.raw`(?<qty>\d+(?:\.\d+)?)\s*\b(?<unit>${UNIT_LABEL_PATTERN})\b\s+(?:of\s+)?(?<name>[a-z0-9'\-\s()]{2,}?)(?=${FREEFORM_BOUNDARY_PATTERN})`, 'gi'),
  new RegExp(String.raw`(?<name>[a-z0-9'\-\s()]{2,}?)\s+(?:x\s*)?(?<qty>\d+(?:\.\d+)?)\s*\b(?<unit>${UNIT_LABEL_PATTERN})\b(?=${FREEFORM_BOUNDARY_PATTERN})`, 'gi'),
];
const COMMAND_WORDS = {
  cancel: ['cancel', 'stop', 'nevermind', 'abort', 'forget it', 'forget about it'],
  skip: ['skip', 'none', 'no', 'nothing', 'n/a', 'na', 'nah', 'nope'],
  done: ['done', 'finish', 'post', 'ship it'],
  status: ['status', 'summary', 'progress'],
};
const HIT_ACTION_PATTERN = /\b(add|log|record|submit|post|create|file|report|register|start|launch|new)\b/i;
const HIT_INTAKE_HINT_PATTERN = /\b(intake|form|entry|ticket)\b/i;
const PIRACY_VERB_PATTERN = /\b(stole|steal|stolen|robbed|pirated|jacked|heisted|nabbed|lifted|raided|yoinked|took)\b/i;
const CARGO_UNIT_HINT_PATTERN = /\b(scu|unit|units|box|boxes|crate|crates|haul|load|cargo|loot)\b/i;
const AUTO_ASSIST_LIMIT = Number(process.env.HIT_INTAKE_AUTO_ASSIST_LIMIT || 6);
const AUTO_EXTRACTION_MIN_CONFIDENCE = Number(process.env.HIT_AUTO_EXTRACTION_MIN_CONFIDENCE || 0.6);
const AUTO_EXTRACTION_MAX_CARGO = Number(process.env.HIT_AUTO_EXTRACTION_MAX_CARGO || 8);
const DEFAULT_AIR_OR_GROUND = 'Air';
const DEFAULT_PIRACY_STYLE = 'Brute Force';
const AIR_AND_PIRACY_PROMPT = [
  'Is this hit Air or Ground? Reply with `Air` or `Ground` (defaults to Air).',
  'Extortion or Brute Force? Reply with `Extortion` or `Brute Force` (defaults to Brute Force).',
].join('\n');
const OPTIONAL_DETAILS_PROMPT = 'Optional: add `title/summary/video/victims` using `title=`, `story=`, `video=URL`, `victims=Name1,Name2` or say `skip`. Attach media if you have receipts.';
const CONFIRMATION_INSTRUCTIONS = 'Say `done` to post this hit, provide adjustments like `title=New Title` to tweak fields, or say `cancel` to abort.';
const HIT_ID_RANDOM_SUFFIX_MAX = (() => {
  const raw = Number(process.env.HIT_ID_RANDOM_SUFFIX_MAX);
  if (Number.isFinite(raw) && raw >= 10) return Math.floor(raw);
  return 1000;
})();
const ASSIST_CAPTURE_PATTERNS = [
  /\bassists?\s*(?:were|was|=|:)?\s*(?<names>[^.;\n]+)/gi,
  /\bassisted\s+by\s+(?<names>[^.;\n]+)/gi,
  /\bwith\s+(?<names>[^.;\n]+)/gi,
  /\brolling\s+with\s+(?<names>[^.;\n]+)/gi,
  /\brolled\s+with\s+(?<names>[^.;\n]+)/gi,
  /\bteamed\s+(?:up\s+)?with\s+(?<names>[^.;\n]+)/gi,
  /\bplus\s+(?<names>[^.;\n]+)/gi,
  /\bcrew\s*(?:was|were|=|:)?\s*(?<names>[^.;\n]+)/gi,
];
const ASSIST_NAME_SPLIT_REGEX = /\s*(?:,|&|\band\b|\+|\/|\|)\s*/i;
const ASSIST_NAME_STOPWORDS = /\b(?:scu|unit|units|crate|crates|box|boxes|cargo|loot|value|profit|haul|solo|alone|nobody|none|myself|my|crew|self|ran|running|flying|watching|covering|holding|supporting)\b/i;

const ITEM_NAME_FIELDS = ['item_name', 'item', 'commodity_name', 'commodity', 'commodityName', 'name', 'label'];
const SELL_PRICE_FIELDS = ['sell_price', 'best_sell', 'median_price', 'price_sell', 'price_sell_max', 'price_sell_avg', 'price_sell_min'];
const LOCATION_FIELDS = ['terminal_name', 'terminal', 'location', 'station', 'space_station_name', 'outpost_name', 'city_name', 'moon_name', 'planet_name'];
const MIN_COMMODITY_MATCH_SCORE = Number(process.env.HIT_INTAKE_MIN_COMMODITY_SCORE || 0.58);

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function generateHitEntryId() {
  const base = Date.now();
  const suffix = Math.floor(Math.random() * HIT_ID_RANDOM_SUFFIX_MAX);
  const padded = suffix.toString().padStart(String(HIT_ID_RANDOM_SUFFIX_MAX - 1).length, '0');
  const composite = `${base}${padded}`;
  const asNumber = Number(composite);
  return Number.isFinite(asNumber) ? asNumber : base;
}

function getSessionKey(meta) {
  return `${meta.channelId}:${meta.authorId}`;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (!session) {
      sessions.delete(key);
      continue;
    }
    if (session.status === 'completed' || session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
}

function startSession(meta, message) {
  const key = getSessionKey(meta);
  const nickname = message.member?.displayName || message.author?.globalName || message.author?.username || null;
  const username = message.author?.username || message.author?.tag || meta.authorTag || 'Unknown pirate';
  const session = {
    key,
    userId: meta.authorId,
    channelId: meta.channelId,
    botUserId: meta.botUserId || null,
    startedAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    status: 'collecting',
    step: 'cargo',
    fields: {
      user_id: meta.authorId,
      username,
      nickname,
      title: null,
      story: null,
      cargo: [],
      assists: [],
      guests: [],
      victims: [],
      additional_media_links: [],
      video_link: null,
      type_of_piracy: DEFAULT_PIRACY_STYLE,
      air_or_ground: DEFAULT_AIR_OR_GROUND,
      timestamp: null,
      patch: null,
    },
    pricing: {
      totalValue: 0,
      totalScu: 0,
    },
  };
  sessions.set(key, session);
  return session;
}

function shouldStartSession(intent, content) {
  if (intent?.intent === 'hit_create') return true;
  if (!content) return false;
  const lower = content.toLowerCase();
  const actionHint = HIT_ACTION_PATTERN.test(lower);
  const mentionsHitWord = /\bhit\b/.test(lower);
  const mentionsHitTracker = lower.includes('hit tracker');
  const mentionsPirateHit = lower.includes('pirate hit');
  const mentionsIntake = HIT_INTAKE_HINT_PATTERN.test(lower) || lower.includes('hit intake');
  if ((mentionsHitTracker || mentionsPirateHit || mentionsIntake || mentionsHitWord) && actionHint) {
    return true;
  }
  if (mentionsHitTracker && (lower.includes('start') || lower.includes('open') || lower.includes('use'))) {
    return true;
  }
  if (mentionsIntake && mentionsHitWord) {
    return true;
  }
  const hasPiracyVerb = PIRACY_VERB_PATTERN.test(lower);
  if (hasPiracyVerb && (CARGO_UNIT_HINT_PATTERN.test(lower) || /\b\d+(?:\.\d+)?\b/.test(lower))) {
    return true;
  }
  if ((hasPiracyVerb || /\bhit\b/.test(lower)) && extractFreeformCargo(content).length) {
    return true;
  }
  return false;
}

function normalizeCommand(content) {
  if (!content) return '';
  return content.trim().toLowerCase();
}

function matchesCommand(content, keywords) {
  if (!content) return false;
  const normalized = normalizeCommand(content);
  return keywords.some((word) => normalized === word || normalized.startsWith(`${word} `));
}

function wantsCancel(content) {
  return matchesCommand(content, COMMAND_WORDS.cancel);
}

function wantsSkip(content) {
  return matchesCommand(content, COMMAND_WORDS.skip);
}

function wantsStatus(content) {
  return matchesCommand(content, COMMAND_WORDS.status);
}

function wantsDone(content) {
  return matchesCommand(content, COMMAND_WORDS.done);
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return numberFormatter.format(Math.round(Number(value)));
}

function formatScu(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return decimalFormatter.format(Number(value));
}

function canonicalizeCommodityName(name) {
  if (!name) return null;
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = new Array(rows);
  for (let i = 0; i < rows; i += 1) {
    matrix[i] = new Array(cols);
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function commoditySimilarity(target, candidate) {
  if (!target || !candidate) return 0;
  if (target === candidate) return 1;
  if (candidate.includes(target) || target.includes(candidate)) {
    return 0.92;
  }
  const distance = levenshteinDistance(target, candidate);
  const maxLen = Math.max(target.length, candidate.length);
  if (!maxLen) return 0;
  const ratio = 1 - distance / maxLen;
  return Math.max(0, ratio);
}

function readTerminalPriceField(entry, fields) {
  for (const field of fields) {
    const raw = entry?.[field];
    if (raw == null) continue;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function readStringField(entry, fields) {
  for (const field of fields) {
    const value = entry?.[field];
    if (typeof value === 'string' && value.trim().length) {
      return value.trim();
    }
  }
  return null;
}

function lookupBestSellPrice(commodityName) {
  const cache = globalThis.uexCache;
  if (!cache || typeof cache.getRecords !== 'function') return null;
  const records = cache.getRecords('terminal_prices') || [];
  if (!records.length) return null;
  const target = canonicalizeCommodityName(commodityName);
  if (!target) return null;
  let best = null;
  for (const entry of records) {
    const itemName = readStringField(entry, ITEM_NAME_FIELDS);
    if (!itemName) continue;
    const canonical = canonicalizeCommodityName(itemName);
    if (!canonical) continue;
    const score = commoditySimilarity(target, canonical);
    if (score < MIN_COMMODITY_MATCH_SCORE) continue;
    const sellPrice = readTerminalPriceField(entry, SELL_PRICE_FIELDS);
    if (sellPrice == null) continue;
    const candidate = {
      price: sellPrice,
      location: readStringField(entry, LOCATION_FIELDS),
      matchName: itemName,
      score,
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.score > best.score + 0.02) {
      best = candidate;
      continue;
    }
    if (Math.abs(candidate.score - best.score) <= 0.02 && candidate.price > best.price) {
      best = candidate;
    }
  }
  return best;
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function dedupeStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseCargoJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((entry) => ({
        commodity_name: entry?.commodity_name || entry?.commodity || entry?.name,
        scuAmount: Number(entry?.scuAmount ?? entry?.scu ?? entry?.amount ?? entry?.quantity),
        avg_price: entry?.avg_price ?? entry?.avgPrice ?? entry?.price ?? null,
      }))
      .filter((entry) => entry.commodity_name && Number.isFinite(entry.scuAmount) && entry.scuAmount > 0)
      .map((entry) => ({
        commodity_name: String(entry.commodity_name).trim(),
        scuAmount: Number(entry.scuAmount),
        avg_price: entry.avg_price == null ? null : Number(entry.avg_price),
      }));
  } catch {
    return null;
  }
}

function parseScaledNumber(raw) {
  if (raw == null) return null;
  const str = String(raw).trim().toLowerCase();
  if (!str) return null;
  const cleaned = str.replace(/auec|uec|credits?/g, '').trim();
  const match = cleaned.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(million|billion|m|b)?/i);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'million' || suffix === 'm') return base * 1_000_000;
  if (suffix === 'billion' || suffix === 'b') return base * 1_000_000_000;
  return base;
}

function parseCargoInput(text) {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const json = parseCargoJson(trimmed);
    if (json && json.length) return json;
  }
  const segments = trimmed.split(CARGO_SPLIT_REGEX).map((segment) => segment.trim()).filter(Boolean);
  const items = [];
  for (const segment of segments) {
    if (!/[0-9]/.test(segment)) continue;

    // Optional inline pricing support: `Item: 1 @ 10000000` (or `@ 10 million`).
    let price = null;
    let segmentWithoutPrice = segment;
    const atSplit = segment.split(/\s*@\s*/);
    if (atSplit.length >= 2) {
      segmentWithoutPrice = atSplit[0].trim();
      price = parseScaledNumber(atSplit.slice(1).join('@'));
    } else {
      const priceMatch = segment.match(/\b(?:avg_price|price)\s*[:=]\s*([^\s]+(?:\s*(?:million|billion|m|b))?)/i);
      if (priceMatch) {
        price = parseScaledNumber(priceMatch[1]);
        segmentWithoutPrice = segment.replace(priceMatch[0], '').trim();
      }
    }

    const patterns = [
      /^(?<name>[a-z0-9'\-\s()]+)\s*[:=]\s*(?<qty>\d+(?:\.\d+)?)/i,
      /^(?<qty>\d+(?:\.\d+)?)\s*(?:scu|u|units?)?\s+(?:of\s+)?(?<name>[a-z0-9'\-\s()]+)/i,
      /^(?<name>[a-z0-9'\-\s()]+)\s+(?<qty>\d+(?:\.\d+)?)(?:\s*(?:scu|u|units?))?$/i,
      /^(?<name>[a-z0-9'\-\s()]+)\s+x\s*(?<qty>\d+(?:\.\d+)?)/i,
    ];
    let match = null;
    for (const pattern of patterns) {
      match = segmentWithoutPrice.match(pattern);
      if (match) break;
    }
    if (!match) continue;
    const name = (match.groups.name || '').replace(/\s+/g, ' ').trim();
    const qty = Number(match.groups.qty);
    if (!name || !Number.isFinite(qty) || qty <= 0) continue;
    if (!isLikelyCommodityName(name)) {
      continue;
    }
    items.push({ commodity_name: name, scuAmount: qty, avg_price: Number.isFinite(price) ? price : null });
  }
  if (items.length) return items;
  return extractFreeformCargo(trimmed);
}

function isLikelyCommodityName(name) {
  if (!name) return false;
  const value = name.trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (/^(?:i|me|my|mine|we|us|they|them|you|ya|yo)\b/.test(lower)) return false;
  if (/(?:\bstole\b|\bsteal\b|\bstolen\b|\bhit\b|\bwith\b|\bassists?\b|\bwas\b|\bwere\b|\bsolo\b)/.test(lower)) return false;
  if (lower.includes('scu')) return false;
  if (value.length > 48) return false;
  return true;
}

function sanitizeCommodityLabel(raw) {
  if (!raw) return null;
  return raw
    .replace(/^(?:of|the|some|a|an)\s+/i, '')
    .replace(/\s+(?:and|&)?$/i, '')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFreeformCargo(text) {
  const matches = [];
  const seen = new Set();
  for (const pattern of FREEFORM_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const qty = Number(match.groups?.qty);
      const unit = match.groups?.unit;
      const rawName = match.groups?.name;
      if (!unit || !rawName || !Number.isFinite(qty) || qty <= 0) continue;
      const cleanedName = sanitizeCommodityLabel(rawName);
      if (!cleanedName) continue;
      const key = `${match.index}:${cleanedName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ commodity_name: cleanedName, scuAmount: qty });
    }
  }
  return matches;
}

async function enrichCargoPricing(items) {
  if (!items.length) return { priced: [], totalValue: 0, totalScu: 0 };
  await ensureUexCacheReady();
  let totalValue = 0;
  let totalScu = 0;
  const priced = items.map((entry) => {
    const explicit = Number(entry?.avg_price);
    const hasExplicit = Number.isFinite(explicit) && explicit > 0;
    const lookup = hasExplicit ? null : lookupBestSellPrice(entry.commodity_name);
    const avgPrice = hasExplicit ? Math.round(explicit) : (lookup?.price ?? 0);
    const extended = Number(entry.scuAmount) * avgPrice;
    totalValue += Number.isFinite(extended) ? extended : 0;
    totalScu += Number(entry.scuAmount) || 0;
    return {
      commodity_name: entry.commodity_name,
      scuAmount: Number(entry.scuAmount) || 0,
      avg_price: avgPrice,
      pricing_note: hasExplicit
        ? 'custom'
        : (lookup?.location ? `Best sell @ ${lookup.location}` : null),
      pricing_match: hasExplicit ? null : (lookup?.matchName || null),
    };
  });
  return { priced, totalValue, totalScu };
}

function parseAssistsFromMessage(message, { excludeIds = [] } = {}) {
  const content = (message.content || '').trim();
  if (!content && !message.mentions?.users?.size) {
    return { handled: false, assists: [], guests: [] };
  }
  if (matchesCommand(content, COMMAND_WORDS.skip)) {
    return { handled: true, assists: [], guests: [], skipped: true };
  }
  const assists = new Set();
  const excluded = new Set((excludeIds || []).filter(Boolean).map((id) => String(id)));
  if (message.mentions?.users?.size) {
    for (const user of message.mentions.users.values()) {
      if (excluded.has(String(user.id))) continue;
      assists.add(String(user.id));
    }
  }
  const manualMatches = content.match(/<@!?(\d+)>/g);
  if (manualMatches) {
    for (const raw of manualMatches) {
      const id = raw.replace(/\D/g, '');
      if (id && !excluded.has(id)) assists.add(id);
    }
  }
  const guestMatch = content.match(/guests?\s*[:=]\s*(.+)$/i);
  let guests = guestMatch ? splitList(guestMatch[1]) : [];
  if (assists.size === 0 && guests.length === 0) {
    const { resolvedIds, unresolvedNames } = extractAssistHintsFromContent(content);
    for (const id of resolvedIds) {
      assists.add(id);
    }
    if (unresolvedNames.length) {
      guests = dedupeStrings(unresolvedNames.slice(0, AUTO_ASSIST_LIMIT));
    }
  }
  if (assists.size === 0 && guests.length === 0) {
    return { handled: false, assists: [], guests: [] };
  }
  return { handled: true, assists: Array.from(assists), guests, skipped: false };
}

function cleanAssistName(raw) {
  if (!raw) return null;
  let value = raw.replace(/<@!?(\d+)>/g, '').replace(/[@#]/g, '').trim();
  value = value.replace(/\b(?:for|on|during|while|watching|covering|holding|running|flying|guarding|supporting|helping|against|near|in|at)\b.*$/i, '').trim();
  value = value.replace(/[^a-z0-9\s'._-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!value || value.length < 2) return null;
  if (/^\d+$/.test(value)) return null;
  if (!/[a-z]/i.test(value)) return null;
  if (ASSIST_NAME_STOPWORDS.test(value.toLowerCase())) return null;
  return value;
}

function extractAssistHintsFromContent(content) {
  if (!content) return { resolvedIds: [], unresolvedNames: [] };
  const candidates = [];
  for (const pattern of ASSIST_CAPTURE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const segment = (match.groups?.names || '').trim();
      if (!segment) continue;
      const pieces = segment.split(ASSIST_NAME_SPLIT_REGEX).map((part) => cleanAssistName(part)).filter(Boolean);
      candidates.push(...pieces);
    }
  }
  if (!candidates.length) return { resolvedIds: [], unresolvedNames: [] };
  const uniqueNames = dedupeStrings(candidates).slice(0, AUTO_ASSIST_LIMIT * 2);
  const resolvedIds = [];
  const unresolvedNames = [];
  for (const name of uniqueNames) {
    const user = getUserFromCacheByName?.(name);
    if (user?.id) {
      resolvedIds.push(user.id);
    } else {
      unresolvedNames.push(name);
    }
    if (resolvedIds.length >= AUTO_ASSIST_LIMIT) break;
  }
  return { resolvedIds, unresolvedNames };
}

function resolveAssistNamesFromExtraction(names = []) {
  if (!Array.isArray(names) || !names.length) {
    return { assists: [], guests: [] };
  }
  const assists = new Set();
  const guests = [];
  for (const raw of names) {
    const mentionMatch = typeof raw === 'string' ? raw.match(/<@!?(\d+)>/) : null;
    if (mentionMatch) {
      assists.add(mentionMatch[1]);
      continue;
    }
    const cleaned = cleanAssistName(raw);
    if (!cleaned) continue;
    const user = getUserFromCacheByName?.(cleaned);
    if (user?.id) {
      assists.add(String(user.id));
    } else {
      guests.push(cleaned);
    }
    if (assists.size >= AUTO_ASSIST_LIMIT) break;
  }
  return {
    assists: Array.from(assists),
    guests: dedupeStrings(guests).slice(0, AUTO_ASSIST_LIMIT),
  };
}

function extractionIndicatesSolo(names = []) {
  if (!Array.isArray(names) || !names.length) return false;
  return names.some((value) => typeof value === 'string' && /\b(none|solo|alone|no assists?)\b/i.test(value));
}

function mapExtractionCargoToItems(entries = []) {
  return entries
    .slice(0, AUTO_EXTRACTION_MAX_CARGO)
    .map((entry) => {
      const commodityName = entry?.name ? String(entry.name).trim() : null;
      const amount = Number(entry?.quantity ?? entry?.amount ?? entry?.scuAmount);
      if (!commodityName || !Number.isFinite(amount) || amount <= 0) return null;
      return { commodity_name: commodityName, scuAmount: amount };
    })
    .filter(Boolean);
}

function coerceTimestampIso(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

function normalizeAirOrGroundValue(value) {
  const str = (value == null ? '' : String(value)).trim().toLowerCase();
  if (!str) return null;
  if (str.startsWith('g')) return 'Ground';
  if (str.startsWith('a')) return 'Air';
  return null;
}

function normalizePiracyStyleValue(value) {
  const str = (value == null ? '' : String(value)).trim().toLowerCase();
  if (!str) return null;
  if (str.startsWith('ext')) return 'Extortion';
  if (str.startsWith('bru') || str.startsWith('for')) return 'Brute Force';
  return null;
}

function inferEngagementDetailsFromText(text) {
  const result = {};
  const raw = (text || '').trim();
  if (!raw) return result;
  const lowered = raw.toLowerCase();
  const directAir = normalizeAirOrGroundValue(raw);
  if (directAir) {
    result.air_or_ground = directAir;
  } else if (/\bground\b/.test(lowered)) {
    result.air_or_ground = 'Ground';
  } else if (/\bair\b/.test(lowered)) {
    result.air_or_ground = 'Air';
  }
  const directPiracy = normalizePiracyStyleValue(raw);
  if (directPiracy) {
    result.type_of_piracy = directPiracy;
  } else if (/\bextort(?:ion|ing|ed|s)?\b/.test(lowered)) {
    result.type_of_piracy = 'Extortion';
  } else if (/\bbrute\s*force\b/.test(lowered) || /\bbruteforce\b/.test(lowered)) {
    result.type_of_piracy = 'Brute Force';
  }
  return result;
}

function isPureEngagementResponse(text) {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  const allowed = new Set(['air', 'ground', 'brute', 'force', 'bruteforce', 'extortion', 'with', 'and', 'or']);
  return normalized.split(' ').every((token) => allowed.has(token));
}

function setSessionAirOrGround(session, value) {
  if (!session) return null;
  const target = session.fields || session;
  if (!target) return null;
  const normalized = normalizeAirOrGroundValue(value);
  if (!normalized) return null;
  target.air_or_ground = normalized;
  return normalized;
}

function setSessionPiracyStyle(session, value) {
  if (!session) return null;
  const target = session.fields || session;
  if (!target) return null;
  const normalized = normalizePiracyStyleValue(value);
  if (!normalized) return null;
  target.type_of_piracy = normalized;
  return normalized;
}

function applyExtractionOptionalDetails(session, extraction) {
  if (!extraction) return;
  if (extraction.title && !session.fields.title) session.fields.title = extraction.title;
  if (extraction.story && !session.fields.story) session.fields.story = extraction.story;
  if (extraction.type_of_piracy) {
    const appliedPiracy = setSessionPiracyStyle(session, extraction.type_of_piracy);
    if (!appliedPiracy) {
      setSessionAirOrGround(session, extraction.type_of_piracy);
    }
  }
  if (extraction.timestamp) {
    const normalized = coerceTimestampIso(extraction.timestamp);
    if (normalized) session.fields.timestamp = normalized;
  }
  if (Array.isArray(extraction.victims) && extraction.victims.length) {
    session.fields.victims = dedupeStrings((session.fields.victims || []).concat(extraction.victims));
  }
  if (Array.isArray(extraction.guests) && extraction.guests.length) {
    session.fields.guests = dedupeStrings((session.fields.guests || []).concat(extraction.guests));
  }
}

function normalizeUrlCandidates(values = []) {
  return dedupeStrings(values)
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//i.test(value))
    .slice(0, MAX_MEDIA_LINKS);
}

function parseOptionalDetails(message) {
  const content = (message.content || '').trim();
  const attachments = Array.from(message.attachments?.values?.() || []);
  const details = {};
  let hasStructuredFields = false;
  if (content.includes('=') || content.includes(':')) {
    const segments = content.split(/;|\n/);
    for (const raw of segments) {
      const segment = raw.trim();
      if (!segment) continue;
      const match = segment.match(/^(\w+)\s*[:=]\s*(.+)$/i);
      if (!match) continue;
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (!value) continue;
      switch (key) {
        case 'title':
          details.title = value;
          hasStructuredFields = true;
          break;
        case 'story':
        case 'summary':
          details.story = value;
          hasStructuredFields = true;
          break;
        case 'video':
        case 'video_link':
          details.video_link = value;
          hasStructuredFields = true;
          break;
        case 'media':
        case 'additional_media':
          details.additional_media_links = splitList(value);
          hasStructuredFields = true;
          break;
        case 'victims':
          details.victims = splitList(value);
          hasStructuredFields = true;
          break;
        case 'guests':
          details.guests = splitList(value);
          hasStructuredFields = true;
          break;
        case 'air':
        case 'mode':
        case 'air_or_ground':
        case 'engagement':
          details.air_or_ground = value;
          hasStructuredFields = true;
          break;
        case 'piracy':
        case 'piracy_type':
        case 'type_of_piracy':
        case 'piracy_style':
          details.type_of_piracy = value;
          hasStructuredFields = true;
          break;
        case 'type':
          {
            const piracyGuess = normalizePiracyStyleValue(value);
            if (piracyGuess) {
              details.type_of_piracy = piracyGuess;
              hasStructuredFields = true;
            } else {
              details.air_or_ground = value;
              hasStructuredFields = true;
            }
          }
          break;
        case 'timestamp':
          {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.valueOf())) {
              details.timestamp = parsed.toISOString();
              hasStructuredFields = true;
            }
          }
          break;
        case 'patch':
          details.patch = value;
          hasStructuredFields = true;
          break;
        case 'victim':
          details.victims = splitList(value);
          hasStructuredFields = true;
          break;
        default:
          break;
      }
    }
  }
  if (content) {
    const inferred = inferEngagementDetailsFromText(content);
    if (inferred.air_or_ground && !details.air_or_ground) {
      details.air_or_ground = inferred.air_or_ground;
    }
    if (inferred.type_of_piracy && !details.type_of_piracy) {
      details.type_of_piracy = inferred.type_of_piracy;
    }
    const inferredAny = Boolean(inferred.air_or_ground || inferred.type_of_piracy);
    if (inferredAny && isPureEngagementResponse(content)) {
      hasStructuredFields = true;
    }
  }
  if (!hasStructuredFields && content) {
    details.story = content;
    hasStructuredFields = true;
  }
  if (attachments.length) {
    const urls = attachments.map((file) => file?.url).filter(Boolean);
    if (urls.length) {
      details.additional_media_links = (details.additional_media_links || []).concat(urls);
    }
  }
  return details;
}

function mergeOptionalDetails(target, updates) {
  if (!updates || typeof updates !== 'object') return;
  if (updates.title) target.title = updates.title;
  if (updates.story) target.story = updates.story;
  if (updates.video_link) target.video_link = updates.video_link;
  if (Array.isArray(updates.additional_media_links) && updates.additional_media_links.length) {
    target.additional_media_links = normalizeUrlCandidates((target.additional_media_links || []).concat(updates.additional_media_links));
  }
  if (Array.isArray(updates.victims) && updates.victims.length) {
    target.victims = dedupeStrings((target.victims || []).concat(updates.victims));
  }
  if (Array.isArray(updates.guests) && updates.guests.length) {
    target.guests = dedupeStrings((target.guests || []).concat(updates.guests));
  }
  if (updates.type_of_piracy) setSessionPiracyStyle(target, updates.type_of_piracy);
  if (updates.air_or_ground) setSessionAirOrGround(target, updates.air_or_ground);
  if (updates.timestamp) target.timestamp = updates.timestamp;
  if (updates.patch) target.patch = updates.patch;
}

function buildCargoSummary(session) {
  const lines = session.fields.cargo.map((entry) => {
    const value = entry.scuAmount * (entry.avg_price || 0);
    const parts = [`${entry.commodity_name} — ${formatScu(entry.scuAmount)} SCU`];
    if (entry.avg_price) {
      parts.push(`@ ${formatCurrency(entry.avg_price)}`);
    }
    if (value) {
      parts.push(`(${formatCurrency(value)} total)`);
    }
    if (entry.pricing_note) {
      parts.push(`| ${entry.pricing_note}`);
    }
    return `• ${parts.join(' ')}`;
  });
  lines.push(`Total: ${formatScu(session.pricing.totalScu)} SCU / ${formatCurrency(session.pricing.totalValue)} aUEC`);
  return lines.join('\n');
}

function buildAssistsSummary(session) {
  if (!session.fields.assists.length) return 'Assists: None';
  const mentions = session.fields.assists.map((id) => `<@${id}>`).join(', ');
  return `Assists: ${mentions}`;
}

function buildGuestsSummary(session) {
  if (!session.fields.guests || !session.fields.guests.length) return null;
  return `Guests: ${session.fields.guests.join(', ')}`;
}

function buildAssistAndOptionalSummary(session) {
  const guestLine = buildGuestsSummary(session);
  const assistBlock = [buildAssistsSummary(session), guestLine].filter(Boolean).join('\n');
  return `${assistBlock}\n\n${AIR_AND_PIRACY_PROMPT}\n\n${OPTIONAL_DETAILS_PROMPT}`;
}

function buildStatusSummary(session) {
  const sections = [];
  sections.push(`Cargo: ${session.fields.cargo.length ? `${session.fields.cargo.length} items` : 'pending'}`);
  sections.push(`Assists: ${session.fields.assists.length ? session.fields.assists.length : 'pending'}`);
  sections.push(`Extras: ${session.fields.story || session.fields.title || session.fields.video_link || session.fields.victims.length || session.fields.additional_media_links.length ? 'captured' : 'optional'}`);
  sections.push(`Total Value: ${session.pricing.totalValue ? `${formatCurrency(session.pricing.totalValue)} aUEC` : 'tbd'}`);
  return sections.join(' | ');
}

function formatTimestampForSummary(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return date.toISOString();
  } catch {
    return value;
  }
}

function buildOptionalDetailsSummary(session) {
  const fields = session.fields || {};
  const lines = [];
  if (fields.title) lines.push(`Title: ${fields.title}`);
  if (fields.story) lines.push(`Story: ${fields.story}`);
  if (fields.video_link) lines.push(`Video: ${fields.video_link}`);
  if (fields.victims?.length) lines.push(`Victims: ${fields.victims.join(', ')}`);
  if (fields.additional_media_links?.length) {
    lines.push(`Media links: ${fields.additional_media_links.length}`);
  }
  if (fields.air_or_ground) lines.push(`Engagement: ${fields.air_or_ground}`);
  if (fields.type_of_piracy) lines.push(`Piracy Style: ${fields.type_of_piracy}`);
  if (fields.timestamp) {
    const formatted = formatTimestampForSummary(fields.timestamp);
    if (formatted) lines.push(`Timestamp: ${formatted}`);
  }
  if (fields.patch) lines.push(`Patch: ${fields.patch}`);
  return lines.join('\n');
}

function buildConfirmationSummary(session) {
  const sections = [buildCargoSummary(session), '', buildAssistsSummary(session)];
  const guestsLine = buildGuestsSummary(session);
  if (guestsLine) sections.push(guestsLine);
  const optional = buildOptionalDetailsSummary(session);
  if (optional) {
    sections.push('', optional);
  }
  return sections.filter(Boolean).join('\n');
}

function buildConfirmationPrompt(session, { prefix } = {}) {
  const header = prefix || 'Review the hit before I post it:';
  const summary = buildConfirmationSummary(session);
  return `${header}\n\n${summary}\n\n${CONFIRMATION_INSTRUCTIONS}`;
}

function buildSuccessMessage(session, createdHit) {
  const title = session.fields.title || createdHit?.title || 'Pirate Hit';
  const assists = session.fields.assists.length ? session.fields.assists.map((id) => `<@${id}>`).join(', ') : 'None';
  const valueLine = `${formatScu(session.pricing.totalScu)} SCU / ${formatCurrency(session.pricing.totalValue)} aUEC`;
  const lines = [
    `Logged **${title}** for <@${session.userId}> (${valueLine}).`,
    `Assists: ${assists}.`,
  ];
  if (session.fields.guests?.length) {
    lines.push(`Guests: ${session.fields.guests.join(', ')}`);
  }
  if (createdHit?.thread_id) {
    lines.push(`Thread: <#${createdHit.thread_id}>`);
  }
  lines.push('If something is wrong, say "cancel hit" and start over or edit it in the dashboard.');
  return lines.join('\n');
}

function buildHitPayload(session) {
  const fields = session.fields;
  const rawId = Number(fields.id);
  const entryId = Number.isFinite(rawId) ? rawId : generateHitEntryId();
  const airOrGround = normalizeAirOrGroundValue(fields.air_or_ground) || DEFAULT_AIR_OR_GROUND;
  const piracyStyle = normalizePiracyStyleValue(fields.type_of_piracy) || DEFAULT_PIRACY_STYLE;
  const valueLabel = formatCurrency(Math.round(session.pricing.totalValue || 0));
  const baseTitle = fields.title
    || `${fields.username || fields.nickname || 'Unknown'} hit — ${valueLabel} aUEC`;
  return {
    id: entryId,
    user_id: fields.user_id,
    username: fields.username,
    nickname: fields.nickname,
    title: baseTitle,
    story: fields.story || undefined,
    cargo: fields.cargo.map((entry) => ({
      commodity_name: entry.commodity_name,
      scuAmount: entry.scuAmount,
      avg_price: entry.avg_price,
    })),
    total_scu: Number(session.pricing.totalScu.toFixed(2)),
    total_value: Math.round(session.pricing.totalValue),
    assists: fields.assists,
    guests: fields.guests,
    victims: fields.victims,
    video_link: fields.video_link || undefined,
    additional_media_links: fields.additional_media_links,
    type_of_piracy: piracyStyle,
    air_or_ground: airOrGround,
    timestamp: fields.timestamp || new Date().toISOString(),
    patch: fields.patch || undefined,
    fleet_activity: false,
  };
}

async function submitHit(session, { client, openai }) {
  const payload = buildHitPayload(session);
  const created = await HitTrackerModel.create(payload);
  if (!created) {
    throw new Error('Hit creation failed');
  }
  const merged = { ...created, ...payload };
  try {
    await handleHitPost(client, openai, merged);
  } catch (error) {
    console.error('[HitIntake] handleHitPost failed:', error?.message || error);
    throw new Error('Discord thread creation failed');
  }
  session.status = 'completed';
  sessions.delete(session.key);
  return merged;
}

function ensureStep(session, step) {
  session.step = step;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
}

async function processCargoStep(session, message) {
  if (wantsSkip(message.content || '')) {
    session.fields.cargo = [];
    session.pricing.totalValue = 0;
    session.pricing.totalScu = 0;
    ensureStep(session, 'assists');
    return `No cargo recorded.
Total: ${formatScu(session.pricing.totalScu)} SCU / ${formatCurrency(session.pricing.totalValue)} aUEC

Tag every assist or say \`none\`.`;
  }
  const items = parseCargoInput(message.content || '');
  if (!items.length) {
    return 'Provide the cargo manifest (`Commodity: SCU`, optionally `@ price`) or say `none` if nothing was taken.';
  }
  const { priced, totalValue, totalScu } = await enrichCargoPricing(items);
  if (!priced.length) {
    return 'I could not parse those cargo entries. Use `Item: SCU` on separate lines.';
  }
  session.fields.cargo = priced;
  session.pricing.totalValue = totalValue;
  session.pricing.totalScu = totalScu;
  ensureStep(session, 'assists');
  return `${buildCargoSummary(session)}\n\nTag every assist or say \`none\`.`;
}

async function processAssistsStep(session, message) {
  const parsed = parseAssistsFromMessage(message, { excludeIds: [session.botUserId] });
  if (!parsed.handled) {
    return 'Need the assists. Mention them or say `none` if nothing was taken.';
  }
  session.fields.assists = parsed.assists;
  if (parsed.guests.length) {
    session.fields.guests = dedupeStrings((session.fields.guests || []).concat(parsed.guests));
  }
  ensureStep(session, 'details');
  return buildAssistAndOptionalSummary(session);
}

function processDetailsStep(session, message) {
  if (wantsSkip(message.content || '')) {
    ensureStep(session, 'confirm');
    return buildConfirmationPrompt(session, { prefix: 'Skipping extras. Review everything before I post it:' });
  }
  const details = parseOptionalDetails(message);
  if (!Object.keys(details).length) {
    return 'Did not catch any details. Use `title=`, `air=Ground`, `piracy=Extortion`, `video=` or say `skip`.';
  }
  mergeOptionalDetails(session.fields, details);
  ensureStep(session, 'confirm');
  return buildConfirmationPrompt(session, { prefix: 'Extras locked. Review everything before I post it:' });
}

function ensureSession(meta, message) {
  const key = getSessionKey(meta);
  let session = sessions.get(key);
  if (!session) {
    session = startSession(meta, message);
  }
  return session;
}

async function tryAutoBootstrapHitFromModel({ session, message, meta, openai }) {
  if (!session || !message?.content) return null;
  try {
    const extraction = await extractHitIntentFields({ message, meta, openai });
    if (!extraction || extraction.action !== 'hit_create') return null;
    if ((extraction.confidence || 0) < AUTO_EXTRACTION_MIN_CONFIDENCE) return null;
    const cargoItems = mapExtractionCargoToItems(extraction.cargo);
    if (!cargoItems.length) return null;
    const { priced, totalValue, totalScu } = await enrichCargoPricing(cargoItems);
    if (!priced.length) return null;
    session.fields.cargo = priced;
    session.pricing.totalValue = totalValue;
    session.pricing.totalScu = totalScu;

    const resolvedAssists = resolveAssistNamesFromExtraction(extraction.assists);
    if (resolvedAssists.assists.length) {
      session.fields.assists = resolvedAssists.assists;
    }
    if (resolvedAssists.guests.length) {
      session.fields.guests = dedupeStrings((session.fields.guests || []).concat(resolvedAssists.guests));
    }
    if (Array.isArray(extraction.guests) && extraction.guests.length) {
      session.fields.guests = dedupeStrings((session.fields.guests || []).concat(extraction.guests));
    }
    applyExtractionOptionalDetails(session, extraction);
    if (message?.content) {
      const inferred = inferEngagementDetailsFromText(message.content);
      if (inferred.air_or_ground) setSessionAirOrGround(session, inferred.air_or_ground);
      if (inferred.type_of_piracy) setSessionPiracyStyle(session, inferred.type_of_piracy);
    }

    const mentionAssistParse = parseAssistsFromMessage(message, { excludeIds: [meta?.botUserId] });
    if (mentionAssistParse?.handled) {
      if (mentionAssistParse.assists.length) {
        session.fields.assists = dedupeStrings((session.fields.assists || []).concat(mentionAssistParse.assists));
      }
      if (mentionAssistParse.guests.length) {
        session.fields.guests = dedupeStrings((session.fields.guests || []).concat(mentionAssistParse.guests));
      }
    }

    const soloAcknowledged = extractionIndicatesSolo(extraction.assists);
    if (session.fields.assists.length || session.fields.guests.length || soloAcknowledged) {
      ensureStep(session, 'details');
      const reply = [
        buildCargoSummary(session),
        '',
        buildAssistAndOptionalSummary(session),
      ].join('\n');
      return { handled: true, reply };
    }

    ensureStep(session, 'assists');
    return {
      handled: true,
      reply: `${buildCargoSummary(session)}\n\nTag every assist or say \`none\`.`,
    };
  } catch (error) {
    console.error('[HitIntake] auto extraction bootstrap failed:', error?.message || error);
    return null;
  }
}

async function processHitIntakeInteraction({ message, meta, intent, client, openai }) {
  cleanupExpiredSessions();
  const content = message.content || '';
  const sessionKey = getSessionKey(meta);
  const existingSession = sessions.get(sessionKey);
  const shouldStart = shouldStartSession(intent, content);
  if (!existingSession && !shouldStart) {
    return { handled: false };
  }
  const session = ensureSession(meta, message);
  if (wantsStatus(content)) {
    return {
      handled: true,
      intent: SESSION_INTENT,
      reply: `Hit intake progress: ${buildStatusSummary(session)}`,
    };
  }
  if (wantsCancel(content)) {
    sessions.delete(session.key);
    return {
      handled: true,
      intent: SESSION_INTENT,
      reply: 'Fine. Canceled the hit intake. Start over when you have your act together.',
    };
  }

  if (!existingSession) {
    const autoBootstrap = await tryAutoBootstrapHitFromModel({ session, message, meta, openai });
    if (autoBootstrap?.handled) {
      return { handled: true, intent: SESSION_INTENT, reply: autoBootstrap.reply };
    }
  }

  let reply;
  if (session.step === 'cargo') {
    reply = await processCargoStep(session, message);
    if (session.step === 'assists') {
      const autoAssists = parseAssistsFromMessage(message, { excludeIds: [session.botUserId] });
      if (autoAssists.handled) {
        session.fields.assists = autoAssists.assists;
        if (autoAssists.guests.length) {
          session.fields.guests = dedupeStrings((session.fields.guests || []).concat(autoAssists.guests));
        }
        if (autoAssists.skipped || session.fields.assists.length || session.fields.guests.length) {
          ensureStep(session, 'details');
          const cargoBlock = buildCargoSummary(session);
          reply = `${cargoBlock}\n\n${buildAssistAndOptionalSummary(session)}`;
          return { handled: true, intent: SESSION_INTENT, reply };
        }
      }
    }
    return { handled: true, intent: SESSION_INTENT, reply };
  }
  if (session.step === 'assists') {
    reply = await processAssistsStep(session, message);
    return { handled: true, intent: SESSION_INTENT, reply };
  }
  if (session.step === 'details') {
    reply = processDetailsStep(session, message);
    return { handled: true, intent: SESSION_INTENT, reply };
  }
  if (session.step === 'confirm') {
    if (wantsDone(content)) {
      try {
        const created = await submitHit(session, { client, openai });
        reply = buildSuccessMessage(session, created);
      } catch (error) {
        console.error('[HitIntake] Failed to submit hit:', error?.message || error);
        sessions.delete(session.key);
        reply = `I borked the submission (${error?.message || 'unknown error'}). Try again in a bit or ping an officer.`;
      }
      return { handled: true, intent: SESSION_INTENT, reply };
    }

    if (wantsSkip(content)) {
      return {
        handled: true,
        intent: SESSION_INTENT,
        reply: 'If everything above looks right, say `done` to log it or keep adjusting fields.',
      };
    }

    const detailUpdates = parseOptionalDetails(message);
    if (Object.keys(detailUpdates).length) {
      mergeOptionalDetails(session.fields, detailUpdates);
      reply = buildConfirmationPrompt(session, { prefix: 'Updated the details. Review before I post it:' });
      return { handled: true, intent: SESSION_INTENT, reply };
    }

    return {
      handled: true,
      intent: SESSION_INTENT,
      reply: 'Need either more field updates (e.g., `title=New Title`) or say `done` to post the hit.',
    };
  }
  return { handled: true, intent: SESSION_INTENT, reply: 'Still working on it. Keep feeding me the details.' };
}

module.exports = {
  processHitIntakeInteraction,
  getActiveHitIntakeSessions: () => ({ size: sessions.size }),
};

module.exports.__internals = {
  parseCargoInput,
  enrichCargoPricing,
  buildCargoSummary,
  dedupeStrings,
  splitList,
  formatCurrency,
  formatScu,
};
