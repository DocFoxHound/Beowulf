const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { createGameVersion } = require('../../api/gameVersionApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zadmin-update-game-version')
        .setDescription('Only use sparsely to update the major game version.')
        .addStringOption(option => 
            option.setName('version')
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
                content: "You do not have permission to use this command.",
                ephemeral: true 
            });
        }

        const newVersion = interaction.options.getString('version');
        

        // Validate the description length
        if (newVersion.length === 0) {
            await interaction.reply('The field was blank, returning.');
            return;
        }

        try {
            const result = await createGameVersion({
                id: new Date().getTime(),
                version: newVersion,
            });
            await interaction.reply(`Game Version updated to: **${newVersion}**, and the trackers will now reflect progress made in this patch. Please use this infrequently as it will interfere with progress. It is best to use it once per major update.`);
        } catch (error) {
            console.error('Error adding game version:', error);
            await interaction.reply('An error occurred while adding the game version. Please try again later.');
        }
    }
};