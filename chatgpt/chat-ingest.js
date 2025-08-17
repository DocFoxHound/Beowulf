const { listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge } = require('../api/knowledgeApi');

// Channels to ingest from env
function getIngestChannelIds() {
  return [
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.STARCITIZEN_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.CREW_CHANNEL : process.env.TEST_CREW_CHANNEL,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.DOGFIGHTING_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.PIRACY_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.DEV_CHAT_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.ADVICE_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.RONIN_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.SC_FEEDS_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.THE_TOME : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.BOT_COMMANDS_CHANNEL : null,
    process.env.LIVE_ENVIRONMENT === 'true' ? process.env.HITTRACK_CHANNEL_ID : process.env.TEST_HITTRACK_CHANNEL_ID,
  ].filter(Boolean);
}

function utcDayKey(d = new Date()) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayStartUTC(d = new Date()) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

const STOPWORDS = new Set(['the','a','an','and','or','but','if','then','else','on','in','at','to','for','of','with','by','is','are','was','were','be','been','it','this','that','these','those','you','i','we','they','he','she','them','us','our','your','yours','from','as','so','not','do','did','does','have','has','had','my','me','too','very','just','also','can','could','should','would','will','won\'t','can\'t','don\'t','im','i\'m','u','ya','lol']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length > 2 && !STOPWORDS.has(t));
}

function analyzeMessages(msgs) {
  const users = new Set();
  const freq = new Map();
  const quotes = [];
  for (const m of msgs) {
    const name = m.member?.nickname || m.author?.username || 'unknown';
    users.add(name);
    const content = m.content || '';
    for (const t of tokenize(content)) freq.set(t, (freq.get(t) || 0) + 1);
    if (content && content.length >= 40) quotes.push({ name, content: content.slice(0, 240) });
  }
  const topKeywords = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([k])=>k);
  const topQuotes = quotes.sort((a,b)=>b.content.length-a.content.length).slice(0, 3);
  return { participants: Array.from(users), topKeywords, topQuotes };
}

function buildSummaryContent({ dateKey, channelName, msgsCount, participants, topKeywords, topQuotes }) {
  const lines = [];
  lines.push(`Date (UTC): ${dateKey}`);
  lines.push(`Channel: #${channelName}`);
  lines.push(`Messages: ${msgsCount}`);
  lines.push(`Participants (${participants.length}): ${participants.slice(0, 15).join(', ')}`);
  if (topKeywords.length) lines.push(`Topics: ${topKeywords.join(', ')}`);
  if (topQuotes.length) {
    lines.push('Representative quotes:');
    for (const q of topQuotes) lines.push(`- ${q.name}: "${q.content}"`);
  }
  return lines.join('\n');
}

// ---------------- AI summarization helpers ----------------
function formatMessageLine(m) {
  const when = new Date(m.createdAt);
  const hh = String(when.getUTCHours()).padStart(2, '0');
  const mm = String(when.getUTCMinutes()).padStart(2, '0');
  const who = m.member?.nickname || m.author?.username || 'unknown';
  const text = (m.content || '').replace(/\s+/g, ' ').trim();
  return `[${hh}:${mm}] ${who}: ${text}`;
}

function chunkTranscript(msgs, maxChars = 4000, hardCap = 8) {
  const lines = msgs.map(formatMessageLine);
  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const line of lines) {
    if (curLen + line.length + 1 > maxChars && cur.length) {
      chunks.push(cur.join('\n'));
      cur = [];
      curLen = 0;
    }
    cur.push(line);
    curLen += line.length + 1;
  }
  if (cur.length) chunks.push(cur.join('\n'));
  return chunks.slice(0, hardCap);
}

async function llmRespond(openai, model, system, prompt) {
  try {
    if (openai?.responses?.create) {
      const res = await openai.responses.create({
        model,
        input: [
          { role: 'system', content: [{ type: 'text', text: system }] },
          { role: 'user', content: [{ type: 'text', text: prompt }] },
        ],
      });
      // Prefer output_text if available
      if (typeof res.output_text === 'string') return res.output_text.trim();
      // Fallback: extract text from first content block
      const out = res.output?.[0]?.content?.[0]?.text;
      if (typeof out === 'string') return out.trim();
      return '';
    }
    if (openai?.chat?.completions?.create) {
      const res = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });
      return res.choices?.[0]?.message?.content?.trim() || '';
    }
    console.error('No compatible OpenAI API method found (responses or chat.completions)');
    return '';
  } catch (e) {
    console.error('llmRespond error:', e?.response?.data || e?.message || e);
    return '';
  }
}

