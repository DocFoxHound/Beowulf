const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { verifyUser } = require('../functions/verify-user');
const { notifyJoinMemberWelcome, notifyJoinGuestWelcome } = require('./bot-notify');
const { getUserById } = require('../api/userlistApi');

// Track verification attempts and DM message in memory (per process)
const verificationAttempts = {};
const verificationDMs = {};

function getGuild(client) {
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    return client.guilds.cache.get(guildId);
}

async function verifyHandle(client, openai, member) {
    // Step 1: Prompt for RSI Handle/Dossier link using a modal
    const { ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
    const modal = new ModalBuilder()
        .setCustomId('rsi_handle_modal')
        .setTitle('Enter RSI Handle or Dossier Link');
    const handleInput = new TextInputBuilder()
        .setCustomId('rsi_handle_input')
        .setLabel('RSI Handle or Dossier Link')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. DocHound or https://robertsspaceindustries.com/citizens/DocHound');
    modal.addComponents(new ActionRowBuilder().addComponents(handleInput));
    try {
        await member.user.send({ content: "Welcome to the server! Please provide your RSI Handle or Dossier link to continue verification." });
        // You cannot send modals via DM, so instead, send a button that triggers the modal in the server
        // Save that the user needs to submit their handle
    } catch (dmError) {
        console.error(`[verifyHandle] Could not send DM to ${member.user.username}:`, dmError);
    }
    // You must trigger the modal from an interaction in the server (e.g., a button click)
    // See handler below for modal submission
}

module.exports = {
    verifyHandle,

    /**
     * Handles RSI Handle modal submission
     * @param {ModalSubmitInteraction} interaction
     */
    async handleRSIModal(interaction) {
        if (interaction.customId !== 'rsi_handle_modal') return;
        const userId = interaction.user.id;
        let rsiHandleOrLink = interaction.fields.getTextInputValue('rsi_handle_input').trim();
        // If input is a dossier link, extract the handle
        let rsiHandle = rsiHandleOrLink;
        const dossierPrefix = 'https://robertsspaceindustries.com/citizens/';
        if (rsiHandleOrLink.startsWith(dossierPrefix)) {
            rsiHandle = rsiHandleOrLink.substring(dossierPrefix.length);
        }
        // Remove spaces from handle
        rsiHandle = rsiHandle.replace(/\s+/g, '');
        // Validate handle: must not be empty and must not contain spaces
        if (!rsiHandle || /\s/.test(rsiHandle)) {
            await interaction.reply({ content: "Invalid RSI Handle. Please enter a valid handle with no spaces.", ephemeral: true });
            return;
        }
        // Fetch RSI profile HTML and validate handle
        const profileUrl = `https://robertsspaceindustries.com/citizens/${rsiHandle}`;
        let html = '';
        try {
            const res = await fetch(profileUrl);
            html = await res.text();
        } catch (fetchErr) {
            console.error(`[handleRSIModal] Error fetching RSI profile:`, fetchErr);
            await interaction.reply({ content: "Could not reach RSI profile. Please try again later.", ephemeral: true });
            return;
        }
        if (html.includes('NAVIGATING UNCHARTED TERRITORY')) {
            await interaction.reply({ content: "Invalid RSI Handle. That profile does not exist. Please enter your handle again.", ephemeral: true });
            return;
        }
        // Save RSI handle to DB or memory (implement as needed)
        const dbUser = await getUserById(userId) || {};
        dbUser.rsi_handle = rsiHandle;
        // TODO: Save dbUser.rsi_handle to DB if needed
        const verifyButton = new ButtonBuilder()
            .setCustomId('verify_rsi')
            .setLabel('Verify')
            .setStyle(1);
        const row = new ActionRowBuilder().addComponents(verifyButton);
        const dmMessage = `Thank you! Now, please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then click the verify button below: ${dbUser.verification_code}`;
        try {
            const sentMsg = await interaction.user.send({ content: dmMessage, components: [row] });
            verificationDMs[userId] = sentMsg;
            await interaction.reply({ content: "RSI Handle/Dossier received! Please check your DM for the next step.", ephemeral: true });
        } catch (dmError) {
            console.error(`[handleRSIModal] Could not send DM:`, dmError);
            await interaction.reply({ content: "Could not send DM. Please check your DM settings.", ephemeral: true });
        }
    },

    async handleVerifyButtonInteraction(interaction) {
        const userId = interaction.user.id;
        console.debug(`[handleVerifyButtonInteraction] Called for user: ${userId}`);
        if (!verificationAttempts[userId]) verificationAttempts[userId] = 0;
        // Always defer immediately to avoid interaction expiration
        if (!interaction.replied && !interaction.deferred) {
            console.debug(`[handleVerifyButtonInteraction] Deferring interaction update.`);
            await interaction.deferUpdate();
        }
        try {
            console.debug(`[handleVerifyButtonInteraction] Fetching user from DB...`);
            const dbUser = await getUserById(userId);
            const rsiHandle = dbUser?.username || interaction.user.username;
            console.debug(`[handleVerifyButtonInteraction] Verifying user: ${rsiHandle}`);
            const resultMsg = await verifyUser(rsiHandle, userId);
            console.debug(`[handleVerifyButtonInteraction] Verification result: ${resultMsg}`);
            if (/fail|error|not found|incorrect/i.test(resultMsg)) {
                verificationAttempts[userId]++;
                console.debug(`[handleVerifyButtonInteraction] Verification failed. Attempt ${verificationAttempts[userId]}`);
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
                            console.debug(`[handleVerifyButtonInteraction] Editing DM for failed verification.`);
                            await verificationDMs[userId].edit({ content: dmMessage, components: [row] });
                        }
                    } catch (dmError) {
                        console.error(`[handleVerifyButtonInteraction] Could not edit DM:`, dmError);
                    }
                    // No further interaction response needed
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
                            console.debug(`[handleVerifyButtonInteraction] Disabling DM button after max attempts.`);
                            await verificationDMs[userId].edit({ content: finalMsg, components: [disabledRow] });
                        } catch (dmError) {
                            console.error(`[handleVerifyButtonInteraction] Could not edit DM:`, dmError);
                        }
                    }
                    // No further interaction response needed
                }
            } else {
                verificationAttempts[userId] = 0;
                // Delete previous DM if exists
                if (verificationDMs[userId]) {
                    try {
                        console.debug(`[handleVerifyButtonInteraction] Deleting previous DM after successful verification.`);
                        await verificationDMs[userId].delete();
                    } catch (dmError) {
                        console.error(`[handleVerifyButtonInteraction] Could not delete DM:`, dmError);
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
                    console.debug(`[handleVerifyButtonInteraction] Sending join DM after verification.`);
                    sentJoinMsg = await interaction.user.send({ content: joinMsg, components: [joinRow] });
                } catch (dmError) {
                    console.error(`[handleVerifyButtonInteraction] Could not send join DM:`, dmError);
                }
                verificationDMs[userId] = sentJoinMsg;
                // Change user's nickname to their handle
                try {
                    const guild = getGuild(interaction.client);
                    if (guild && rsiHandle) {
                        const member = guild.members.cache.get(userId);
                        if (member) {
                            console.debug(`[handleVerifyButtonInteraction] Setting nickname for user.`);
                            await member.setNickname(rsiHandle);
                        }
                    }
                } catch (nickError) {
                    console.error(`[handleVerifyButtonInteraction] Could not set nickname:`, nickError);
                }
                // No further interaction response needed
            }
        } catch (err) {
            const errorText = err?.message || err?.toString() || 'Unknown error occurred.';
            console.error(`[handleVerifyButtonInteraction] Error:`, errorText);
            // If already deferred/replied, use followUp, else just log error (should never happen)
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorText, ephemeral: true });
            } else {
                // Should never happen, but log error
                console.error('[handleVerifyButtonInteraction] Interaction expired before response:', errorText);
            }
        }
    },
    /**
     * Handles Join as Member/Guest button interaction
     * @param {ButtonInteraction} interaction
     */
    async handleJoinButtonInteraction(interaction, client, openai) {
        const userId = interaction.user.id;
        console.debug(`[handleJoinButtonInteraction] Called for user: ${userId}, customId: ${interaction.customId}`);
        // Always defer immediately to avoid interaction expiration
        if (!interaction.replied && !interaction.deferred) {
            console.debug(`[handleJoinButtonInteraction] Deferring interaction update.`);
            await interaction.deferUpdate();
        }
        let member = null;
        let guild = interaction.guild
            || client.guilds.cache.find(g => g.members.cache.has(userId))
            || client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID);
        if (guild) {
            member = guild.members.cache.get(userId);
        }
        if (!member) {
            console.error(`[handleJoinButtonInteraction] Could not find server membership for user: ${userId}`);
            await interaction.followUp({ content: "Could not find your server membership. Please use this button in the server.", ephemeral: true });
            return;
        }
        let roleId;
        if (interaction.customId === 'join_member') {
            roleId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.APPLICATION_PENDING_ROLE : process.env.TEST_APPLICATION_PENDING_ROLE;
        } else if (interaction.customId === 'join_guest') {
            roleId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.TEST_FRIENDLY_PENDING_ROLE;
        }
        if (roleId) {
            try {
                console.debug(`[handleJoinButtonInteraction] Adding role ${roleId} to user: ${userId}`);
                await member.roles.add(roleId);
            } catch (roleError) {
                console.error(`[handleJoinButtonInteraction] Could not add role:`, roleError);
            }
        }
        // Disable buttons after click (move up so it's immediate)
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
                console.debug(`[handleJoinButtonInteraction] Disabling DM buttons for user: ${userId}`);
                await verificationDMs[userId].edit({ components: [disabledRow] });
            } catch (dmError) {
                console.error(`[handleJoinButtonInteraction] Could not edit DM:`, dmError);
            }
        }
        // Run welcome notification in background
        if (interaction.customId === 'join_member') {
            (async () => {
                try {
                    console.debug(`[handleJoinButtonInteraction] Running notifyJoinMemberWelcome for user: ${userId}`);
                    const dbUser = await getUserById(userId);
                    await notifyJoinMemberWelcome(dbUser, openai, interaction.client);
                } catch (e) {
                    console.error(`[handleJoinButtonInteraction] Error in notifyJoinMemberWelcome:`, e);
                }
            })();
        }
        if (interaction.customId === 'join_guest') {
            // Re-retrieve user profile after verifyUser to ensure .player_org is up-to-date, then update nickname
            try {
                console.debug(`[handleJoinButtonInteraction] Running notifyJoinGuestWelcome for user: ${userId}`);
                // Re-fetch user profile from DB
                const dbUser = await getUserById(userId);
                const handle = dbUser?.rsi_handle;
                const playerOrg = dbUser?.player_org || '';
                await member.setNickname(`[${playerOrg}] ${handle}`);
                await notifyJoinGuestWelcome(dbUser, openai, interaction.client);
            } catch (nickError) {
                console.error(`[handleJoinButtonInteraction] Error in notifyJoinGuestWelcome or setNickname:`, nickError);
            }
        }
        // Send followUp welcome message
        console.debug(`[handleJoinButtonInteraction] Sending welcome followUp for user: ${userId}`);
        await interaction.followUp({ content: "Welcome to IronPoint!", ephemeral: true });
    },
};