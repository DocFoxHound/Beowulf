const { saveMemoryEntry } = require('./memory-store');
const { UserProfilesModel } = require('../../api/models/user-profiles');
const {
  getUserProfileFromCache,
  upsertUserProfileInCache,
  refreshUserProfilesCache,
} = require('../../common/user-profiles-cache');
const { isBotUser } = require('../../common/bot-identity');

const MEMORY_MODEL = process.env.CHATGPT_MEMORY_MODEL || process.env.CHATGPT_PERSONA_MODEL || 'gpt-4o-mini';
const MEMORY_IMPORTANCE_THRESHOLD = Math.max(1, Number(process.env.MEMORY_IMPORTANCE_THRESHOLD || 3));
const MAX_MEMORIES_PER_BATCH = Math.max(1, Number(process.env.MEMORY_BATCH_MAX_MEMORIES || 3));
const MEMORY_BATCH_DEBUG = 0;
const MAX_SERIALIZED_MESSAGES = Math.max(5, Number(process.env.MEMORY_BATCH_MAX_MESSAGES || 20));
const MESSAGE_CHAR_LIMIT = Math.max(80, Number(process.env.MEMORY_BATCH_MESSAGE_CHAR_LIMIT || 400));
const PROMPT_CHAR_LIMIT = Math.max(2000, Number(process.env.MEMORY_BATCH_PROMPT_CHAR_LIMIT || 9000));
const PROFILE_NOTES_KEY = 'notes';
const PERSONA_STRING_FIELDS = ['profession', 'demeanor', 'relationship_notes', 'personality_summary', 'catchphrase'];
const PERSONA_ARRAY_FIELDS = ['known_for', 'notable_quotes', 'favorite_topics', 'achievements', 'notable_traits', 'warnings'];
const PERSONA_TRAIT_FIELDS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'confidence', 'courage', 'integrity', 'resilience', 'humor'];
const ALLOWED_MEMORY_TYPES = new Set(['episodic', 'inside_joke', 'profile', 'lore', 'dogfighting_advice', 'piracy_advice']);
const MAX_PROFILE_NICKNAME = 120;
const DEFAULT_LIKEABLE_SCORE = (() => {
  const raw = Number(process.env.USER_PROFILE_DEFAULT_LIKEABLE || 55);
  if (Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, raw));
  }
  return 55;
})();
const STAT_FIELD_RULES = {
  likeable: {
    min: 0,
    max: 100,
    default: DEFAULT_LIKEABLE_SCORE,
  },
};

function logMemoryError(context, error, meta = {}) {
  const safeMeta = (() => {
    try {
      return JSON.stringify(meta);
    } catch {
      return String(meta);
    }
  })();
  const details = error?.stack || error?.message || String(error);
  console.error(`[MemoryBatcher][error] ${context} meta=${safeMeta}\n${details}`);
}

function emitHeartbeat({ channelId, reason, processed, status, memories = 0, adjustments = 0 }) {
  console.log(`[MemoryBatcher][heartbeat] channel=${channelId || 'unknown'} reason=${reason || 'n/a'} processed=${processed} memories=${memories} adjustments=${adjustments} status=${status}`);
}

async function refreshProfilesCacheSafe() {
  if (typeof refreshUserProfilesCache !== 'function') return;
  try {
    await refreshUserProfilesCache();
  } catch (error) {
    console.error('[MemoryBatcher] User profiles cache refresh failed:', error?.message || error);
  }
}

function toArrayOfStrings(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  return [];
}

function parseStatsJsonValue(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...parsed };
      }
    } catch {}
  }
  return {};
}

function mergeArraysUnique(base = [], incoming = []) {
  const set = new Set();
  for (const entry of base.concat(incoming)) {
    if (!entry) continue;
    const text = String(entry).trim();
    if (text) set.add(text);
  }
  return Array.from(set);
}

