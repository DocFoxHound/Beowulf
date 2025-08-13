const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { verifyUser } = require('../functions/verify-user');
const { notifyJoinMemberWelcome, notifyJoinGuestWelcome, notifyWelcomeForEmbed } = require('./bot-notify');
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
    // Debug: entry log
    // Block further attempts if user is blocked
    if (blockedVerificationUsers[dbUser.id]) {
        // Optionally reply, or just ignore
        return;
    }
    let handle;
    const guild = getGuild(client);
    let msgContent = typeof message === 'string' ? message : message.content;
    // Check if msgContent is a URL
    if (msgContent.startsWith('http')) {
        try {
            const urlParts = msgContent.split('/');
            handle = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
        } catch (e) {
            console.error('Error extracting handle from URL:', e);
            handle = msgContent;
        }
    } else {
        handle = msgContent;
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
        // 1. Extract orgSID from HTML
        let orgSID = '';
        try {
            // Find the SID label (class numbers may vary)
            const sidLabelRegex = /<span[^>]*>Spectrum Identification \(SID\)<\/span>\s*<strong[^>]*>([^<]+)<\/strong>/;
            const sidMatch = html.match(sidLabelRegex);
            if (sidMatch && sidMatch[1]) {
                orgSID = sidMatch[1].trim();
            }
        } catch (e) {
            console.error('Error extracting orgSID:', e);
        }

        // 2. Change user's nickname in guild
        try {
            const member = await guild.members.fetch(dbUser.id);
            let newNick = handle;
            if (orgSID) {
                newNick = `[${orgSID}] ${handle}`;
            }
            await member.setNickname(newNick).catch(e => console.error('Error setting nickname:', e));
        } catch (e) {
            console.error('Error setting nickname after verification:', e);
        }

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
    console.log('[handleDMVerificationResponse] Returning handle:', handle);
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

    // Check that the user still has the newUserRole, which indicates they've not clicked this button yet
    if (dbUser.roles.includes(newUserRole)) {
        // Immediately respond with disabled buttons
        const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
        const memberBtn = new ButtonBuilder()
            .setCustomId('join_member')
            .setLabel('Join as Member')
            .setStyle(1)
            .setDisabled(true);
        const guestBtn = new ButtonBuilder()
            .setCustomId('join_guest')
            .setLabel('Join as Guest')
            .setStyle(2)
            .setDisabled(true);
        const row = new ActionRowBuilder().addComponents(memberBtn, guestBtn);
        await interaction.reply({
            content: 'Processing your selection...',
            components: [row],
            ephemeral: true
        });

        // Process role changes and notifications asynchronously
        (async () => {
            try {
                await member.roles.remove(newUserRole);
            } catch (error) {
                console.error('Error removing new user role:', error);
            }
            if (interaction.customId === 'join_member') {
                try {
                    await member.roles.add(memberPendingRole);
                    notifyJoinMemberWelcome(dbUser, openai, client);
                } catch (error) {
                    console.error('Error adding member role:', error);
                }
            }
            if (interaction.customId === 'join_guest') {
                try {
                    await member.roles.add(friendlyPendingRole);
                    notifyJoinGuestWelcome(dbUser, openai, client);
                } catch (error) {
                    console.error('Error adding guest role:', error);
                }
            }
        })();
    }
}

//this skips the verification process and just goes straight to the welcome message
async function handleSimpleJoin(interaction, client, openai){
    const { EmbedBuilder } = require('discord.js');
    const friendlyPendingRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.FRIENDLY_ROLE;
    const bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;
    const channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const userId = interaction.user.id;
    const dbUser = await getUserById(userId);
    const guild = getGuild(client);
    const member = await guild.members.fetch(userId);
    // Add friendlyPendingRole, remove newUserRole
    try {
        await member.roles.add(friendlyPendingRole);
    } catch (error) {
        console.error('Error adding friendlyPendingRole:', error);
    }

    // Create welcome message
    const messageToBot = `Welcome ${dbUser.username} to IronPoint, the best Pirate crew in Star Citizen. Explain that we expect skill and creativity, as they're both needed to dominate. Ask if ${dbUser.username} is here to join as a member or as a guest, and what organization they belong to.`;
    let returnedMessage = "";
    try{
        returnedMessage = await notifyWelcomeForEmbed(dbUser, openai, client, messageToBot);
    }catch(error){
        returnedMessage = "Welcome to IronPoint! Please take a moment to read the rules and let us know if you're here as a Guest or here as a potential Join!";
        console.error("Error notifying welcome for embed:", error);
    }
    // Create embed with avatar, title, and welcome message
    const avatarUrl = interaction.user.displayAvatarURL();
    const embed = new EmbedBuilder()
        .setTitle(`<@${userId}>, welcome to IronPoint!`)
        .setDescription(returnedMessage)
        .setThumbnail(avatarUrl)
        .setColor(0x3498db);
    // Send embed to channel, ping bloodedToNotify role in message content
    const channel = guild.channels.cache.get(channelToNotify);
    const pingBlooded = `<@&${bloodedToNotify}>`;
    if (channel) {
        await channel.send({ content: pingBlooded, embeds: [embed] });
    } else {
        console.error('Welcome channel not found:', channelToNotify);
    }
}

