const { SlashCommandBuilder } = require('discord.js');
const { queueController } = require('../../queue-functions/queue-controller');
const { getAvailableClasses } = require('../../queue-functions/get-available-classes');
const { getUsersInQueue } = require('../../api/queueApi');  
// const { getQueueUsers } = require('../../queue-functions/get-queue-users'); // Add this import

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-remove')
        .setDescription('Edit your queue entry')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('The user whose queue entry to edit.')
                .setRequired(true)
                .setAutocomplete(true)) // Enable autocomplete for users
        .addStringOption(option =>
            option.setName('class')
                .setDescription('The class to edit in the queue')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Status for removal action')
                .setRequired(true)
                .addChoices(
                    { name: 'Completed', value: 'completed' },
                    { name: 'Not Completed', value: 'not_completed' }
                )),

    async execute(interaction, openai, client) {
        try {
            // Check if the user has the required role
            const memberRoles = interaction.member.roles.cache;
            const moderatorRoles = process.env.MODERATOR_ROLES.split(',');
            const hasPermission = moderatorRoles.some(role => memberRoles.has(role));

            if (!hasPermission) {
                return await interaction.reply({
                    content: 'You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            // Extract options
            const targetOption = interaction.options.getString('target');
            //need to convert target (username) into user object
            const guild = interaction.guild
            // Now search by username (case-insensitive)
            const usernameToFind = targetOption;
            const members = await guild.members.fetch();
            const foundMember = members.find(
            member => member.user.username.toLowerCase() === usernameToFind.toLowerCase()
            );
            const targetUser = foundMember || interaction.user;
            const className = interaction.options.getString('class');
            const action = interaction.options.getString('action');
            const status = interaction.options.getString('status');

            const parsedArgs = {
                status: status
            };
            const result = await queueController(className, targetUser, openai, client, false, true, parsedArgs, guild);
            // runOrClassName, messageOrUser, openai, client, addToQueue, slashCommand, classCompletedOrIncomplete, guild

            await interaction.reply({
                content: result,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in queue-edit command:', error);
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        }
    },

    async autocomplete(interaction, client, openAi) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'target') {
            // Get the users that are in the queue
            const queueUsers = await getUsersInQueue();
            // Filter based on the current input
            const filteredUsers = queueUsers.filter(user =>
                user.username.toLowerCase().startsWith(focusedOption.value.toLowerCase())
            );
            // Respond with the filtered users
            await interaction.respond(
                filteredUsers.map(user => ({ name: user.username, value: user.id })).slice(0, 25)
            );
        } else if (focusedOption.name === 'class') {
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
    }
};