const { UsersModel } = require('../api/models/users');
const { getUsers } = require('../api/userlistApi');
const { getPrestigeRanks } = require('../userlist-functions/userlist-controller');
const { PermissionsBitField } = require('discord.js');

const VERBOSE = String(process.env.SKILL_SYNC_VERBOSE || 'false').toLowerCase() === 'true';
const SYNC_MODE = String(process.env.SKILL_SYNC_MODE || 'prefetch').toLowerCase(); // 'prefetch' | 'cache-only' | 'per-user'
const SYNC_LIMIT = Number(process.env.SKILL_SYNC_LIMIT || 0) || 0; // 0 = no limit
const SYNC_CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.SKILL_SYNC_CONCURRENCY || 3) || 3));
const FETCH_TIMEOUT_MS = Number(process.env.SKILL_SYNC_FETCH_TIMEOUT_MS || 60000) || 605000; // 60s default

function envBool(val) {
  if (val === undefined || val === null) return false;
  return String(val).toLowerCase() === 'true';
}

function getGuildId() {
  return envBool(process.env.LIVE_ENVIRONMENT) ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
}

function getMemberRoleId() {
  const live = envBool(process.env.LIVE_ENVIRONMENT);
  return live ? process.env.MEMBER : process.env.TEST_MEMBER;
}

function getPrestigeRoleIds() {
  const live = envBool(process.env.LIVE_ENVIRONMENT);
  const raptor = [1, 2, 3, 4, 5].map((n) => live ? process.env[`RAPTOR_${n}_ROLE`] : process.env[`RAPTOR_${n}_TEST_ROLE`]);
  const raider = [1, 2, 3, 4, 5].map((n) => live ? process.env[`RAIDER_${n}_ROLE`] : process.env[`RAIDER_${n}_TEST_ROLE`]);
  return [...raptor, ...raider].filter(Boolean);
}

function getSkillRoleIds() {
  const live = envBool(process.env.LIVE_ENVIRONMENT);
  const roleIds = [1,2,3,4,5].map(n => live ? process.env[`SKILL_LEVEL_${n}`] : process.env[`TEST_SKILL_LEVEL_${n}`]);
  const missing = roleIds.map((v,i)=>({v,i:i+1})).filter(x=>!x.v);
  if (missing.length) {
    console.warn(`[SkillRoles] Missing env vars for ${live? 'SKILL_LEVEL' : 'TEST_SKILL_LEVEL'}: levels ${missing.map(m=>m.i).join(', ')}`);
  }
  if (VERBOSE) {
    console.log(`[SkillRoles] Mode: ${live ? 'LIVE' : 'TEST'} — using ${live ? 'SKILL_LEVEL_*' : 'TEST_SKILL_LEVEL_*'} role IDs: ${roleIds.filter(Boolean).join(', ')}`);
  }
  return roleIds.filter(Boolean);
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
function getEnvNum(v, def=0){ const n = Number(v); return Number.isFinite(n) ? n : def; }

async function fetchAllMembersWithTimeout(guild, timeoutMs = FETCH_TIMEOUT_MS) {
  const start = Date.now();
  try {
    const result = await Promise.race([
      guild.members.fetch(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('members.fetch timeout')), timeoutMs)),
    ]);
    return result;
  } catch (e) {
    const dur = Date.now() - start;
    console.error(`[SkillRoles] Failed to fetch all guild members after ${dur}ms:`, e?.message || e);
    return null;
  }
}

function highestPrestigeLevelFromDb(user) {
  const r = Number(user?.raptor_level || 0) || 0;
  const d = Number(user?.raider_level || 0) || 0;
  return Math.max(r, d, 0);
}

function highestPrestigeLevelFromRoles(roleIds) {
  // Uses getPrestigeRanks helper to compute levels from role IDs
  // Note: getPrestigeRanks expects an array of IDs; it returns an object with raptor_level/raider_level
  // We'll call it synchronously in a wrapper function when needed
  return getPrestigeRanks(roleIds).then(({ raptor_level = 0, raider_level = 0 } = {}) => {
    const r = Number(raptor_level || 0) || 0;
    const d = Number(raider_level || 0) || 0;
    return Math.max(r, d, 0);
  }).catch(() => 0);
}

