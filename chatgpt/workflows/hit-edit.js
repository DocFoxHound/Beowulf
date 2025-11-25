const { ChannelType } = require('discord.js');
const { HitTrackerModel } = require('../../api/models/hit-tracker');
const { ensureHitCacheReady, ensureUexCacheReady } = require('../context/cache-readiness');
const { handleHitPostUpdate } = require('../../functions/post-new-hit');
const hitIntakeInternals = require('./hit-intake').__internals || {};

const parseCargoInput = hitIntakeInternals.parseCargoInput || (() => []);
const enrichCargoPricing = hitIntakeInternals.enrichCargoPricing || (async () => ({ priced: [], totalValue: 0, totalScu: 0 }));
const buildCargoSummary = hitIntakeInternals.buildCargoSummary || (() => '');
const dedupeStrings = hitIntakeInternals.dedupeStrings || ((values = []) => Array.from(new Set(values.filter(Boolean))));
const splitList = hitIntakeInternals.splitList
  || ((value) => (value ? value.split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean) : []));
const formatCurrency = hitIntakeInternals.formatCurrency || ((value) => String(value ?? '0'));
const formatScu = hitIntakeInternals.formatScu || ((value) => String(value ?? '0'));

const EDIT_SESSION_TTL_MS = Number(process.env.HIT_EDIT_SESSION_TTL_MS || 10 * 60 * 1000);
const SESSION_INTENT = {
  intent: 'hit_edit',
  needsTool: true,
  confidence: 0.9,
  rationale: 'workflow:hit-edit',
};
const sessions = new Map();
const NUMERIC_FIELDS = new Set(['total_value', 'total_scu', 'total_cut_value', 'total_cut_scu']);
const DIRECT_ASSIGNMENT_REGEX = /\b(?:set|change|update|edit|make|adjust|add|include|remove)\s+(?:the\s+)?([a-z][a-z0-9\s_-]+?)(?:\s+of\s+(?:this|the)\s+hit)?\s+(?:to|=)\s+([\s\S]+)/i;
const FIELD_ALIAS_MAP = [
  { field: 'total_value', keywords: ['total value', 'overall value', 'value total'] },
  { field: 'total_scu', keywords: ['total scu', 'scu total', 'cargo amount'] },
  { field: 'total_cut_value', keywords: ['cut value', 'value per share', 'share value'] },
  { field: 'total_cut_scu', keywords: ['cut scu', 'scu per share'] },
  { field: 'title', keywords: ['title', 'name', 'headline'] },
  { field: 'story', keywords: ['story', 'description', 'summary', 'notes'] },
  { field: 'video_link', keywords: ['video', 'vod', 'clip', 'recording', 'youtube', 'link'] },
  { field: 'additional_media_links', keywords: ['media', 'images', 'screenshots', 'proof'] },
  { field: 'type_of_piracy', keywords: ['type of piracy', 'air or ground', 'mode', 'type'] },
];

const COMMAND_WORDS = {
  cancel: ['cancel', 'stop', 'nevermind', 'abort', 'forget it', 'forget about it'],
  status: ['status', 'summary', 'progress'],
  submit: ['done', 'finish', 'apply', 'save', 'submit'],
  help: ['help', 'instructions', 'how do i', 'what do i do'],
};

const CLEAR_VALUE_REGEX = /^(?:none|clear|remove|empty|reset|null|n\/a|na)$/i;
const LIST_FIELD_PATTERNS = {
  assists: 'assist(?:s)?(?:\\s+list)?',
  victims: 'victim(?:s)?(?:\\s+list)?',
};
const LIST_ADD_VERBS = /\b(add|include|plus|bring|append)\b/i;
const LIST_REMOVE_VERBS = /\b(remove|drop|delete|exclude|minus|without|take\s+out|take\s+off)\b/i;

function arraysEqual(a = [], b = []) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeListOperation(operation) {
  if (!operation) return 'set';
  const normalized = String(operation).toLowerCase();
  return ['add', 'remove', 'clear', 'set'].includes(normalized) ? normalized : 'set';
}

function sanitizeListText(value) {
  return (value || '').trim().replace(/[\s,;]+$/, '').trim();
}

function extractListInstruction(content, field) {
  const pattern = LIST_FIELD_PATTERNS[field];
  if (!pattern) return null;
  const text = content || '';
  const article = '(?:the\\s+|an\\s+|a\\s+)?';
  const addRegex = new RegExp(`\\b(?:add|include|bring|append|plus)\\b\\s+([^\\n]+?)\\s+(?:to|into|in|as)\\s+${article}${pattern}`, 'i');
  const removeRegex = new RegExp(`\\b(?:remove|drop|delete|exclude|minus|without|take\\s+out|take\\s+off)\\b\\s+([^\\n]+?)\\s+(?:from|out\\s+of)\\s+${article}${pattern}`, 'i');
  const setRegex = new RegExp(`\\b(?:set|update|change|make|replace|assign|should\\s+be)\\b\\s+${article}${pattern}\\s+(?:to|as|=)\\s+([^\\n]+)`, 'i');
  const clearRegex = new RegExp(`\\b(?:clear|reset|wipe|empty|erase)\\b\\s+${article}${pattern}`, 'i');
  const matchers = [
    { regex: addRegex, operation: 'add' },
    { regex: removeRegex, operation: 'remove' },
    { regex: setRegex, operation: 'set' },
  ];
  for (const matcher of matchers) {
    const match = matcher.regex.exec(text);
    if (match) {
      return { operation: matcher.operation, listText: sanitizeListText(match[1]) };
    }
  }
  if (clearRegex.test(text) || new RegExp(`\\b(?:no|without|zero)\\s+${pattern}`, 'i').test(text)) {
    return { operation: 'clear', listText: '' };
  }
  return null;
}

