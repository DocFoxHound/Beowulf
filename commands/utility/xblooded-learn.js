const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { createLessonLearned } = require('../../api/lessonsLearnedApi.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xblooded-learn')
        .setDescription('Teaches the bot something that it should remember. Be sure to remove previous contradictory lessons.')
        .addStringOption(option => 
            option.setName('lesson')
                .setDescription('What the bot should remember')
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

        const newLesson = interaction.options.getString('lesson');
        

        // Validate the description length
        if (newLesson.length === 0) {
            await interaction.reply('The field was blank, returning.');
            return;
        }

        try {
            const result = await createLessonLearned({
                id: new Date().getTime(),
                user_id: interaction.user.id,
                username: interaction.member.nickname || interaction.user.username,
                lesson: newLesson,
            });
            await interaction.reply(`The lesson has been uploaded.`);
        } catch (error) {
            console.error('Error teaching the bot:', error);
            await interaction.reply('An error occurred while teaching the bot.');
        }
    }
};