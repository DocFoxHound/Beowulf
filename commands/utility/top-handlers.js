const { SlashCommandBuilder } = require('discord.js');
const { checkUserListForUser } = require('../../userlist-functions/userlist-controller.js');
const progressEmbed = require('../../common/embeds.js').progressEmbed;
const { topHandlers } = require('../../common/embeds.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-top-handlers')
        .setDescription('See who has handled the most queue entries in the server.')
        .addStringOption(option =>
            option.setName('timeframe')
                .setDescription('This quarter or all time?')
                .setRequired(true)
                .addChoices(
                    { name: 'This Quarter', value: 'this-quarter' },
                    { name: 'Last Quarter', value: 'last-quarter' },
                    { name: 'All time', value: 'all' }
                )),
    
    async execute(interaction, client) {
        try {
            // Fetch user data
            const timeframe = interaction.options.getString('timeframe');
            return interaction.reply({ embeds: [await topHandlers(client, interaction, timeframe)]});
        } catch (error) {
            console.error('Error in progress-tracker command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the progress data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    }
};