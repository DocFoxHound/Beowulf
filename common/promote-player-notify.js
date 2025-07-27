const { notifyRankPromotion } = require("./bot-notify");


async function promotePlayerNotify(client, openai, user_id) {
    console.log(`Promote Player Notify for user: ${user_id}`);
    // Get role IDs from environment
    const friendlyRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_ROLE : process.env.TEST_FRIENDLY_ROLE;
    const prospectRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.PROSPECT_ROLE : process.env.TEST_PROSPECT_ROLE;
    const crewRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CREW_ROLE : process.env.TEST_CREW_ROLE;
    const marauderRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MARAUDER_ROLE : process.env.TEST_MARAUDER_ROLE;
    const bloodedRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;

    // Get the guild
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) throw new Error("Guild not found");
        // Fetch the member
        const member = await guild.members.fetch(user_id);
        if (!member) throw new Error("User not found in guild");
        // Get current roles
        const roles = member.roles.cache;
        // Promotion ladder
        const ladder = [friendlyRole, prospectRole, crewRole, marauderRole, bloodedRole];
        // Find current rank index
        let currentRankIdx = -1;
        for (let i = 0; i < ladder.length; i++) {
            if (roles.has(ladder[i])) {
                currentRankIdx = i;
                break;
            }
        }
        // If not found or already at top, do nothing
        if (currentRankIdx === -1 || currentRankIdx === ladder.length - 1) {
            return false;
        }
        // Remove old rank, add new rank
        const oldRole = ladder[currentRankIdx];
        const newRole = ladder[currentRankIdx + 1];
        await member.roles.remove(oldRole);
        await member.roles.add(newRole);

        // Try to get user data for notification (nickname or username)
        let userData = {
            userId: user_id,
            username: member.user?.username || user_id,
            nickname: member.nickname || undefined
        };
        // newRole is a role ID, get the role name
        const newRoleObj = guild.roles.cache.get(newRole);
        const newRoleName = newRoleObj ? newRoleObj.name : "Promoted";
        await notifyRankPromotion(newRoleName, userData, openai, client);
        return true;
    } catch (err) {
        console.error('Promotion error:', err);
        return false;
    }
}

module.exports = { promotePlayerNotify };   
