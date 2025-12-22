const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getUsers } = require('../api/userlistApi');
const { getHitLogsByUserId } = require('../api/hitTrackerApi');
const { getBadgesByUserId } = require('../api/badgeApi');
const { getAllVoiceSessions } = require('../api/voiceChannelSessionsApi');
const {
  loadVotesState,
  getCountsForProspect,
  setVote,
  setListMessages,
  getListMessages,
} = require('../common/prospect-votes');

const name = 'prospect-review';

const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Review prospects by hits, voice hours, badges, and votes')
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Post the current prospect review list')
  )
  .addSubcommand((sub) =>
    sub
      .setName('vote')
      .setDescription('Vote on a prospect (nominate / oppose)')
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('The prospect to vote on')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('vote')
          .setDescription('Your vote')
          .setRequired(true)
          .addChoices(
            { name: 'Nominate (👍)', value: 'up' },
            { name: 'Oppose (👎)', value: 'down' }
          )
      )
  );

function envBool(v) {
  return String(v || 'false').toLowerCase() === 'true';
}

function isLiveGuild(interaction) {
  const guildId = String(interaction?.guildId || '');
  const liveGuildId = String(process.env.GUILD_ID || '');
  const testGuildId = String(process.env.TEST_GUILD_ID || '');

  if (guildId && liveGuildId && guildId === liveGuildId) return true;
  if (guildId && testGuildId && guildId === testGuildId) return false;

  // Fallback to process-wide env flag.
  return envBool(process.env.LIVE_ENVIRONMENT);
}

function getBloodedRoleId(interaction) {
  const live = isLiveGuild(interaction);
  return live ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;
}

function getProspectRoleId(interaction) {
  const live = isLiveGuild(interaction);
  return live ? process.env.PROSPECT_ROLE : process.env.TEST_PROSPECT_ROLE;
}

function memberIsBlooded(interaction) {
  const bloodedRoleId = getBloodedRoleId(interaction);
  if (!bloodedRoleId) {
    // Fail closed unless the bot is misconfigured.
    return interaction?.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) || false;
  }
  return Boolean(interaction?.member?.roles?.cache?.has?.(String(bloodedRoleId)));
}

function normalizeUserId(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.replace(/\D+/g, '');
}

function parseIsoDate(dateLike) {
  if (!dateLike) return null;
  const t = Date.parse(String(dateLike));
  return Number.isFinite(t) ? new Date(t) : null;
}

function daysBetween(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function hasCrewChallengeBadge(badges) {
  const targetId = '1762694590502621';
  const targetName = 'crew challenge';
  const list = Array.isArray(badges) ? badges : [];
  return list.some((b) => {
    const id = b?.id != null ? String(b.id) : '';
    const name = b?.badge_name != null ? String(b.badge_name).trim().toLowerCase() : '';
    return id === targetId || name === targetName;
  });
}

function minutesToHours(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return m / 60;
}

function getLastMonthCutoff(days = 30) {
  const d = Number(days);
  const safeDays = Number.isFinite(d) && d > 0 ? d : 30;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
}

function extractHitDate(hit) {
  const candidates = [
    hit?.timestamp,
    hit?.created_at,
    hit?.createdAt,
    hit?.date,
    hit?.datetime,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(String(c));
    if (Number.isFinite(t)) return new Date(t);
  }
  return null;
}

function countHitsSince(hitLogs, cutoffDate) {
  const logs = Array.isArray(hitLogs) ? hitLogs : [];
  if (!cutoffDate) return logs.length;
  let count = 0;
  for (const hit of logs) {
    const d = extractHitDate(hit);
    if (!d) continue;
    if (d.getTime() >= cutoffDate.getTime()) count++;
  }
  return count;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      try {
        results[idx] = await mapper(items[idx], idx);
      } catch (err) {
        results[idx] = null;
      }
    }
  }

  const workers = [];
  const n = Math.max(1, Math.min(limit, items.length || 1));
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function sessionMinutesWithinWindow(session, windowStart, windowEnd) {
  const rawMinutes = session?.minutes ?? session?.minute ?? 0;
  const fallbackMinutes = Number(rawMinutes);
  const joined = parseIsoDate(session?.joined_at || session?.joinedAt);
  const left = parseIsoDate(session?.left_at || session?.leftAt) || windowEnd;

  // If we have timestamps, compute overlap precisely.
  if (joined && left && left.getTime() >= joined.getTime()) {
    const start = new Date(Math.max(joined.getTime(), windowStart.getTime()));
    const end = new Date(Math.min(left.getTime(), windowEnd.getTime()));
    if (end.getTime() <= start.getTime()) return 0;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return clamp(minutes, 0, 32767);
  }

  // Fallback: if session has no parseable timestamps, include it only if it looks recent.
  const anyDate = parseIsoDate(session?.left_at || session?.leftAt || session?.joined_at || session?.joinedAt);
  if (anyDate && anyDate.getTime() >= windowStart.getTime()) {
    return Number.isFinite(fallbackMinutes) && fallbackMinutes > 0 ? clamp(Math.round(fallbackMinutes), 0, 32767) : 0;
  }
  return 0;
}

