const { SlashCommandBuilder } = require('discord.js');
const { updateUserClassStatus, checkUserListForUserById, userlistApi } = require('../../userlist-functions/userlist-controller');
const { getUserById } = require("../../api/userlistApi");
const { queueController } = require('../../queue-functions/queue-controller');
const { queueControllerForSlashCommands } = require('../../queue-functions/queue-controller');
const { logHandler } = require('../../completed-queue-functions/completed-queue-handler');
const { getClasses } = require('../../api/classApi');
const queueApi = require('../../api/queueApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zmoderator-edit-user')
        .setDescription('Edit a user status for a specific class')
        .addStringOption(option => 
            option.setName('target')
                .setDescription('@ the user to edit')
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
                    { name: 'Mark Complete (requires completed_by)', value: 'completed' },
                    { name: 'Mark Incomplete', value: 'not_completed' },
                    { name: 'Add to Queue', value: 'queue_add' },
                    { name: 'Remove from Queue', value: 'queue_remove'}
                ))
        .addUserOption(option =>
            option
                .setName('completed_by')
                .setDescription('Required ONLY for "Mark Complate"')
                .setRequired(false)
            ),
    
    async execute(interaction, client, openai) {
        try {
            // Check if the user has the required permissions
            const target = interaction.options.getString('target').replace(/\D/g, '');
            const targetUser = await getUserById(target);
            const member = interaction.member;
            const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
            const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
            
            if (!hasPermission) {
                return interaction.reply({ 
                    content: `${interaction.user.username}, you do not have permission to use this command.`, 
                    ephemeral: false 
                });
            }
            
            // Extract options
            const className = interaction.options.getString('class');
            const status = interaction.options.getString('status');
            const handler = interaction.options.getUser('completed_by');
            const guild = interaction.guild
            let response = "";
            const classes = await getClasses()
            const classId = classes.find(c => 
                c.name === className || 
                c.alt_name === className || 
                (Array.isArray(c.ai_function_class_names) && c.ai_function_class_names.includes(className))
            ).id;
            
            // Get the user data
            const userData = await checkUserListForUserById(target);
            
            if (!userData) {
                return interaction.reply({ 
                    content: `User ${targetUser.username} not found in the user list.`, 
                    ephemeral: true 
                });
            }
            
            // Update the user's class status
            if (status === 'completed') {
                if(!handler){
                    return interaction.reply({ 
                        content: 'Please include the officer/leader that performed this class or assessment on the player in the "completed_user" field.',
                        ephemeral: true 
                    });
                }
                // Set the class status to completed (true)
                try{
                    await updateUserClassStatus(userData, className, true);
                    await interaction.reply({ 
                        content: "User was marked as completed",
                        ephemeral: true 
                    });
                }catch(error){
                    console.log(`Error in edit-user command: ${error.message}`);
                    return interaction.reply({ 
                        content: response,
                        ephemeral: true 
                    });
                }
                
            } else if (status === 'not_completed') {
                // Set the class status to not completed (false)
                try{
                    await updateUserClassStatus(userData, className, false);
                    return interaction.reply({ 
                        content: "User was marked as incomplete.",
                        ephemeral: true 
                    });
                }catch(error){
                    response = `Error in edit-user command: ${error.message}`;
                    return interaction.reply({ 
                        content: response,
                        ephemeral: true 
                    });
                }
            }else if(status === 'queue_add'){
                await interaction.reply(await queueControllerForSlashCommands(className, targetUser, handler, openai, client, true, null, "other", interaction));
                                                                            //className, targetUser, handler, openai, client, addOrRemove, classStatus, selfOrOther, interaction
            }else if(status === 'queue_remove'){
                const guild = interaction.guild
                await interaction.reply(await queueControllerForSlashCommands(className, targetUser, handler, openai, client, false, null, "other", interaction));
            }
        } catch (error) {
            response = `Error in edit-user command: ${error.message}`;
            return interaction.reply({ 
                content: response,
                ephemeral: true 
            });
        }
    },
    
    async autocomplete(interaction) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            const target = interaction.options.getString('target').replace(/\D/g, '');
            const targetUser = await getUserById(target);
            const queueUserData = await queueApi.getUserById(target);

            let choices = [];

            if (focusedOption.name === 'class') {
                if (!targetUser) {
                    await interaction.respond([]);
                    return;
                }

                // Fetch all classes and generate classData
                const allClasses = await getClasses();
                let classData = await generateClassData(allClasses);
                sortClassesAlphabetically(classData); // Sort classes alphabetically by name


                // Generate queue data for the target user
                await generateQueueDataForUser(targetUser, classData);

                // Format the autocomplete choices
                for (const prestige in classData) {
                    const classes = classData[prestige];
                    for (const classObj of classes) {
                        let inQueueString = "";
                        if(queueUserData[classObj.name] === true){
                            inQueueString = " - In Queue)";
                        }
                        const completionStatus = classObj.completed ? 'Completed' : `Not Completed${inQueueString}`;
                        choices.push({
                            name: `${classObj.name || classObj.name} (${completionStatus})`,
                            value: classObj.name
                        });
                    }
                }

                // Filter choices based on the focused value
                choices = choices
                    .filter(choice =>
                        choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
                    )
                    .slice(0, 25); // Limit to 25 choices
            }

            await interaction.respond(choices);
        } catch (error) {
            console.error('Error in autocomplete function:', error);
            await interaction.respond([]);
        }
    }
};

async function generateClassData(allClasses) {
    const classData = {};
    try {
        for (const log of allClasses) {
            if (!classData[log.prestige_category]) {
                classData[log.prestige_category] = [];
            }

            classData[log.prestige_category].push({
                id: log.id,
                name: log.name,
                alt_name: log.alt_name,
                description: log.description,
                ai_function_class_names: log.ai_function_class_names,
                prerequisites: log.prerequisites,
                thumbnail_url: log.thumbnail_url,
                completed: false,
                value: 0,
                level: log.level
            });
        }
        return classData;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

async function generateQueueDataForUser(targetUser, classData) {
    try {
        for (const prestige in classData) {
            const classes = classData[prestige];
            for (const classObj of classes) {
                // Check if the target user has completed the class
                if (targetUser[classObj.name] === true) {
                    classObj.completed = true;
                } else {
                    classObj.completed = false;
                }
            }
        }
    } catch (error) {
        console.error('Error generating queue data for user:', error);
        return null; // Return null if there's an error
    }
}

function sortClassesAlphabetically(classData) {
    for (const prestige in classData) {
        classData[prestige].sort((a, b) => a.name.localeCompare(b.name));
    }
}