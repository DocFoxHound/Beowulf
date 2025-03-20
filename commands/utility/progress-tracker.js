const { SlashCommandBuilder } = require('discord.js');
const { checkUserListForUser } = require('../../userlist-functions/userlist-controller.js');
const { progressBar } = require('../../common/progress-bar.js');
const progressEmbed = require('../../common/embeds.js').progressEmbed;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('progress-tracker')
        .setDescription('View your promotion progress across RAPTOR, CORSAIR, and RAIDER assessments')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The user to check progress for')
                .setRequired(true)
            ),
    
    async execute(interaction) {
        try {
            // Fetch user data
            const targetUser = interaction.options.getUser('target');
            const userData = await checkUserListForUser(targetUser);
            
            if (!userData) {
                return interaction.reply({
                    content: 'The specified user is not registered in our database. Please contact an administrator for assistance.',
                    ephemeral: true
                });
            }
            return interaction.reply({ embeds: [await progressEmbed(targetUser, userData)]});
            
        } catch (error) {
            console.error('Error in progress-tracker command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the progress data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    }
};