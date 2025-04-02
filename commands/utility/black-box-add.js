const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { createBlackBox } = require('../../api/blackBoxApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');

const command = new SlashCommandBuilder()
    .setName('black-box-add')
    .setDescription('Add a kill log for your ship to the Black Box.')
    .addStringOption(option => 
        option.setName('ship-used')
            .setDescription('The ship used for the kill')
            .setRequired(true)
            .setAutocomplete(true)) // Enable autocomplete
    .addStringOption(option => 
        option.setName('ship-killed')
            .setDescription('The type of ship you killed (only one per entry)')
            .setRequired(true)
            .setAutocomplete(true)) // Enable autocomplete
    .addIntegerOption(option => 
        option.setName('kills')
            .setDescription('The number of victims in the kill.')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('victims')
            .setDescription('The names of the victim SEPARATED BY A COMMA, if known.')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('assists')
            .setDescription('@ the players who assisted in the kill. (leave blank for none)')
            .setRequired(false));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the chosen class name from the command options
        const shipUsed = interaction.options.getString('ship-used');
        const shipKilled = interaction.options.getString('ship-killed');
        const killAmount = interaction.options.getInteger('kills');
        const victimNames = interaction.options.getString('victims');
        const victimNamesArray = victimNames.split(',').map(name => name.trim()); // Split by comma and trim whitespace
        const allShips = await getAllShips(); // Fetch all ships
        const shipKilledObject = allShips.find(ship => ship.ship === shipKilled);
        const avgPrice = shipKilledObject.avg_price || 0;
        const patches = await getAllGameVersions();
        const assistsRaw = interaction.options.getString('assists');
        const assistedPlayers = assistsRaw
            ? assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
            : [];
        const numberAssisted = assistedPlayers.length > 0 ? assistedPlayers.length : 1;
        const dividedKillAmount = assistedPlayers.length > 0 ? (killAmount / (numberAssisted + 1)) : killAmount;
        const dividiedAvgPrice = assistedPlayers.length > 0 ? (avgPrice / (numberAssisted + 1)) : avgPrice;
        const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
        const latestPatch = latestPatchesSorted[0].version; // Get the latest patch

        // Call your signup logic from the external file
        try {
            const parentId = new Date().getTime()
            //for all of the assistants
            // if(assistedPlayers.length > 0) {
            //     for(const assistant of assistedPlayers) {
            //         delay(10);
            //         await createBlackBox({
            //             id: new Date().getTime(), // Use a unique ID for the entry
            //             user_id: assistant, 
            //             ship_used: "assist", 
            //             ship_killed: shipKilled, 
            //             value: dividiedAvgPrice,
            //             kill_count: dividedKillAmount, 
            //             victims: victimNamesArray,
            //             patch: latestPatch,
            //             assists: assistedPlayers,
            //             parent_entry: parentId
            //         });
            //     }
            // }
            //for the main player putting in the entry
            await createBlackBox({
                id: parentId,
                user_id: interaction.user.id, 
                ship_used: shipUsed, 
                ship_killed: shipKilled, 
                value: dividiedAvgPrice,
                kill_count: dividedKillAmount, 
                victims: victimNamesArray,
                patch: latestPatch,
                assists: assistedPlayers
            });
            await interaction.reply({ content: 'Black Box log added successfully!', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error adding the Black Box log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const allShips = await getAllShips(); // Fetch all ships
        const allShipsListed = allShips.map(ship => ship.ship); // Map to ship names
        // Filter ships based on the focused value
        const filtered = allShipsListed.filter(ship =>
            ship.toLowerCase().startsWith(focusedValue.toLowerCase())
        );

        // Respond with up to 25 suggestions
        await interaction.respond(
            filtered.map(ship => ({ name: ship, value: ship })).slice(0, 25)
        );
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}