const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto'); // For generating the API key
const { createKey } = require('../../api/keyApi.js'); // Import the function to save the key in the database

module.exports = {
    data: new SlashCommandBuilder()
        .setName('key-create')
        .setDescription('Generate a new API key for the user.'),

    async execute(interaction) {
        try {
            // Generate a random API key
            const apiKey = crypto.randomBytes(16).toString('hex'); // 32-character hexadecimal key
            console.log('Generated API key:', apiKey);
            // Save the API key to the database
            const parentId = new Date().getTime()
            const now = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            const formattedDate = now.toISOString();
            const userId = interaction.user.id;
            const username = interaction.user.username;
            const keyData = {
                id: parentId,
                key: apiKey,
                user_id: interaction.user.id,
                username: interaction.user.username,
                created_at: new Date(),
                expires_at: formattedDate, // Set expiration date to 30 days from now
                player_name: null
            };
            const result = await createKey(keyData); // Call the function to save the key in the database

            if (result) {
                // Send the API key to the user as an ephemeral message
                await interaction.reply({
                    content: `Your new API key has been generated:\n\`\`\`${apiKey}\`\`\`\nKeep it safe!`,
                    ephemeral: true
                });
            } else {
                throw new Error('Failed to save the API key to the database.');
            }
        } catch (error) {
            console.error('Error generating API key:', error);
            await interaction.reply({
                content: 'An error occurred while generating your API key. Please try again later.',
                ephemeral: true
            });
        }
    }
};