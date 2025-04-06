const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { createShipLog } = require('../../api/shipLogApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getPlayerShipsByUserId, getPlayerShipByEntryId } = require('../../api/playerShipApi');
const { getAllCommodities } = require('../../api/uexApi');

const command = new SlashCommandBuilder()
    .setName('hit-tracker-add')
    .setDescription('Log a Pirate Hit in the Tracker.')
    .addStringOption(option =>
        option.setName('assists')
            .setDescription('@ the players who assisted this hit.')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('cargo-1')
            .setDescription('Select the cargo.')
            .setRequired(true)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-1')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('cargo-2')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-2')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-3')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-3')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-4')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-4')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-5')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-5')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-6')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-6')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('cargo-7')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-7')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-8')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-8')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-9')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-9')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-10')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-10')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-11')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-11')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-12')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-12')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-13')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-13')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-14')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-14')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-15')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addNumberOption(option => 
        option.setName('amount-15')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    ;
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        //do logic here
        
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
        const allCommodities = await getAllCommodities(); // Fetch all ships
        const allItems = await getAllItems(); // Fetch all ships
        const allCargo = [...allCommodities, ...allItems]; // Combine all items

        if (optionName.includes('cargo')) {
            const allCargoListed = allCargo.map(cargo => ({
                name: `${cargo.name} (${cargo.price_sell === 0 ? cargo.price_buy : cargo.price_sell}aUEC)`, // Include both ship name and model in the name
                value: ship.id // Use ship name as the value
            }));

            // Filter ships based on the focused value
            const filtered = allCargoListed.filter(cargo =>
                cargo.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            // Respond with up to 25 suggestions
            await interaction.respond(filtered.slice(0, 25));
        }
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}