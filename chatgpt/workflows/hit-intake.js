const { HitTrackerModel } = require('../../api/models/hit-tracker');
const { ensureUexCacheReady } = require('../context/cache-readiness');
const { handleHitPost } = require('../../functions/post-new-hit');

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

const ITEM_NAME_FIELDS = ['item_name', 'item', 'commodity_name', 'commodity', 'commodityName', 'name', 'label'];
const SELL_PRICE_FIELDS = ['sell_price', 'best_sell', 'median_price', 'price_sell', 'price_sell_max', 'price_sell_avg', 'price_sell_min'];
const LOCATION_FIELDS = ['terminal_name', 'terminal', 'location', 'station', 'space_station_name', 'outpost_name', 'city_name', 'moon_name', 'planet_name'];
const MIN_COMMODITY_MATCH_SCORE = Number(process.env.HIT_INTAKE_MIN_COMMODITY_SCORE || 0.58);

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

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
      type_of_piracy: null,
      air_or_ground: null,
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
  if (lower.includes('hit tracker')) return true;
  if (lower.includes('pirate hit')) return true;
  if (/\b(add|log|record|submit|post|create|new|file)\b/.test(lower) && /\bhit\b/.test(lower)) {
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
      }))
      .filter((entry) => entry.commodity_name && Number.isFinite(entry.scuAmount) && entry.scuAmount > 0);
  } catch {
    return null;
  }
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
    const patterns = [
      /^(?<name>[a-z0-9'\-\s()]+)\s*[:=]\s*(?<qty>\d+(?:\.\d+)?)/i,
      /^(?<qty>\d+(?:\.\d+)?)\s*(?:scu|u|units?)?\s+(?:of\s+)?(?<name>[a-z0-9'\-\s()]+)/i,
      /^(?<name>[a-z0-9'\-\s()]+)\s+(?<qty>\d+(?:\.\d+)?)(?:\s*(?:scu|u|units?))?$/i,
      /^(?<name>[a-z0-9'\-\s()]+)\s+x\s*(?<qty>\d+(?:\.\d+)?)/i,
    ];
    let match = null;
    for (const pattern of patterns) {
      match = segment.match(pattern);
      if (match) break;
    }
    if (!match) continue;
    const name = (match.groups.name || '').replace(/\s+/g, ' ').trim();
    const qty = Number(match.groups.qty);
    if (!name || !Number.isFinite(qty) || qty <= 0) continue;
    items.push({ commodity_name: name, scuAmount: qty });
  }
  if (items.length) return items;
  return extractFreeformCargo(trimmed);
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
    const lookup = lookupBestSellPrice(entry.commodity_name);
    const avgPrice = lookup?.price ?? 0;
    const extended = Number(entry.scuAmount) * avgPrice;
    totalValue += Number.isFinite(extended) ? extended : 0;
    totalScu += Number(entry.scuAmount) || 0;
    return {
      commodity_name: entry.commodity_name,
      scuAmount: Number(entry.scuAmount) || 0,
      avg_price: avgPrice,
      pricing_note: lookup?.location ? `Best sell @ ${lookup.location}` : null,
      pricing_match: lookup?.matchName || null,
    };
  });
  return { priced, totalValue, totalScu };
}

function parseAssistsFromMessage(message) {
  const content = (message.content || '').trim();
  if (!content && !message.mentions?.users?.size) {
    return { handled: false, assists: [], guests: [] };
  }
  if (matchesCommand(content, COMMAND_WORDS.skip)) {
    return { handled: true, assists: [], guests: [] };
  }
  const assists = new Set();
  if (message.mentions?.users?.size) {
    for (const user of message.mentions.users.values()) {
      assists.add(user.id);
    }
  }
  const manualMatches = content.match(/<@!?(\d+)>/g);
  if (manualMatches) {
    for (const raw of manualMatches) {
      const id = raw.replace(/\D/g, '');
      if (id) assists.add(id);
    }
  }
  const guestMatch = content.match(/guests?\s*[:=]\s*(.+)$/i);
  const guests = guestMatch ? splitList(guestMatch[1]) : [];
  if (assists.size === 0 && guests.length === 0) {
    return { handled: false, assists: [], guests: [] };
  }
  return { handled: true, assists: Array.from(assists), guests };
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
  let keyedFieldFound = false;
  if (content.includes('=') || content.includes(':')) {
    const segments = content.split(/;|\n/);
    for (const raw of segments) {
      const segment = raw.trim();
      if (!segment) continue;
      const match = segment.match(/^(\w+)\s*[:=]\s*(.+)$/i);
      if (!match) continue;
      keyedFieldFound = true;
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (!value) continue;
      switch (key) {
        case 'title':
          details.title = value;
          break;
        case 'story':
        case 'summary':
          details.story = value;
          break;
        case 'video':
        case 'video_link':
          details.video_link = value;
          break;
        case 'media':
        case 'additional_media':
          details.additional_media_links = splitList(value);
          break;
        case 'victims':
          details.victims = splitList(value);
          break;
        case 'guests':
          details.guests = splitList(value);
          break;
        case 'type':
          details.type_of_piracy = value;
          if (['air', 'ground', 'mixed'].includes(value.toLowerCase())) {
            details.air_or_ground = value.toLowerCase();
          }
          break;
        case 'timestamp':
          {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.valueOf())) {
              details.timestamp = parsed.toISOString();
            }
          }
          break;
        case 'patch':
          details.patch = value;
          break;
        case 'victim':
          details.victims = splitList(value);
          break;
        default:
          break;
      }
    }
  }
  if (!keyedFieldFound && content) {
    details.story = content;
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
  if (updates.type_of_piracy) target.type_of_piracy = updates.type_of_piracy;
  if (updates.air_or_ground) target.air_or_ground = updates.air_or_ground;
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

function buildStatusSummary(session) {
  const sections = [];
  sections.push(`Cargo: ${session.fields.cargo.length ? `${session.fields.cargo.length} items` : 'pending'}`);
  sections.push(`Assists: ${session.fields.assists.length ? session.fields.assists.length : 'pending'}`);
  sections.push(`Extras: ${session.fields.story || session.fields.title || session.fields.video_link || session.fields.victims.length || session.fields.additional_media_links.length ? 'captured' : 'optional'}`);
  sections.push(`Total Value: ${session.pricing.totalValue ? `${formatCurrency(session.pricing.totalValue)} aUEC` : 'tbd'}`);
  return sections.join(' | ');
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
  return {
    user_id: fields.user_id,
    username: fields.username,
    nickname: fields.nickname,
    title: fields.title || `${fields.nickname || fields.username || 'Unknown'} hit`,
    story: fields.story,
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
    video_link: fields.video_link,
    additional_media_links: fields.additional_media_links,
    type_of_piracy: fields.type_of_piracy,
    air_or_ground: fields.air_or_ground,
    timestamp: fields.timestamp || new Date().toISOString(),
    patch: fields.patch,
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
  const items = parseCargoInput(message.content || '');
  if (!items.length) {
    return 'Need the cargo manifest first. Format each line as `Commodity: SCU` (e.g., `Quantanium: 48`).';
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
  const parsed = parseAssistsFromMessage(message);
  if (!parsed.handled) {
    return 'Need the assists. Mention them or type `none` if you ran it solo.';
  }
  session.fields.assists = parsed.assists;
  if (parsed.guests.length) {
    session.fields.guests = dedupeStrings((session.fields.guests || []).concat(parsed.guests));
  }
  ensureStep(session, 'details');
  return `${buildAssistsSummary(session)}\n\nOptional: add \`title/summary/video/victims\` using \`title=\`, \`story=\`, \`video=URL\`, \`victims=Name1,Name2\` or say \`skip\`. Attach media if you have receipts.`;
}

function processDetailsStep(session, message) {
  if (wantsSkip(message.content || '')) {
    ensureStep(session, 'ready');
    return 'Skipping extras. I will push the hit with what we have.';
  }
  const details = parseOptionalDetails(message);
  if (!Object.keys(details).length) {
    return 'Did not catch any details. Use `title=`, `story=`, `video=` or say `skip`.';
  }
  mergeOptionalDetails(session.fields, details);
  ensureStep(session, 'ready');
  return 'Extras locked. Posting the hit now.';
}

function ensureSession(meta, message) {
  const key = getSessionKey(meta);
  let session = sessions.get(key);
  if (!session) {
    session = startSession(meta, message);
  }
  return session;
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

  let reply;
  if (session.step === 'cargo') {
    reply = await processCargoStep(session, message);
    return { handled: true, intent: SESSION_INTENT, reply };
  }
  if (session.step === 'assists') {
    reply = await processAssistsStep(session, message);
    return { handled: true, intent: SESSION_INTENT, reply };
  }
  if (session.step === 'details') {
    reply = processDetailsStep(session, message);
    if (session.step !== 'ready') {
      return { handled: true, intent: SESSION_INTENT, reply };
    }
  }
  if (session.step === 'ready') {
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
  return { handled: true, intent: SESSION_INTENT, reply: 'Still working on it. Keep feeding me the details.' };
}

module.exports = {
  processHitIntakeInteraction,
  getActiveHitIntakeSessions: () => ({ size: sessions.size }),
};
