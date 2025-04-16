const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { createBadge } = require('../../api/badgeApi');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('yblooded-badge-add')
        .setDescription('Add a new badge to a user')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to receive the badge')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('name')
                .setDescription('The name of the badge')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('description')
                .setDescription('The description of the badge. (200 character limit)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('weight')
                .setDescription('The importance of the badge (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)),
    
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        // Check if the user has the required role
        const memberRoles = interaction.member.roles.cache;
        const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
        const hasPermission = moderatorRoles.some(role => memberRoles.has(role));

        if (!hasPermission) {
            return await interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }
        
        const targetUser = interaction.options.getUser('target');
        const badgeName = interaction.options.getString('name');
        const badgeDescription = interaction.options.getString('description');
        const badgeWeight = interaction.options.getInteger('weight');
        

        // Validate the description length
        if (badgeDescription.length > 200) {
            await interaction.reply('The description of the badge must be 200 characters or less.');
            return;
        }

        const generatedId = new Date().getTime();
        // Math.floor(Math.random() * 1000000);

        try {
            const result = await createBadge({
                id: generatedId,
                user_id: targetUser.id,
                badge_name: badgeName,
                badge_description: badgeDescription,
                badge_weight: badgeWeight
            });

            if (result) {
                await interaction.reply(`Badge "${badgeName}" (Weight: ${badgeWeight}) has been added to ${targetUser.username}.`);
            } else {
                await interaction.reply(`Failed to add badge "${badgeName}" to ${targetUser.username}.`);
            }
        } catch (error) {
            console.error('Error adding badge:', error);
            await interaction.reply('An error occurred while adding the badge. Please try again later.');
        }
    }
};