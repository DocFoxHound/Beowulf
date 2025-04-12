const { SlashCommandBuilder } = require('@discordjs/builders');
const { deleteShipLog, getAllShipLogs, getAssistantShipLogs, getShipLogByEntryId } = require('../../api/shipLogApi');
const logger = require('../../logger');

const command = new SlashCommandBuilder()
    .setName('xblooded-ship-log-remove')
    .setDescription('Remove a kill log for your ship to the Black Box.')
    .addStringOption(option => 
        option.setName('log')
            .setDescription('The kill log you want to remove')
            .setRequired(true)
            .setAutocomplete(true));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        const member = interaction.member;
        const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
        const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
        
        if (!hasPermission) {
            return interaction.reply({ 
                content: `${interaction.user.username}, you do not have permission to use this command.`, 
                ephemeral: false 
            });
        }
        // Get the needed variables
        const killLog = interaction.options.getString('log');
        // const allBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id); // Fetch all black box logs

        // Call your delete logic from the external file
        try {
            const channelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AUDIT_CHANNEL : process.env.TEST_AUDIT_CHANNEL; // Replace with actual channel ID
            const channel = await client.channels.fetch(channelId);
            const logRecord = await getShipLogByEntryId(killLog); // Fetch the kill log record
            if (channel && channel.isTextBased()) {
            await channel.send(`The following Ship Log was deleted by ${interaction.user.username}: \n` + JSON.stringify(logRecord));
            }

            await deleteShipLog(killLog); // Pass the selected kill log ID
            await interaction.reply({ content: `Ship Log deleted successfullyby a moderator: ${interaction.user.username}!`, ephemeral: false });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error deleting the Ship Log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const allPrimaryBlackBoxLogs = await getAllShipLogs(interaction.user.id); // Fetch all black box logs

        // Combine ship_used and victims[] into a single searchable array
        const allBlackBoxLogsListed = allPrimaryBlackBoxLogs.map(log => ({
            name: `${log.ship_used} - Victims: ${log.victim_orgs.join(', ')}`,
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