async function buildVoiceMinutesByUser({ cutoffDate } = {}) {
  const sessions = await getAllVoiceSessions() || [];
  const allByUser = new Map();
  const sinceByUser = new Map();
  const now = new Date();
  const start = cutoffDate instanceof Date ? cutoffDate : null;

  for (const session of sessions) {
    const userId = normalizeUserId(session?.user_id || session?.userId || session?.user);
    if (!userId) continue;

    const rawMinutes = session?.minutes ?? session?.minute ?? 0;
    const minutes = Number(rawMinutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      allByUser.set(userId, (allByUser.get(userId) || 0) + minutes);
    }

    if (start) {
      const within = sessionMinutesWithinWindow(session, start, now);
      if (within > 0) sinceByUser.set(userId, (sinceByUser.get(userId) || 0) + within);
    }
  }

  return { allByUser, sinceByUser };
}

function formatFlagsColumn({ missingCrewChallenge, missingPirateHits, tooNew }) {
  const flags = [];
  if (missingCrewChallenge) flags.push('C');
  if (missingPirateHits) flags.push('P');
  if (tooNew) flags.push('T');
  return flags.length ? flags.join('/') : '-';
}

function truncateText(text, maxLen) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s;
  if (maxLen <= 1) return s.slice(0, maxLen);
  return s.slice(0, maxLen - 1) + '…';
}

