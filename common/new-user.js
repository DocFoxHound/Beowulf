const { getUserById, createUser, editUser } = require('../api/userlistApi');


async function handleNewGuildMember(member) {
    const logChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ENTRY_LOG_CHANNEL : process.env.TEST_ENTRY_LOG_CHANNEL;
    try {
        // Check if the user already exists in the database
        const user = await getUserById(member.user.id) || null;
        let result;
        let actionMsg;
        const verificationCode = user.verification_code || Date.now();
        if (user) {
            // Update existing user profile
            const updatedUser = {
                ...user,
                username: member.user.username,
                roles: member.roles.cache.map(role => role.id),
                nickname: member.nickname || null,
                joined_date: user.joined_date || new Date().toISOString(),
            };
            // You may want to use an updateUser function here; for now, reuse createUser for upsert
            result = await editUser(updatedUser.id, updatedUser);
            actionMsg = `User ${member.user.username} profile has been updated in the UserList.`;
        } else {
            // Initialize the newUser object
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
            console.log(actionMsg);
            member.guild.channels.cache.get(logChannel)?.send(actionMsg);

            // Send DM with Verify button
            const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
            const verifyButton = new ButtonBuilder()
                .setCustomId('verify_rsi')
                .setLabel('Verify')
                .setStyle(1); // 1 = Primary
            const row = new ActionRowBuilder().addComponents(verifyButton);
            const dmMessage = `Welcome to the server, ${member.user.username}! Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then click the verify button below: ${verificationCode}`;
            try {
                await member.user.send({ content: dmMessage, components: [row] });
            } catch (dmError) {
                console.error(`Could not send DM to ${member.user.username}:`, dmError);
            }
        } else {
            const errorMsg = `Failed to process user ${member.user.username} in the UserList.`;
            console.error(errorMsg);
            member.guild.channels.cache.get(logChannel)?.send(errorMsg);
        }
    } catch (error) {
        const errorMsg = `Error adding new user: ${error}`;
        console.error(errorMsg);
        member.guild.channels.cache.get(logChannel)?.send(errorMsg);
    }
}

module.exports = {
    handleNewGuildMember
}