const { PermissionsBitField, Routes } = require('discord.js');

function envBool(val) {
  if (val === undefined || val === null) return false;
  return String(val).toLowerCase() === 'true';
}

function getGuildId() {
  return envBool(process.env.LIVE_ENVIRONMENT) ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
}

function getRoleIds() {
  const live = envBool(process.env.LIVE_ENVIRONMENT);
  const ROLE = (name) => live ? process.env[name] : process.env[`TEST_${name}`];
  const member = live ? process.env.MEMBER : process.env.TEST_MEMBER;
  const crew = ROLE('CREW_ROLE');
  const marauder = ROLE('MARAUDER_ROLE');
  const blooded = ROLE('BLOODED_ROLE');
  return { member, crew, marauder, blooded };
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function changedRelevant(oldMember, newMember, roleIds) {
  try {
    const oldSet = new Set(oldMember?.roles?.cache ? Array.from(oldMember.roles.cache.keys()) : []);
    const newSet = new Set(newMember?.roles?.cache ? Array.from(newMember.roles.cache.keys()) : []);
    const relevant = [roleIds.member, roleIds.crew, roleIds.marauder, roleIds.blooded].filter(Boolean);
    return relevant.some(id => oldSet.has(id) !== newSet.has(id));
  } catch {
    return true; // default to true if we can't determine
  }
}

async function ensureMemberRole(member, roleIds, { verbose = false } = {}) {
  const { member: memberId, crew, marauder, blooded } = roleIds;
  if (!memberId) return { ok: false, reason: 'No MEMBER role configured' };

  const hasMember = member.roles.cache.has(memberId);
  const eligible = [crew, marauder, blooded].filter(Boolean).some(rid => member.roles.cache.has(rid));

  try {
    if (eligible && !hasMember) {
      if (verbose) console.log(`[MemberRole] add MEMBER to ${member.id}`);
      await member.roles.add(memberId);
      return { ok: true, action: 'added' };
    }
    if (!eligible && hasMember) {
      if (verbose) console.log(`[MemberRole] remove MEMBER from ${member.id}`);
      await member.roles.remove(memberId);
      return { ok: true, action: 'removed' };
    }
    return { ok: true, action: 'none' };
  } catch (e) {
    console.error('[MemberRole] ensureMemberRole failed for', member?.id, e?.message || e);
    return { ok: false, err: e };
  }
}

// REST-paginated fetch of guild members (raw API objects) without requiring Gateway member chunks
async function listGuildMembersRest(client, guildId, { pageLimit = 1000, verbose = false } = {}) {
  const all = [];
  let after = '0';
  while (true) {
    const query = new URLSearchParams({ limit: String(pageLimit), after });
    let page;
    try {
      page = await client.rest.get(Routes.guildMembers(guildId), { query });
    } catch (e) {
      const msg = e?.message || e;
      console.error('[MemberRole] REST list members failed:', msg);
      throw e;
    }
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    // next cursor is the last user id in this page (snowflake order)
    after = page[page.length - 1]?.user?.id || after;
    if (verbose) console.log(`[MemberRole] fetched ${all.length} members via REST…`);
    if (page.length < pageLimit) break; // last page
  }
  return all;
}

// Run at startup to align MEMBER role for all users based on CREW/MARAUDER/BLOODED
async function makeMember(client, { delayMs = 25, verbose = false } = {}) {
  const guildId = getGuildId();
  if (!guildId) { console.warn('[MemberRole] Missing guild id'); return; }
  const guild = await client.guilds.fetch(guildId);
  if (!guild) { console.warn('[MemberRole] Guild not found'); return; }
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me) { console.warn('[MemberRole] Could not resolve bot member'); return; }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.warn('[MemberRole] Bot lacks Manage Roles permission; cannot assign MEMBER role.');
    return;
  }

  const roleIds = getRoleIds();
  if (!roleIds.member) {
    console.warn('[MemberRole] MEMBER role ID not configured; aborting.');
    return;
  }

  // Prefer REST pagination to avoid Gateway member chunk timeouts
  let rawMembers;
  try {
    rawMembers = await listGuildMembersRest(client, guildId, { verbose });
  } catch (e) {
    console.error('[MemberRole] Failed to list members via REST; falling back to gateway fetch (may require Server Members Intent)…');
    try {
      // Increase timeout in case of large guilds; may still fail without privileged intent
      const coll = await guild.members.fetch({ time: 180_000 });
      rawMembers = Array.from(coll.values()).map(m => ({ user: { id: m.id }, roles: Array.from(m.roles.cache.keys()) }));
    } catch (e2) {
      console.error('[MemberRole] Gateway fetch also failed:', e2?.message || e2);
      return;
    }
  }

  console.log(`[MemberRole] Startup sync scanning ${rawMembers.length} members…`);
  let processed = 0, changed = 0, errors = 0;

  // Only fetch full GuildMember objects for users who need a change, to reduce API load
  for (const rm of rawMembers) {
    try {
      const userId = rm?.user?.id;
      if (!userId) continue;
      const roles = new Set(rm.roles || []);
      const hasMember = roles.has(roleIds.member);
      const eligible = [roleIds.crew, roleIds.marauder, roleIds.blooded].filter(Boolean).some(rid => roles.has(rid));

      let action = 'none';
      if (eligible && !hasMember) action = 'add';
      else if (!eligible && hasMember) action = 'remove';

      if (action !== 'none') {
        // Fetch single member via REST to get a GuildMember instance (no privileged intent required)
        const member = await guild.members.fetch(userId);
        if (action === 'add') {
          if (verbose) console.log(`[MemberRole] add MEMBER to ${userId}`);
          await member.roles.add(roleIds.member);
        } else {
          if (verbose) console.log(`[MemberRole] remove MEMBER from ${userId}`);
          await member.roles.remove(roleIds.member);
        }
        changed++;
      }
    } catch (e) {
      errors++;
      if (verbose) console.warn('[MemberRole] member update error:', e?.message || e);
    }
    processed++;
    if (processed % 100 === 0) {
      console.log(`[MemberRole] Progress: ${processed}/${rawMembers.length} (changed=${changed}, errors=${errors})`);
    }
    if (delayMs) await sleep(delayMs);
  }
  console.log(`[MemberRole] Startup sync complete. processed=${processed}, changed=${changed}, errors=${errors}`);
}

// Run on guildMemberUpdate to keep MEMBER role aligned
async function updateMemberOnMemberChange(oldMember, newMember, { verbose = false } = {}) {
  try {
    const roleIds = getRoleIds();
    if (!roleIds.member) return;
    if (!changedRelevant(oldMember, newMember, roleIds)) return; // ignore unrelated updates
    await ensureMemberRole(newMember, roleIds, { verbose });
  } catch (err) {
    console.error('[MemberRole] update on member change failed', err?.message || err);
  }
}

module.exports = {
  makeMember,
  updateMemberOnMemberChange,
};