async function assignSkillLevelRole(member, level, { verbose = VERBOSE } = {}) {
  try {
    const skillRoles = getSkillRoleIds();
    if (!skillRoles.length) return { ok: false, reason: 'No SKILL_LEVEL roles configured' };

    // Clamp level to 0..skillRoles.length
    const lvl = Math.min(Math.max(Number(level||0), 0), skillRoles.length);

    const currentSkillRoles = skillRoles.filter(rid => member.roles.cache.has(rid));
    const rolesToRemove = skillRoles.filter((rid, idx) => member.roles.cache.has(rid) && (idx+1) !== lvl);
    if (rolesToRemove.length) {
      try { await member.roles.remove(rolesToRemove).catch(()=>{}); } catch(_){}
    }
    if (verbose) {
      console.log(`[SkillRoles] ${member.id}: level=${lvl} current=[${currentSkillRoles.join(',')}] remove=[${rolesToRemove.join(',')}]`);
    }

    if (lvl === 0) {
      if (verbose) console.log(`[SkillRoles] ${member.id}: no skill role to add (level 0)`);
      return { ok: true, level: 0 };
    }

    const targetRoleId = skillRoles[lvl-1];
    if (!member.roles.cache.has(targetRoleId)) {
      if (verbose) console.log(`[SkillRoles] ${member.id}: add=${targetRoleId}`);
      await member.roles.add(targetRoleId);
    }
    return { ok: true, level: lvl };
  } catch (err) {
    console.error('[SkillRoles] assign failed for', member?.id, err?.message || err);
    return { ok: false, err };
  }
}

