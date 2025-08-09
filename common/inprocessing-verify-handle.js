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

async function messageUserForHandle(client, openai, member) {
    const joinIronPointChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.JOIN_IRONPOINT_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const channel = await client.channels.fetch(joinIronPointChannel);
    if (!channel) {
        console.error('Could not find joinIronPointChannel:', joinIronPointChannel);
        return;
    }

    // Create button to open modal, customId includes user ID
    const userId = member.user ? member.user.id : member.id;
    const button = new ButtonBuilder()
        .setCustomId(`open_handle_verification_modal_${userId}`)
        .setLabel('Verify RSI Handle')
        .setStyle(1); // Primary

    const row = new ActionRowBuilder().addComponents(button);

    // Send ephemeral message to the user in the channel
    await channel.send({
        content: `${member}, please verify your RSI handle to complete onboarding.`,
        ephemeral: true,
        components: [row],
    });
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
        try {
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
                return;
            }

            // Search for verification code in HTML
            const found = html.includes(dbUser.verification_code);
            if (found) {
                await interaction.reply({
                    content: `Success! Your verification code was found on your RSI profile. Welcome aboard!`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `Verification failed. Your code was not found on your RSI profile. Please ensure you have added it to your Bio and try again.`,
                    ephemeral: true
                });
            }
        } catch (err) {
            console.error('Error handling verification modal submit:', err);
            await interaction.reply({
                content: 'There was an error processing your verification. Please try again or contact an admin.',
                ephemeral: true
            });
        }
}

module.exports = {
    messageUserForHandle,
    showHandleVerificationModal,
    handleVerificationModalSubmit,
};