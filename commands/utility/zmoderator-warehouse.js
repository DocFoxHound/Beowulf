const { SlashCommandBuilder } = require('@discordjs/builders');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getAllSummarizedItems, getAllSummarizedCommodities, getSummarizedItemById } = require('../../api/uexApi');
const { getUserById } = require('../../api/userlistApi');
const { createWarehouse, getWarehousesByUserId, getWarehousesByUserAndCommodity, deleteWarehouse, editWarehouse } = require('../../api/warehouseApi');

const command = new SlashCommandBuilder()
    .setName('zmoderator-warehouse-remove')
    .setDescription('Add items to the Org warehouse.')
    .addStringOption(option => 
        option.setName('owner')
            .setDescription('@ the player whose cargo you want to remove.')
            .setRequired(true))
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
            const member = interaction.member;
            const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
            const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
            if(!hasPermission) {
                return interaction.reply({ 
                    content: `${interaction.user.username}, you do not have permission to use this command.`,
                    ephemeral: false 
                });
            }
            
            const owner = interaction.options.getString('owner').replace(/\D/g, '');
            const action = interaction.options.getString(`action`);
            const patches = await getAllGameVersions();
            const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
            const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
            const parentId = new Date().getTime()
            const allCommodities = await getAllSummarizedCommodities(); // Fetch all ships
            const allItems = await getAllSummarizedItems(); // Fetch all ships
            const allCargo = [...allCommodities, ...allItems]; // Combine all items
            const cargoName = interaction.options.getString(`cargo`);
            const cargoAmount = interaction.options.getInteger(`amount`);

            
            if(cargoName && !cargoAmount) {
                await interaction.reply({ content: `Please provide an amount for ${cargoName}`, ephemeral: true });
                return;
            }

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
            const owner = interaction.options.getString('owner').replace(/\D/g, '');

            const allCommodities = await getWarehousesByUserId(owner); // Fetch all ships
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
        }catch(error){
            console.error('Error autofilling the warehouse:', error);
            await interaction.reply({ content: 'There was an error autofilling the warehouse command.', ephemeral: true });
            return;
        }
    }
};