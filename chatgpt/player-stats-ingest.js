const { listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge } = require('../api/knowledgeApi');
const { getAllPlayerStats } = require('../api/playerStatsApi');
const { getUsers } = require('../api/userlistApi');

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function fmtInt(v) { const n = safeNum(v, 0); return Math.round(n); }
function fmtFloat(v, digits = 1) { const n = safeNum(v, 0); return Number(n.toFixed(digits)); }
function fmtCurrency(v) {
  if (v == null || isNaN(Number(v))) return 'n/a';
  const n = Number(v);
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M aUEC`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k aUEC`;
  return `${n.toFixed(0)} aUEC`;
}

function buildContent(ps, username) {
  const lines = [];
  lines.push(`User: ${username || ps.user_id} (${ps.user_id})`);
  const ranks = [
    ps.rank_name ? `Rank: ${ps.rank_name}` : null,
    Number.isFinite(Number(ps.corsair)) ? `Corsair: ${ps.corsair}` : null,
    Number.isFinite(Number(ps.raider)) ? `Raider: ${ps.raider}` : null,
    Number.isFinite(Number(ps.raptor)) ? `Raptor: ${ps.raptor}` : null,
  ].filter(Boolean);
  if (ranks.length) lines.push(ranks.join(' | '));
  lines.push(
    `Flags: ronin=${Boolean(ps.ronin)} | fleetCommander=${Boolean(ps.fleetcommander)}`
  );

  // Ship combat
  lines.push('');
  lines.push('Ship Combat:');
  lines.push(
    `- Kills: AI=${fmtInt(ps.shipackills)} PU=${fmtInt(ps.shippukills)} Total=${fmtInt(ps.shipkills)}`
  );
  lines.push(
    `- Damage: AI=${fmtFloat(ps.shipacdamages,1)} PU=${fmtFloat(ps.shippudamages,1)} Total=${fmtFloat(ps.shipdamages,1)}`
  );

  // FPS combat
  lines.push('');
  lines.push('FPS Combat:');
  lines.push(
    `- Kills: AI=${fmtInt(ps.fpsackills)} PU=${fmtInt(ps.fpspukills)} Total=${fmtInt(ps.fpskills)}`
  );

  // Piracy
  lines.push('');
  lines.push('Piracy:');
  lines.push(
    `- Hits: total=${fmtInt(ps.piracyhits)} published=${fmtInt(ps.piracyhitspublished)}`
  );
  lines.push(
    `- Loot: SCU=${fmtFloat(ps.piracyscustolen,1)} value=${fmtCurrency(ps.piracyvaluestolen)}`
  );

  // Fleet
  lines.push('');
  lines.push('Fleet:');
  lines.push(
    `- Participation: leads=${fmtInt(ps.fleetleads)} assists=${fmtInt(ps.fleetassists)} events=${fmtInt(ps.fleetparticipated)}`
  );
  lines.push(
    `- Results: kills=${fmtInt(ps.fleetkills)} SCU=${fmtFloat(ps.fleetscu,1)} value=${fmtCurrency(ps.fleetvalue)} damage=${fmtFloat(ps.fleetdamages,1)}`
  );

  // Activity / Misc
  lines.push('');
  lines.push('Activity:');
  if (ps.flighthours) lines.push(`- Flight Hours: ${ps.flighthours}`);
  if (ps.voicehours != null) lines.push(`- Voice Hours: ${fmtInt(ps.voicehours)}`);
  if (ps.recentgatherings != null) lines.push(`- Recent Gatherings: ${fmtInt(ps.recentgatherings)}`);
  if (ps.shipsbleaderboardrank != null) lines.push(`- Ship SB Rank: ${fmtInt(ps.shipsbleaderboardrank)}`);

  return lines.join('\n');
}

