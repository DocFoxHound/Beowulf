const { randomUUID } = require('node:crypto');
const { ingestChatMessage } = require('../../vector-handling/chat-ingest');
const { UserProfilesModel } = require('../../api/models/user-profiles');
const {
  getUserProfileFromCache,
  upsertUserProfileInCache,
} = require('../../common/user-profiles-cache');

const PREVIEW_LIMIT = Number(process.env.MEMORY_BATCH_PREVIEW_LIMIT || 2);
const PREVIEW_CHAR_LIMIT = Number(process.env.MEMORY_BATCH_PREVIEW_CHAR_LIMIT || 80);
const MEMORY_MODEL = process.env.CHATGPT_MEMORY_MODEL || process.env.CHATGPT_PERSONA_MODEL || 'gpt-4o-mini';
const MEMORY_IMPORTANCE_THRESHOLD = Math.max(1, Number(process.env.MEMORY_IMPORTANCE_THRESHOLD || 2));
const MAX_MEMORIES_PER_BATCH = Math.max(1, Number(process.env.MEMORY_BATCH_MAX_MEMORIES || 3));
const MEMORY_BATCH_DEBUG = process.env.MEMORY_BATCH_DEBUG === '1';
const MAX_SERIALIZED_MESSAGES = Math.max(5, Number(process.env.MEMORY_BATCH_MAX_MESSAGES || 20));
const MESSAGE_CHAR_LIMIT = Math.max(80, Number(process.env.MEMORY_BATCH_MESSAGE_CHAR_LIMIT || 400));
const PROMPT_CHAR_LIMIT = Math.max(2000, Number(process.env.MEMORY_BATCH_PROMPT_CHAR_LIMIT || 9000));
const PROFILE_NOTES_KEY = 'notes';
const PERSONA_STRING_FIELDS = ['profession', 'demeanor', 'relationship_notes', 'personality_summary', 'catchphrase'];
const PERSONA_ARRAY_FIELDS = ['known_for', 'notable_quotes', 'favorite_topics', 'achievements', 'notable_traits', 'warnings'];
const PERSONA_TRAIT_FIELDS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'confidence', 'courage', 'integrity', 'resilience', 'humor'];

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

function mergeStatsJson(existingValue, incomingPersona) {
  const base = parseStatsJsonValue(existingValue);
  if (!incomingPersona) return Object.keys(base).length ? base : null;
  const existingPersona = typeof base.persona_details === 'object' && base.persona_details !== null
    ? base.persona_details
    : {};
  const mergedPersona = mergePersonaDetails(existingPersona, incomingPersona);
  if (mergedPersona) {
    base.persona_details = mergedPersona;
    base.last_persona_update = new Date().toISOString();
  }
  return Object.keys(base).length ? base : null;
}

function clamp(value, min, max) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return Math.max(min, Math.min(max, Number(value)));
}

function clampTeaseLevel(value) {
  const clamped = clamp(value, 0, 100);
  return clamped === null ? null : Math.round(clamped);
}

function renderPreview(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return 'no-preview';
  return messages
    .slice(0, PREVIEW_LIMIT)
    .map((msg) => {
      const ts = msg?.timestamp || 'unknown-time';
      const user = msg?.username || msg?.user_id || 'user';
      const content = (msg?.content || '').replace(/\s+/g, ' ').slice(0, PREVIEW_CHAR_LIMIT);
      return `[${ts}] ${user}: ${content}`;
    })
    .join(' | ');
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
    const pieces = [profession, knownFor, traitLine ? `Traits: ${traitLine}` : null].filter(Boolean);
    lines.push(`- ${name} (${userId})${pieces.length ? ` -> ${pieces.join(' | ')}` : ''}`);
  }
  if (!lines.length) {
    return 'No existing persona baselines for these speakers; infer from chat context.';
  }
  return 'Existing persona baselines (refine gradually, adjusting trait sliders by <=1 per batch):\n' + lines.join('\n');
}

