const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { refreshUserlist } = require('../../common/refresh-userlist');
const { newLoadUserList } = require('../../common/refresh-userlist');
const { getUserById } = require('../../api/userlistApi');
const { editUser } = require('../../api/userlistApi');
const { deleteUser } = require('../../api/userlistApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zadmin-replace-user')
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
                content: "You do not have permission to use this command.",
                ephemeral: true 
            });
        }
        try {
            const oldAccount = interaction.options.getUser('old-account');
            const newAccount = interaction.options.getUser('new-account');
            const oldUserData = await getUserById(oldAccount.id);
            const newUserData = await getUserById(newAccount.id);
            const updatedUserData = {
                id: newUserData.id,
                username: newUserData.user.username,
                nickname: newUserData.nickname,
                raptor_1_solo: oldAccount.raptor_1_solo,
                raptor_1_team: oldAccount.raptor_1_team,
                raptor_2_solo: oldAccount.raptor_2_solo,
                raptor_2_team: oldAccount.raptor_2_team,
                raptor_3_solo: oldAccount.raptor_3_solo,
                raptor_3_team: oldAccount.raptor_3_team,
                corsair_1_turret: oldAccount.corsair_1_turret,
                corsair_1_torpedo: oldAccount.corsair_1_torpedo,
                corsair_2_ship_commander: oldAccount.corsair_2_ship_commander,
                corsair_2_wing_commander: oldAccount.corsair_2_wing_commander,
                corsair_3_fleet_commander: oldAccount.corsair_3_fleet_commander,
                raider_1_swabbie: oldAccount.raider_1_swabbie,
                raider_1_linemaster: oldAccount.raider_1_linemaster,
                raider_1_boarder: oldAccount.raider_1_boarder,
                raider_2_powdermonkey: oldAccount.raider_2_powdermonkey,
                raider_2_mate: oldAccount.raider_2_mate,
                raider_3_sailmaster: oldAccount.raider_3_sailmaster
            }
            await editUser(newUserData.id, updatedUserData);
            await deleteUser(oldUserData.id);
            await interaction.reply(`Successfully switched progress from ${oldAccount.username} to ${newAccount.username}.`);
        } catch (error) {
            console.error('Error switching users:', error);
            await interaction.reply('An error occurred while switching users.');
        }
    }
};