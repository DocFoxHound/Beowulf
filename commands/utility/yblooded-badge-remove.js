const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { deleteBadge } = require('../../api/badgeApi');
const { getBadgesByUserId } = require('../../api/badgeApi');


module.exports = {
    data: new SlashCommandBuilder().setName('yblooded-badge-remove')
        .setDescription('Remove a badge from a user')
        .addUserOption(option =>
        option
            .setName('target')
            .setDescription('User to remove the badge from')
            .setRequired(true)
        )
        .addStringOption(option =>
        option
            .setName('badge')
            .setDescription('Which badge to remove?')
            .setRequired(true)
            .setAutocomplete(true)
        ),
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        try {
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
            const badges = await getBadgesByUserId(targetUser.id);
            const targetBadge = interaction.options.getString('badge');
            const badge = badges.find(b => b.badge_name === targetBadge);

            const result = await deleteBadge(badge.id);

            await interaction.reply({
                content: `Badge removed from ${targetUser.username}.`,
                ephemeral: false
            });
        } catch (error) {
            console.error('Error fetching badges:', error);
            await interaction.reply('An error occurred while fetching the badges. Please try again later.');
        }
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        // const targetUser = interaction.options.getUser('target');
        const targetOption = interaction.options.get('target');
        let userId;
        if (targetOption?.value) {
            userId = targetOption.value;
        }

        if (focusedOption.name === 'badge') {
            if (!userId) {
                await interaction.respond([]);
                return;
            }
            // Get the user's current input so far
            const focusedValue = interaction.options.getFocused();
            // Get the classes that the user hasn’t taken yet
            const badges = await getBadgesByUserId(userId);
            // Filter based on the current input
            const filtered = badges.filter(b =>
                b.badge_name.toLowerCase().startsWith(focusedValue.toLowerCase())
            );
            // Discord allows up to 25 suggestions
            await interaction.respond(
                filtered.map(b => ({ name: b.badge_name, value: b.badge_name })).slice(0, 25)
            );
        }
    }
};