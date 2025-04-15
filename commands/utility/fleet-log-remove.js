const { SlashCommandBuilder } = require('@discordjs/builders');
const { deleteShipLog, getCrewShipLogs, getShipLogByEntryId, getShipLogsByCommanderId } = require('../../api/shipLogApi');
const { getUserById, getUsers } = require('../../api/userlistApi');


const command = new SlashCommandBuilder()
    .setName('fleet-log-remove')
    .setDescription('Remove a kill log for your ship to the Black Box.')
    .addStringOption(option => 
        option.setName('log')
            .setDescription('The kill log you want to remove')
            .setRequired(true)
            .setAutocomplete(true));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the needed variables
        const killLog = interaction.options.getString('log');
        // const allBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id); // Fetch all black box logs

        // Call your delete logic from the external file
        try {
            const channelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AUDIT_CHANNEL : process.env.TEST_AUDIT_CHANNEL; // Replace with actual channel ID
            const channel = await client.channels.fetch(channelId);
            const logRecord = await getShipLogByEntryId(killLog); // Fetch the kill log record
            if(interaction.user.id !== logRecord.commander){
                const originalCreator = await getUserById(logRecord.commander);
                return interaction.reply({ 
                    content: `Only ${originalCreator.username} or a Marauder+ can delete this log: (${logRecord.id}).`, 
                    ephemeral: false 
                });
            }
            if (channel && channel.isTextBased()) {
            await channel.send(`The following Ship Log was deleted by ${interaction.user.username}: \n` + JSON.stringify(logRecord));
            }

            await deleteShipLog(killLog); // Pass the selected kill log ID
            await interaction.reply({ content: 'Ship Log deleted successfully!', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error deleting the Ship Log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const allFleetLogsCombined = await getShipLogsByCommanderId(interaction.user.id); // Fetch all black box logs
        const allUsers = await getUsers()

        // Combine ship_used and victims[] into a single searchable array
        const allBlackBoxLogsListed = allFleetLogsCombined.map(log => ({
            name: `${log.id} - Subcommanders: ${log.subcommanders
                .map(subId => {
                    const user = allUsers.find(user => user.id === subId); // Find the user in allUsers
                    return user ? user.username : 'Unknown'; // Replace with username or 'Unknown' if not found
                })
                .join(', ')}`,
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
    }
};

async function getPlayerName(allUsers, playerId) {
    const userData = await getUserById(playerId)
    return userData ? userData.nickname : userData.username; // Fallback to playerId if not found
}