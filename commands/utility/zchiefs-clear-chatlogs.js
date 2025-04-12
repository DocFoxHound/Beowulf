const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('zchiefs-clear-chatlogs')
        .setDescription("Admin tool: Clears the chat logs in the bot's database."),
    
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
        
        try{
            const list = await openai.files.list();
            const vectorFiles = await openai.beta.vectorStores.files.list(process.env.VECTOR_STORE);
            for(const file of list.data){
                console.log(file.id);
                await openai.files.del(file.id);
            }
            for(const vectorFile of vectorFiles.data){
                console.log(vectorFile.id);
                await openai.beta.vectorStores.files.del(process.env.VECTOR_STORE, vectorFile.id);
            }
            return interaction.reply({ 
                content: "Chatlogs successfully cleared.",
                ephemeral: true 
            });
        }catch(error){
            console.error('Error clearing chat logs:', error);
            return interaction.reply({ 
                content: "There was an issue clearing chat logs.",
                ephemeral: true 
            });
        }
    }
};