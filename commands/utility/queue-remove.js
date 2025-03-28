const { SlashCommandBuilder } = require('discord.js');
const { queueControllerForSlashCommands } = require('../../queue-functions/queue-controller');
const { getAvailableClasses } = require('../../queue-functions/get-available-classes');
const { getUsersInQueue } = require('../../api/queueApi');  
const { getUsers } = require("../../api/userlistApi"); 
// const { getQueueUsers } = require('../../queue-functions/get-queue-users'); // Add this import

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-remove')
        .setDescription('Edit your queue entry')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('The user whose queue entry to edit. (only yourself if not a moderator)')
                .setRequired(true)
                .setAutocomplete(true)) // Enable autocomplete for users
        .addStringOption(option =>
            option.setName('class')
                .setDescription('The class to edit in the queue')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Status for removal action. (moderator only)')
                .setRequired(false)
                .addChoices(
                    { name: 'Completed', value: 'completed' },
                    { name: 'Not Completed', value: 'not_completed' }
                ))
        .addUserOption(option => 
            option.setName('handler')
                .setDescription('The user who handled the ticket (moderator only)')
                .setRequired(false)),

    async execute(interaction, openai, client) {
        try {
            // Check if the user has the required role
            const memberRoles = interaction.member.roles.cache;
            const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
            const hasPermission = moderatorRoles.some(role => memberRoles.has(role));

            // if (!hasPermission) {
            //     return await interaction.reply({
            //         content: 'You do not have permission to use this command.',
            //         ephemeral: true
            //     });
            // }

            // Extract options
            const targetOption = interaction.options.getString('target');
            const handlerUser = !hasPermission ? null : interaction.options.getUser('handler');
            const allUsers = await getUsers();
            const targetUser = allUsers.find(
                user => user.id === targetOption || user.username === targetOption || user.nickname === targetOption
              ) || null;
            const className = interaction.options.getString('class');
            const selfOrOther = !hasPermission ? "self" : "other";
            const addOrRemove = false;
            const classStatus = !hasPermission ? "not_completed" : interaction.options.getString('status');
            const result = await queueControllerForSlashCommands(className, targetUser, handlerUser,  openai, client, addOrRemove, classStatus, selfOrOther, interaction);

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
            // if not a moderator, then only show the person's name
            // Check if the user has the required permissions
            const member = interaction.member;
            const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
            const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
            if(!hasPermission){
                // Filter the target if they are not a mod, to just showing themself
                const filteredUsers = queueUsers.filter(user =>
                    user.username.toLowerCase() === member.user.username.toLowerCase()
                );
                // Respond with the filtered users
                await interaction.respond(
                    filteredUsers.map(user => ({ name: user.username, value: user.id })).slice(0, 25)
                );
                return
            }else{
                // Filter based on the current input
                const filteredUsers = queueUsers.filter(user =>
                    user.username.toLowerCase().startsWith(focusedOption.value.toLowerCase())
                );
                // Respond with the filtered users
                await interaction.respond(
                    filteredUsers.map(user => ({ name: user.username, value: user.id })).slice(0, 25)
                );
            }
        } else if (focusedOption.name === 'class') {
            // Get the user's current input so far
            const focusedValue = interaction.options.getFocused();
            // Get the classes that the user hasn’t taken yet
            targetOption = interaction.options.getString('target');
            const allUsers = await getUsers();
            const targetUser = allUsers.find(
                user => user.id === targetOption || user.username === targetOption || user.nickname === targetOption
              ) || null;
            const availableClasses = await getAvailableClasses(targetUser, interaction.guild, "current");
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