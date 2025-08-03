const { SlashCommandBuilder } = require('discord.js');
const { verifyUser } = require('../../functions/verify-user.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify-handle')
        .setDescription('Verify your RSI handle or dossier link.')
        .addStringOption(option =>
            option.setName('input')
                .setDescription('Your RSI handle or link to your dossier')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const input = interaction.options.getString('input');
            // Extract handle from input
            let handle = input;
            // Remove URL parts if present
            const match = input.match(/(?:citizens\/)([A-Za-z0-9_-]+)/i);
            if (match) {
                handle = match[1];
            } else {
                // If input is just the handle, use as is
                handle = input.replace(/[^A-Za-z0-9_-]/g, '');
            }
            const userId = interaction.user.id;
            const replyMsg = await verifyUser(handle, userId);
            await interaction.reply({
                content: replyMsg,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error verifying handle:', error);
            await interaction.reply({
                content: 'An error occurred while verifying your handle. Please try again later.',
                ephemeral: true
            });
        }
    }
};