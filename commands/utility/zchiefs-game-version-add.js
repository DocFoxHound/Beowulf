const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { createGameVersion } = require('../../api/gameVersionApi');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('zchiefs-update-game-version')
        .setDescription('Only use sparsely to update the major game version.')
        .addStringOption(option => 
            option.setName('version')
                .setDescription('WILL RESET TRACKERS')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('season')
                .setDescription('WILL RESET TRACKERS')
                .setRequired(true)),
    
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        const member = interaction.member;
        const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ADMIN_ROLES.split(',') : process.env.TEST_ADMIN_ROLES.split(',');
        const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
        if(!hasPermission) {
            return interaction.reply({ 
                content: `${interaction.user.username}, you do not have permission to use this command.`,
                ephemeral: false 
            });
        }

        const newVersion = interaction.options.getString('version');
        const newSeason = interaction.options.getString('season');

        // Validate the description length
        if (newVersion.length === 0 || newSeason.length === 0) {
            await interaction.reply('One or more required fields were blank, returning.');
            return;
        }

        try {
            const result = await createGameVersion({
                id: new Date().getTime(),
                version: newVersion,
                season: newSeason,
            });
            await interaction.reply(`Game Version updated to: **${newVersion}**, Season: **${newSeason}**. Trackers will now reflect progress made in this patch. Please use this infrequently as it will interfere with progress. It is best to use it once per major update.`);
        } catch (error) {
            console.error('Error adding game version:', error);
            await interaction.reply('An error occurred while adding the game version. Please try again later.');
        }
    }
};