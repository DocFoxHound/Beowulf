const { SlashCommandBuilder } = require('discord.js');
const { checkUserListForUser } = require('../../userlist-functions/userlist-controller.js');
const { progressBar } = require('../../common/progress-bar.js');
const progressEmbed = require('../../common/embeds.js').progressEmbed;
const queueEmbed = require('../../common/embeds.js').queueEmbed;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-status')
        .setDescription('View who is waiting in queue for a class or an assessment.'),
        // .addStringOption(option => 
        //     option.setName('view')
        //         .setDescription('The view to display')
        //         .setRequired(true)
        //         .addChoices(
        //             { name: 'Prestige Category', value: 'prestige' },
        //             { name: 'Each Class/Assessment', value: 'full-layout' },
        //             { name: 'RAPTOR', value: 'raptor' },
        //             { name: 'CORSAIR', value: 'corsair' },
        //             { name: 'RAIDER', value: 'raider' },
        //         )),
                    
    async execute(interaction) {
        try {
            return interaction.reply({ embeds: [await queueEmbed(interaction)]});
        } catch (error) {
            console.error('Error in Queue-Status command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the progress data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    }
};