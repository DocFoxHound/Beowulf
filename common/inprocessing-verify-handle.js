const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { verifyUser } = require('../functions/verify-user');
const { notifyJoinMemberWelcome, notifyJoinGuestWelcome } = require('./bot-notify');
const { getUserById, editUser } = require('../api/userlistApi');
const { get } = require('lodash');

// Track verification attempts and DM message in memory (per process)
const verificationAttempts = {};
const verificationDMs = {};
const blockedVerificationUsers = {};

function getGuild(client) {
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    return client.guilds.cache.get(guildId);
}

// Function to show the Handle Verification Modal
async function sendHandleVerificationMessage(newMember, client, openai) {
    const dbUser = await getUserById(newMember.id);
    if (!dbUser || !dbUser.verification_code) {
        console.error('No verification code found for user:', newMember.id);
        return;
    }

    // Create the embed message
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
        .setTitle('Step 2: RSI Verification')
        .setDescription(
            `Please go to your RSI Account Profile page and edit the 'Short Bio' section to include the following code below.\nhttps://robertsspaceindustries.com/en/account/profile\n**${dbUser.verification_code}**\n\nWhen complete, please either link your **RSI Dossier/Profile page** or post your full and correct **RSI Handle**`
        )
        .setColor(0x3498db);

    try {
        // Send DM to the user
        const dmChannel = await newMember.user.createDM();
        await dmChannel.send({ embeds: [embed] });
        // Optionally, track that we've sent the DM for later reply handling
        verificationDMs[newMember.id] = true;
    } catch (err) {
        console.error('Failed to send verification DM:', err);
    }
}

async function handleDMVerificationResponse(message, client, openai, dbUser) {
    // Block further attempts if user is blocked
    if (blockedVerificationUsers[dbUser.id]) {
        // Optionally reply, or just ignore
        return;
    }
    let handle;
    const guild = getGuild(client);
        // Check if message is a URL
        if (typeof message === 'string' && message.startsWith('http')) {
            // Extract last part of URL as handle
            try {
                const urlParts = message.split('/');
                handle = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
            } catch (e) {
                console.error('Error extracting handle from URL:', e);
                handle = message;
            }
        } else {
            // Message is just the handle
            handle = message;
        }

        // Track attempts
        if (!verificationAttempts[dbUser.id]) {
            verificationAttempts[dbUser.id] = 0;
        }
        verificationAttempts[dbUser.id]++;

        // Fetch RSI profile HTML
        const profileUrl = `https://robertsspaceindustries.com/en/citizens/${handle}`;
        let html = '';
        try {
            const fetch = require('node-fetch');
            const response = await fetch(profileUrl);
            html = await response.text();
        } catch (err) {
            console.error('Failed to fetch RSI profile:', err);
            await message.reply('Failed to fetch RSI profile. Please check your handle and try again.');
            return;
        }

        // Check for verification code in HTML
        const codeFound = html.includes(dbUser.verification_code);

        if (codeFound) {
            // Success: show buttons to join as Member or Guest
            const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
            const memberBtn = new ButtonBuilder()
                .setCustomId('join_member')
                .setLabel('Join as Member')
                .setStyle(1); // Primary
            const guestBtn = new ButtonBuilder()
                .setCustomId('join_guest')
                .setLabel('Join as Guest')
                .setStyle(2); // Secondary
            const row = new ActionRowBuilder().addComponents(memberBtn, guestBtn);
            await message.reply({
                content: 'Verification successful! Please choose how you want to join:',
                components: [row]
            });
            verificationAttempts[dbUser.id] = 0; // Reset attempts on success
        } else {
            // Failure: check attempts
            if (verificationAttempts[dbUser.id] >= 3) {
                await message.reply('Verification failed 3 times. Please contact DocHound for assistance.');
                blockedVerificationUsers[dbUser.id] = true;
            } else {
                await message.reply('Verification check failed. Please re-check your RSI handle and verification code, then try again.');
            }
        }
        // Optionally, update user handle in DB
        // await editUser(dbUser.id, { handle });
        return handle;
}

async function handleMemberOrGuestJoin(interaction, client, openai) {
    const userId = interaction.user.id;
    const dbUser = await getUserById(userId);
    const guild = getGuild(client);
    const friendlyPendingRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.FRIENDLY_ROLE;
    const memberPendingRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.APPLICATION_PENDING_ROLE : process.env.PROSPECT_ROLE;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const member = await guild.members.fetch(userId);

    //check that the user still has the newUserRole, which indicates they've not clicked this button yet
    if(dbUser.roles.includes(newUserRole)){
        try{
            await member.roles.remove(newUserRole);
        } catch (error) {
            console.error('Error removing new user role:', error);
        }
        if(interaction.customId === 'join_member'){
            try{
                await member.roles.add(memberPendingRole);
                notifyJoinMemberWelcome(dbUser, openai, client);
            } catch (error) {
                console.error('Error adding member role:', error);
            }
        }
        if(interaction.customId === 'join_guest'){
            try{
                await member.roles.add(friendlyPendingRole);
                notifyJoinGuestWelcome(dbUser, openai, client);
            } catch (error) {
                console.error('Error adding guest role:', error);
            }
        }
    }
}


module.exports = {
    sendHandleVerificationMessage,
    handleDMVerificationResponse,
    handleMemberOrGuestJoin
};