function sanitizeNickname(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > MAX_PROFILE_NICKNAME ? text.slice(0, MAX_PROFILE_NICKNAME) : text;
}

function getUserIdentitySnapshot(userId) {
  if (!userId) return null;
  try {
    const cache = globalThis?.userListCache;
    if (cache && typeof cache.getById === 'function') {
      return cache.getById(userId) || null;
    }
  } catch (error) {
    if (MEMORY_BATCH_DEBUG) {
      console.warn('[MemoryBatcher] Failed to read userListCache for nickname:', error?.message || error);
    }
  }
  return null;
}

function derivePreferredNickname({ providedNickname, existingNickname, fallbackUser }) {
  const candidates = [
    providedNickname,
    fallbackUser?.nickname,
    fallbackUser?.username,
    existingNickname,
  ];
  for (const candidate of candidates) {
    const normalized = sanitizeNickname(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeTraits(traitsSource = {}) {
  if (!traitsSource || typeof traitsSource !== 'object') return null;
  const traits = {};
  for (const key of PERSONA_TRAIT_FIELDS) {
    const value = traitsSource[key];
    if (value === undefined || value === null || value === '') continue;
    const num = Number(value);
    if (Number.isNaN(num)) continue;
    const clamped = Math.max(0, Math.min(10, num));
    traits[key] = Number(clamped.toFixed(2));
  }
  return Object.keys(traits).length ? traits : null;
}

function mergeTraits(existing = {}, incoming = {}) {
  if (!incoming || !Object.keys(incoming).length) return Object.keys(existing || {}).length ? existing : null;
  const merged = { ...(existing || {}) };
  for (const key of PERSONA_TRAIT_FIELDS) {
    if (incoming[key] === undefined || incoming[key] === null) continue;
    const incomingValue = Number(incoming[key]);
    if (Number.isNaN(incomingValue)) continue;
    const current = Number(merged[key]);
    if (Number.isNaN(current)) {
      merged[key] = incomingValue;
    } else {
      const blended = (current * 0.7) + (incomingValue * 0.3);
      merged[key] = Number(Math.max(0, Math.min(10, blended)).toFixed(2));
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function normalizePersonaDetails(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const normalized = {};
  for (const key of PERSONA_STRING_FIELDS) {
    if (raw[key]) {
      const value = String(raw[key]).trim();
      if (value) normalized[key] = value;
    }
  }
  for (const key of PERSONA_ARRAY_FIELDS) {
    const arr = toArrayOfStrings(raw[key]);
    if (arr.length) normalized[key] = arr;
  }
  if (raw.summary && !normalized.personality_summary) {
    const summary = String(raw.summary).trim();
    if (summary) normalized.personality_summary = summary;
  }
  const traitPayload = raw.traits || raw.persona_traits || raw.persona_traits_map;
  const normalizedTraits = normalizeTraits({ ...(traitPayload || {}), ...PERSONA_TRAIT_FIELDS.reduce((acc, key) => {
    if (raw[key] !== undefined) acc[key] = raw[key];
    return acc;
  }, {}) });
  if (normalizedTraits) {
    normalized.traits = normalizedTraits;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function mergePersonaDetails(existing = {}, incoming = {}) {
  const merged = { ...existing };
  for (const key of PERSONA_STRING_FIELDS) {
    if (incoming[key]) merged[key] = incoming[key];
  }
  for (const key of PERSONA_ARRAY_FIELDS) {
    if (incoming[key]) {
      const base = Array.isArray(merged[key]) ? merged[key] : [];
      merged[key] = mergeArraysUnique(base, incoming[key]);
    }
  }
  if (incoming.personality_summary) merged.personality_summary = incoming.personality_summary;
  if (incoming.traits) {
    const currentTraits = merged.traits && typeof merged.traits === 'object' ? merged.traits : {};
    const blended = mergeTraits(currentTraits, incoming.traits);
    if (blended) merged.traits = blended;
  }
  return Object.keys(merged).length ? merged : null;
}

function normalizeStatNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampStatField(name, value) {
  const num = normalizeStatNumber(value);
  if (num === null) return null;
  const rule = STAT_FIELD_RULES[name];
  if (!rule) return Number(num.toFixed(2));
  const clamped = Math.max(rule.min, Math.min(rule.max, num));
  return Number(clamped.toFixed(2));
}

function blendStatValue(name, currentValue, incomingValue) {
  const incoming = clampStatField(name, incomingValue);
  if (incoming === null) return clampStatField(name, currentValue);
  const current = clampStatField(name, currentValue);
  if (current === null) return incoming;
  const blended = (current + incoming) / 2;
  return clampStatField(name, blended);
}

function applyStatDeltas(target, deltas = {}) {
  if (!target || typeof target !== 'object') return target;
  for (const [key, rawDelta] of Object.entries(deltas)) {
    const delta = normalizeStatNumber(rawDelta);
    if (delta === null || delta === 0) continue;
    const rule = STAT_FIELD_RULES[key];
    const current = clampStatField(key, target[key] ?? rule?.default);
    if (current === null) continue;
    const next = clampStatField(key, current + delta);
    if (next !== null) {
      target[key] = next;
    }
  }
  return target;
}

function mergeStatFields(base = {}, patch = {}) {
  const target = { ...base };
  const absolute = patch.absolute || patch.fields || null;
  if (absolute && typeof absolute === 'object') {
    for (const [key, value] of Object.entries(absolute)) {
      if (value !== null && typeof value === 'object') continue;
      const blended = blendStatValue(key, target[key], value);
      if (blended !== null) {
        target[key] = blended;
      }
    }
  }
  if (patch.deltas && typeof patch.deltas === 'object') {
    applyStatDeltas(target, patch.deltas);
  }
  return target;
}

function ensureStatsDefaults(stats = {}) {
  const target = { ...stats };
  for (const [key, rule] of Object.entries(STAT_FIELD_RULES)) {
    if (target[key] == null && rule?.default != null) {
      const normalized = clampStatField(key, rule.default);
      if (normalized != null) target[key] = normalized;
    }
  }
  return target;
}

function mergeStatsJson(existingValue, incomingUpdate) {
  const base = parseStatsJsonValue(existingValue);
  if (!incomingUpdate) {
    const normalizedBase = ensureStatsDefaults(base);
    return Object.keys(normalizedBase).length ? normalizedBase : null;
  }

  const payload = typeof incomingUpdate === 'object' && incomingUpdate !== null
    ? incomingUpdate
    : { personaDetails: incomingUpdate };

  const personaSource = payload.personaDetails
    || payload.persona_details
    || (!payload.statsPatch && !payload.stats_patch && !payload.stats && !payload.absolute && !payload.deltas
      ? payload
      : null);
  const normalizedPersona = normalizePersonaDetails(personaSource);
  if (normalizedPersona) {
    const existingPersona = typeof base.persona_details === 'object' && base.persona_details !== null
      ? base.persona_details
      : {};
    const mergedPersona = mergePersonaDetails(existingPersona, normalizedPersona);
    if (mergedPersona) {
      base.persona_details = mergedPersona;
      base.last_persona_update = new Date().toISOString();
    }
  }

  const statsPatch = payload.statsPatch || payload.stats_patch || payload.stats || null;
  if (statsPatch) {
    const mergedFields = mergeStatFields(base, statsPatch);
    Object.assign(base, mergedFields);
  }

  const normalizedBase = ensureStatsDefaults(base);
  return Object.keys(normalizedBase).length ? normalizedBase : null;
}

function clamp(value, min, max) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return Math.max(min, Math.min(max, Number(value)));
}

function clampTeaseLevel(value) {
  const clamped = clamp(value, 0, 100);
  return clamped === null ? null : Math.round(clamped);
}

function safeJsonParse(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function shortenContent(content) {
  if (!content) return '';
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length > MESSAGE_CHAR_LIMIT ? `${trimmed.slice(0, MESSAGE_CHAR_LIMIT)}…` : trimmed;
}

function serializeMessages(messages = []) {
  const subset = messages.slice(-MAX_SERIALIZED_MESSAGES);
  const result = [];
  let budget = PROMPT_CHAR_LIMIT;
  const speakerIds = new Set();
  for (const msg of subset) {
    const entry = {
      timestamp: msg?.timestamp || null,
      user_id: msg?.user_id || null,
      username: msg?.username || `user-${String(msg?.user_id || '').slice(-4) || 'unknown'}`,
      channel_id: msg?.channel_id || null,
      content: shortenContent(msg?.content || ''),
    };
    const serializedLength = JSON.stringify(entry).length + 1; // +1 for comma/newline when joined
    if (serializedLength > budget && result.length) break;
    if (serializedLength <= budget) {
      result.push(entry);
      budget -= serializedLength;
      if (entry.user_id) speakerIds.add(String(entry.user_id));
    }
  }
  return {
    entries: result,
    speakerIds: Array.from(speakerIds),
  };
}

function buildSpeakerSummary(messages = []) {
  const summary = new Map();
  for (const msg of messages) {
    const userId = msg?.user_id;
    if (!userId) continue;
    if (!summary.has(userId)) {
      summary.set(userId, msg?.username || `user-${String(userId).slice(-4)}`);
    }
  }
  return Array.from(summary.entries()).map(([id, name]) => `${name} (${id})`);
}

function formatTraitBaseline(traits = {}) {
  const parts = [];
  for (const key of PERSONA_TRAIT_FIELDS) {
    if (traits[key] == null) continue;
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    parts.push(`${label}:${Number(traits[key]).toFixed(1)}`);
  }
  return parts.length ? parts.join(', ') : null;
}

function collectSpeakerProfiles(ids = []) {
  const map = new Map();
  if (!Array.isArray(ids) || !ids.length) return map;
  for (const id of ids) {
    const profile = typeof getUserProfileFromCache === 'function' ? getUserProfileFromCache(id) : null;
    if (profile) map.set(String(id), profile);
  }
  return map;
}

function buildPersonaGuidance(profilesMap) {
  if (!profilesMap || !profilesMap.size) return 'No existing persona baselines for these speakers; infer from chat context.';
  const lines = [];
  for (const [userId, profile] of profilesMap.entries()) {
    const name = profile.nickname || profile.username || userId;
    const stats = parseStatsJsonValue(profile.stats_json);
    const personaDetails = stats?.persona_details || stats?.personaDetails || null;
    const profession = personaDetails?.profession ? `Profession: ${personaDetails.profession}` : null;
    const knownFor = Array.isArray(personaDetails?.known_for) && personaDetails.known_for.length
      ? `Known for: ${personaDetails.known_for.join(', ')}`
      : null;
    const traitLine = personaDetails?.traits ? formatTraitBaseline(personaDetails.traits) : null;
    const likeableScore = typeof stats?.likeable === 'number' ? `Likeable: ${Math.round(stats.likeable)}` : null;
    const pieces = [profession, knownFor, likeableScore, traitLine ? `Traits: ${traitLine}` : null].filter(Boolean);
    lines.push(`- ${name} (${userId})${pieces.length ? ` -> ${pieces.join(' | ')}` : ''}`);
  }
  if (!lines.length) {
    return 'No existing persona baselines for these speakers; infer from chat context.';
  }
  return 'Existing persona baselines (refine gradually, adjusting trait sliders by <=1 per batch):\n' + lines.join('\n');
}

function buildPrompts({ channelId, channelName, guildId, reason, serializedMessages, speakerSummary, personaGuidance }) {
  const systemPrompt = `You are Beowulf's memory curator. Analyze recent Discord chat logs and decide if any information deserves a long-term memory or a user profile tweak. Store durable info: achievements, battle results, logistics, BUT ALSO capture memorable banter, recurring jokes, or strong opinions that reveal personality or relationships. Additionally classify any actionable pilotry/fighter tactics as dogfighting_advice, and any piracy strategies, market ambush intel, or profit routes as piracy_advice. Rate importance 1-5 (5 = core lore). Output JSON strictly matching the requested schema. If nothing qualifies, return empty arrays.`;
  const instructions = [
    `Guild ID: ${guildId || 'unknown'}`,
    `Channel: ${channelName || channelId || 'unknown'}`,
    `Batch reason: ${reason}`,
    speakerSummary.length ? `Speakers: ${speakerSummary.join('; ')}` : 'Speakers: unknown',
    personaGuidance || 'No persona baselines available for these speakers.',
    'Messages JSON follows:',
    JSON.stringify(serializedMessages, null, 2),
    'Desired JSON schema:',
    '{"memories":[{"summary":"string","details":"include concrete facts, stats, or quotes","importance":1-5,"type":"episodic|inside_joke|profile|lore|dogfighting_advice|piracy_advice|fact","related_users":["discordId"],"tags":["string"],"should_store":true|false}],"profile_adjustments":[{"user_id":"string","nickname":"string?","tease_level":0-100,"tease_level_delta":-10-10,"style_preferences":{"tone_preference":"short text"},"persona_details":{"profession":"string?","known_for":["string"],"notable_quotes":["string"],"favorite_topics":["string"],"achievements":["string"],"personality_summary":"string?","relationship_notes":"string?","catchphrase":"string?","traits":{"openness":0-10,"conscientiousness":0-10,"extraversion":0-10,"agreeableness":0-10,"neuroticism":0-10,"confidence":0-10,"courage":0-10,"integrity":0-10,"resilience":0-10,"humor":0-10}},"stats_adjustments":{"likeable":0-100,"likeable_delta":-15-15,"other_numeric_stat":0-100},"notes":"short guidance"}]}',
    `Limit memories to ${MAX_MEMORIES_PER_BATCH} items. Reject mundane updates unless they include a concrete plan, metric, or character insight. Classify fighter tactics, formation calls, joust angles, missile baiting, or EVA boarding plans as dogfighting_advice. Classify profitable commodity intel, piracy routes, snare traps, loot valuations, or fence strategies as piracy_advice. If someone states a strong opinion, shares a recurring joke, or teases another member in a way that defines their relationship, capture it as an inside_joke (with the direct quote in details). If you keep a memory, ensure the summary explains why it matters AND populate the details field with supporting numbers, names, timestamps, or direct quotes. Set should_store=false for filler banter. Only populate persona_details when the chat gives reliable signals (profession, what they are known for, quotes, quirks, etc.). When updating trait sliders, reference the baseline above and adjust gradually (no jumps bigger than 1 point).`,
    `Track how much Beowulf likes each speaker using stats_adjustments.likeable (0-100, default ${STAT_FIELD_RULES.likeable.default || 55}). Increase it when they are helpful/respectful, decrease it when they are rude or demanding. Keep likeable_delta between -15 and +15 per batch, and only emit stats_adjustments when you have strong sentiment evidence.`
  ].join('\n');
  return { systemPrompt, userPrompt: instructions };
}

async function callMemoryModel({ channelId, channelName, guildId, reason, messages, openai }) {
  if (!openai) return null;
  if (!Array.isArray(messages) || !messages.length) return null;
  const { entries, speakerIds } = serializeMessages(messages);
  const speakerSummary = buildSpeakerSummary(entries);
  const speakerProfiles = collectSpeakerProfiles(speakerIds);
  const personaGuidance = buildPersonaGuidance(speakerProfiles);
  const { systemPrompt, userPrompt } = buildPrompts({
    channelId,
    channelName,
    guildId,
    reason,
    serializedMessages: entries,
    speakerSummary,
    personaGuidance,
  });
  try {
    const completion = await openai.chat.completions.create({
      model: MEMORY_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return safeJsonParse(completion?.choices?.[0]?.message?.content);
  } catch (error) {
    console.error('[MemoryBatcher] Memory model call failed:', error?.response?.data || error?.message || error);
    return null;
  }
}

function normalizeMemory(entry = {}) {
  const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
  if (!summary) return null;
  let type = typeof entry.type === 'string' ? entry.type.toLowerCase() : 'episodic';
  if (!ALLOWED_MEMORY_TYPES.has(type)) {
    type = type === 'fact' ? 'lore' : 'episodic';
  }
  const importance = clamp(entry.importance, 1, 5) || 1;
  const shouldStore = entry.should_store !== false;
  const explicitStore = entry.should_store === true;
  if (!shouldStore) return null;
  const relaxedThreshold = ALLOWED_MEMORY_TYPES.has(type) && (type === 'inside_joke' || type === 'profile')
    ? Math.max(1, MEMORY_IMPORTANCE_THRESHOLD - 1)
    : MEMORY_IMPORTANCE_THRESHOLD;
  if (!explicitStore && importance < relaxedThreshold) return null;
  const details = typeof entry.details === 'string' ? entry.details.trim() : '';
  const tags = Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
  const relatedUsers = Array.isArray(entry.related_users)
    ? entry.related_users.map((id) => String(id).trim()).filter(Boolean)
    : [];
  return {
    id: entry.id || null,
    summary,
    details,
    importance,
    type,
    tags,
    relatedUsers,
  };
}

function parseStylePreferences(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...parsed };
    } catch {}
  }
  return {};
}

function mergeStylePreferences(existingPrefs, incomingPrefs, notes) {
  const base = parseStylePreferences(existingPrefs);
  const addition = parseStylePreferences(incomingPrefs);
  const merged = { ...base, ...addition };
  if (notes) {
    merged[PROFILE_NOTES_KEY] = merged[PROFILE_NOTES_KEY]
      ? `${merged[PROFILE_NOTES_KEY]} | ${notes}`
      : notes;
  }
  return Object.keys(merged).length ? merged : null;
}

function normalizeStatsPatch(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const absolute = {};
  const deltas = {};
  const rawSources = [];
  if (entry.stats_adjustments && typeof entry.stats_adjustments === 'object') rawSources.push(entry.stats_adjustments);
  if (entry.statsPatch && typeof entry.statsPatch === 'object') rawSources.push(entry.statsPatch);
  if (entry.stats_patch && typeof entry.stats_patch === 'object') rawSources.push(entry.stats_patch);
  if (entry.stats_json) rawSources.push(parseStatsJsonValue(entry.stats_json));
  if (entry.stats) rawSources.push(parseStatsJsonValue(entry.stats));

  const ingest = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null || value === '') continue;
      if (key === 'persona_details' || key === 'personaDetails') continue;
      if (typeof value === 'object') continue;
      if (key.toLowerCase().endsWith('_delta')) {
        const baseKey = key.replace(/_delta$/i, '');
        const deltaValue = normalizeStatNumber(value);
        if (deltaValue !== null) deltas[baseKey] = deltaValue;
      } else {
        absolute[key] = value;
      }
    }
  };

  rawSources.forEach(ingest);

  const likeableValueCandidates = [entry.likeable, entry.likeable_score, entry.stats_likeable];
  for (const candidate of likeableValueCandidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    absolute.likeable = candidate;
    break;
  }

  const likeableDeltaCandidates = [entry.likeable_delta, entry.stats_likeable_delta];
  for (const candidate of likeableDeltaCandidates) {
    const deltaValue = normalizeStatNumber(candidate);
    if (deltaValue === null) continue;
    deltas.likeable = deltaValue;
    break;
  }

  if (!Object.keys(absolute).length && !Object.keys(deltas).length) return null;
  return { absolute, deltas };
}

function normalizeProfileAdjustment(entry = {}) {
  const userId = entry.user_id || entry.userId;
  if (!userId) return null;
  const adjustment = {
    userId: String(userId),
    nickname: typeof entry.nickname === 'string' && entry.nickname.trim() ? entry.nickname.trim() : null,
    teaseLevel: entry.tease_level !== undefined ? clampTeaseLevel(entry.tease_level) : null,
    teaseDelta: entry.tease_level_delta !== undefined ? clamp(entry.tease_level_delta, -20, 20) : null,
    stylePreferences: typeof entry.style_preferences === 'object' && entry.style_preferences !== null ? entry.style_preferences : null,
    notes: typeof entry.notes === 'string' ? entry.notes.trim() : null,
    personaDetails: normalizePersonaDetails(entry.persona_details || entry.personaDetails || entry.persona),
    statsPatch: normalizeStatsPatch(entry),
  };
  if (!adjustment.nickname && adjustment.teaseLevel === null && adjustment.teaseDelta === null && !adjustment.stylePreferences && !adjustment.notes && !adjustment.personaDetails && !adjustment.statsPatch) {
    return null;
  }
  return adjustment;
}

async function persistMemories(memories = [], { channelId, channelName, guildId, openai }) {
  const stored = [];
  if (!guildId) {
    console.warn('[MemoryBatcher] Missing guild_id; skipping memory persistence.');
    return stored;
  }
  for (const memory of memories) {
    if (!memory) continue;
    const tags = memory.tags?.length ? `\nTags: ${memory.tags.join(', ')}` : '';
    const related = memory.relatedUsers?.length ? `\nRelated Users: ${memory.relatedUsers.join(', ')}` : '';
    const detailLine = memory.details ? `\nDetails: ${memory.details}` : '';
    const content = `Summary: ${memory.summary}${detailLine}${tags}${related}`;
    const tagsList = Array.isArray(memory.tags) && memory.tags.length
      ? memory.tags
      : ['memory-batcher'];
    let result;
    try {
      result = await saveMemoryEntry({
        content,
        type: memory.type || 'episodic',
        importance: memory.importance,
        tags: tagsList,
        guildId,
        channelId,
        userId: memory.relatedUsers?.[0],
        openai,
      });
    } catch (error) {
      logMemoryError('saveMemoryEntry exception', error, { channelId, guildId, summary: memory.summary?.slice?.(0, 120) });
      stored.push({ ok: false, id: null });
      continue;
    }
    const ok = !!result?.ok;
    if (!ok) {
      logMemoryError('saveMemoryEntry failed', result?.errors || 'unknown-error', { channelId, guildId, summary: memory.summary?.slice?.(0, 120) });
    } else if (MEMORY_BATCH_DEBUG) {
      console.log('[MemoryBatcher] Stored memory', { summary: memory.summary.slice(0, 120) });
    }
    stored.push({ ok, id: result?.data?.id || null });
  }
  return stored;
}

async function applyProfileAdjustment(adjustment) {
  if (!adjustment) return null;
  const userId = adjustment.userId;
  const existing = typeof getUserProfileFromCache === 'function' ? getUserProfileFromCache(userId) : null;
  const fallbackUser = getUserIdentitySnapshot(userId);
  const patch = { user_id: userId };

  const preferredNickname = derivePreferredNickname({
    providedNickname: adjustment.nickname,
    existingNickname: existing?.nickname,
    fallbackUser,
  });
  if (preferredNickname) {
    patch.nickname = preferredNickname;
  }

  if (adjustment.teaseLevel !== null && adjustment.teaseLevel !== undefined) {
    patch.tease_level = clampTeaseLevel(adjustment.teaseLevel);
  } else if (adjustment.teaseDelta !== null && adjustment.teaseDelta !== undefined) {
    const base = existing?.tease_level ?? 50;
    patch.tease_level = clampTeaseLevel(base + Number(adjustment.teaseDelta));
  }

  const mergedPrefs = mergeStylePreferences(existing?.style_preferences, adjustment.stylePreferences, adjustment.notes);
  if (mergedPrefs) {
    patch.style_preferences = mergedPrefs;
  }

  const mergedStats = mergeStatsJson(existing?.stats_json, {
    personaDetails: adjustment.personaDetails,
    statsPatch: adjustment.statsPatch,
  });
  if (mergedStats) {
    patch.stats_json = mergedStats;
  }

  if (!patch.nickname && patch.tease_level == null && !patch.style_preferences && !patch.stats_json) {
    return null;
  }

  try {
    let result;
    if (existing) {
      result = await UserProfilesModel.update(userId, patch);
      if (!result?.ok) {
        result = await UserProfilesModel.create(patch);
      }
    } else {
      // No cached profile, so jump straight to create to avoid noisy 404 patch attempts.
      result = await UserProfilesModel.create(patch);
      if (!result?.ok) {
        result = await UserProfilesModel.update(userId, patch);
      }
    }
    if (result?.ok && result.data) {
      upsertUserProfileInCache(result.data);
      return result.data;
    }
    logMemoryError('profile adjustment persistence failed', result?.errors || 'unknown-error', { userId });
    return null;
  } catch (error) {
    logMemoryError('profile adjustment write failed', error, { userId });
    return null;
  }
}

async function persistProfileAdjustments(adjustments = []) {
  const applied = [];
  for (const adj of adjustments) {
    const normalized = normalizeProfileAdjustment(adj);
    if (!normalized) continue;
    const result = await applyProfileAdjustment(normalized);
    if (result) applied.push(result);
  }
  return applied;
}

async function handleMemoryBatch({ channelId, reason, messages, openai }) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const filtered = messages.filter((msg) => msg && !isBotUser(msg.user_id));
  if (!filtered.length) return;
  const processedCount = filtered.length;
  if (!openai) {
    console.warn('[MemoryBatcher] Skipping batch; OpenAI client missing.');
    emitHeartbeat({ channelId, reason, processed: processedCount, status: 'skipped-no-openai' });
    return;
  }
  const channelName = filtered[filtered.length - 1]?.channel_name || filtered[0]?.channel_name || null;
  const guildId = filtered[0]?.guild_id || messages[0]?.guild_id || null;
  const decision = await callMemoryModel({ channelId, channelName, guildId, reason, messages: filtered, openai });
  if (!decision) {
    emitHeartbeat({ channelId, reason, processed: processedCount, status: 'no-decision' });
    return;
  }
  if (MEMORY_BATCH_DEBUG) {
    console.log('[MemoryBatcher] Raw decision payload:', JSON.stringify(decision, null, 2));
  }
  const memories = Array.isArray(decision.memories)
    ? decision.memories.map(normalizeMemory).filter(Boolean).slice(0, MAX_MEMORIES_PER_BATCH)
    : [];
  const adjustments = Array.isArray(decision.profile_adjustments)
    ? decision.profile_adjustments
    : [];

  if (!memories.length && !adjustments.length) {
    emitHeartbeat({ channelId, reason, processed: processedCount, status: 'no-output' });
    return;
  }

  const generatedMemoriesCount = memories.length;
  if (generatedMemoriesCount) {
    await persistMemories(memories, { channelId, channelName, guildId, openai });
  }
  let appliedAdjustmentsCount = 0;
  if (adjustments.length) {
    const applied = await persistProfileAdjustments(adjustments);
    appliedAdjustmentsCount = Array.isArray(applied) ? applied.length : 0;
  }

  if (generatedMemoriesCount > 0 || appliedAdjustmentsCount > 0) {
    await refreshProfilesCacheSafe();
  }

  emitHeartbeat({
    channelId,
    reason,
    processed: processedCount,
    status: 'completed',
    memories: generatedMemoriesCount,
    adjustments: appliedAdjustmentsCount,
  });
}

module.exports = {
  handleMemoryBatch,
};