async function syncSkillLevelsFromDb(client, { delayMs=50, verbose = VERBOSE } = {}) {
  const guildId = getGuildId();
  if (!guildId) { console.warn('[SkillRoles] Missing guild id'); return; }
  const guild = await client.guilds.fetch(guildId);
  if (!guild) { console.warn('[SkillRoles] Guild not found'); return; }
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me) { console.warn('[SkillRoles] Could not resolve bot member'); return; }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.warn('[SkillRoles] Bot lacks Manage Roles permission; cannot assign skill roles.');
    return;
  }

  const users = await UsersModel.list();
  if (!Array.isArray(users) || !users.length) {
    console.log('[SkillRoles] No users from DB');
    return;
  }

  console.log(`[SkillRoles] Syncing ${users.length} members from DB... (mode=${SYNC_MODE}, limit=${SYNC_LIMIT || 'none'})`);

  // Fetch all guild members once to avoid 1000+ per-user fetch calls
  let allMembers = null;
  if (SYNC_MODE === 'prefetch') {
    try {
      allMembers = await guild.members.fetch();
      console.log(`[SkillRoles] Loaded ${allMembers.size} guild members into cache.`);
    } catch (e) {
      console.error('[SkillRoles] Failed to fetch all guild members:', e?.message || e);
      // Decide fallback strategy
      if (String(process.env.SKILL_SYNC_FALLBACK || 'cache-only').toLowerCase() === 'per-user') {
        console.log('[SkillRoles] Fallback: per-user fetch mode');
        allMembers = null; // handled below
      } else {
        console.log('[SkillRoles] Fallback: cache-only mode');
        allMembers = guild.members.cache; // may be partial
      }
    }
  } else if (SYNC_MODE === 'cache-only') {
    allMembers = guild.members.cache; // do not force fetch
    console.log(`[SkillRoles] Using cache-only mode with ${allMembers.size} cached members.`);
  }

  // Build an iterator over targets depending on strategy
  let targetUsers = users;
  if (allMembers && typeof allMembers.get === 'function') {
    // prefetch or cache-only: limit to those in map
    const availableIds = new Set(allMembers.map ? allMembers.map(m=>m.id) : Array.from(allMembers.keys()));
    targetUsers = users.filter(u => availableIds.has(String(u.id)));
    console.log(`[SkillRoles] Filtered to ${targetUsers.length} users present in ${SYNC_MODE==='prefetch'?'prefetched':''} cache.`);
  }
  if (SYNC_LIMIT > 0 && targetUsers.length > SYNC_LIMIT) {
    targetUsers = targetUsers.slice(0, SYNC_LIMIT);
    console.log(`[SkillRoles] Applying limit: processing first ${SYNC_LIMIT} users.`);
  }

  let processed = 0, assigned = 0, skipped = 0, notFound = 0, errors = 0;

  // Helper to process a single record
  const handleOne = async (u) => {
    const userId = String(u.id);
    if (!userId) return;
    let member = null;
    try {
      if (allMembers && typeof allMembers.get === 'function') {
        member = allMembers.get(userId) || null;
      } else if (SYNC_MODE === 'per-user' || !allMembers) {
        member = await guild.members.fetch(userId);
      }
    } catch (_) {
      notFound++;
      if (verbose) console.log(`[SkillRoles] skip ${userId}: not found in guild`);
      return;
    }
    if (!member) { notFound++; if (verbose) console.log(`[SkillRoles] skip ${userId}: undefined member`); return; }

    const level = highestPrestigeLevelFromDb(u);
    try {
      if (verbose) console.log(`[SkillRoles] user ${userId}: computed highest level=${level}`);
      const res = await assignSkillLevelRole(member, level, { verbose });
      if (res && res.ok) assigned++; else skipped++;
    } catch (e) {
      errors++;
      console.error('[SkillRoles] per-member error', userId, e?.message || e);
    }
  };

  // Concurrency control for per-user processing
  const queue = [...targetUsers];
  const workers = Array.from({ length: SYNC_CONCURRENCY }, async () => {
    while (queue.length) {
      const u = queue.shift();
      await handleOne(u);
      processed++;
      if (processed % 50 === 0) {
        console.log(`[SkillRoles] Progress: ${processed}/${targetUsers.length} (assigned=${assigned}, skipped=${skipped}, notFound=${notFound}, errors=${errors})`);
      }
      if (delayMs) await sleep(delayMs);
    }
  });
  await Promise.all(workers);

  // For the users we didn't consider due to cache-only filter, count them as notFound (informative)
  if (allMembers && typeof allMembers.get === 'function' && targetUsers.length < users.length) {
    const diff = users.length - targetUsers.length;
    notFound += diff;
  }

  console.log(`[SkillRoles] DB sync complete. processed=${processed}, assigned=${assigned}, skipped=${skipped}, notFound=${notFound}, errors=${errors}`);
}