function padRight(text, width) {
  const s = String(text ?? '');
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function renderTableRows(rows) {
  // Fixed-width columns for Discord code block readability.
  const COLS = {
    name: 7,
    flags: 5,
    hitsAll: 3,
    hits30: 3,
    voiceAll: 5,
    voice30: 5,
    votes: 7,
  };

  const header =
    `${padRight('NAME', COLS.name)} | ` +
    `${padRight('FLG', COLS.flags)} | ` +
    `${padRight('HA', COLS.hitsAll)} | ` +
    `${padRight('H30', COLS.hits30)} | ` +
    `${padRight('VA', COLS.voiceAll)} | ` +
    `${padRight('V30', COLS.voice30)} | ` +
    `${padRight('VOTE', COLS.votes)}`;

  const sep =
    `${'-'.repeat(COLS.name)}-+-` +
    `${'-'.repeat(COLS.flags)}-+-` +
    `${'-'.repeat(COLS.hitsAll)}-+-` +
    `${'-'.repeat(COLS.hits30)}-+-` +
    `${'-'.repeat(COLS.voiceAll)}-+-` +
    `${'-'.repeat(COLS.voice30)}-+-` +
    `${'-'.repeat(COLS.votes)}`;

  const lines = [header, sep];
  for (const row of rows) {
    const name = truncateText(displayNameForUser(row.dbUser), COLS.name);
    const flags = truncateText(formatFlagsColumn(row.flags), COLS.flags);
    const hitsAll = String(row.hitsAll ?? 0);
    const hits30 = String(row.hits30 ?? 0);
    const voiceAll = `${Math.round(Number(row.voiceAllHours || 0))}h`;
    const voice30 = `${Math.round(Number(row.voice30Hours || 0))}h`;
    const votes = `+${row.voteCounts.up}/-${row.voteCounts.down}`;

    lines.push(
      `${padRight(name, COLS.name)} | ` +
      `${padRight(flags, COLS.flags)} | ` +
      `${padRight(hitsAll, COLS.hitsAll)} | ` +
      `${padRight(hits30, COLS.hits30)} | ` +
      `${padRight(voiceAll, COLS.voiceAll)} | ` +
      `${padRight(voice30, COLS.voice30)} | ` +
      `${padRight(truncateText(votes, COLS.votes), COLS.votes)}`
    );
  }
  return lines;
}

function displayNameForUser(dbUser) {
  const nick = dbUser?.nickname ? String(dbUser.nickname).trim() : '';
  const uname = dbUser?.username ? String(dbUser.username).trim() : '';
  return nick || uname || dbUser?.id || 'Unknown';
}

async function buildProspectReviewChunks({ guildId }) {
  const pseudoInteraction = { guildId };
  const prospectRoleId = getProspectRoleId(pseudoInteraction);
  if (!prospectRoleId) {
    return { ok: false, error: 'Missing PROSPECT_ROLE/TEST_PROSPECT_ROLE env var.' };
  }

  const dbUsers = await getUsers();
  const users = Array.isArray(dbUsers) ? dbUsers : [];
  const prospects = users.filter((u) => String(u?.rank || '') === String(prospectRoleId));
  if (!prospects.length) {
    return { ok: false, error: 'No prospects found in the database.' };
  }

  const cutoff = getLastMonthCutoff(30);
  const { allByUser: voiceMinutesByUser, sinceByUser: voiceMinutesByUser30d } = await buildVoiceMinutesByUser({ cutoffDate: cutoff });

  // loadVotesState() will auto-clear expired cycles.
  const votesState = loadVotesState();

  const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.PROSPECT_REVIEW_CONCURRENCY || 4) || 4));
  const enriched = await mapWithConcurrency(prospects, CONCURRENCY, async (u) => {
    const userId = normalizeUserId(u?.id);
    const [hitLogs, badges] = await Promise.all([
      getHitLogsByUserId(userId).catch(() => null),
      getBadgesByUserId(userId).catch(() => null),
    ]);

    const hitsAll = Array.isArray(hitLogs) ? hitLogs.length : 0;
    const hits30 = countHitsSince(hitLogs, cutoff);
    const crewChallenge = hasCrewChallengeBadge(badges);

    const promoteDate = parseIsoDate(u?.promote_date);
    const tooNew = !promoteDate ? true : (daysBetween(new Date(), promoteDate) < 30);

    const minutesAll = voiceMinutesByUser.get(userId) || 0;
    const minutes30 = voiceMinutesByUser30d.get(userId) || 0;
    const voiceAllHours = minutesToHours(minutesAll);
    const voice30Hours = minutesToHours(minutes30);

    const voteCounts = getCountsForProspect(votesState, userId);

    return {
      id: userId,
      dbUser: u,
      hitsAll,
      hits30,
      voiceAllHours,
      voice30Hours,
      voteCounts,
      flags: {
        missingCrewChallenge: !crewChallenge,
        missingPirateHits: hitsAll < 10,
        tooNew,
      },
    };
  });

  const rows = enriched.filter(Boolean);
  rows.sort((a, b) => (b.hitsAll - a.hitsAll) || (b.hits30 - a.hits30) || (b.voiceAllHours - a.voiceAllHours) || String(a.id).localeCompare(String(b.id)));

  const title = `Prospect Review — ${rows.length} prospects`;
  const subtitle = `Last month window: last 30 days`;
  const legend = `Columns: NAME=player (trimmed), FLG=missing reqs, HA=hits all-time, H30=hits last 30d, VA=voice hours all-time, V30=voice hours last 30d, VOTE=+noms/-opposes. FLG key: C=missing Crew Challenge, P=<10 hits all-time, T=promote_date <30d or missing.`;

  const tableLines = renderTableRows(rows);

  const chunks = [];
  let currentLines = [];
  const wrap = (lines) => `\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`;
  const basePrefix = `${title}\n${subtitle}\n${legend}`;

  const headerLines = tableLines.slice(0, 2);
  const bodyLines = tableLines.slice(2);

  const flush = () => {
    if (!currentLines.length) return;
    const payload = `${basePrefix}${wrap([...headerLines, ...currentLines])}`.trimEnd();
    chunks.push(payload);
    currentLines = [];
  };

  for (const line of bodyLines) {
    currentLines.push(line);
    const tentative = `${basePrefix}${wrap([...headerLines, ...currentLines])}`;
    if (tentative.length > 1900) {
      currentLines.pop();
      flush();
      currentLines.push(line);
    }
  }
  flush();

  return { ok: true, chunks };
}