function normalizeNameList(entries = []) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const trimmed = (entry || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function listEntryMatchesId(entry, targetId) {
  const value = entry && typeof entry === 'object'
    ? entry.id || entry.user_id || entry.value || entry.mention || entry.userId
    : entry;
  if (value == null) return false;
  const idStr = String(targetId);
  const normalized = String(value);
  return normalized === idStr || normalized === `<@${idStr}>` || normalized === `<@!${idStr}>`;
}

function detectFieldForMentions(session, mentionIds = []) {
  if (!session || !mentionIds.length) return null;
  const working = session.working || {};
  const assists = Array.isArray(working.assists) ? working.assists : [];
  const victims = Array.isArray(working.victims) ? working.victims : [];
  const assistMatch = mentionIds.some((id) => assists.some((entry) => listEntryMatchesId(entry, id)));
  const victimMatch = mentionIds.some((id) => victims.some((entry) => listEntryMatchesId(entry, id)));
  if (assistMatch && !victimMatch) return 'assists';
  if (victimMatch && !assistMatch) return 'victims';
  if (assistMatch && victimMatch) return 'assists';
  return null;
}

function inferImplicitListChange({ content, message, meta, session }) {
  const text = (content || '').trim();
  if (!text) return null;
  const wantsAdd = LIST_ADD_VERBS.test(text);
  const wantsRemove = LIST_REMOVE_VERBS.test(text);
  if (!wantsAdd && !wantsRemove) return null;
  const mentionIds = extractMentionIds(text, message, { excludeIds: [meta?.botUserId] });
  if (!mentionIds.length) return null;
  let field = null;
  if (wantsRemove) {
    field = detectFieldForMentions(session, mentionIds);
  }
  if (!field && wantsAdd) {
    field = 'assists';
  }
  if (!field) return null;
  const operation = wantsRemove ? 'remove' : 'add';
  return {
    field,
    value: mentionIds.map((id) => `<@${id}>`).join(' '),
    inferred: true,
    operation,
    mentionIds,
  };
}
const HIT_ID_PATTERN = /\bhit\s*(?:id|number|#)?\s*(\d{4,})/i;
const GENERAL_ID_PATTERN = /\b(\d{6,})\b/;
const BLOODED_ROLE = process.env.BLOODED_ROLE || null;
const TEST_BLOODED_ROLE = process.env.TEST_BLOODED_ROLE || null;
const LIVE_ENVIRONMENT = (process.env.LIVE_ENVIRONMENT || 'false').toLowerCase() === 'true';
const EDIT_INSTRUCTIONS = 'Provide updates as `field=value` lines (e.g., `title=New Title`, `cargo=Fluorine 4; Distilled 6`). Say `done` to apply or `cancel` to abort.';
const SESSION_ACTION_HINT = 'Say `done` to apply the pending changes or `cancel` to discard them.';

const EDIT_VERBS = /\b(edit|update|fix|modify|change|amend)\b/;
const ADJUST_VERBS = /\b(add|include|remove|set|make|adjust|attach)\b/;
const FIELD_KEYWORDS = /\b(assist|victim|cargo|title|value|scu|story|media|video|timestamp|type|guest|link|patch)\b/;
const GENERIC_LIST_CHANGE_REGEX = /\b(add|include|remove|drop|delete|plus|append|take\s+out|take\s+off)\b[^\n]{0,80}?\bhit\b/i;

function getSessionKey(meta) {
  return `${meta.channelId}:${meta.authorId}:edit`;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
}

function getBloodedRoleId() {
  if (LIVE_ENVIRONMENT) return BLOODED_ROLE;
  return TEST_BLOODED_ROLE || BLOODED_ROLE;
}

function userHasBloodedRole(message) {
  const roleId = getBloodedRoleId();
  if (!roleId) return false;
  const roles = message?.member?.roles;
  if (!roles) return false;
  if (typeof roles.cache?.has === 'function') {
    return roles.cache.has(roleId);
  }
  if (Array.isArray(roles)) {
    return roles.some((role) => role === roleId || role?.id === roleId);
  }
  return false;
}

function isThreadChannel(message) {
  const channel = message?.channel;
  if (!channel) return false;
  if (typeof channel.isThread === 'function') {
    return channel.isThread();
  }
  return channel.type === ChannelType.PublicThread
    || channel.type === ChannelType.PrivateThread
    || channel.type === ChannelType.AnnouncementThread;
}

function wantsCommand(content, list) {
  if (!content) return false;
  const normalized = content.trim().toLowerCase();
  return list.some((word) => normalized === word || normalized.startsWith(`${word} `));
}

function wantsCancel(content) {
  return wantsCommand(content, COMMAND_WORDS.cancel);
}

function wantsStatus(content) {
  return wantsCommand(content, COMMAND_WORDS.status);
}

function wantsHelp(content) {
  return wantsCommand(content, COMMAND_WORDS.help);
}

function wantsSubmit(content) {
  return wantsCommand(content, COMMAND_WORDS.submit);
}

function extractHitIdFromContent(content) {
  if (!content) return null;
  const sanitized = content.replace(/<@[!&]?\d+>/g, '');
  const direct = sanitized.match(HIT_ID_PATTERN);
  if (direct) return direct[1];
  const generic = sanitized.match(GENERAL_ID_PATTERN);
  if (generic) return generic[1];
  return null;
}

async function findHitById(hitId) {
  if (!hitId) return null;
  await ensureHitCacheReady();
  const cache = globalThis.hitCache?.getAll?.();
  if (Array.isArray(cache) && cache.length) {
    const cached = cache.find((entry) => String(entry.id) === String(hitId));
    if (cached) return normalizeHitRecord(cached);
  }
  const row = await HitTrackerModel.getByEntryId(hitId);
  return row ? normalizeHitRecord(row) : null;
}

async function findHitByThreadId(threadId) {
  if (!threadId) return null;
  await ensureHitCacheReady();
  const cache = globalThis.hitCache?.getAll?.();
  if (Array.isArray(cache) && cache.length) {
    const cached = cache.find((entry) => String(entry.thread_id || entry.threadId) === String(threadId));
    if (cached) return normalizeHitRecord(cached);
  }
  const row = await HitTrackerModel.getByThreadId(threadId);
  return row ? normalizeHitRecord(row) : null;
}

function normalizeHitRecord(hit) {
  if (!hit) return null;
  const clone = JSON.parse(JSON.stringify(hit));
  clone.id = hit.id;
  clone.user_id = hit.user_id;
  clone.thread_id = hit.thread_id || hit.threadId || null;
  clone.cargo = normalizeCargoArray(hit.cargo);
  clone.assists = Array.isArray(hit.assists)
    ? hit.assists.map((entry) => String(entry?.id || entry?.user_id || entry)).filter(Boolean)
    : [];
  clone.guests = Array.isArray(hit.guests) ? hit.guests.slice() : [];
  clone.victims = Array.isArray(hit.victims) ? hit.victims.slice() : [];
  clone.additional_media_links = Array.isArray(hit.additional_media_links) ? hit.additional_media_links.slice() : [];
  clone.total_value = Number(hit.total_value ?? hit.totalValue ?? 0) || 0;
  clone.total_scu = Number(hit.total_scu ?? hit.totalScu ?? 0) || 0;
  clone.total_cut_value = Number(hit.total_cut_value ?? hit.totalCutValue ?? 0) || 0;
  clone.total_cut_scu = Number(hit.total_cut_scu ?? hit.totalCutScu ?? 0) || 0;
  clone.air_or_ground = normalizeAirOrGroundValue(hit.air_or_ground || hit.type_of_piracy);
  clone.type_of_piracy = clone.air_or_ground;
  clone.fleet_activity = !!hit.fleet_activity;
  clone.title = hit.title || hit.nickname || hit.username || 'Pirate Hit';
  clone.story = hit.story || '';
  clone.username = hit.username || hit.nickname || 'Unknown pirate';
  clone.nickname = hit.nickname || hit.username || clone.username;
  clone.timestamp = hit.timestamp || new Date().toISOString();
  clone.patch = hit.patch || null;
  return clone;
}

function normalizeCargoArray(cargo) {
  if (Array.isArray(cargo)) {
    return cargo.map((entry) => ({
      commodity_name: entry.commodity_name || entry.name || 'Unknown cargo',
      scuAmount: Number(entry.scuAmount ?? entry.scu ?? entry.amount ?? 0) || 0,
      avg_price: Number(entry.avg_price ?? entry.price ?? 0) || 0,
      pricing_note: entry.pricing_note || null,
      pricing_match: entry.pricing_match || null,
    }));
  }
  if (typeof cargo === 'string') {
    try {
      const parsed = JSON.parse(cargo);
      if (Array.isArray(parsed)) return normalizeCargoArray(parsed);
    } catch {}
  }
  return [];
}

function normalizeAirOrGroundValue(value) {
  const str = (value == null ? '' : String(value)).trim().toLowerCase();
  if (!str) return 'air';
  if (str.startsWith('g')) return 'ground';
  return 'air';
}

function ensureSession(meta, hit) {
  const key = getSessionKey(meta);
  let session = sessions.get(key);
  if (!session) {
    session = startSession(key, meta, hit);
    sessions.set(key, session);
  }
  return session;
}

function startSession(key, meta, hit) {
  const working = normalizeHitRecord(hit);
  const session = {
    key,
    userId: meta.authorId,
    channelId: meta.channelId,
    startedAt: new Date().toISOString(),
    expiresAt: Date.now() + EDIT_SESSION_TTL_MS,
    hitId: String(hit.id),
    threadId: hit.thread_id || hit.threadId || null,
    original: normalizeHitRecord(hit),
    working,
    updatedFields: new Set(),
    manualTotals: { total_value: false, total_scu: false },
    autoTotals: computeTotalsFromCargo(working.cargo),
  };
  applyAutoTotals(session, { force: true });
  return session;
}

function computeTotalsFromCargo(cargo = []) {
  let totalValue = 0;
  let totalScu = 0;
  for (const entry of cargo) {
    const amount = Number(entry?.scuAmount || 0) || 0;
    const price = Number(entry?.avg_price || 0) || 0;
    totalValue += amount * price;
    totalScu += amount;
  }
  return {
    totalValue: Math.round(totalValue),
    totalScu: Number(totalScu.toFixed(2)),
  };
}

function applyAutoTotals(session, { force = false } = {}) {
  session.autoTotals = computeTotalsFromCargo(session.working.cargo);
  if (force || !session.manualTotals.total_value) {
    session.working.total_value = session.autoTotals.totalValue;
  }
  if (force || !session.manualTotals.total_scu) {
    session.working.total_scu = session.autoTotals.totalScu;
  }
}

function shouldStartEditSession(intent, message, { hasSession } = {}) {
  const inThread = isThreadChannel(message);
  if (!hasSession && !inThread) {
    return false;
  }
  if (intent?.intent === 'hit_edit') return true;
  const content = (message?.content || '').toLowerCase();
  if (!content) return false;
  if (/<@!?(\d+)>/.test(message?.content || '') && GENERIC_LIST_CHANGE_REGEX.test(content)) {
    return true;
  }
  if (EDIT_VERBS.test(content) && /\bhit\b/.test(content)) {
    return true;
  }
  if (inThread && (EDIT_VERBS.test(content) || (ADJUST_VERBS.test(content) && FIELD_KEYWORDS.test(content)))) {
    return true;
  }
  if ((ADJUST_VERBS.test(content) || EDIT_VERBS.test(content)) && FIELD_KEYWORDS.test(content) && /\bhit\b/.test(content)) {
    return true;
  }
  return false;
}

function hasHitPermission(hit, message) {
  if (!hit || !message) return false;
  const isOwner = String(hit.user_id) === String(message.author?.id);
  return isOwner || userHasBloodedRole(message);
}

function buildHitLabel(hit) {
  if (!hit) return 'unknown hit';
  const valueLabel = formatCurrency(hit.total_value || 0);
  return `Hit ${hit.id} — ${hit.title || hit.nickname || hit.username || 'Pirate Hit'} (${valueLabel} aUEC)`;
}

function buildSessionStatus(session) {
  const working = session.working;
  const value = formatCurrency(working.total_value || 0);
  const scu = formatScu(working.total_scu || 0);
  const lines = [`${buildHitLabel(working)}`, `Current totals: ${value} aUEC / ${scu} SCU`];
  if (session.updatedFields.size) {
    lines.push('Pending changes:');
    lines.push(buildChangeSummary(session));
  } else {
    lines.push('No pending changes yet.');
  }
  return lines.join('\n');
}

function parseAssignments(content) {
  if (!content) return [];
  const regex = /(\b[a-z][a-z0-9 _-]*\b)\s*(?:=|:)\s*([\s\S]*?)(?=(?:\n|;)\s*\b[a-z][a-z0-9 _-]*\s*(?:=|:)|$)/gi;
  const assignments = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const field = match[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = match[2].trim();
    assignments.push({ field, value, operation: 'set' });
  }
  return assignments;
}

function mapFieldAlias(rawField, fullText) {
  if (!rawField) return null;
  const normalized = rawField.toLowerCase().trim();
  for (const entry of FIELD_ALIAS_MAP) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.field;
    }
  }
  if (normalized === 'value' && /total\s+value/i.test(fullText || '')) return 'total_value';
  if (normalized === 'scu' && /total\s+scu/i.test(fullText || '')) return 'total_scu';
  return null;
}

