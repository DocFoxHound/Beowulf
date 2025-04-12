const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getAllSummarizedItems, getAllSummarizedCommodities } = require('../../api/uexApi');
const { createHitLog } = require('../../api/hitTrackerApi');
const { getUserById } = require('../../api/userlistApi');
const logger = require('../../logger');

const command = new SlashCommandBuilder()
    .setName('hit-tracker-add')
    .setDescription('Log a Pirate Hit in the Tracker.')
    .addStringOption(option => 
        option.setName('cargo-1')
            .setDescription('Select the cargo.')
            .setRequired(true)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-1')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('assists')
            .setDescription('@ the players who assisted this hit.')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-2')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-2')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-3')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-3')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-4')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-4')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-5')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-5')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-6')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-6')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-7')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-7')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-8')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-8')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-9')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-9')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('cargo-10')
            .setDescription('Select the cargo.')
            .setRequired(false)
            .setAutocomplete(true))
    .addIntegerOption(option => 
        option.setName('amount-10')
            .setDescription('List the amount of cargo (total SCU).')
            .setRequired(false))
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
            for (let i = 1; i <= 10; i++) {
                const cargoName = interaction.options.getString(`cargo-${i}`);
                const cargoAmount = interaction.options.getInteger(`amount-${i}`);
                if(!cargoName || !cargoAmount) continue; // Skip if no cargo name or amount is provided
                if(cargoName && !cargoAmount) {
                    await interaction.reply({ content: `Please provide an amount for ${cargoName}`, ephemeral: true });
                    return;
                }
                const itemObject = allCargo.find(cargo => cargo.commodity_name === cargoName);
                averagePrice = itemObject.price_sell_avg === 0 ? itemObject.price_buy_avg : itemObject.price_sell_avg;
                totalPrice = averagePrice * cargoAmount;
                const cargoItem = { commodity_name: cargoName, scuAmount: cargoAmount, avg_price: averagePrice };
                cargoList.push(cargoItem); // Add the ship to the killList if it exists
            }

            const totalValue = cargoList.reduce((acc, item) => acc + (item.avg_price * item.scuAmount), 0);
            const totalCutValue = Math.round(totalValue / (assistedPlayers.length + 1));

            const hitLog = {
                id: parentId,
                user_id: interaction.user.id,
                cargo: cargoList,
                total_value: totalValue,
                patch: latestPatch,
                total_cut_value: totalCutValue,
                assists: assistedPlayers,
                total_scu: cargoList.reduce((acc, item) => acc + item.scuAmount, 0),
            }

            await createHitLog(hitLog);

            // Create an embed for the response
            const embed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/SBKHSKb.png')
                .setAuthor({ name: `Hit Log Created by ${interaction.user.username}`, iconURL: 'https://i.imgur.com/iAypxY2.png' })
                .setTitle(`Patch ${latestPatch}`)
                .setImage('https://i.imgur.com/8eoJvJI.png')
                .setDescription(`**Hit Log ID:** ${parentId}`)
                .addFields(
                    { name: 'Total Value', value: `${totalValue} aUEC`, inline: true },
                    { name: 'Total Split Value', value: `${totalCutValue} aUEC`, inline: true },
                    { name: 'Total SCU', value: `${cargoList.reduce((acc, item) => acc + item.scuAmount, 0)} SCU`, inline: true },
                    { name: 'Crew', value: assistedPlayerNames.join(', ') || 'None', inline: false }
                )
                .setFooter({ text: 'The split value does not equate to total income. Split profits or cargo responsibly with your team.' })
                // .setColor('#FF0000')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: false });
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

        if (optionName.includes('cargo')) {
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