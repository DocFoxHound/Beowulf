const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { refreshUserlist } = require('../../common/refresh-userlist');
const { newLoadUserList } = require('../../common/refresh-userlist');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zchiefs-update-db-userlist')
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
        if (hasPermission === false) {
            return interaction.reply({ 
                content: `${interaction.user.username}, you do not have permission to use this command.`,
                ephemeral: true 
            });
        }

        try {
            const type = interaction.options.getString('type');

            // Defer the reply to allow time for the operation
            await interaction.deferReply({ ephemeral: true });

            let response = '';
            if (type === 'update') {
                response = await refreshUserlist(client, openai);
            } else if (type === 'new_server_load') {
                response = await newLoadUserList(client);
            }

            // Edit the deferred reply with the response
            await interaction.editReply({ content: response });
        } catch (error) {
            console.error('Error updating userlist:', error);

            // Edit the deferred reply with an error message
            if (interaction.deferred) {
                await interaction.editReply('An error occurred while updating the userlist. Please try again later.');
            } else {
                await interaction.reply({
                    content: 'An error occurred while updating the userlist. Please try again later.',
                    ephemeral: true
                });
            }
        }
    }
};