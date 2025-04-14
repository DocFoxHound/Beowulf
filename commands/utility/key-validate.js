const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto'); // For generating the API key
const { validateKey } = require('../../api/keyApi.js'); // Import the function to save the key in the database

module.exports = {
    data: new SlashCommandBuilder()
        .setName('key-validate')
        .setDescription('Check that your API key is valid.')
        .addStringOption(option => 
            option.setName('key')
                .setDescription('The 32 digit key')
                .setRequired(true)),

    async execute(interaction) {
        try {
            // Generate a random API key
            const apiKey = interaction.options.getString('key');
            const result = await validateKey(apiKey); // Call the function to save the key in the database
            if (result) {
                // Send the API key to the user as an ephemeral message
                await interaction.reply({
                    content: `Key validated, **${result.username}!**`,
                    ephemeral: true
                });
            } else {
                throw new Error('Failed to validate the API key in the database.');
            }
        } catch (error) {
            console.error('Error validating API key:', error);
            await interaction.reply({
                content: 'An error occurred while validating your API key. Please try again later.',
                ephemeral: true
            });
        }
    }
};