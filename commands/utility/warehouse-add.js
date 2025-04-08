const { SlashCommandBuilder } = require('@discordjs/builders');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getAllSummarizedItems, getAllSummarizedCommodities, getSummarizedItemById } = require('../../api/uexApi');
const { getUserById } = require('../../api/userlistApi');
const { createWarehouse, getWarehousesByUserId, getWarehousesByUserAndCommodity, deleteWarehouse, editWarehouse } = require('../../api/warehouseApi');

const command = new SlashCommandBuilder()
    .setName('warehouse-add-remove')
    .setDescription('Add items to the Org warehouse.')
    .addStringOption(option => 
        option.setName('action')
            .setDescription('Add or Remove.')
            .setRequired(true)
            .addChoices(
                { name: 'Add', value: 'add' },
                { name: 'Remove', value: 'remove' }
            ))
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
            const action = interaction.options.getString(`action`);
            const allCommodities = await getAllSummarizedCommodities(); // Fetch all ships
            const allItems = await getAllSummarizedItems(); // Fetch all ships
            const allCargo = [...allCommodities, ...allItems]; // Combine all items
            const patches = await getAllGameVersions();
            const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
            const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
            const parentId = new Date().getTime()

            const cargoName = interaction.options.getString(`cargo`);
            const cargoAmount = interaction.options.getInteger(`amount`);
            if(cargoName && !cargoAmount) {
                await interaction.reply({ content: `Please provide an amount for ${cargoName}`, ephemeral: true });
                return;
            }

            if(action === 'add') {
                const itemObject = allCargo.find(cargo => cargo.commodity_name === cargoName);
                const averagePrice = itemObject.price_sell_avg === 0 ? itemObject.price_buy_avg : itemObject.price_sell_avg;

                const warehouseItem = {
                    id: parentId,
                    user_id: interaction.user.id,
                    commodity_name: cargoName,
                    total_scu: cargoAmount,
                    total_value: averagePrice,
                    patch: latestPatch,
                }

                const coupling = {
                    user_id: interaction.user.id,
                    commodity_name: cargoName
                }
                const warehouseItemObject = await getWarehousesByUserAndCommodity(coupling);
                if(warehouseItemObject) {
                    const updatedWarehouseItem = {
                        id: warehouseItemObject[0].id,
                        user_id: warehouseItemObject[0].user_id,
                        commodity_name: warehouseItemObject[0].commodity_name,
                        total_scu: warehouseItemObject[0].total_scu + cargoAmount,
                        total_value: averagePrice,
                        patch: latestPatch,
                    }
                    await editWarehouse(warehouseItemObject[0].id, updatedWarehouseItem);
                    message = `Warehouse item (${cargoName}) updated by ${interaction.user.username}! \nAmount: ${updatedWarehouseItem.total_scu} scu/units \nAverage Market Price per Unit: ${averagePrice}aUEC.`;
                    await interaction.reply({ content: message, ephemeral: false });
                    return;
                }else{
                    await createWarehouse(warehouseItem);
                    message = `Warehouse item (${cargoName}) added by ${interaction.user.username}! \nAmount: ${cargoAmount} scu/units \nAverage Market Price per Unit: ${averagePrice}aUEC.`;
                    await interaction.reply({ content: message, ephemeral: false });
                }
            }

            if(action === 'remove') {
                const itemObject = allCargo.find(cargo => cargo.commodity_name === cargoName);
                const coupling = {
                    user_id: interaction.user.id,
                    commodity_name: cargoName
                }
                const warehouseItemObject = await getWarehousesByUserAndCommodity(coupling);
                const averagePrice = itemObject.price_sell_avg === 0 ? itemObject.price_buy_avg : itemObject.price_sell_avg;

                const warehouseItem = {
                    id: parentId,
                    user_id: interaction.user.id,
                    commodity_name: cargoName,
                    total_scu: warehouseItemObject[0].total_scu - cargoAmount,
                    total_value: averagePrice,
                    patch: latestPatch,
                }

                if(warehouseItemObject[0].total_scu - cargoAmount <= 0) {
                    await deleteWarehouse(warehouseItemObject[0].id);
                    message = `${interaction.user.username}'s Warehouse item (${cargoName}) reached zero amount and was removed.`;
                    await interaction.reply({ content: message, ephemeral: false });
                }else{
                    await editWarehouse(warehouseItemObject[0].id, warehouseItem);
                    message = `Warehouse item (${cargoName}) updated by ${interaction.user.username}! \nAmount: ${warehouseItem.total_scu} scu/units \nAverage Market Price per Unit: ${averagePrice}aUEC.`;
                    await interaction.reply({ content: message, ephemeral: false });
                }
            }
        }catch(error){
            console.error('Error retrieving cargo types and amounts:', error);
            await interaction.reply({ content: 'There was an error with the Warehouse.', ephemeral: true });
            return;
        }
        
    },
    async autocomplete(interaction) {
        try{
            const focusedValue = interaction.options.getFocused(); // Get the focused option value
            const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
            const action = interaction.options.getString(`action`);
            let addOrRemove = '';
            
            
            if(action === 'add') {
                addOrRemove = 'add';
            }else if(action === 'remove') {
                addOrRemove = 'remove';
            }
            if (addOrRemove === 'add' && optionName === 'cargo') {
                const allCommodities = await getAllSummarizedCommodities(); // Fetch all ships
                const allItems = await getAllSummarizedItems(); // Fetch all ships
                const allCargo = [...allCommodities, ...allItems]; // Combine all items
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
            if (addOrRemove === 'remove' && optionName === 'cargo') {
                const allCommodities = await getWarehousesByUserId(interaction.user.id); // Fetch all ships
                const allCargoListed = allCommodities.map(cargo => ({
                    name: `${cargo.commodity_name} (${cargo.total_scu}scu/units)`, // Include both ship name and model in the name
                    value: cargo.commodity_name // Use ship name as the value
                }));
    
                // Filter ships based on the focused value
                const filtered = allCargoListed.filter(cargo =>
                    cargo.name.toLowerCase().includes(focusedValue.toLowerCase())
                );
    
                // Respond with up to 25 suggestions
                await interaction.respond(filtered.slice(0, 25));
            }
        }catch(error){
            console.error('Error autofilling Warehouse:', error);
            await interaction.reply({ content: 'There was an error with autofilling fields in the Warehouse command.', ephemeral: true });
            return;
        }
        
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}