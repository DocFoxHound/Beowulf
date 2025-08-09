const { getUserById, createUser, editUser } = require('../api/userlistApi');

// Helper to get the guild from client and .env
function getGuild(client) {
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    return client.guilds.cache.get(guildId);
}

async function handleNewGuildMember(member) {
    const logChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ENTRY_LOG_CHANNEL : process.env.TEST_ENTRY_LOG_CHANNEL;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const guild = getGuild(member.client);
    console.debug(`[handleNewGuildMember] Called for user: ${member.user.username} (${member.user.id})`);
        // Assign newUserRole if not already present
        if (!member.roles.cache.has(newUserRole)) {
            try {
                await member.roles.add(newUserRole);
                console.debug(`[handleNewGuildMember] Assigned newUserRole (${newUserRole}) to user: ${member.user.username}`);
            } catch (roleErr) {
                console.error(`[handleNewGuildMember] Failed to assign newUserRole: ${roleErr}`);
            }
        }
    try {
        // Check if the user already exists in the database
        console.debug(`[handleNewGuildMember] Checking if user exists in DB...`);
        const user = await getUserById(member.user.id) || null;
        let result;
        let actionMsg;
        const verificationCode = user ? user.verification_code : Date.now();
        if (user) {
            console.debug(`[handleNewGuildMember] User exists. Updating profile.`);
            const updatedUser = {
                ...user,
                username: member.user.username,
                roles: member.roles.cache.map(role => role.id),
                nickname: member.nickname || null,
                joined_date: user.joined_date || new Date().toISOString(),
            };
            result = await editUser(updatedUser.id, updatedUser);
            actionMsg = `User ${member.user.username} profile has been updated in the UserList.`;
        } else {
            console.debug(`[handleNewGuildMember] User does not exist. Creating new profile.`);
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
            actionMsg = `User ${member.user.username} has been successfully added to the UserList.`;
        }

        if (result) {
            console.debug(`[handleNewGuildMember] DB operation successful. Sending log message.`);
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