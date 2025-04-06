const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { getShipLogsByCommanderId, getShipLogsByOwnerId, getShipLogByEntryId, editShipLog } = require('../../api/shipLogApi');
const { getPlayerShipsByUserId, getPlayerShipByEntryId } = require('../../api/playerShipApi');

const command = new SlashCommandBuilder()
    .setName('ship-log-edit')
    .setDescription('Edit a Ship Log entry. Only for ships you own or commanded.')
    .addStringOption(option => 
        option.setName('commander')
            .setDescription('@ the player who commanded the ship')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('log')
            .setDescription('The ship log for the ship the player commanded or you owned.')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('crew')
            .setDescription('@ the players who assisted/crewed this ship. (at minimum, 3 players)')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('victim-orgs')
            .setDescription('The names of the orgs that were engaged, SEPARATED BY A COMMA. Use "unknown" if not known.')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('ship-killed1')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed2')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed3')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed4')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed5')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed6')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed7')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed8')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed9')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed10')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    ;
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the chosen class name from the command options
        const commander = interaction.options.getString('commander').replace(/\D/g, '');
        const logId = interaction.options.getString('log');
        const shipLogObject = await getShipLogByEntryId(logId); // Fetch the kill log object
        const shipUsed = interaction.options.getString('ship-used') || null;
        const shipKilled = interaction.options.getString('ship-killed1') || null;
        const victimOrgs = interaction.options.getString('victim-orgs') || null;
        const assistsRaw = interaction.options.getString('crew') || null;
        const victimOrgsArray = victimOrgs !== null ? victimOrgs.split(',').map(name => name.trim()) : null; // Split by comma and trim whitespace
        const assistedPlayersTemp = assistsRaw
            ? assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
            : [];
        let killList = [];
        try{
            for (let i = 1; i <= 10; i++) {
                const shipKilled = interaction.options.getString(`ship-killed${i}`);
                if (shipKilled) {
                    killList.push(shipKilled); // Add the ship to the killList if it exists
                }
            }
        }catch(error){
            console.error('Error retrieving ship kills:', error);
            await interaction.reply({ content: 'There was an error retrieving the ship kills.', ephemeral: true });
            return;
        }
        // const killAmount = killList.length > 0 ? killList.length : 1; // default to 1 to not break spacetime
        const allShips = await getAllShips(); // Fetch all ships
        let tempTotalPrice = 0;
        try{
            for(kill of killList) {
                const shipKilledObject = allShips.find(ship => ship.id === kill);
                tempTotalPrice += shipKilledObject.avg_price;
            }
        }catch(error){
            console.error('Error retrieving ship kills:', error);
            await interaction.reply({ content: 'There was an error retrieving the ship kills.', ephemeral: true });
            return;
        }

        const assistedPlayers = assistedPlayersTemp.length > 0 ? assistedPlayersTemp : shipLogObject.crew;
        const totalPrice = tempTotalPrice > 0 ? tempTotalPrice : shipLogObject.value; // default to 0 to not break spacetime
        const killAmount = (killList.length !== shipLogObject.ships_killed.length) ? killList.length : shipLogObject.ships_killed.length;
        const numberAssisted = assistedPlayers.length;
        const dividedKillAmount = (killAmount / (numberAssisted + 1));
        const dividiedAvgPrice = (totalPrice / (numberAssisted + 1));
        const shipUsedNameString = shipUsed !== null ? await getPlayerShipByEntryId(shipUsed) : null;

        // Call your signup logic from the external file
        try {
            if(interaction.user.id !== commander){
                const originalCreator = await getUserById(shipLogObject.user_id);
                return interaction.reply({ 
                    content: `Only ${originalCreator.username} or a Marauder+ can edit this black box: (${shipLogObject.id}).`, 
                    ephemeral: false 
                });
            }
            //for the main player putting in the entry
            const editedShipLog = ({
                id: shipLogObject.id,
                owner_id: shipLogObject.owner_id, 
                ship_used: shipUsed !== null ? shipUsed : shipLogObject.ship_used, 
                commander: commander,
                value: tempTotalPrice === 0 ? shipLogObject.value : tempTotalPrice,
                victim_orgs: victimOrgsArray !== null ? victimOrgsArray : shipLogObject.victim_orgs,
                patch: shipLogObject.patch,
                crew: assistedPlayers,
                ships_killed: killList.length > 0 ? killList : shipLogObject.ships_killed, 
                divided_value: dividiedAvgPrice,
                total_kills: killList.length > 0 ? killAmount : shipLogObject.total_kills,
                divided_kills: dividedKillAmount,
                ship_used_name: shipUsed !== null ? shipUsedNameString.custom_name : shipLogObject.ship_used_name
            });

            const channelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AUDIT_CHANNEL : process.env.TEST_AUDIT_CHANNEL; // Replace with actual channel ID
            const channel = await client.channels.fetch(channelId);
            const logRecord = await getShipLogByEntryId(logId); // Fetch the kill log record
            if (channel && channel.isTextBased()) {
            await channel.send(`The following ship log was edited by ${interaction.user.username}: ` + 
                `\n**Old:** \n${JSON.stringify(shipLogObject)}` + 
                `\n**New:** \n${JSON.stringify(editedShipLog)}`);
            }
            await editShipLog(logId, editedShipLog);
            await interaction.reply({ content: 'Ship Log added successfully!', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error adding the Ship Log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
        const allShips = await getAllShips(); // Fetch all ships

        if (optionName === 'log') {
            const commander = interaction.options.getString('commander').replace(/\D/g, ''); // Get the owner user
            // const allBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id); // Fetch all black box logs
            const allPrimaryBlackBoxLogs = await getShipLogsByCommanderId(commander) || []; // Fetch all black box logs
            const allSecondaryBlackBoxLogs = await getShipLogsByOwnerId(interaction.user.id) || []; // Fetch all assistant black box logs
            const allBlackBoxLogs = [...allPrimaryBlackBoxLogs, ...allSecondaryBlackBoxLogs];
            const uniqueLogs = allBlackBoxLogs.filter(
                (log, index, self) =>
                  index === self.findIndex(other => other.id === log.id)
              );

            // Combine ship_used and victims[] into a single searchable array
            const allBlackBoxLogsListed = uniqueLogs.map(log => ({
                name: `${log.id}: ${log.ship_used_name} - Victims: ${log.victim_orgs.join(', ')}`,
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
            const allShipsSmallerCrew = allPlayerShips.filter(ship => ship.crew >= 3); // Filter ships with crew size <= 2
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
        } else if (optionName.includes('ship-killed')) {
            const allShipsListed = allShips.map(ship => ({
                name: `${ship.ship}`, // Include both ship name and model in the name
                value: ship.id // Use ship name as the value
            }));

            // Filter ships based on the focused value
            const filtered = allShipsListed.filter(ship =>
                ship.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            // Respond with up to 25 suggestions
            await interaction.respond(filtered.slice(0, 25));
        }
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function shipUsedName(shipUsed) {
    return getPlayerShipByEntryId(shipUsed)
};