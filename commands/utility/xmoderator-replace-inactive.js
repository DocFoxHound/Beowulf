const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('xmoderator-replace-inactive')
        .setDescription('Replace inactive users with active roles.'),
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

        // Role mapping: inactiveRoleId => activeRoleId
        const roleMap = {
            '1176714013695021157': '1134351702431105084',
            '1299015782780637184': '1134351702431105084',
            '1176713880257437767': '1134352841985773628',
            '1191109098452820121': '1191071030421229689',
            '1175315083665100840': '1034596054529736745',
        };

        // Fetch all members in the guild
        await interaction.guild.members.fetch();
        let changedCount = 0;
        for (const [id, guildMember] of interaction.guild.members.cache) {
            for (const inactiveRoleId of Object.keys(roleMap)) {
                if (guildMember.roles.cache.has(inactiveRoleId)) {
                    const activeRoleId = roleMap[inactiveRoleId];
                    try {
                        await guildMember.roles.remove(inactiveRoleId);
                        await guildMember.roles.add(activeRoleId);
                        changedCount++;
                    } catch (err) {
                        console.error(`Failed to update roles for user ${guildMember.user.tag}:`, err);
                    }
                }
            }
        }

        await interaction.reply(`Replaced roles for ${changedCount} user(s).`);
    }
};