async function summarizeChunkWithAI(openai, model, channelName, dateKey, chunk) {
  const system = 'You are a concise meeting scribe. Summarize chat into key points, actions, decisions, and notable quotes. Be faithful to the text.';
  const prompt = `Channel: #${channelName}\nDate (UTC): ${dateKey}\n\nChat chunk (UTC):\n"""\n${chunk}\n"""\n\nSummarize in 4-7 bullet points and add an Actions section if applicable.`;
  return await llmRespond(openai, model, system, prompt);
}

async function summarizeDailyWithAI(openai, model, channelName, dateKey, parts) {
  const system = 'You are an expert editor. Merge multiple partial summaries into a clear, de-duplicated daily summary. Prefer themes, decisions, open questions, and action items.';
  const prompt = `Merge the following partial summaries for #${channelName} (${dateKey}) into a single daily summary.\n\nPartial summaries:\n---\n${parts.map((s,i)=>`[${i+1}]\n${s}`).join('\n---\n')}\n\nOutput format:\n- Overview (2-4 sentences)\n- Topics (bullets)\n- Decisions (bullets, if any)\n- Action Items (bullets, if any)\n- Notable Quotes (bullets, short)`;
  return await llmRespond(openai, model, system, prompt);
}

// --------- User-focused summarization helpers ---------
function collectUserCatalog(msgs) {
  const users = new Map(); // id -> { username, nickname }
  const mentioned = new Set();
  for (const m of msgs) {
    const id = m.author?.id;
    if (id) {
      if (!users.has(id)) users.set(id, { username: m.author?.username, nickname: m.member?.nickname });
    }
    if (m.mentions?.users) {
      for (const [uid, user] of m.mentions.users) {
        mentioned.add(uid);
        if (!users.has(uid)) users.set(uid, { username: user?.username, nickname: null });
      }
    }
  }
  return { users, mentioned };
}

function nameCandidates(rec) {
  const out = new Set();
  if (rec?.username) out.add(rec.username.toLowerCase());
  if (rec?.nickname) out.add(rec.nickname.toLowerCase());
  // Also split on spaces for nicknames with multiple words
  for (const s of Array.from(out)) {
    for (const part of s.split(/\s+/)) if (part.length > 2) out.add(part);
  }
  return Array.from(out);
}