async function handleSimpleWelcomeProspect(interaction, client, openai){
    const { EmbedBuilder } = require('discord.js');
    const friendlyPendingRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.FRIENDLY_ROLE;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const userId = interaction.user.id;
    const dbUser = await getUserById(userId);
    const guild = getGuild(client);
    const member = await guild.members.fetch(userId);
    // Add friendlyPendingRole, remove newUserRole
    try {
        await member.roles.add(friendlyPendingRole);
    } catch (error) {
        console.error('Error adding friendlyPendingRole:', error);
    }
    try {
        await member.roles.remove(newUserRole);
    } catch (error) {
        console.error('Error removing newUserRole:', error);
    }
    // Create welcome message
    const messageToBot = `Congratulate ${dbUser.username} on joining as a PROSPECT. Let them know they need to now prove themselves to become part of the Crew. Explain that they'll have to learn pirate skills and dogfighting to excel, but most importantly they need to learn how to work as a team member. Explain that Piracy is the most challenging and rewarding activity in StarCitizen, and that they're contributions to the crew's success will be crucial.`;
    let returnedMessage = "";
    try{
        returnedMessage = await notifyWelcomeForEmbed(dbUser, openai, client, messageToBot);
    }catch(error){
        returnedMessage = "Congratulations on joining IronPoint as a PROSPECT! We value teamwork, creative problem solving, and of course dogfighting skills. You'll be expected to learn how to function on the Pirate Team, and how to hold your own against some of the best. You're contributions to our successes will be crucial to keeping us on top!";
        console.error("Error notifying welcome for embed:", error);
    }
    // Create embed with avatar, title, and welcome message
    const avatarUrl = interaction.user.displayAvatarURL();
    const embed = new EmbedBuilder()
        .setTitle(`Welcome, <@${userId}>, our newest PROSPECT!`)
        .setDescription(returnedMessage)
        .setThumbnail(avatarUrl)
        .setColor(0x3498db)
        .addFields(
            { name: 'Website', value: '[ironpoint.org](https://www.ironpoint.org/)', inline: false },
            { name: 'Kill Tracker', value: '[BeowulfHunter](https://github.com/DocFoxHound/BeowulfHunterPy/releases/latest)', inline: false },
            { name: 'Dogfighting 101 Videos', value: `[Kozuka's Raptor 101](https://www.youtube.com/playlist?list=PL3P2dFMRGUtYJa4NauDruO76hSdNCDBOQ)`, inline: false },
            { name: 'Standard Pirate Team', value: `[Be Prepared!](https://discord.com/channels/692428312840110090/1195385211358285915)`, inline: false }
        );
    // Send embed to channel
    const channel = guild.channels.cache.get(channelToNotify);
    if (channel) {
        await channel.send({ embeds: [embed] });
    } else {
        console.error('Welcome channel not found:', channelToNotify);
    }
}

async function handleSimpleWelcomeGuest(interaction, client, openai){
    const { EmbedBuilder } = require('discord.js');
    const friendlyPendingRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.FRIENDLY_ROLE;
    const newUserRole = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.STARCITIZEN_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const userId = interaction.user.id;
    const dbUser = await getUserById(userId);
    const guild = getGuild(client);
    const member = await guild.members.fetch(userId);
    // Add friendlyPendingRole, remove newUserRole
    try {
        await member.roles.add(friendlyPendingRole);
    } catch (error) {
        console.error('Error adding friendlyPendingRole:', error);
    }
    try {
        await member.roles.remove(newUserRole);
    } catch (error) {
        console.error('Error removing newUserRole:', error);
    }
    // Create welcome message
    const messageToBot = `Welcome ${dbUser.username} as a Guest of IronPoint. Let them know that they're free to join in on the action whenever they feel like it, but to respect our rules. Tell them if they'd like to join, to please let DocHound or any of the Blooded members know.`;
    let returnedMessage = "";
    try{
        returnedMessage = await notifyWelcomeForEmbed(dbUser, openai, client, messageToBot);
    }catch(error){
        returnedMessage = "Welcome to IronPoint! We're glad to have you as a guest. Please feel free to join in on the action whenever you feel, and if you're interested in joining up just let DocHound or any of the Blooded members know!";
        console.error("Error notifying welcome for embed:", error);
    }
    // Create embed with avatar, title, and welcome message
    const avatarUrl = interaction.user.displayAvatarURL();
    const embed = new EmbedBuilder()
        .setTitle(`Welcome, <@${userId}>, our newest Guest!`)
        .setDescription(returnedMessage)
        .setThumbnail(avatarUrl)
        .setColor(0x3498db)
        .addFields(
            { name: 'Website', value: '[ironpoint.org](https://www.ironpoint.org/)', inline: false },
            { name: 'Kill Tracker', value: '[BeowulfHunter](https://github.com/DocFoxHound/BeowulfHunterPy/releases/latest)', inline: false },
            { name: 'Dogfighting 101 Videos', value: `[Kozuka's Raptor 101](https://www.youtube.com/playlist?list=PL3P2dFMRGUtYJa4NauDruO76hSdNCDBOQ)`, inline: false },
        );
    // Send embed to channel
    const channel = guild.channels.cache.get(channelToNotify);
    if (channel) {
        await channel.send({ embeds: [embed] });
    } else {
        console.error('Welcome channel not found:', channelToNotify);
    }
}

module.exports = {
    sendHandleVerificationMessage,
    handleDMVerificationResponse,
    handleMemberOrGuestJoin,
    handleSimpleJoin,
    handleSimpleWelcomeProspect,
    handleSimpleWelcomeGuest
};