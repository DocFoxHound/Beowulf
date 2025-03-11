const { SlashCommandBuilder } = require('discord.js');
const { queueController } = require('../../queue-functions/queue-controller');
const { getAvailableClasses } = require('../../queue-functions/get-available-classes');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-remove')
        .setDescription('Edit your queue entry')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user whose queue entry to edit.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('class')
                .setDescription('The class to edit in the queue')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Status for removal action')
                .setRequired(false)
                .addChoices(
                    { name: 'Completed', value: 'completed' },
                    { name: 'Not Completed', value: 'not_completed' }
                )),

    async execute(interaction) {
        try {
            // Extract options
            const targetOption = interaction.options.getUser('target');
            const targetUser = targetOption || interaction.user;
            const className = interaction.options.getString('class');
            const action = interaction.options.getString('action');
            const status = interaction.options.getString('status');

            // Validate status is provided when action is 'remove'
            if (action === 'remove' && !status) {
                return interaction.reply({
                    content: 'Status is required when removing a queue entry.',
                    ephemeral: true
                });
            }

            let result;
            if (action === 'edit') {
                // For edit action, trigger the editing update
                result = await queueController(className, targetUser, null, null, true, true);
            } else if (action === 'remove') {
                // For remove action, prepare arguments for removal
                const parsedArgs = {
                    status: status
                };
                result = await queueController(className, targetUser, parsedArgs, null, false, false);
            }

            // Handle the result
            if (result.success) {
                await interaction.reply({
                    content: `Successfully ${action === 'edit' ? 'edited' : 'removed'} queue entry for ${targetUser.username} in ${className}.`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `Error: ${result.message || 'Unknown error occurred.'}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in queue-edit command:', error);
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        }
    },

    async autocomplete(interaction, client, openAi) {
        // Get the user's current input so far
        const focusedValue = interaction.options.getFocused();
        // Get the classes that the user hasn’t taken yet
        const availableClasses = await getAvailableClasses(interaction.user, interaction.guild, "current");
        // Filter based on the current input
        const filtered = availableClasses.filter(c =>
          c.toLowerCase().startsWith(focusedValue.toLowerCase())
        );
        // Discord allows up to 25 suggestions
        await interaction.respond(
          filtered.map(c => ({ name: c, value: c })).slice(0, 25)
        );
      }
};