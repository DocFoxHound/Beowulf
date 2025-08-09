const { ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { verifyUser } = require('../functions/verify-user');
const { notifyJoinMemberWelcome, notifyJoinGuestWelcome } = require('./bot-notify');
const { getUserById, editUser } = require('../api/userlistApi');

// Track verification attempts and DM message in memory (per process)
const verificationAttempts = {};
const verificationDMs = {};

function getGuild(client) {
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    return client.guilds.cache.get(guildId);
}

// Function to show the Handle Verification Modal
async function showHandleVerificationModal(interaction) {
    const dbUser = await getUserById(interaction.user.id);
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const verificationCode = dbUser.verification_code;
    const instructions = `Go to your RSI Profile Settings (https://robertsspaceindustries.com/en/account/profile) and put the following verification code into your 'Bio' section: \n\n${verificationCode}`;

    const modal = new ModalBuilder()
        .setCustomId('handle_verification_modal')
        .setTitle('Handle Verification');

    // Instructions field (read-only)
    const instructionsInput = new TextInputBuilder()
        .setCustomId('verification_instructions')
        .setLabel('Instructions')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(instructions)
        .setRequired(false);

    const handleInput = new TextInputBuilder()
        .setCustomId('rsi_handle_input')
        .setLabel('RSI Handle or profile link')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const instructionsRow = new ActionRowBuilder().addComponents(instructionsInput);
    const handleRow = new ActionRowBuilder().addComponents(handleInput);
    modal.addComponents(instructionsRow, handleRow);

    await interaction.showModal(modal);
}

// Handles modal submission for handle_verification_modal
async function handleVerificationModalSubmit(interaction, client, openai) {
    const dbUser = await getUserById(interaction.user.id);
    let alreadyReplied = false;
    let rsiHandleRaw = interaction.fields.getTextInputValue('rsi_handle_input');
    let rsiHandle = rsiHandleRaw;
    // If input is a URL, extract handle from the end
    const urlPattern = /robertsspaceindustries\.com\/en\/citizens\/([A-Za-z0-9_-]+)/i;
    const match = rsiHandleRaw.match(urlPattern);
    if (match && match[1]) {
        rsiHandle = match[1];
    }
    rsiHandle = rsiHandle.trim();

    // Build profile URL
    const profileUrl = `https://robertsspaceindustries.com/en/citizens/${rsiHandle}`;

    // Fetch HTML from profile URL
    let html = '';
    try {
        const res = await fetch(profileUrl);
        html = await res.text();
    } catch (fetchErr) {
        console.error('Error fetching RSI profile:', fetchErr);
        await interaction.reply({
            content: `Could not fetch RSI profile for handle "${rsiHandle}". Please check the handle and try again.`,
            ephemeral: true
        });
        alreadyReplied = true;
    }

    if (!alreadyReplied) {
        // Search for verification code in HTML
        const found = html.includes(dbUser.verification_code);
        try {
            if (found) {
                await interaction.reply({
                    content: `Success! Your verification code was found on your RSI profile. Click either of the buttons below to join as a Member of IronPoint, or a friendly Guest!`,
                    ephemeral: true
                });
                    // Send follow-up ephemeral message with buttons
                    const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
                    const memberButton = new ButtonBuilder()
                        .setCustomId('join_member')
                        .setLabel('Join as Member')
                        .setStyle(ButtonStyle.Primary);

                    const guestButton = new ButtonBuilder()
                        .setCustomId('join_guest')
                        .setLabel('Join as Guest')
                        .setStyle(ButtonStyle.Secondary);

                    const row = new ActionRowBuilder().addComponents(memberButton, guestButton);
                    await interaction.followUp({
                        content: 'Choose your onboarding type:',
                        components: [row],
                        ephemeral: true
                    });
            } else {
                await interaction.reply({
                    content: `Verification failed. Your code was not found on your RSI profile. Please ensure you have added it to your Bio and try again.`,
                    ephemeral: true
                });
            }
        } catch (err) {
            // If reply fails, log error but do not try to reply again
            console.error('Error handling verification modal submit:', err);
        }
    }
}

async function handleJoinButtonInteraction(interaction, client, openai) {
    const dbUser = await getUserById(interaction.user.id);
    if (!dbUser) {
        await interaction.reply({
            content: 'User not found in database. Please contact an admin.',
            ephemeral: true
        });
        return;
    }

    // Get role IDs from .env
    const NEW_USER_ROLE = process.env.LIVE_ENVIRONMENT === "true" ? process.env.NEW_USER_ROLE : process.env.TEST_NEW_USER_ROLE;
    const APPLICATION_PENDING_ROLE = process.env.LIVE_ENVIRONMENT === "true" ? process.env.APPLICATION_PENDING_ROLE : process.env.TEST_APPLICATION_PENDING_ROLE;
    const FRIENDLY_PENDING_ROLE = process.env.LIVE_ENVIRONMENT === "true" ? process.env.FRIENDLY_PENDING_ROLE : process.env.TEST_FRIENDLY_ROLE;

    const guild = interaction.guild || client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID);
    const member = guild.members.cache.get(interaction.user.id);

    if (!member) {
        await interaction.reply({
            content: 'Could not find your guild member record. Please contact an admin.',
            ephemeral: true
        });
        return;
    }

    // Remove NEW_USER_ROLE
    if (member.roles.cache.has(NEW_USER_ROLE)) {
        await member.roles.remove(NEW_USER_ROLE).catch(() => {});
    }

    if (interaction.customId === 'join_member') {
        // Add APPLICATION_PENDING_ROLE
        await member.roles.add(APPLICATION_PENDING_ROLE).catch(() => {});
        await notifyJoinMemberWelcome(dbUser, client, openai);
        await interaction.reply({
            content: 'Welcome! You have joined as a Member of IronPoint. Enjoy your stay!',
            ephemeral: true
        });
    } else if (interaction.customId === 'join_guest') {
        // Add FRIENDLY_PENDING_ROLE
        await member.roles.add(FRIENDLY_PENDING_ROLE).catch(() => {});
        await notifyJoinGuestWelcome(dbUser, client, openai);
        await interaction.reply({
            content: 'Welcome! You have joined as a Guest. Enjoy your stay and feel free to ask questions!',
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: 'Unknown onboarding option. Please try again.',
            ephemeral: true
        });
    }
}

module.exports = {
    showHandleVerificationModal,
    handleVerificationModalSubmit,
    handleJoinButtonInteraction
};