// New: Sync based on userlist API getUsers() records, filtering to users who have MEMBER role in their stored role array.
// Prestige is computed from stored RAPTOR/RAIDER role IDs (not DB raptor_level/raider_level fields).
async function syncSkillLevelsFromUserListApi(client, { delayMs = 25, verbose = VERBOSE } = {}) {
  const guildId = getGuildId();
  if (!guildId) {
    console.warn('[SkillRoles] Missing guild id');
    return;
  }

  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    console.warn('[SkillRoles] Guild not found');
    return;
  }

  const me = guild.members.me || await guild.members.fetchMe();
  if (!me) {
    console.warn('[SkillRoles] Could not resolve bot member');
    return;
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.warn('[SkillRoles] Bot lacks Manage Roles permission; cannot assign skill roles.');
    return;
  }

  const memberRoleId = getMemberRoleId();
  if (!memberRoleId) {
    console.warn('[SkillRoles] Missing MEMBER/TEST_MEMBER env var; cannot filter member list.');
    return;
  }

  const users = await getUsers();
  if (!Array.isArray(users) || users.length === 0) {
    console.warn('[SkillRoles] getUsers() returned no users; aborting.');
    return;
  }

  const memberUsers = users.filter((u) => {
    const roles = Array.isArray(u?.roles) ? u.roles.map(String) : [];
    return roles.includes(String(memberRoleId));
  });

  console.log(`[SkillRoles] getUsers() returned ${users.length}; syncing SKILL roles for ${memberUsers.length} MEMBER users...`);

  // Prefetch guild members once for fast lookups
  let allMembers = null;
  try {
    allMembers = await guild.members.fetch();
    if (VERBOSE) console.log(`[SkillRoles] Prefetched ${allMembers.size} guild members.`);
  } catch (e) {
    console.warn('[SkillRoles] Failed to prefetch guild members; falling back to cache/per-user fetch:', e?.message || e);
    allMembers = guild.members.cache;
  }

  let targetUsers = memberUsers;
  if (SYNC_LIMIT > 0 && targetUsers.length > SYNC_LIMIT) {
    targetUsers = targetUsers.slice(0, SYNC_LIMIT);
    console.log(`[SkillRoles] Applying limit: processing first ${SYNC_LIMIT} MEMBER users.`);
  }

  let processed = 0, assigned = 0, skipped = 0, notFound = 0, errors = 0;

  const queue = [...targetUsers];
  const workers = Array.from({ length: SYNC_CONCURRENCY }, async () => {
    while (queue.length) {
      const u = queue.shift();
      const userId = String(u?.id || '');
      try {
        if (!userId) {
          skipped++;
          continue;
        }

        let member = null;
        try {
          member = (allMembers && typeof allMembers.get === 'function') ? (allMembers.get(userId) || null) : null;
          if (!member) member = await guild.members.fetch(userId);
        } catch (_) {
          notFound++;
          if (verbose) console.log(`[SkillRoles] skip ${userId}: not found in guild`);
          continue;
        }

        const roleIds = Array.isArray(u?.roles) ? u.roles.map(String) : [];
        const prestige = await getPrestigeRanks(roleIds);
        const highest = Math.max(Number(prestige?.raptor_level || 0) || 0, Number(prestige?.raider_level || 0) || 0);
        if (verbose) console.log(`[SkillRoles] user ${userId}: highestPrestige=${highest}`);

        const res = await assignSkillLevelRole(member, highest, { verbose });
        if (res && res.ok) assigned++; else skipped++;
      } catch (e) {
        errors++;
        console.error('[SkillRoles] per-user error (getUsers sync)', userId, e?.message || e);
      } finally {
        processed++;
        if (processed % 50 === 0) {
          console.log(`[SkillRoles] Progress: ${processed}/${targetUsers.length} (assigned=${assigned}, skipped=${skipped}, notFound=${notFound}, errors=${errors})`);
        }
        if (delayMs) await sleep(delayMs);
      }
    }
  });

  await Promise.all(workers);

  console.log(`[SkillRoles] getUsers() MEMBER sync complete. processed=${processed}, assigned=${assigned}, skipped=${skipped}, notFound=${notFound}, errors=${errors}`);
}