async function upsertPlayerStatsKnowledge(ps, username, existingRow) {
  const url = `player://${ps.user_id}/stats`;
  const version = 'v1';
  const source = 'player-stats';
  const section = 'player-stats';
  const category = 'user';
  const title = `Player Stats \u2014 ${username || ps.user_id}${ps.rank_name ? ` (${ps.rank_name})` : ''}`;
  const tags = [
    'user-stats',
    `user:${ps.user_id}`,
    ps.rank_name ? `rank:${ps.rank_name}` : null,
    ps.fleetcommander ? 'fleetcommander:true' : 'fleetcommander:false',
    ps.ronin ? 'ronin:true' : 'ronin:false',
  ].filter(Boolean);

  const doc = {
    source,
    category,
    title,
    section,
    content: buildContent(ps, username).slice(0, 4000),
    tags,
    url,
    version,
    guild_id: process.env.GUILD_ID,
  };

  // If we already know it exists, just update
  if (existingRow && existingRow.id) {
    await updateKnowledge(existingRow.id, doc);
    return existingRow.id;
  }

  // Attempt create (likely path for new users)
  const created = await createKnowledge(doc);
  if (created && created.id) return created.id;

  // As a final fallback (race condition or create failed but row exists) list & update
  try {
    const rows = await listKnowledge({ category, section, limit: 2000, order: 'created_at.desc' }) || [];
    const existing = rows.find(r => r.url === url && r.source === source && r.version === version);
    if (existing?.id) {
  await updateKnowledge(existing.id, doc);
  return existing.id;
    }
  } catch (e) {
    console.error('[player-stats-ingest] lookup/update failed:', e?.response?.data || e?.message || e);
  }
  return null;
}

async function cleanupOrphanedPlayerStats(validUserIds) {
  try {
    const category = 'user';
    const section = 'player-stats';
    const rows = await listKnowledge({ category, section, limit: 2000, order: 'created_at.desc' }) || [];
    let deleted = 0;
    for (const r of rows) {
      const m = r.url && String(r.url).match(/^player:\/\/(\d+)\/stats$/);
      const uid = m ? m[1] : null;
      if (!uid || !validUserIds.has(uid)) {
        try { await deleteKnowledge(r.id); deleted++; } catch (e) {
          console.error('[player-stats-ingest] delete orphan failed id=', r.id, e?.response?.data || e?.message || e);
        }
      }
    }
    if (deleted) console.log(`[player-stats-ingest] cleanup deleted=${deleted}`);
  } catch (e) {
    console.error('[player-stats-ingest] cleanup error:', e?.response?.data || e?.message || e);
  }
}

async function ingestPlayerStats(client) {
  const startIso = new Date().toISOString();
  if ((process.env.KNOWLEDGE_RETRIEVAL || 'true').toLowerCase() === 'false') {
    console.log(`[player-stats-ingest] SKIP ${startIso} (KNOWLEDGE_RETRIEVAL=false)`);
    return;
  }
  console.log(`[player-stats-ingest] START ${startIso}`);
  let upserts = 0, processed = 0;
  try {
    const [stats, users, existing] = await Promise.all([
      getAllPlayerStats(),
      getUsers().catch(() => null),
      // Preload existing knowledge rows once to avoid N duplicate create attempts
      listKnowledge({ category: 'user', section: 'player-stats', limit: 2000, order: 'created_at.desc' }).catch(() => null),
    ]);
    if (!Array.isArray(stats) || !stats.length) {
      console.log('[player-stats-ingest] No player stats returned');
      return;
    }
    const userMap = new Map();
    if (Array.isArray(users)) {
      for (const u of users) {
        if (u && (u.id || u.user_id)) userMap.set(String(u.id || u.user_id), u.username || u.nickname || u.display_name || null);
      }
    }
    // Build quick lookup of existing knowledge rows by user id parsed from url
    const existingMap = new Map();
    if (Array.isArray(existing)) {
      for (const row of existing) {
        const m = row.url && String(row.url).match(/^player:\/\/(\d+)\/stats$/);
        if (m) existingMap.set(m[1], row);
      }
    }

    const validIds = new Set();
    for (const ps of stats) {
      if (!ps || ps.user_id == null) continue;
      const uid = String(ps.user_id);
      validIds.add(uid);
      processed++;
      const username = userMap.get(uid) || null;
      const existingRow = existingMap.get(uid);
  const id = await upsertPlayerStatsKnowledge(ps, username, existingRow);
      if (id) upserts++;
    }
    // Cleanup knowledge entries for users no longer present
    await cleanupOrphanedPlayerStats(validIds);
  } catch (e) {
    console.error('[player-stats-ingest] failure:', e?.response?.data || e?.message || e);
  } finally {
    const endIso = new Date().toISOString();
  console.log(`[player-stats-ingest] DONE ${endIso} processed=${processed} upserts=${upserts}`);
  }
}
module.exports = { ingestPlayerStats };
