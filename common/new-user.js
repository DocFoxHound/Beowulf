const { getUserById, createUser, editUser } = require('../api/userlistApi');
const { verifyHandle } = require('../common/inprocessing-verify-handle');
const { notifyRejoinWelcome, notifyJoinMemberWelcome, notifyJoinGuestWelcome } = require('./bot-notify');

// Helper to get the guild from client and .env
function getGuild(client) {
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    return client.guilds.cache.get(guildId);
}

async function handleNewGuildMember(member) {
    const logChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ENTRY_LOG_CHANNEL : process.env.TEST_ENTRY_LOG_CHANNEL;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const guild = getGuild(member.client);
    
    try {
        // Check if the user already exists in the database
        const user = await getUserById(member.user.id) || null;
        let result;
        let actionMsg;
        const verificationCode = user ? user.verification_code : Date.now();
        if (user) {
            const updatedUser = {
                ...user,
                username: member.user.username,
                roles: member.roles.cache.map(role => role.id),
                nickname: member.nickname || null,
                joined_date: user.joined_date || new Date().toISOString(),
            };
            result = await editUser(updatedUser.id, updatedUser);
            actionMsg = `User ${member.user.username} profile has been updated in the UserList.`;

            const friendlyPendingRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.TEST_FRIENDLY_ROLE;
            const verifiedRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.VERIFIED_ROLE : process.env.TEST_VERIFIED_ROLE;
            try {
                await member.roles.add(friendlyPendingRole);
                await member.roles.remove(newUserRole);
                await member.roles.add(verifiedRole);
            } catch (roleErr) {
                console.error("Error adding friendly pending role: ", roleErr);
            }
            await notifyRejoinWelcome(member, verificationCode, client);
        } else {
            const newUser = {
                id: member.user.id,
                username: member.user.username,
                nickname: null,
                rank: null,
                roles: member.roles.cache.map(role => role.id),
                verification_code: verificationCode,
                rsi_handle: null,
                joined_date: new Date().toISOString(),
            };
            result = await createUser(newUser);
            // Assign newUserRole if not already present
            if (!member.roles.cache.has(newUserRole)) {
                try {
                    await member.roles.add(newUserRole);
                } catch (roleErr) {
                    console.error("Error adding new user role: ", roleErr);
                }
            }
            actionMsg = `User ${member.user.username} has been successfully added to the UserList.`;
        }

        if (result) {
            guild.channels.cache.get(logChannel)?.send(actionMsg);
        }
    } catch (error) {
        const errorMsg = `[handleNewGuildMember] Error adding new user: ${error}`;
        console.error(errorMsg);
        guild.channels.cache.get(logChannel)?.send(errorMsg);
    }
}

// Track verification attempts in memory (per process)
// ...existing code...

module.exports = {
    handleNewGuildMember,
}