// New: Sync by fetching members from Discord (not DB) and computing from live roles
async function syncSkillLevelsFromGuild(client, { delayMs = 50, verbose = VERBOSE } = {}) {
  const guildId = getGuildId();
  if (!guildId) { console.warn('[SkillRoles] Missing guild id'); return; }
  const guild = await client.guilds.fetch(guildId);
  if (!guild) { console.warn('[SkillRoles] Guild not found'); return; }
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me) { console.warn('[SkillRoles] Could not resolve bot member'); return; }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.warn('[SkillRoles] Bot lacks Manage Roles permission; cannot assign skill roles.');
    return;
  }

  console.log(`[SkillRoles] Guild-based sync starting… (mode=${SYNC_MODE}, limit=${SYNC_LIMIT || 'none'})`);
  let allMembers = null;
  if (SYNC_MODE === 'prefetch') {
    allMembers = await fetchAllMembersWithTimeout(guild, FETCH_TIMEOUT_MS);
    if (allMembers && typeof allMembers.size === 'number') {
      console.log(`[SkillRoles] Loaded ${allMembers.size} guild members into cache.`);
    } else {
      const fb = String(process.env.SKILL_SYNC_FALLBACK || 'cache-only').toLowerCase();
      console.log(`[SkillRoles] Prefetch failed or timed out. Fallback strategy: ${fb}`);
      if (fb === 'per-user') {
        allMembers = null;
      } else {
        allMembers = guild.members.cache;
        console.log(`[SkillRoles] Using cache-only mode with ${allMembers.size} cached members.`);
      }
    }
  } else if (SYNC_MODE === 'cache-only') {
    allMembers = guild.members.cache;
    console.log(`[SkillRoles] Using cache-only mode with ${allMembers.size} cached members.`);
  } else {
    // For guild-based sync, 'per-user' isn't meaningful without a known list; treat as cache-only
    allMembers = guild.members.cache;
    console.log(`[SkillRoles] Using cache (implicit per-user unsupported without an ID list). Cached=${allMembers.size}`);
  }

  // Build a list of members to process
  let membersToProcess = Array.from(allMembers.values());
  if (membersToProcess.length === 0) {
    console.log('[SkillRoles] No members to process (empty list after fetch/cache).');
  }
  if (SYNC_LIMIT > 0 && membersToProcess.length > SYNC_LIMIT) {
    membersToProcess = membersToProcess.slice(0, SYNC_LIMIT);
    console.log(`[SkillRoles] Applying limit: processing first ${SYNC_LIMIT} guild members.`);
  }

  let processed = 0, assigned = 0, skipped = 0, errors = 0;
  const skillRoles = getSkillRoleIds();
  if (!skillRoles.length) {
    console.warn('[SkillRoles] No SKILL roles configured; aborting guild-based sync.');
    return;
  }

  for (const member of membersToProcess) {
    try {
      const roleIds = member.roles?.cache ? Array.from(member.roles.cache.keys()) : [];
      const level = await highestPrestigeLevelFromRoles(roleIds);
      if (verbose) console.log(`[SkillRoles] guild user ${member.id}: computed highest level=${level}`);
      const res = await assignSkillLevelRole(member, level, { verbose });
      if (res && res.ok) assigned++; else skipped++;
    } catch (e) {
      errors++;
      console.error('[SkillRoles] per-member error (guild sync)', member?.id, e?.message || e);
    }
    processed++;
    if (processed % 50 === 0) {
      console.log(`[SkillRoles] Progress: ${processed}/${membersToProcess.length} (assigned=${assigned}, skipped=${skipped}, errors=${errors})`);
    }
    if (delayMs) await sleep(delayMs);
  }

  console.log(`[SkillRoles] Guild sync complete. processed=${processed}, assigned=${assigned}, skipped=${skipped}, errors=${errors}`);
}

async function updateSkillOnMemberChange(oldMember, newMember) {
  try {
    // When roles change, compute from roles directly
    const oldRoles = oldMember?.roles?.cache ? Array.from(oldMember.roles.cache.keys()) : [];
    const newRoles = newMember?.roles?.cache ? Array.from(newMember.roles.cache.keys()) : [];

    // Only recompute when a prestige role changes (gain or loss)
    const prestigeRoleSet = new Set(getPrestigeRoleIds().map(String));
    const oldSet = new Set(oldRoles.map(String));
    const newSet = new Set(newRoles.map(String));
    const gained = Array.from(newSet).filter((rid) => !oldSet.has(rid));
    const lost = Array.from(oldSet).filter((rid) => !newSet.has(rid));
    const prestigeChanged = gained.some((rid) => prestigeRoleSet.has(rid)) || lost.some((rid) => prestigeRoleSet.has(rid));
    if (!prestigeChanged) return;

    const oldPrestige = await getPrestigeRanks(oldRoles);
    const newPrestige = await getPrestigeRanks(newRoles);
    const oldHighest = Math.max(oldPrestige?.raptor_level||0, oldPrestige?.raider_level||0);
    const newHighest = Math.max(newPrestige?.raptor_level||0, newPrestige?.raider_level||0);

    if (oldHighest !== newHighest) {
      await assignSkillLevelRole(newMember, newHighest);
    }
  } catch (err) {
    console.error('[SkillRoles] update on member change failed', err?.message || err);
  }
}

module.exports = {
  syncSkillLevelsFromDb,
  syncSkillLevelsFromGuild,
  syncSkillLevelsFromUserListApi,
  updateSkillOnMemberChange,
  assignSkillLevelRole,
};