function buildUserRelatedLines(msgs, targetId, rec) {
  const names = nameCandidates(rec);
  const lines = [];
  let ownCount = 0;
  let mentionCount = 0;
  for (const m of msgs) {
    if (m.system || m.author?.bot) continue;
    const text = (m.content || '');
    const isOwn = m.author?.id === targetId;
    const isMention = Boolean(m.mentions?.users?.has?.(targetId));
    const lower = text.toLowerCase();
    const nameHit = names.length ? names.some(n => n && new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`, 'i').test(lower)) : false;
    if (isOwn) ownCount++;
    if (isMention || nameHit) mentionCount++;
    if (isOwn || isMention || nameHit) {
      lines.push(formatMessageLine(m));
    }
  }
  return { lines, ownCount, mentionCount };
}

async function summarizeUserDailyWithAI(openai, model, channelName, dateKey, username, userId, transcript) {
  const system = 'You write concise persona-focused reports. Capture how the person acted and what others said about them. Be neutral, factual, and specific.';
  const prompt = `Subject: ${username} (ID: ${userId})\nChannel: #${channelName}\nDate (UTC): ${dateKey}\n\nRelated chat lines (UTC):\n"""\n${transcript}\n"""\n\nSummarize the going-ons concerning this person. Output:\n- Behavior and participation (2-4 bullets)\n- Mentions by others (2-4 bullets)\n- Notable quotes (1-3, short, with time/user if present)\n- Open items or follow-ups (optional)`;
  return await llmRespond(openai, model, system, prompt);
}

function buildUserHeuristicSummary({ dateKey, channelName, username, userId, ownCount, mentionCount, sampleLines }) {
  const lines = [];
  lines.push(`Date (UTC): ${dateKey}`);
  lines.push(`Channel: #${channelName}`);
  lines.push(`User: ${username} (${userId})`);
  lines.push(`Own messages: ${ownCount}`);
  lines.push(`Mentions/ref: ${mentionCount}`);
  if (sampleLines && sampleLines.length) {
    lines.push('Samples:');
    for (const l of sampleLines.slice(0, 5)) lines.push(`- ${l}`);
  }
  return lines.join('\n');
}

async function upsertUserDailySummary({ guildId, channel, dateKey, userId, username, content }) {
  const channelId = channel.id;
  const channelName = channel.name || channelId;
  const title = `@${username || userId} (${userId}) — ${dateKey}`;
  // Keep tags short and stable (<=5 is safer for many backends)
  const tags = ['chat','user-daily',`date:${dateKey}`,`channel_id:${channelId}`,`user:${userId}`];
  const safeContent = String(content || '').slice(0, 12000);
  const url = `discord://guild/${guildId || 'g'}/channel/${channelId || 'c'}/user/${userId}/${dateKey}`;
  const version = 'v1';
  const base = {
  source: 'discord',
    category: 'chat',
    title,
    section: 'user-daily-summary',
    content: String(safeContent).slice(0, 4000),
    tags,
    url,
    version,
  };
  if ((process.env.KNOWLEDGE_MINIMAL || 'false') !== 'true') {
    base.guild_id = guildId;
    base.channel_id = channelId;
  }

  try {
    // Look for existing summary for this day/channel/user
    const rows = await listKnowledge({ category: 'chat', guild_id: guildId, channel_id: channelId, limit: 200, order: 'created_at.desc', tags_all: `date:${dateKey}` });
    const list = Array.isArray(rows) ? rows : [];
    const existing = list.find(r => r.section === 'user-daily-summary' && Array.isArray(r.tags) && r.tags.includes(`user:${userId}`));
    if (existing) {
      await updateKnowledge(existing.id, base);
      return existing.id;
    }
    const created = await createKnowledge(base);
    return created?.id || null;
  } catch (e) {
    console.error('upsertUserDailySummary error:', {
      title,
      section: 'user-daily-summary',
      guildId,
      channelId,
      userId,
      err: e?.response?.data || e?.message || String(e),
    });
    return null;
  }
}

async function generateUserDailySummaries({ client, openai, channel, dateKey, msgs }) {
  const guildId = channel.guild?.id || process.env.GUILD_ID;
  const { users, mentioned } = collectUserCatalog(msgs);
  // Candidates: authors and anyone mentioned
  for (const id of mentioned) if (!users.has(id)) users.set(id, { username: null, nickname: null });
  // Cap per env
  const maxUsers = Number(process.env.KNOWLEDGE_USER_SUMMARY_MAX || 30);
  const entries = Array.from(users.entries()).slice(0, maxUsers);
  for (const [userId, rec] of entries) {
    const username = rec?.nickname || rec?.username || userId;
    const { lines, ownCount, mentionCount } = buildUserRelatedLines(msgs, userId, rec);
    if (!lines.length && ownCount === 0 && mentionCount === 0) continue;
    let content = buildUserHeuristicSummary({ dateKey, channelName: channel.name || channel.id, username, userId, ownCount, mentionCount, sampleLines: lines.slice(0, 3) });
    try {
      if ((process.env.KNOWLEDGE_AI_SUMMARY || 'false') === 'true' && lines.length) {
        const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
        const transcript = lines.join('\n');
        const ai = await summarizeUserDailyWithAI(openai, model, channel.name || channel.id, dateKey, username, userId, transcript);
        if (ai) content = `${content}\n\nAI Summary (user):\n${ai}`;
      }
    } catch (e) {
      console.error('AI user summarization failed, using heuristic:', e?.response?.data || e?.message || e);
    }
    await upsertUserDailySummary({ guildId, channel, dateKey, userId, username, content });
  }
}

async function fetchTodayMessagesForChannel(channel, maxPages = 10) {
  const since = dayStartUTC();
  const out = [];
  let before = undefined;
  for (let i = 0; i < maxPages; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    const msgs = Array.from(batch.values());
    msgs.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
    for (const m of msgs) {
      if (m.system) continue;
      if (m.author?.bot) continue;
      if (m.createdAt >= since) out.push(m);
    }
    const earliest = msgs[0];
    if (!earliest) break;
    if (earliest.createdAt < since) break; // crossed boundary
    before = msgs[0].id;
  }
  return out;
}

// Generic fetcher: get all non-bot, non-system messages since a given UTC date
async function fetchMessagesSinceDate(channel, sinceDate, maxPages = 500) {
  const since = new Date(sinceDate);
  const out = [];
  let before = undefined;
  for (let i = 0; i < maxPages; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    const msgs = Array.from(batch.values());
    msgs.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
    // Stop condition: if the earliest message in this batch is older than the target 'since', we can finish after filtering
    let crossedBoundary = false;
    for (const m of msgs) {
      if (m.system) continue;
      if (m.author?.bot) continue;
      if (m.createdAt >= since) out.push(m);
    }
    const earliest = msgs[0];
    if (!earliest) break;
    if (earliest.createdAt < since) crossedBoundary = true;
    before = msgs[0].id;
    if (crossedBoundary) break;
  }
  // Ensure ascending order overall
  out.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
  return out;
}

// Group messages into days by UTC date key
function groupMessagesByDayUTC(msgs) {
  const bucket = new Map();
  for (const m of msgs) {
    const key = utcDayKey(new Date(m.createdAt));
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(m);
  }
  // Ensure each day's messages are in ascending order
  for (const arr of bucket.values()) arr.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
  return bucket;
}

async function upsertDailySummary({ guildId, channel, dateKey, content }) {
  const channelId = channel.id;
  const channelName = channel.name || channelId;
  const title = `#${channelName} — ${dateKey}`;
  // Keep tags short and stable
  const tags = ['chat','daily',`date:${dateKey}`,`channel_id:${channelId}`,`guild_id:${guildId}`];
  const safeContent = String(content || '').slice(0, 12000);
  const url = `discord://guild/${guildId || 'g'}/channel/${channelId || 'c'}/daily/${dateKey}`;
  const version = 'v1';
  const base = {
  source: 'discord',
    category: 'chat',
    title,
    section: 'daily-summary',
    content: String(safeContent).slice(0, 4000),
    tags,
    url,
    version,
  };
  if ((process.env.KNOWLEDGE_MINIMAL || 'false') !== 'true') {
    base.guild_id = guildId;
    base.channel_id = channelId;
  }

  try {
    // Look for existing summary for this day/channel
    const rows = await listKnowledge({ category: 'chat', guild_id: guildId, channel_id: channelId, tags_all: `date:${dateKey}`, limit: 50, order: 'created_at.desc' });
    if (Array.isArray(rows) && rows.length) {
      const row = rows.find(r => r.section === 'daily-summary') || rows[0];
      if (row?.id) {
        await updateKnowledge(row.id, base);
        return row.id;
      }
    }
    const created = await createKnowledge(base);
    return created?.id || null;
  } catch (e) {
    console.error('upsertDailySummary error:', {
      title,
      section: 'daily-summary',
      guildId,
      channelId,
      err: e?.response?.data || e?.message || String(e),
    });
    return null;
  }
}

async function cleanupOldSummaries({ guildId, channel }) {
  try {
    const channelId = channel.id;
    // Fetch up to 400 summaries to evaluate retention
    const rows = await listKnowledge({ category: 'chat', guild_id: guildId, channel_id: channelId, limit: 400, order: 'created_at.desc' }) || [];
    if (!Array.isArray(rows) || rows.length <= 90) return; // below threshold
    const cutoff = Date.now() - 90 * 86400000;
    const toDelete = rows.filter(r => new Date(r.created_at).getTime() < cutoff);
    for (const r of toDelete) {
      try { await deleteKnowledge(r.id); } catch (e) { console.error('cleanup delete failed id=', r.id, e?.response?.data || e?.message || e); }
    }
  } catch (e) {
    console.error('cleanupOldSummaries error:', e?.response?.data || e);
  }
}

async function processChannel(client, openai, channelId) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.messages?.fetch) return;
    const guildId = channel.guild?.id || process.env.GUILD_ID;
    const today = utcDayKey();
    const msgs = await fetchTodayMessagesForChannel(channel);
    if (!msgs.length) {
      // Still ensure cleanup runs occasionally
      await cleanupOldSummaries({ guildId, channel });
      return;
    }
  const { participants, topKeywords, topQuotes } = analyzeMessages(msgs);
    const baseHeader = buildSummaryContent({ dateKey: today, channelName: channel.name || channel.id, msgsCount: msgs.length, participants, topKeywords, topQuotes });

    let content = baseHeader;
    try {
      if ((process.env.KNOWLEDGE_AI_SUMMARY || 'false') === 'true') {
        const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
        const chunks = chunkTranscript(msgs, 4000, 8);
        if (chunks.length) {
          const partials = [];
          for (const ch of chunks) {
            const s = await summarizeChunkWithAI(openai, model, channel.name || channel.id, today, ch);
            if (s) partials.push(s);
          }
          if (partials.length) {
            const merged = await summarizeDailyWithAI(openai, model, channel.name || channel.id, today, partials);
            if (merged) content = `${baseHeader}\n\nAI Summary:\n${merged}`;
          }
        }
      }
    } catch (aiErr) {
      console.error('AI summarization failed, falling back to heuristic summary:', aiErr?.response?.data || aiErr?.message || aiErr);
      // content remains baseHeader
    }
  await upsertDailySummary({ guildId, channel, dateKey: today, content });
  // Per-user summaries for today
  await generateUserDailySummaries({ client, openai, channel, dateKey: today, msgs });
    await cleanupOldSummaries({ guildId, channel });
  } catch (e) {
    console.error('processChannel error:', e?.response?.data || e);
  }
}

