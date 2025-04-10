const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { deleteLessonLearned } = require('../../api/lessonsLearnedApi.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xblooded-unlearn')
        .setDescription('Erase a lesson learned from the bot.')
        .addStringOption(option => 
            option.setName('lesson-id')
                .setDescription('use learn-view to get the id of the lesson to remove')
                .setRequired(true)),
    
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        const member = interaction.member;
        const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
        const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
        if(!hasPermission) {
            return interaction.reply({ 
                content: `${interaction.user.username}, you do not have permission to use this command.`,
                ephemeral: false 
            });
        }

        try {
            const result = await deleteLessonLearned(interaction.options.getString('lesson-id'));

            await interaction.reply(`The lesson has been deleted.`);
        } catch (error) {
            console.error('Error deleting a lesson from the bot:', error);
            await interaction.reply('An error occurred while unlearning the bot.');
        }
    }
};