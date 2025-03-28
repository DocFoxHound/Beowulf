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
        try {
            const type = interaction.options.getString('type');
            if(type === 'update'){
                const response = await refreshUserlist(client, openai);
                console.log("Response: ", response)
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
            console.error('Error adding badge:', error);
            await interaction.reply('An error occurred while adding the badge. Please try again later.');
        }
    }
};