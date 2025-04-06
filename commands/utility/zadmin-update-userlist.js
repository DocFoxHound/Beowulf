const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { refreshUserlist } = require('../../common/refresh-userlist');
const { newLoadUserList } = require('../../common/refresh-userlist');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zadmin-update-db-userlist')
        .setDescription('Admin tool: Updates the userlist in the database')
        .addStringOption(option => 
            option.setName('type')
                .setDescription('Update or New Server Load')
                .setRequired(true)
                .addChoices(
                    { name: 'Update', value: 'update' },
                    { name: 'New Load', value: 'new_server_load' }
                )),
    
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
            const type = interaction.options.getString('type');
            if(type === 'update'){
                const response = await refreshUserlist(client, openai);
                return interaction.reply({ 
                    content: response,
                    ephemeral: true 
                });
            }
            if(type === 'new_server_load'){
                const response = await newLoadUserList(client);
                console.log("Response: ", response)
                return interaction.reply({ 
                    content: response,
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error('Error updating userlist:', error);
            await interaction.reply('An error occurred while updating userlist. Please try again later.');
        }
    }
};