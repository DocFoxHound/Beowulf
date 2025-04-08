const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Add EmbedBuilder here
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getAllSummarizedItems, getAllSummarizedCommodities, getSummarizedItemById } = require('../../api/uexApi');
const { getUserById } = require('../../api/userlistApi');
const { createWarehouse, getWarehousesByUserId, getWarehousesByUserAndCommodity, deleteWarehouse, editWarehouse, getWarehousesByCommodity, getAllWarehouses } = require('../../api/warehouseApi');

const command = new SlashCommandBuilder()
    .setName('warehouse-view')
    .setDescription('Select what to view from the Warehouse.')
    .addStringOption(option => 
        option.setName('view')
            .setDescription('Which view would you like to see?')
            .setRequired(true)
            .addChoices(
                { name: 'View All', value: 'all' },
                { name: 'Search by Player', value: 'player' },
                { name: 'Search by Item', value: 'item' }
            ))
    .addStringOption(option => 
        option.setName('item')
            .setDescription('Select the item to search.')
            .setRequired(false)
            .setAutocomplete(true))
    .addUserOption(option => 
        option.setName('player')
            .setDescription('Select the player to search.')
            .setRequired(false))
    ;
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        try {
            const view = interaction.options.getString('view');
            const cargoName = interaction.options.getString('item');
            const player = interaction.options.getUser('player');
            // const playerId = interaction.options.getUser('player')?.replace(/\D/g, '');
            const patches = await getAllGameVersions();
            const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
            const latestPatch = latestPatchesSorted[0].version; // Get the latest patch

            if (view === 'item' && !cargoName) {
                await interaction.reply({ content: `Please select cargo to view.`, ephemeral: true });
                return;
            }
            if (view === 'player' && !player) {
                await interaction.reply({ content: `Please select a player to view.`, ephemeral: true });
                return;
            }
            if (view === 'all' && cargoName || view === 'all' && player || view === 'item' && player || view === 'player' && cargoName) {
                await interaction.reply({ content: `Please only select the fields that pertain to your search and do not mix.`, ephemeral: true });
                return;
            }

            let data = null;
            let title = '';
            let author = '';
            if (view === 'all') {
                const allCargo = await getAllWarehouses();
                data = await generateAllCommodityData(allCargo);
                author = `All Commodities`;
                title = 'Warehouse Item List, Alphabetical';
            }else if (view === 'player') {
                const allCargo = await getWarehousesByUserId(player.id);
                data = await generatePersonalData(allCargo);
                author = `Search by Player`;
                title = `${interaction.options.getUser('player').username}`;
            }else if (view === 'item') {
                const allCargo = await getWarehousesByCommodity(cargoName);
                data = await generateItemData(allCargo);
                console.log('Data:', data);
                author = `Search by Item`;
                title = `${cargoName}`;
            }

            if (!data) {
                await interaction.reply({ content: 'No data found for the selected option.', ephemeral: true });
                return;
            }

            // Generate embeds
            const embeds = generateEmbed(data, view, title, author);

            if (embeds.length === 0) {
                // If there are no embeds to display, send a message and return
                await interaction.reply({ content: 'No data available to display.', ephemeral: true });
                return;
            }

            if (embeds.length === 1) {
                // If there is only one page, send the embed without buttons
                await interaction.reply({ embeds: [embeds[0]], ephemeral: false });
                return;
            }

            // Create buttons for navigation
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true), // Disable the "Previous" button on the first page
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                );

            // Send the first embed with navigation buttons
            let currentPage = 0;
            const message = await interaction.reply({ embeds: [embeds[currentPage]], components: [buttons], fetchReply: true });

            // Create a collector to handle button interactions
            const collector = message.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'previous') {
                    currentPage--;
                } else if (i.customId === 'next') {
                    currentPage++;
                }

                // Update buttons
                buttons.components[0].setDisabled(currentPage === 0); // Disable "Previous" on the first page
                buttons.components[1].setDisabled(currentPage === embeds.length - 1); // Disable "Next" on the last page

                await i.update({ embeds: [embeds[currentPage]], components: [buttons] });
            });

            collector.on('end', async () => {
                try {
                    // Remove the buttons entirely when the collector ends
                    await message.edit({ components: [] });
                } catch (error) {
                    console.error('Error removing buttons:', error);
                }
            });
        } catch (error) {
            console.error('Error retrieving warehouse views:', error);
            await interaction.reply({ content: 'There was an error with the Warehouse View.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
        const view = interaction.options.getString(`view`);
        let addOrRemove = '';
        
        if(view === 'all') {
            addOrRemove = 'all';
        }else if(view === 'item') {
            addOrRemove = 'item';
        }else if(view === 'player') {
            addOrRemove = 'player';
        }
        if (addOrRemove === 'item' && optionName === 'item') {
            const allCommodities = await getAllWarehouses(); // Fetch all ships
            const allCargoListed = allCommodities.map(cargo => ({
                name: `${cargo.commodity_name} (${cargo.total_value}aUEC)`, // Include both ship name and model in the name
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

// Helper function to generate commodity data
async function generateAllCommodityData(allCargo) {
    const itemboard = {};
    try{
        for (const item of allCargo) {
            const userObject = await getUserById(item.user_id);

            if (!itemboard[item.commodity_name]) {
                itemboard[item.commodity_name] = { commodity_name: item.commodity_name, users: [], total_scu: 0};
            }
                itemboard[item.commodity_name].users.push(userObject.username);
                itemboard[item.commodity_name].total_scu += item.total_scu;
        }
        const sortedItemboard = Object.fromEntries(
            Object.entries(itemboard).sort(([aKey], [bKey]) =>
                aKey.localeCompare(bKey)
            )
        );
        return sortedItemboard;
        // return itemboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate commodity data
async function generatePersonalData(allCargo) {
    const itemboard = {};
    try{
        for (const item of allCargo) {
            const userObject = await getUserById(item.user_id);

            if (!itemboard[userObject.username]) {
                itemboard[userObject.username] = { commodity_names_and_cargo: []};
            }
            const cargoObject = {
                commodity_name: item.commodity_name,
                total_scu: item.total_scu
            };
            itemboard[userObject.username].commodity_names_and_cargo.push(cargoObject);
        }
        return itemboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate commodity data
async function generateItemData(allCargo) {
    const itemboard = {};
    try{
        for (const item of allCargo) {
            const userObject = await getUserById(item.user_id);

            if (!itemboard[userObject.username]) {
                itemboard[userObject.username] = { username: userObject.username, total_scu: item.total_scu};
            }
        }
        return itemboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

function generateEmbed(data, option, title, author) {
    const embeds = [];
    const fieldsPerPage = 25; // Discord's limit for fields per embed
    const maxFieldLength = 1024; // Discord's limit for field value length

    // Prepare fields based on the option
    let allFields = [];
    if (option === 'all') {
        allFields = Object.entries(data).flatMap(([commodityName, stats]) => {
            const value = `**${stats.total_scu}** scu/units\n${stats.users.join(', ')}\n`;
            return splitFieldAll(commodityName, value, maxFieldLength);
        });
    }else if (option === 'player') {
        allFields = Object.entries(data).flatMap(([username, stats]) => {
            const value = stats.commodity_names_and_cargo
                .map(cargo => `**${cargo.commodity_name}:** ${cargo.total_scu} scu/units`)
                .join('\n');
            return splitField(username, value, maxFieldLength);
        });
    }else if (option === 'item') {
        allFields = Object.entries(data).flatMap(([username, stats]) => {
            const value = `**${stats.total_scu}** scu/units\n`;
            return splitField(username, value, maxFieldLength);
        });
    }

    // Split fields into pages
    for (let i = 0; i < allFields.length; i += fieldsPerPage) {
        const currentFields = allFields.slice(i, i + fieldsPerPage);

        const embed = new EmbedBuilder()
            // .setTitle(title)
            .setAuthor({ name: author, iconURL: 'https://i.imgur.com/CaymfS8.png' })
            .setDescription(`\`\`\`\n${title}\n\`\`\``)
            .setColor('#0099ff')
            .addFields(currentFields)
            .setImage('https://i.imgur.com/OuIubZH.png')
            .setTimestamp();

        embeds.push(embed);
    }

    return embeds;
}

// Helper function to split a field into multiple fields if its value exceeds the max length
function splitFieldAll(name, value, maxLength) {
    const fields = [];
    if (value.length <= maxLength) {
        fields.push({ name, value, inline: true });
    } else {
        const chunks = splitString(value, maxLength);
        chunks.forEach((chunk, index) => {
            fields.push({
                name: index === 0 ? name : `${name} (cont.)`,
                value: chunk,
                inline: true
            });
        });
    }
    return fields;
}

// Helper function to split a field into multiple fields if its value exceeds the max length
function splitField(name, value, maxLength) {
    const fields = [];
    if (value.length <= maxLength) {
        fields.push({ name, value, inline: false });
    } else {
        const chunks = splitString(value, maxLength);
        chunks.forEach((chunk, index) => {
            fields.push({
                name: index === 0 ? name : `${name} (cont.)`,
                value: chunk,
                inline: false
            });
        });
    }
    return fields;
}

// Helper function to split a string into chunks of a specified maximum length
function splitString(str, maxLength) {
    const chunks = [];
    while (str.length > maxLength) {
        let chunk = str.slice(0, maxLength);

        // Ensure we don't split in the middle of a word
        const lastNewline = chunk.lastIndexOf('\n');
        const lastSpace = chunk.lastIndexOf(' ');
        const splitIndex = lastNewline > -1 ? lastNewline : lastSpace > -1 ? lastSpace : maxLength;

        chunk = str.slice(0, splitIndex).trim();
        chunks.push(chunk);
        str = str.slice(splitIndex).trim();
    }
    if (str.length > 0) {
        chunks.push(str);
    }
    return chunks;
}