function normalizeInferredValue(field, rawValue) {
  if (!rawValue) return rawValue;
  let trimmed = rawValue.trim();
  trimmed = trimmed.replace(/^['"`]|['"`]$/g, '');
  if (NUMERIC_FIELDS.has(field)) {
    const numberMatch = trimmed.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (numberMatch) {
      return numberMatch[0].replace(/,/g, '');
    }
  }
  return trimmed;
}

function inferAssignmentsFromContent(content, message, meta, session) {
  if (!content) return [];
  const text = content.trim();
  const inferred = [];
  const directMatch = text.match(DIRECT_ASSIGNMENT_REGEX);
  if (directMatch) {
    const field = mapFieldAlias(directMatch[1], text);
    const value = directMatch[2]?.trim();
    if (field && value) {
      inferred.push({ field, value: normalizeInferredValue(field, value), inferred: true });
      return inferred;
    }
  }

  const totalValueMatch = text.match(/\btotal\s+value\b[^\d-]{0,32}?(-?\d[\d,]*(?:\.\d+)?)/i);
  if (totalValueMatch) {
    inferred.push({ field: 'total_value', value: totalValueMatch[1].replace(/,/g, ''), inferred: true });
  }

  const totalScuMatch = text.match(/\btotal\s+scu\b[^\d-]{0,32}?(-?\d[\d,]*(?:\.\d+)?)/i);
  if (totalScuMatch) {
    inferred.push({ field: 'total_scu', value: totalScuMatch[1].replace(/,/g, ''), inferred: true });
  }

  if (/\btitle\b/i.test(text)) {
    const titleQuoted = text.match(/title[^'"\n]*['"]([^'"]+)['"]/i);
    if (titleQuoted) {
      inferred.push({ field: 'title', value: titleQuoted[1].trim(), inferred: true });
    }
  }

  const assistInstruction = extractListInstruction(content, 'assists');
  const assistKeywordsPresent = /\bassist/i.test(text);
  if (assistInstruction || assistKeywordsPresent) {
    const mentionSource = assistInstruction?.listText || content;
    const mentionIds = extractMentionIds(mentionSource, message, { excludeIds: [meta?.botUserId] });
    const operation = normalizeListOperation(assistInstruction?.operation);
    if (operation === 'clear' && !mentionIds.length) {
      inferred.push({ field: 'assists', value: 'none', inferred: true, operation: 'clear' });
    } else if (mentionIds.length) {
      inferred.push({ field: 'assists', value: mentionIds.map((id) => `<@${id}>`).join(' '), inferred: true, operation, mentionIds });
    }
  }

  const victimInstruction = extractListInstruction(content, 'victims');
  if (victimInstruction) {
    const entries = victimInstruction.listText ? splitList(victimInstruction.listText) : [];
    const operation = normalizeListOperation(victimInstruction.operation);
    if (operation === 'clear' && !entries.length) {
      inferred.push({ field: 'victims', value: 'none', inferred: true, operation: 'clear' });
    } else if (entries.length) {
      inferred.push({ field: 'victims', value: entries.join(', '), inferred: true, operation, entries });
    }
  } else {
    const victimsMatch = text.match(/(?:add|include|set|make)\s+(?:the\s+)?victim(?:s)?\s+(?:to|as|=)\s+([^\n]+)/i);
    if (victimsMatch) {
      const victimList = splitList(victimsMatch[1]);
      if (victimList.length) {
        inferred.push({ field: 'victims', value: victimList.join(', '), inferred: true, operation: 'set', entries: victimList });
      }
    }
  }

  if (!inferred.length) {
    const implicit = inferImplicitListChange({ content, message, meta, session });
    if (implicit) {
      inferred.push(implicit);
    }
  }

  return inferred;
}

function isClearValue(value) {
  return CLEAR_VALUE_REGEX.test(value || '');
}

function updateSimpleField(session, field, value) {
  session.working[field] = value;
  session.updatedFields.add(field);
  session.expiresAt = Date.now() + EDIT_SESSION_TTL_MS;
}

function updateListField(session, field, values) {
  session.working[field] = values;
  session.updatedFields.add(field);
  session.expiresAt = Date.now() + EDIT_SESSION_TTL_MS;
}

function extractMentionIds(content, message, { excludeIds = [] } = {}) {
  const ids = new Set();
  const excluded = new Set((excludeIds || []).filter(Boolean).map((id) => String(id)));
  const regex = /<@!?(\d+)>/g;
  let match;
  while ((match = regex.exec(content || '')) !== null) {
    if (excluded.has(match[1])) continue;
    ids.add(match[1]);
  }
  if (!ids.size && message?.mentions?.users?.size) {
    for (const user of message.mentions.users.values()) {
      if (excluded.has(user.id)) continue;
      ids.add(user.id);
    }
  }
  return Array.from(ids);
}

function mutateAssistList(session, { ids = [], operation }) {
  const op = normalizeListOperation(operation);
  const current = Array.isArray(session.working.assists) ? session.working.assists.slice() : [];
  if (op === 'clear') {
    if (!current.length) return 'Assists already empty.';
    updateListField(session, 'assists', []);
    return 'Cleared assists.';
  }
  const normalizedIds = dedupeStrings((ids || []).map((entry) => String(entry).trim()).filter(Boolean));
  if (!normalizedIds.length) {
    throw new Error('Mention at least one assist or say `assists=none`.');
  }
  if (op === 'add') {
    const next = dedupeStrings(current.concat(normalizedIds));
    if (arraysEqual(current, next)) {
      return 'Everyone you mentioned was already listed.';
    }
    updateListField(session, 'assists', next);
    const added = next.length - current.length;
    return `Added ${added} ${pluralize('assist', added)}.`;
  }
  if (op === 'remove') {
    const removeSet = new Set(normalizedIds.map(String));
    const next = current.filter((id) => !removeSet.has(String(id)));
    if (arraysEqual(current, next)) {
      return 'None of those assists were on the hit.';
    }
    const removed = current.length - next.length;
    updateListField(session, 'assists', next);
    return `Removed ${removed} ${pluralize('assist', removed)}.`;
  }
  const next = normalizedIds;
  if (arraysEqual(current, next)) {
    return 'Assists already match that list.';
  }
  updateListField(session, 'assists', next);
  return `Updated assists (${next.length}).`;
}

function mutateNamedListField(session, field, { entries = [], operation }) {
  const op = normalizeListOperation(operation);
  const current = Array.isArray(session.working[field]) ? session.working[field].slice() : [];
  const label = field === 'victims' ? 'victim' : 'entry';
  const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
  if (op === 'clear') {
    if (!current.length) return `${fieldLabel} already empty.`;
    updateListField(session, field, []);
    return `Cleared ${field}.`;
  }
  const normalizedEntries = normalizeNameList(entries);
  if (!normalizedEntries.length) {
    if (op === 'set') {
      if (!current.length) return `${fieldLabel} already empty.`;
      updateListField(session, field, []);
      return `Cleared ${field}.`;
    }
    throw new Error(`Provide at least one ${label} or say \`${field}=none\`.`);
  }
  if (op === 'add') {
    const seen = new Set(current.map((entry) => String(entry).toLowerCase()));
    const next = current.slice();
    let added = 0;
    for (const value of normalizedEntries) {
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(value);
      added += 1;
    }
    if (!added) {
      return `All of those ${pluralize(label, normalizedEntries.length)} were already listed.`;
    }
    updateListField(session, field, next);
    return `Added ${added} ${pluralize(label, added)}.`;
  }
  if (op === 'remove') {
    const removeSet = new Set(normalizedEntries.map((entry) => entry.toLowerCase()));
    const next = current.filter((entry) => !removeSet.has(String(entry).toLowerCase()));
    if (arraysEqual(current, next)) {
      return `None of those ${pluralize(label, normalizedEntries.length)} were on the hit.`;
    }
    const removed = current.length - next.length;
    updateListField(session, field, next);
    return `Removed ${removed} ${pluralize(label, removed)}.`;
  }
  if (arraysEqual(current, normalizedEntries)) {
    return `${fieldLabel} already match that list.`;
  }
  updateListField(session, field, normalizedEntries);
  return `Updated ${field} (${normalizedEntries.length}).`;
}

async function applyAssignment(session, assignment, message, meta) {
  const { field, value } = assignment;
  switch (field) {
    case 'title':
      if (isClearValue(value)) {
        updateSimpleField(session, 'title', `${session.working.username} hit — ${formatCurrency(session.working.total_value)} aUEC`);
        return 'Title reset to default.';
      }
      updateSimpleField(session, 'title', value);
      return 'Updated title.';
    case 'story':
    case 'summary':
    case 'description':
      updateSimpleField(session, 'story', isClearValue(value) ? '' : value);
      return 'Updated story.';
    case 'video':
    case 'video_link':
      updateSimpleField(session, 'video_link', isClearValue(value) ? null : value);
      return 'Updated video link.';
    case 'media':
    case 'additional_media':
    case 'additional_media_links':
      updateListField(session, 'additional_media_links', isClearValue(value) ? [] : dedupeStrings(splitList(value)));
      return 'Updated media links.';
    case 'victims': {
      const operation = normalizeListOperation(assignment.operation);
      if (isClearValue(value) || operation === 'clear') {
        return mutateNamedListField(session, 'victims', { entries: [], operation: 'clear' });
      }
      {
        const entries = assignment.entries || splitList(value);
        if (!entries.length) {
          throw new Error('List at least one victim or say `victims=none`.');
        }
        return mutateNamedListField(session, 'victims', { entries, operation });
      }
    }
    case 'guests':
      updateListField(session, 'guests', isClearValue(value) ? [] : dedupeStrings(splitList(value)));
      return 'Updated guests.';
    case 'assists': {
      const operation = normalizeListOperation(assignment.operation);
      if (isClearValue(value) || operation === 'clear') {
        return mutateAssistList(session, { ids: [], operation: 'clear' });
      }
      const assistIds = assignment.mentionIds
        || extractMentionIds(value, message, { excludeIds: [meta?.botUserId] });
      if (!assistIds.length) {
        throw new Error('Mention at least one assist or say `assists=none`.');
      }
      return mutateAssistList(session, { ids: assistIds, operation });
    }
    case 'type':
    case 'type_of_piracy':
    case 'air_or_ground':
      if (isClearValue(value)) {
        session.working.air_or_ground = 'air';
        session.working.type_of_piracy = 'air';
        session.updatedFields.add('type_of_piracy');
        return 'Type reset to air.';
      }
      {
        const normalized = normalizeAirOrGroundValue(value);
        session.working.air_or_ground = normalized;
        session.working.type_of_piracy = normalized;
        session.updatedFields.add('type_of_piracy');
        return `Set hit type to ${normalized}.`;
      }
    case 'timestamp':
    case 'time':
      if (isClearValue(value)) {
        updateSimpleField(session, 'timestamp', new Date().toISOString());
        return 'Timestamp reset to now.';
      }
      {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.valueOf())) {
          throw new Error('Could not parse that timestamp. Provide an ISO date like `2025-05-10 13:00 UTC`.');
        }
        updateSimpleField(session, 'timestamp', parsed.toISOString());
        return 'Updated timestamp.';
      }
    case 'patch':
      updateSimpleField(session, 'patch', isClearValue(value) ? null : value);
      return 'Updated patch.';
    case 'total_value':
    case 'value':
    case 'total':
      if (isClearValue(value) || value.toLowerCase() === 'auto') {
        session.manualTotals.total_value = false;
        applyAutoTotals(session, { force: false });
        session.updatedFields.add('total_value');
        return 'Total value reset to automatic calculation.';
      }
      {
        const num = Number(value);
        if (!Number.isFinite(num)) throw new Error('Total value must be a number.');
        session.manualTotals.total_value = true;
        session.working.total_value = Math.round(num);
        session.updatedFields.add('total_value');
        return `Total value set to ${formatCurrency(session.working.total_value)}.`;
      }
    case 'total_scu':
    case 'scu':
      if (isClearValue(value) || value.toLowerCase() === 'auto') {
        session.manualTotals.total_scu = false;
        applyAutoTotals(session, { force: false });
        session.updatedFields.add('total_scu');
        return 'Total SCU reset to automatic calculation.';
      }
      {
        const num = Number(value);
        if (!Number.isFinite(num)) throw new Error('Total SCU must be a number.');
        session.manualTotals.total_scu = true;
        session.working.total_scu = Number(num.toFixed(2));
        session.updatedFields.add('total_scu');
        return `Total SCU set to ${formatScu(session.working.total_scu)}.`;
      }
    case 'total_cut_value':
    case 'cut_value':
      if (isClearValue(value)) {
        session.working.total_cut_value = 0;
        session.updatedFields.add('total_cut_value');
        return 'Total cut value cleared.';
      }
      {
        const num = Number(value);
        if (!Number.isFinite(num)) throw new Error('Total cut value must be numeric.');
        session.working.total_cut_value = Math.round(num);
        session.updatedFields.add('total_cut_value');
        return 'Updated total cut value.';
      }
    case 'total_cut_scu':
    case 'cut_scu':
      if (isClearValue(value)) {
        session.working.total_cut_scu = 0;
        session.updatedFields.add('total_cut_scu');
        return 'Total cut SCU cleared.';
      }
      {
        const num = Number(value);
        if (!Number.isFinite(num)) throw new Error('Total cut SCU must be numeric.');
        session.working.total_cut_scu = Number(num.toFixed(2));
        session.updatedFields.add('total_cut_scu');
        return 'Updated total cut SCU.';
      }
    case 'cargo':
    case 'manifest':
      return applyCargoAssignment(session, value);
    default:
      throw new Error(`I do not recognize the field \`${field}\`.`);
  }
}

async function applyCargoAssignment(session, value) {
  if (isClearValue(value)) {
    session.working.cargo = [];
    session.updatedFields.add('cargo');
    applyAutoTotals(session, { force: true });
    return 'Cleared cargo manifest.';
  }
  const items = parseCargoInput(value);
  if (!items.length) {
    throw new Error('Could not parse that cargo list. Use `Item: SCU` entries separated by commas or new lines.');
  }
  await ensureUexCacheReady();
  const { priced, totalValue, totalScu } = await enrichCargoPricing(items);
  if (!priced.length) {
    throw new Error('Could not price that cargo list. Make sure the commodities exist.');
  }
  session.working.cargo = priced;
  session.updatedFields.add('cargo');
  session.manualTotals.total_value = false;
  session.manualTotals.total_scu = false;
  session.autoTotals = { totalValue: Math.round(totalValue), totalScu: Number(totalScu.toFixed(2)) };
  applyAutoTotals(session, { force: false });
  return `Updated cargo manifest (${priced.length} entries).`;
}

function buildChangeSummary(session) {
  if (!session.updatedFields.size) return 'No pending changes.';
  const lines = [];
  for (const field of Array.from(session.updatedFields).sort()) {
    const before = session.original[field];
    const after = session.working[field];
    lines.push(`• ${field}: ${summarizeValue(before)} → ${summarizeValue(after)}`);
  }
  return lines.join('\n');
}

function summarizeValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (typeof value[0] === 'object') return `${value.length} entries`;
    const looksLikeIdList = value.every((entry) => /^\d{5,}$/.test(String(entry)));
    if (looksLikeIdList) {
      return value.map((id) => `<@${id}>`).join(', ');
    }
    return value.join(', ');
  }
  if (value == null || value === '') return 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function submitSessionChanges(session, client) {
  const payload = { ...session.working };
  delete payload.thread_id;
  delete payload.threadId;
  const ok = await HitTrackerModel.update(session.hitId, payload);
  if (!ok) {
    throw new Error('Hit update failed');
  }
  let updated = null;
  try {
    updated = await HitTrackerModel.getByEntryId(session.hitId);
  } catch {}
  if (updated) {
    try {
      await handleHitPostUpdate(client, session.original, updated);
    } catch (error) {
      console.error('[HitEdit] Failed to update hit thread:', error?.message || error);
    }
  }
  sessions.delete(session.key);
  return updated || session.working;
}