async function executeList(interaction, context = {}) {
  const res = await buildProspectReviewChunks({ guildId: interaction.guildId });
  if (!res.ok) {
    await interaction.editReply(res.error || 'Failed to build prospect review.');
    return;
  }

  const sentMessages = [];
  const firstMsg = await interaction.editReply({ content: res.chunks[0] });
  if (firstMsg?.id) sentMessages.push(firstMsg);

  for (let i = 1; i < res.chunks.length; i++) {
    const msg = await interaction.followUp({ content: res.chunks[i], ephemeral: false });
    if (msg?.id) sentMessages.push(msg);
  }

  // Remember where the latest list was posted so votes can auto-refresh it.
  try {
    const messageIds = sentMessages.map((m) => m.id).filter(Boolean);
    setListMessages({ guildId: interaction.guildId, channelId: interaction.channelId, messageIds });
  } catch {}
}

async function refreshPostedListMessage({ client, guildId }) {
  if (!client || !guildId) return false;
  const state = loadVotesState();
  const listRef = getListMessages(state, guildId);
  if (!listRef) return false;

  const channel = await client.channels.fetch(listRef.channelId).catch(() => null);
  if (!channel || !channel.messages?.fetch) return false;

  const built = await buildProspectReviewChunks({ guildId });
  if (!built.ok) return false;

  const newChunks = built.chunks;
  const existingIds = Array.isArray(listRef.messageIds) ? listRef.messageIds : [];
  const updatedIds = [];

  // Edit existing messages where possible.
  for (let i = 0; i < newChunks.length; i++) {
    const content = newChunks[i];
    const existingId = existingIds[i];
    if (existingId) {
      const msg = await channel.messages.fetch(existingId).catch(() => null);
      if (msg) {
        await msg.edit({ content }).catch(() => {});
        updatedIds.push(existingId);
        continue;
      }
    }
    const sent = await channel.send({ content }).catch(() => null);
    if (sent?.id) updatedIds.push(sent.id);
  }

  // Delete any leftover old chunk messages (best effort).
  for (let i = newChunks.length; i < existingIds.length; i++) {
    const mid = existingIds[i];
    const msg = await channel.messages.fetch(mid).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  try {
    if (updatedIds.length) {
      setListMessages({ guildId, channelId: listRef.channelId, messageIds: updatedIds });
    }
  } catch {}

  return true;
}

async function executeVote(interaction, context = {}) {
  const prospectRoleId = getProspectRoleId(interaction);
  if (!prospectRoleId) {
    await interaction.editReply('Missing PROSPECT_ROLE/TEST_PROSPECT_ROLE env var.');
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const vote = interaction.options.getString('vote', true);
  const targetId = normalizeUserId(targetUser.id);

  const dbUser = await require('../api/userlistApi').getUserById(targetId);
  if (!dbUser) {
    await interaction.editReply('That user was not found in the database.');
    return;
  }
  if (String(dbUser?.rank || '') !== String(prospectRoleId)) {
    await interaction.editReply('That user is not currently marked as a Prospect in the database.');
    return;
  }

  const res = setVote({ prospectId: targetId, voterId: interaction.user.id, vote });
  if (!res.ok) {
    await interaction.editReply(`Vote failed: ${res.reason || 'unknown error'}`);
    return;
  }

  // Best-effort: update the last posted list message in this guild.
  try {
    await refreshPostedListMessage({ client: context?.client, guildId: interaction.guildId });
  } catch {}

  await interaction.editReply(`Vote recorded for <@${targetId}>: ${vote === 'up' ? 'Nominate (👍)' : 'Oppose (👎)'} — now +${res.counts.up}/-${res.counts.down}`);
}

async function execute(interaction, context = {}) {
  if (!interaction?.guildId) {
    await interaction.reply({ content: 'This command must be used inside the guild.', ephemeral: true });
    return;
  }
  if (!memberIsBlooded(interaction)) {
    await interaction.reply({ content: 'Only Blooded members can use Prospect Review.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand() || 'list';
  await interaction.deferReply({ ephemeral: sub === 'vote' });

  if (sub === 'vote') {
    await executeVote(interaction, context);
    return;
  }

  await executeList(interaction, context);
}

module.exports = {
  name,
  data,
  execute,
};
