const { SlashCommandBuilder } = require('@discordjs/builders');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getAllSummarizedItems, getAllSummarizedCommodities, getSummarizedItemById } = require('../../api/uexApi');
const { createHitLog } = require('../../api/hitTrackerApi');
const { getUserById } = require('../../api/userlistApi');

const command = new SlashCommandBuilder()
    .setName('warehouse-add')
    .setDescription('Add items to the Org warehouse.')
    .addStringOption(option => 
        option.setName('cargo')
            .setDescription('Select the cargo.')
            .setRequired(true)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount')
            .setDescription('List the amount of cargo (total SCU or individual pieces).')
            .setRequired(true))
    ;
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        try{
            const allCommodities = await getAllSummarizedCommodities(); // Fetch all ships
            const allItems = await getAllSummarizedItems(); // Fetch all ships
            const allCargo = [...allCommodities, ...allItems]; // Combine all items
            const assistsRaw = interaction.options.getString('assists');
            const assistedPlayers = assistsRaw
            ? assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
            : [];
            let assistedPlayerNames = [];
            for(const playerId of assistedPlayers) {
                const player = await getUserById(playerId)
                assistedPlayerNames.push(player.nickname || player.username);
            }
            const patches = await getAllGameVersions();
            const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
            const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
            const parentId = new Date().getTime()

            let cargoList = [];
            const cargoName = interaction.options.getString(`cargo`);
            const cargoAmount = interaction.options.getInteger(`amount`);
            if(cargoName && !cargoAmount) {
                await interaction.reply({ content: `Please provide an amount for ${cargoName}`, ephemeral: true });
                return;
            }
            const itemObject = allCargo.find(cargo => cargo.commodity_name === cargoName);
            averagePrice = itemObject.price_sell_avg === 0 ? itemObject.price_buy_avg : itemObject.price_sell_avg;
            const cargoItem = { commodity_name: cargoName, scuAmount: cargoAmount, avg_price: averagePrice };
            cargoList.push(cargoItem); // Add the ship to the killList if it exists

            const warehouseItem = {
                id: parentId,
                user_id: interaction.user.id,
                commodity_name: cargoName,
                total_scu: cargoAmount,
                total_value: averagePrice,
                patch: latestPatch,
            }

            await createHitLog(warehouseItem);
            message = `Hit Log (${parentId}) Created by ${interaction.user.username}! \nTotal Value: ${totalValue}aUEC \nTotal Split Value: ${totalCutValue}aUEC \nTotal SCU: ${cargoList.reduce((acc, item) => acc + item.scuAmount, 0)} \nPlayers: ${assistedPlayerNames.join(', ')} \n**THE SPLIT VALUE DOESN'T EQUATE TO TOTAL INCOME**, just the worth of the items on the market. Split profits or cargo responsibly with your team.`;
            await interaction.reply({ content: message, ephemeral: false });
        }catch(error){
            console.error('Error retrieving cargo types and amounts:', error);
            await interaction.reply({ content: 'There was an error adding the Hit Tracker Log.', ephemeral: true });
            return;
        }
        
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
        const allCommodities = await getAllSummarizedCommodities(); // Fetch all ships
        const allItems = await getAllSummarizedItems(); // Fetch all ships
        const allCargo = [...allCommodities, ...allItems]; // Combine all items

        if (optionName === 'cargo') {
            const allCargoListed = allCargo.map(cargo => ({
                name: `${cargo.commodity_name} (${cargo.price_sell_avg === 0 ? cargo.price_buy_avg : cargo.price_sell_avg}aUEC)`, // Include both ship name and model in the name
                value: cargo.commodity_name // Use ship name as the value
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