function threadIdFromMessage(message) {
  const channel = message?.channel;
  if (!channel) return null;
  if (typeof channel.isThread === 'function' && channel.isThread()) {
    return channel.id;
  }
  if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread || channel.type === ChannelType.AnnouncementThread) {
    return channel.id;
  }
  return null;
}

async function resolveTargetHit({ message, content }) {
  const threadId = threadIdFromMessage(message);
  const idFromContent = extractHitIdFromContent(content);
  if (!threadId && !idFromContent) {
    return { ok: false, reply: 'Need the hit ID (e.g., `edit hit 123456`) or use this command inside the hit thread.' };
  }

  if (threadId) {
    const hitByThread = await findHitByThreadId(threadId);
    if (hitByThread) return { ok: true, hit: hitByThread };
    if (!idFromContent) {
      return { ok: false, reply: 'I could not find a hit linked to this thread.' };
    }
  }

  if (idFromContent) {
    const hitById = await findHitById(idFromContent);
    if (hitById) return { ok: true, hit: hitById };
    // If entry lookup failed, attempt to treat the number as a thread id too
    const hitByThreadIdValue = await findHitByThreadId(idFromContent);
    if (hitByThreadIdValue) return { ok: true, hit: hitByThreadIdValue };
    return { ok: false, reply: `I could not find hit ${idFromContent}.` };
  }

  return { ok: false, reply: 'I need the hit ID or the hit thread to continue.' };
}

