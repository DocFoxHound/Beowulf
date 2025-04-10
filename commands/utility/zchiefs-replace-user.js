const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { refreshUserlist } = require('../../common/refresh-userlist');
const { newLoadUserList } = require('../../common/refresh-userlist');
const { getUserById } = require('../../api/userlistApi');
const { editUser } = require('../../api/userlistApi');
const { deleteUser } = require('../../api/userlistApi');
const { getClasses } = require('../../api/classApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zchiefs-replace-user')
        .setDescription('Admin tool: Carry progress from old account to new account')
        .addUserOption(option => 
            option.setName('old-account')
                .setDescription('The old user account')
                .setRequired(true))
        .addUserOption(option => 
            option.setName('new-account')
                .setDescription('The new user account')
                .setRequired(true)),
    
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction, client, openai) {
        const member = interaction.member;
        const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ADMIN_ROLES.split(',') : process.env.TEST_ADMIN_ROLES.split(',');
        const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
        if(!hasPermission) {
            return interaction.reply({ 
                content: `${interaction.user.username}, you do not have permission to use this command.`,
                ephemeral: false 
            });
        }
        try {
            const oldAccount = interaction.options.getUser('old-account');
            const newAccount = interaction.options.getUser('new-account');
            const oldUserData = await getUserById(oldAccount.id);
            const newUserData = await getUserById(newAccount.id);

            // Fetch all classes dynamically
            const allClasses = await getClasses();
            const classData = await generateClassData(allClasses); // Organize classes by category

            // Initialize the updatedUserData object
            const updatedUserData = {
                id: newUserData.id,
                username: newUserData.username,
                nickname: newUserData.nickname || null,
                rank: newUserData.rank,
            };

            // Dynamically populate fields for each class category
            for (const [category, classes] of Object.entries(classData)) {
                for (const classObj of classes) {
                    // Add a field for each class in the category
                    updatedUserData[classObj.name] = oldUserData[classObj.name] || false; // Default to false if not completed
                }
            }

            // Update the new user's data and delete the old user
            await editUser(newUserData.id, updatedUserData);
            await deleteUser(oldUserData.id);

            await interaction.reply(`Successfully switched progress from ${oldAccount.username} to ${newAccount.username}.`);
        } catch (error) {
            console.error('Error switching users:', error);
            await interaction.reply('An error occurred while switching users.');
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