function buildPrompts({ channelId, channelName, guildId, reason, serializedMessages, speakerSummary, personaGuidance }) {
  const systemPrompt = `You are Beowulf's memory curator. Analyze recent Discord chat logs and decide if any information deserves a long-term memory or a user profile tweak. Store only durable info: preferences, ongoing plans, lore, achievements, or personality markers. Rate importance 1-5 (5 = core lore). Output JSON strictly matching the requested schema. If nothing qualifies, return empty arrays.`;
  const instructions = [
    `Guild ID: ${guildId || 'unknown'}`,
    `Channel: ${channelName || channelId || 'unknown'}`,
    `Batch reason: ${reason}`,
    speakerSummary.length ? `Speakers: ${speakerSummary.join('; ')}` : 'Speakers: unknown',
    personaGuidance || 'No persona baselines available for these speakers.',
    'Messages JSON follows:',
    JSON.stringify(serializedMessages, null, 2),
    'Desired JSON schema:',
    '{"memories":[{"summary":"string","importance":1-5,"type":"episodic|inside_joke|profile|lore|fact","related_users":["discordId"],"tags":["string"],"should_store":true|false}],"profile_adjustments":[{"user_id":"string","nickname":"string?","tease_level":0-100,"tease_level_delta":-10-10,"style_preferences":{"tone_preference":"short text"},"persona_details":{"profession":"string?","known_for":["string"],"notable_quotes":["string"],"favorite_topics":["string"],"achievements":["string"],"personality_summary":"string?","relationship_notes":"string?","catchphrase":"string?","traits":{"openness":0-10,"conscientiousness":0-10,"extraversion":0-10,"agreeableness":0-10,"neuroticism":0-10,"confidence":0-10,"courage":0-10,"integrity":0-10,"resilience":0-10,"humor":0-10}},"notes":"short guidance"}]}',
    `Limit memories to ${MAX_MEMORIES_PER_BATCH} items. Set should_store=false for trivial banter. Only populate persona_details when the chat gives reliable signals (profession, what they are known for, quotes, quirks, etc.). When updating trait sliders, reference the baseline above and adjust gradually (no jumps bigger than 1 point).`
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
  const importance = clamp(entry.importance, 1, 5) || 1;
  const shouldStore = entry.should_store !== false;
  const explicitStore = entry.should_store === true;
  if (!shouldStore) return null;
  if (!explicitStore && importance < MEMORY_IMPORTANCE_THRESHOLD) return null;
  const type = typeof entry.type === 'string' ? entry.type : 'episodic';
  const tags = Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
  const relatedUsers = Array.isArray(entry.related_users)
    ? entry.related_users.map((id) => String(id).trim()).filter(Boolean)
    : [];
  return {
    id: entry.id || null,
    summary,
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
  };
  if (!adjustment.nickname && adjustment.teaseLevel === null && adjustment.teaseDelta === null && !adjustment.stylePreferences && !adjustment.notes && !adjustment.personaDetails) {
    return null;
  }
  return adjustment;
}

async function persistMemories(memories = [], { channelId, channelName, openai }) {
  const stored = [];
  for (const memory of memories) {
    if (!memory) continue;
    const tags = memory.tags?.length ? `\nTags: ${memory.tags.join(', ')}` : '';
    const related = memory.relatedUsers?.length ? `\nRelated Users: ${memory.relatedUsers.join(', ')}` : '';
    const content = `Memory Type: ${memory.type}\nImportance: ${memory.importance}\nSummary: ${memory.summary}${tags}${related}`;
    const payload = {
      id: memory.id || `memory-${channelId || 'channel'}-${randomUUID()}`,
      content,
      username: 'Beowulf Memory',
      channel_name: channelName || `channel-${channelId || 'unknown'}`,
      timestamp: new Date().toISOString(),
    };
    try {
      const result = await ingestChatMessage(payload, openai);
      stored.push({ ok: result?.ok, id: payload.id });
    } catch (error) {
      console.error('[MemoryBatcher] Failed to ingest memory entry:', error?.message || error);
    }
  }
  return stored;
}

async function applyProfileAdjustment(adjustment) {
  if (!adjustment) return null;
  const userId = adjustment.userId;
  const existing = typeof getUserProfileFromCache === 'function' ? getUserProfileFromCache(userId) : null;
  const patch = { user_id: userId };

  if (adjustment.nickname) {
    patch.nickname = adjustment.nickname;
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

  const mergedStats = mergeStatsJson(existing?.stats_json, adjustment.personaDetails);
  if (mergedStats) {
    patch.stats_json = mergedStats;
  }

  if (!patch.nickname && patch.tease_level == null && !patch.style_preferences && !patch.stats_json) {
    return null;
  }

  if (!existing && !patch.nickname) {
    try {
      const fallbackUser = globalThis?.userListCache?.getById ? globalThis.userListCache.getById(userId) : null;
      const fallbackName = fallbackUser?.nickname || fallbackUser?.username || null;
      if (fallbackName) {
        patch.nickname = String(fallbackName).trim().slice(0, 120);
      }
    } catch (e) {
      if (MEMORY_BATCH_DEBUG) {
        console.warn('[MemoryBatcher] Failed to derive fallback nickname:', e?.message || e);
      }
    }
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
    console.warn('[MemoryBatcher] Failed to persist profile adjustment:', result?.errors || 'unknown-error');
    return null;
  } catch (error) {
    console.error('[MemoryBatcher] Profile adjustment write failed:', error?.message || error);
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
  const firstTs = messages[0]?.timestamp || 'unknown-start';
  const lastTs = messages[messages.length - 1]?.timestamp || 'unknown-end';
  console.log(`[MemoryBatcher] channel=${channelId} reason=${reason} count=${messages.length} window=${firstTs} -> ${lastTs} preview=${renderPreview(messages)}`);
  if (!openai) {
    console.warn('[MemoryBatcher] Skipping batch; OpenAI client missing.');
    return;
  }
  const channelName = messages[messages.length - 1]?.channel_name || messages[0]?.channel_name || null;
  const guildId = messages[0]?.guild_id || null;
  const decision = await callMemoryModel({ channelId, channelName, guildId, reason, messages, openai });
  if (!decision) {
    console.log('[MemoryBatcher] Model returned no decision payload.');
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
    const debugHint = MEMORY_BATCH_DEBUG ? '' : ' (set MEMORY_BATCH_DEBUG=1 to print raw model output)';
    console.log(`[MemoryBatcher] No memories or profile adjustments generated.${debugHint}`);
    return;
  }

  if (memories.length) {
    await persistMemories(memories, { channelId, channelName, openai });
  }
  if (adjustments.length) {
    await persistProfileAdjustments(adjustments);
  }
}

module.exports = {
  handleMemoryBatch,
};
