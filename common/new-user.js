const { getUserById, createUser, editUser } = require('../api/userlistApi');
const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { verifyUser } = require('../functions/verify-user');

// Track verification attempts and DM message in memory (per process)
const verificationAttempts = {};
const verificationDMs = {};

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
            const verifyButton = new ButtonBuilder()
                .setCustomId('verify_rsi')
                .setLabel('Verify')
                .setStyle(1); // 1 = Primary
            const row = new ActionRowBuilder().addComponents(verifyButton);
            const dmMessage = `Welcome to the server, ${member.user.username}! Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then click the verify button below: ${verificationCode}`;
            try {
                // Only send DM if not already sent
                if (!verificationDMs[member.user.id]) {
                    const sentMsg = await member.user.send({ content: dmMessage, components: [row] });
                    verificationDMs[member.user.id] = sentMsg;
                }
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

// Track verification attempts in memory (per process)
// ...existing code...

module.exports = {
    handleNewGuildMember,
    /**
     * Handles the Verify button interaction for RSI verification.
     * @param {ButtonInteraction} interaction - Discord interaction object
     */
    async handleVerifyButtonInteraction(interaction) {
        const userId = interaction.user.id;
        if (!verificationAttempts[userId]) verificationAttempts[userId] = 0;
        try {
            const dbUser = await getUserById(userId);
            const rsiHandle = dbUser?.username || interaction.user.username;
            const resultMsg = await verifyUser(rsiHandle, userId);
            if (/fail|error|not found|incorrect/i.test(resultMsg)) {
                verificationAttempts[userId]++;
                if (verificationAttempts[userId] < 3) {
                    // Always edit the same DM with verify button and resultMsg
                    const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
                    const verifyButton = new ButtonBuilder()
                        .setCustomId('verify_rsi')
                        .setLabel('Verify')
                        .setStyle(1);
                    const row = new ActionRowBuilder().addComponents(verifyButton);
                    const verificationCode = dbUser?.verification_code || Date.now();
                    const dmMessage = `${resultMsg}\n\nPlease ensure your RSI bio contains the code: ${verificationCode} and try again. (${verificationAttempts[userId]}/3 attempts)`;
                    try {
                        if (verificationDMs[userId]) {
                            await verificationDMs[userId].edit({ content: dmMessage, components: [row] });
                        }
                    } catch (dmError) {
                        // Ignore DM errors
                    }
                    // No ephemeral reply, just acknowledge
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.deferUpdate();
                    }
                } else {
                    // Disable button in DM and show resultMsg
                    if (verificationDMs[userId]) {
                        const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
                        const disabledButton = new ButtonBuilder()
                            .setCustomId('verify_rsi')
                            .setLabel('Verify')
                            .setStyle(1)
                            .setDisabled(true);
                        const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
                        const verificationCode = dbUser?.verification_code || Date.now();
                        const finalMsg = `${resultMsg}\n\nYou have reached the maximum number of verification attempts. Please contact DocHound for help. (Code: ${verificationCode})`;
                        try {
                            await verificationDMs[userId].edit({ content: finalMsg, components: [disabledRow] });
                        } catch (dmError) {
                            // Ignore DM errors
                        }
                    }
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.deferUpdate();
                    }
                }
            } else {
                verificationAttempts[userId] = 0;
                // Delete previous DM if exists
                if (verificationDMs[userId]) {
                    try {
                        await verificationDMs[userId].delete();
                    } catch (dmError) {
                        // Ignore DM errors
                    }
                }
                // Send new DM with Join buttons
                const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
                const memberButton = new ButtonBuilder()
                    .setCustomId('join_member')
                    .setLabel('Join as Member')
                    .setStyle(1);
                const guestButton = new ButtonBuilder()
                    .setCustomId('join_guest')
                    .setLabel('Join as Guest')
                    .setStyle(2);
                const joinRow = new ActionRowBuilder().addComponents(memberButton, guestButton);
                const joinMsg = `Verification successful. If you are looking to join IronPoint, please apply here: 'https://robertsspaceindustries.com/en/orgs/IRONPOINT' and then click the "Join as Member" button below. If you are coming from another org or just want to check us out, please click the "Join as Guest" button below.`;
                let sentJoinMsg;
                try {
                    sentJoinMsg = await interaction.user.send({ content: joinMsg, components: [joinRow] });
                } catch (dmError) {
                    // Ignore DM errors
                }
                verificationDMs[userId] = sentJoinMsg;
                // Change user's nickname to their handle
                try {
                    const member = interaction.guild.members.cache.get(userId);
                    if (member && rsiHandle) {
                        await member.setNickname(rsiHandle);
                    }
                } catch (nickError) {
                    // Optionally log or ignore nickname errors
                }
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.deferUpdate();
                }
            }
        } catch (err) {
            const errorText = err?.message || err?.toString() || 'Unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorText, ephemeral: true });
            } else {
                await interaction.reply({ content: errorText, ephemeral: true });
            }
        }
    },
    // Duplicate handleJoinButtonInteraction removed to fix syntax error
    /**
     * Handles Join as Member/Guest button interaction
     * @param {ButtonInteraction} interaction
     */
    async handleJoinButtonInteraction(interaction) {
        const userId = interaction.user.id;
        const member = interaction.guild.members.cache.get(userId);
        if (!member) return;
        let roleId;
        if (interaction.customId === 'join_member') {
            roleId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.PROSPECT_ROLE : process.env.TEST_PROSPECT_ROLE;
        } else if (interaction.customId === 'join_guest') {
            roleId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_ROLE : process.env.TEST_FRIENDLY_ROLE;
        }
        if (roleId) {
            try {
                await member.roles.add(roleId);
                // Send welcome message if joined as Member
                if (interaction.customId === 'join_member') {
                    const { notifyJoinMemberWelcome } = require('./bot-notify');
                    // Get user data for welcome
                    const dbUser = await getUserById(userId);
                    // openai and client are not in scope, so try to get from interaction.client
                    await notifyJoinMemberWelcome(dbUser, interaction.client.openai || null, interaction.client);
                }
            } catch (roleError) {
                // Optionally log or ignore role errors
            }
        }
        if (interaction.customId === 'join_guest') {
            // Re-retrieve user profile and update nickname
            try {
                const dbUser = await getUserById(userId);
                const handle = dbUser?.username || member.user.username;
                const playerOrg = dbUser?.player_org || '';
                await member.setNickname(`[${playerOrg}] ${handle}`);
            } catch (nickError) {
                // Optionally log or ignore nickname errors
            }
        }
        // Disable buttons after click
        if (verificationDMs[userId]) {
            const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
            const memberButton = new ButtonBuilder()
                .setCustomId('join_member')
                .setLabel('Join as Member')
                .setStyle(1)
                .setDisabled(true);
            const guestButton = new ButtonBuilder()
                .setCustomId('join_guest')
                .setLabel('Join as Guest')
                .setStyle(2)
                .setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(memberButton, guestButton);
            try {
                await verificationDMs[userId].edit({ components: [disabledRow] });
            } catch (dmError) {
                // Ignore DM errors
            }
        }
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
    },
}