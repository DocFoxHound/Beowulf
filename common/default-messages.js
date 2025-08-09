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
        // Post the embed if not found
        const embed = {
            title: verificationStepOneTitle,
            description: "Please click the button below to verify your RSI handle and complete onboarding.",
            color: 0x3498db
        };
        let userId = client.user ? client.user.id : "unknown";
        const button = new ButtonBuilder()
            .setCustomId(`open_handle_verification_modal_${userId}`)
            .setLabel('Verify RSI Handle')
            .setStyle(1); // Primary
        const row = new ActionRowBuilder().addComponents(button);
        await channel.send({ embeds: [embed], components: [row] });
    }
    return found;
}

module.exports = {
    channelMessagesCheck,
};