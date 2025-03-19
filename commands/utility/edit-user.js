const { SlashCommandBuilder } = require('discord.js');
const { getAvailableClasses } = require('../../queue-functions/get-available-classes');
const { updateUserClassStatus, checkUserListForUser, userlistApi } = require('../../userlist-functions/userlist-controller');
const { queueController } = require('../../queue-functions/queue-controller');
const { logHandler } = require('../../completed-queue-functions/completed-queue-handler');

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
                    { name: 'Add player to Queue', value: 'queue_add' },
                    { name: 'Remove player from a Queue', value: 'queue_remove'}
                ))
        .addUserOption(option =>
            option
                .setName('completed_by')
                .setDescription('Required ONLY for "Mark Complate"')
                .setRequired(true)
            ),
    
    async execute(interaction, client, openai) {
        try {
            // Check if the user has the required permissions
            const member = interaction.member;
            const moderatorRoles = process.env.MODERATOR_ROLES.split(',');
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
            const completedBy = interaction.options.getUser('completed_by');
            const guild = interaction.guild
            
            // Get the user data
            const userData = await checkUserListForUser(targetUser);
            
            if (!userData) {
                return interaction.reply({ 
                    content: `User ${targetUser.username} not found in the user list.`, 
                    ephemeral: true 
                });
            }
            
            // Update the user's class status
            if (status === 'completed') {
                if(!completedBy){
                    return interaction.reply({ 
                        content: 'Please include the officer/leader that performed this class or assessment on the player in the "completed_user" field.',
                        ephemeral: true 
                    });
                }
                // Set the class status to completed (true)
                try{
                    await updateUserClassStatus(userData, className, true);
                    await logHandler(userData, completedBy, className, true);
                    try{
                        await queueController(className, targetUser, openai, client, false, true, "completed", guild);
                    }catch(e){
                        console.log(`The user may not be in a queue: `, e.message)
                    }
                }catch(error){
                    console.log(`Error in edit-user command: ${error.message}`);
                    return interaction.reply({ 
                        content: 'An error occurred while executing this command. Please try again later.',
                        ephemeral: true 
                    });
                }
                await interaction.reply({ 
                    content: `Successfully marked class "${className}" as completed for ${targetUser.username}.`,
                    ephemeral: true 
                });
            } else if (status === 'not_completed') {
                // Set the class status to not completed (false)
                try{
                    try{
                        await queueController(className, targetUser, openai, client, false, true, "not_completed", guild);
                    }catch(e){
                        console.log(`The user may not be in a queue: `, e.message)
                    }
                    await updateUserClassStatus(userData, className, false);
                }catch(error){
                    console.log(`Error in edit-user command: ${error.message}`);
                    return interaction.reply({ 
                        content: 'An error occurred while executing this command. Please try again later.',
                        ephemeral: true 
                    });
                }
                await interaction.reply({ 
                    content: `Successfully marked class "${className}" as not completed for ${targetUser.username}.`,
                    ephemeral: true 
                });
            }else if(status === 'queue_add'){
                await interaction.reply(await queueController(className, interaction.user, openai, client, true, true));
            }else if(status === 'queue_remove'){
                const guild = interaction.guild
                await interaction.reply(await queueController(className, interaction.user, openai, client, false, true, "not_completed", guild));
                //runOrClassName, messageOrUser, openai, client, addToQueue, slashCommand, classCompletedOrIncomplete, guild
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