async function processHitEditInteraction({ message, meta, intent, client }) {
  cleanupExpiredSessions();
  const content = message.content || '';
  const sessionKey = getSessionKey(meta);
  let session = sessions.get(sessionKey);
  const shouldStart = shouldStartEditSession(intent, message, { hasSession: Boolean(session) });
  if (!session && !shouldStart) {
    return { handled: false };
  }

  if (!session) {
    const resolved = await resolveTargetHit({ message, content });
    if (!resolved.ok) {
      return { handled: true, intent: SESSION_INTENT, reply: resolved.reply };
    }
    if (!hasHitPermission(resolved.hit, message)) {
      return { handled: true, intent: SESSION_INTENT, reply: 'You are not allowed to edit that hit. Only its owner or Blooded members can modify it.' };
    }
    session = ensureSession(meta, resolved.hit);
  }

  if (wantsCancel(content)) {
    sessions.delete(session.key);
    return { handled: true, intent: SESSION_INTENT, reply: 'Aborted the hit edit session. No changes were applied.' };
  }

  if (wantsHelp(content)) {
    return { handled: true, intent: SESSION_INTENT, reply: `${EDIT_INSTRUCTIONS}\n\n${buildSessionStatus(session)}` };
  }

  if (wantsStatus(content)) {
    const changeSummary = buildChangeSummary(session);
    const summary = changeSummary && changeSummary !== 'No pending changes.'
      ? `Pending changes:\n${changeSummary}`
      : 'No pending changes yet.';
    return {
      handled: true,
      intent: SESSION_INTENT,
      reply: `${buildHitLabel(session.working)}\n${summary}`,
    };
  }

  if (wantsSubmit(content)) {
    if (!session.updatedFields.size) {
      return { handled: true, intent: SESSION_INTENT, reply: 'No pending changes. Update a field before saving.' };
    }
    try {
      const updated = await submitSessionChanges(session, client);
      const summary = buildChangeSummary({ ...session, working: updated });
      return {
        handled: true,
        intent: SESSION_INTENT,
        reply: `Updated ${buildHitLabel(updated)}.\n\n${summary}`,
      };
    } catch (error) {
      console.error('[HitEdit] Failed to submit edits:', error?.message || error);
      sessions.delete(session.key);
      return { handled: true, intent: SESSION_INTENT, reply: `I failed to update that hit (${error?.message || 'unknown error'}). Try again later.` };
    }
  }

  const assignments = parseAssignments(content);
  let sourceAssignments = assignments;
  let usedInference = false;
  if (!sourceAssignments.length) {
    const inferred = inferAssignmentsFromContent(content, message, meta, session);
    if (inferred.length) {
      sourceAssignments = inferred;
      usedInference = true;
    }
  }

  if (!sourceAssignments.length) {
    const response = session.updatedFields.size
      ? `${EDIT_INSTRUCTIONS}\n\nPending changes:\n${buildChangeSummary(session)}`
      : `Editing Hit ${session.hitId}.\n${EDIT_INSTRUCTIONS}`;
    return { handled: true, intent: SESSION_INTENT, reply: response };
  }

  const responses = [];
  for (const assignment of sourceAssignments) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await applyAssignment(session, assignment, message, meta);
      if (result) responses.push(result);
    } catch (error) {
      return { handled: true, intent: SESSION_INTENT, reply: error.message || 'Could not apply that change.' };
    }
  }

  const summary = buildChangeSummary(session);
  const changes = responses.length ? responses.join('\n') : 'Captured the update.';
  const inferenceNote = usedInference
    ? 'Interpreted your request and applied that change. If that is wrong, clarify the field and value or say `cancel`. Say `done` when you want me to apply the pending changes.'
    : null;
  return {
    handled: true,
    intent: SESSION_INTENT,
    reply: `${inferenceNote ? `${inferenceNote}\n\n` : ''}${changes}\n\nPending changes:\n${summary}\n\n${SESSION_ACTION_HINT}`,
  };
}

module.exports = {
  processHitEditInteraction,
  getActiveHitEditSessions: () => ({ size: sessions.size }),
};