async function ingestDailyChatSummaries(client, openai) {
  const startTs = Date.now();
  const startIso = new Date().toISOString();
  if ((process.env.KNOWLEDGE_RETRIEVAL || 'true').toLowerCase() === 'false') {
    console.log(`[chat-ingest] SKIP ${startIso} (KNOWLEDGE_RETRIEVAL=false)`);
    return; // respect kill switch
  }
  const ids = getIngestChannelIds();
  console.log(`[chat-ingest] START ${startIso} channels=${ids.length}`);
  try {
    for (const id of ids) {
      await maybeBackfillChannel(client, openai, id);
      await processChannel(client, openai, id);
    }
  } finally {
    const endIso = new Date().toISOString();
    const dur = Date.now() - startTs;
    console.log(`[chat-ingest] DONE ${endIso} duration_ms=${dur}`);
  }
}

module.exports = {
  ingestDailyChatSummaries,
};

// ---------------- Backfill: last N days on fresh load ----------------

async function maybeBackfillChannel(client, openai, channelId) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.messages?.fetch) return;
    const guildId = channel.guild?.id || process.env.GUILD_ID;
    // Fetch existing recent daily summaries to avoid duplicates; we'll fill only missing days
    const existingRows = await listKnowledge({ category: 'chat', guild_id: guildId, channel_id: channelId, section: 'daily-summary', limit: 400, order: 'created_at.desc' }).catch(() => []) || [];
    const existingDates = new Set();
    for (const r of existingRows) {
      if (Array.isArray(r.tags)) {
        const t = r.tags.find(x => typeof x === 'string' && x.startsWith('date:'));
        if (t) existingDates.add(t.replace('date:', ''));
      }
    }

    const days = Number(process.env.KNOWLEDGE_BACKFILL_DAYS || 90);
    const since = new Date(Date.now() - days * 86400000);
    const msgs = await fetchMessagesSinceDate(channel, since);
    if (!msgs.length) return;
    const byDay = groupMessagesByDayUTC(msgs);
    // Iterate oldest to newest for deterministic behavior
    const keys = Array.from(byDay.keys()).sort();
    let createdCount = 0;
    for (const dateKey of keys) {
      // Skip days we already have
      if (existingDates.has(dateKey) && (process.env.KNOWLEDGE_BACKFILL_FORCE || 'false') !== 'true') continue;
      const dayMsgs = byDay.get(dateKey) || [];
      if (!dayMsgs.length) continue;
      const { participants, topKeywords, topQuotes } = analyzeMessages(dayMsgs);
      const baseHeader = buildSummaryContent({ dateKey, channelName: channel.name || channel.id, msgsCount: dayMsgs.length, participants, topKeywords, topQuotes });
      let content = baseHeader;
      try {
        if ((process.env.KNOWLEDGE_AI_SUMMARY || 'false') === 'true') {
          const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
          const chunks = chunkTranscript(dayMsgs, 4000, 8);
          if (chunks.length) {
            const partials = [];
            for (const ch of chunks) {
              const s = await summarizeChunkWithAI(openai, model, channel.name || channel.id, dateKey, ch);
              if (s) partials.push(s);
            }
            if (partials.length) {
              const merged = await summarizeDailyWithAI(openai, model, channel.name || channel.id, dateKey, partials);
              if (merged) content = `${baseHeader}\n\nAI Summary:\n${merged}`;
            }
          }
        }
      } catch (aiErr) {
        console.error('AI summarization (backfill) failed, using heuristic:', aiErr?.response?.data || aiErr?.message || aiErr);
      }
      await upsertDailySummary({ guildId, channel, dateKey, content });
      await generateUserDailySummaries({ client, openai, channel, dateKey, msgs: dayMsgs });
      createdCount++;
    }
    if (createdCount) console.log(`[chat-ingest] backfill channel=${channelId} created_days=${createdCount}`);
    await cleanupOldSummaries({ guildId, channel });
  } catch (e) {
    console.error('maybeBackfillChannel error:', e?.response?.data || e);
  }
}
