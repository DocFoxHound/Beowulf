const { ButtonBuilder, ActionRowBuilder } = require('discord.js');

async function channelMessagesCheck(client, openai) {
    // Always check joinIronPointChannel for the embed titled 'Step 1: DoubleCounter Verification'
    const joinIronPointChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.JOIN_IRONPOINT_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const verificationStepOneTitle = "Step 2: RSI Handle Verification";
    const channel = await client.channels.fetch(joinIronPointChannel);
    if (!channel || !channel.isTextBased()) return null;
    // Fetch recent messages (adjust limit as needed)
    const messages = await channel.messages.fetch({ limit: 50 });
    let found = false;
    for (const msg of messages.values()) {
        if (msg.author.id === client.user.id && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                if (embed.title === verificationStepOneTitle) {
                    found = true;
                    break;
                }
            }
        }
        if (found) break;
    }
    if (!found) {
        await verificationStepTwo(client);
    }
    return found;
}

async function verificationStepTwo(){
    // You must pass client to this function when calling it
    // Example: await verificationStepOne(client)
    const joinIronPointChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.JOIN_IRONPOINT_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const embedTitle = "Step 2: RSI Handle Verification";
    // Assume client is available in scope or passed as argument
    // If not, adjust as needed
    if (typeof arguments[0] !== 'object' || !arguments[0].channels) {
        throw new Error('Client must be passed as the first argument to verificationStepOne');
    }
    const client = arguments[0];
    const foundMsg = await channelMessagesCheck(client, joinIronPointChannel, embedTitle);
    if (!foundMsg) {
        const channel = await client.channels.fetch(joinIronPointChannel);
        if (!channel || !channel.isTextBased()) return;
        const embed = {
            title: embedTitle,
            description: "Please click the button below to verify your RSI handle and complete onboarding.",
            color: 0x3498db
        };
        // Create button to open modal, customId includes user ID
        // If user context is not available, use a generic customId
        let userId = client.user ? client.user.id : "unknown";
        const button = new ButtonBuilder()
            .setCustomId(`open_handle_verification_modal_${userId}`)
            .setLabel('Verify RSI Handle')
            .setStyle(1); // Primary
        const row = new ActionRowBuilder().addComponents(button);
        await channel.send({ embeds: [embed], components: [row] });
    }
}

module.exports = {
    channelMessagesCheck,
    verificationStepTwo,
};