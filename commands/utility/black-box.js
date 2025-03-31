const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { createBadge } = require('../../api/badgeApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('black-box')
        .setDescription('Add a new badge to a user')
        .addStringOption(option => 
            option.setName('ship')
                .setDescription('The ship used for the kill')
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
        

        try {

        } catch (error) {
            console.error('Error adding Black Box entry:', error);
            await interaction.reply('An error occurred while adding to the Black Box. Please try again later.');
        }
    }
};