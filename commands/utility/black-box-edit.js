const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { editBlackBox, getBlackBoxesByUserId, getBlackBoxByEntryId, getAssistantBlackBoxes } = require('../../api/blackBoxApi');
const { getPlayerShipsByUserId } = require('../../api/playerShipApi');

const command = new SlashCommandBuilder()
    .setName('black-box-edit')
    .setDescription('Edit your Black Box entry.')
    .addStringOption(option => 
        option.setName('kill')
            .setDescription('The kill log you want to edit.')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-used')
            .setDescription('The ship used for the kill')
            .setRequired(false)
            .setAutocomplete(true)) // Enable autocomplete
    .addStringOption(option => 
        option.setName('ship-killed')
            .setDescription('The type of ship you killed (only one per entry)')
            .setRequired(false)
            .setAutocomplete(true)) // Enable autocomplete
    .addIntegerOption(option => 
        option.setName('kills')
            .setDescription('The number of victims in the kill.')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('victims')
            .setDescription('The names of the victim SEPARATED BY A COMMA, if known.')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('assists')
            .setDescription('@ the players who assisted in the kill. (leave blank for none)')
            .setRequired(false));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the needed variables
        const killLogId = interaction.options.getString('kill');
        const killLogObject = await getBlackBoxByEntryId(killLogId); // Fetch the kill log object
        const shipUsed = interaction.options.getString('ship-used') || killLogObject.ship_used;
        const shipKilled = interaction.options.getString('ship-killed') || killLogObject.ship_killed;
        const killAmount = interaction.options.getInteger('kills') || killLogObject.kill_count;
        const victimNames = interaction.options.getString('victims') || killLogObject.victims.join(', ');
        const victimNamesArray = victimNames.split(',').map(name => name.trim()); // Split by comma and trim whitespace
        const allShips = await getAllShips(); // Fetch all ships
        const shipKilledObject = allShips.find(ship => ship.ship === shipKilled);
        const avgPrice = shipKilledObject.avg_price || 0;
        const assistsRaw = interaction.options.getString('assists') || killLogObject.assists;
        let assistedPlayers = [];
        try{
            assistedPlayers = assistsRaw
                ? assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
                : [];
        }catch{
            assistedPlayers = assistsRaw;
        }
        const numberAssisted = assistedPlayers.length > 0 ? assistedPlayers.length : 1;
        const dividedKillAmount = assistedPlayers.length > 0 ? (killAmount / (numberAssisted + 1)) : killAmount;
        const dividedAvgPrice = assistedPlayers.length > 0 ? (avgPrice / (numberAssisted + 1)) : avgPrice;

        // Call your signup logic from the external file
        try {
            if(interaction.user.id !== killLogObject.user_id){
                const originalCreator = await getUserById(killLogObject.user_id);
                return interaction.reply({ 
                    content: `Only ${originalCreator.username} or a Marauder+ can edit this black box: (${killLogObject.id}).`, 
                    ephemeral: true 
                });
            }
            //for the main player putting in the entry
            const editedBlackBox = ({
                id: killLogObject.id, 
                user_id: killLogObject.user_id, 
                ship_used: shipUsed, 
                ship_killed: shipKilled, 
                value: dividedAvgPrice,
                kill_count: dividedKillAmount, 
                victims: victimNamesArray,
                patch: killLogObject.patch,
                assists: assistedPlayers
            });
            const channelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AUDIT_CHANNEL : process.env.TEST_AUDIT_CHANNEL; // Replace with actual channel ID
            const channel = await client.channels.fetch(channelId);
            const logRecord = await getBlackBoxByEntryId(killLog); // Fetch the kill log record
            if (channel && channel.isTextBased()) {
            await channel.send(`The following black box was edited by ${interaction.user.username}: ` + 
                `\n**Old:** \n${JSON.stringify(killLogObject)}` + 
                `\n**New:** \n${JSON.stringify(editedBlackBox)}`);
            }
            await editBlackBox(killLogId, editedBlackBox);
            await interaction.reply({ content: 'Black Box log added successfully!', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error adding the Black Box log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option

        if (optionName === 'kill') {
            // Autocomplete for the 'kill' option
            // const allBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id); // Fetch all black box logs
            const allPrimaryBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id) || []; // Fetch all black box logs
            const allSecondaryBlackBoxLogs = await getAssistantBlackBoxes(interaction.user.id) || []; // Fetch all assistant black box logs
            const allBlackBoxLogs = [...allPrimaryBlackBoxLogs, ...allSecondaryBlackBoxLogs];

            // Combine ship_used and victims[] into a single searchable array
            const allBlackBoxLogsListed = allBlackBoxLogs.map(log => ({
                name: `${log.id}: ${log.ship_killed} - Victims: ${log.victims.join(', ')}`,
                value: log.id // Use the log ID as the value for selection
            }));

            // Filter logs based on the focused value (search both ship_used and victims)
            const filtered = allBlackBoxLogsListed.filter(log =>
                log.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            // Respond with up to 25 suggestions
            await interaction.respond(
                filtered.slice(0, 25) // Limit to 25 results
            );
        } else if (optionName === 'ship-used') {
            const allPlayerShips = await getPlayerShipsByUserId(interaction.user.id);
            const allShipsSmallerCrew = allPlayerShips.filter(ship => ship.crew <= 2); // Filter ships with crew size <= 2
            const allShipsListed = allShipsSmallerCrew.map(ship => ({
                name: `${ship.custom_name} (${ship.ship_model})`, // Include both custom_name and model in the name
                value: ship.id // Use custom_name as the value
            }));

            // Filter ships based on the focused value
            const filtered = allShipsListed.filter(ship =>
                ship.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            // Respond with up to 25 suggestions
            await interaction.respond(filtered.slice(0, 25));
        } else if (optionName === 'ship-killed') {
            // Autocomplete for 'ship-used' and 'ship-killed' options
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
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}