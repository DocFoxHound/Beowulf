const { SlashCommandBuilder } = require('discord.js');
const { getAvailableClasses } = require('../../queue-functions/get-available-classes');
const { updateUserClassStatus, checkUserListForUser, userlistApi } = require('../../userlist-functions/userlist-controller');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit-user')
        .setDescription('Edit a user status for a specific class')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to edit')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('class')
                .setDescription('The class to update')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option => 
            option.setName('status')
                .setDescription('The completion status')
                .setRequired(true)
                .addChoices(
                    { name: 'Mark Complete', value: 'completed' },
                    { name: 'Mark Incomplete', value: 'not_completed' },
                    { name: 'Add to Queue', value: 'queue_add' }
                )),
    
    async execute(interaction) {
        try {
            // Check if the user has the required permissions
            const member = interaction.member;
            const moderatorRoles = process.env.MODERATORS_ROLES.split(',');
            const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
            
            if (!hasPermission) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    ephemeral: true 
                });
            }
            
            // Extract options
            const targetUser = interaction.options.getUser('target');
            const className = interaction.options.getString('class');
            const status = interaction.options.getString('status');
            
            // Get the user data
            const userData = await checkUserListForUser(targetUser.id);
            
            if (!userData) {
                return interaction.reply({ 
                    content: `User ${targetUser.username} not found in the user list.`, 
                    ephemeral: true 
                });
            }
            
            // Update the user's class status
            if (status === 'completed') {
                // Set the class status to completed (true)
                await updateUserClassStatus(userData, className);
                
                await interaction.reply({ 
                    content: `Successfully marked class "${className}" as completed for ${targetUser.username}.`,
                    ephemeral: true 
                });
            } else {
                // Set the class status to not completed (false)
                // Find the class in the user's data and set it to false
                if (!userData.classes) {
                    userData.classes = {};
                }
                
                userData.classes[className] = false;
                
                // Save the updated user data
                await userlistApi.editUser(userData);
                
                await interaction.reply({ 
                    content: `Successfully marked class "${className}" as not completed for ${targetUser.username}.`,
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.log(`Error in edit-user command: ${error.message}`);
            return interaction.reply({ 
                content: 'An error occurred while executing this command. Please try again later.',
                ephemeral: true 
            });
        }
    },
    
    async autocomplete(interaction) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            let choices = [];
            
            if (focusedOption.name === 'class') {
                // Get available classes
                const availableClasses = await getAvailableClasses(interaction.user, interaction.guild, "all");
                
                // Filter classes based on the focused value
                choices = availableClasses
                    .filter(className => 
                        className.toLowerCase().includes(focusedOption.value.toLowerCase())
                    )
                    .map(className => ({
                        name: className,
                        value: className
                    }))
                    .slice(0, 25); // Limit to 25 choices
            }
            
            await interaction.respond(choices);
        } catch (error) {
            console.log(`Error in edit-user autocomplete: ${error.message}`);
            await interaction.respond([]);
        }
    }
};