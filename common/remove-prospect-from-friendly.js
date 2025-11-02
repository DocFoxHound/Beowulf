/**
 * One-time cleanup: remove PROSPECT_ROLE from any members who also have FRIENDLY_ROLE.
 * Safe to run multiple times (idempotent). Requires the bot to have Manage Roles.
 */

/**
 * Chunk an array into smaller arrays of size n
 * @param {Array} arr
 * @param {number} n
 * @returns {Array<Array>}
 */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * @param {import('discord.js').Client} client
 */
async function removeProspectFromFriendlies(client) {
  try {
    const prospectRoleId = process.env.PROSPECT_ROLE;
    const friendlyRoleId = process.env.FRIENDLY_ROLE;

    if (!prospectRoleId || !friendlyRoleId) {
      console.warn('[prospect-friendly-fix] Missing PROSPECT_ROLE or FRIENDLY_ROLE env vars; skipping.');
      return;
    }

    let totalExamined = 0;
    let totalToFix = 0;
    let totalFixed = 0;

    for (const [, guild] of client.guilds.cache) {
      try {
        // Ensure full member list is available
        const members = await guild.members.fetch();
        totalExamined += members.size;

        const targets = members.filter(m => m.roles.cache.has(prospectRoleId) && m.roles.cache.has(friendlyRoleId));
        totalToFix += targets.size;

        if (targets.size === 0) continue;

        const batches = chunk(Array.from(targets.values()), 10); // operate in small batches to respect rate limits
        for (const batch of batches) {
          const results = await Promise.allSettled(
            batch.map(member => member.roles.remove(prospectRoleId, 'Prospect+Friendly conflict fix'))
          );
          results.forEach(r => { if (r.status === 'fulfilled') totalFixed += 1; });
        }
      } catch (e) {
        console.error(`[prospect-friendly-fix] Error processing guild ${guild?.name || guild?.id}:`, e.message || e);
      }
    }

    console.log(`[prospect-friendly-fix] Examined ${totalExamined} members; ` +
      `found ${totalToFix} with both roles; removed PROSPECT from ${totalFixed}.`);
  } catch (e) {
    console.error('[prospect-friendly-fix] Fatal error:', e?.message || e);
  }
}

module.exports = { removeProspectFromFriendlies };
