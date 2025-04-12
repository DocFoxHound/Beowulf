const { SlashCommandBuilder } = require('@discordjs/builders');
const { deleteBlackBox, getBlackBoxesByUserId, getAssistantBlackBoxes, getBlackBoxByEntryId } = require('../../api/blackBoxApi');
const { getUserById } = require('../../api/userlistApi');


const command = new SlashCommandBuilder()
    .setName('black-box-remove')
    .setDescription('Remove a kill log for your ship to the Black Box.')
    .addStringOption(option => 
        option.setName('kill')
            .setDescription('The kill log you want to remove')
            .setRequired(true)
            .setAutocomplete(true));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the needed variables
        const killLog = interaction.options.getString('kill');

        // Call your delete logic from the external file
        try {
            const channelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AUDIT_CHANNEL : process.env.TEST_AUDIT_CHANNEL; // Replace with actual channel ID
            const channel = await client.channels.fetch(channelId);
            const logRecord = await getBlackBoxByEntryId(killLog); // Fetch the kill log record
            if(interaction.user.id !== logRecord.user_id){
                const originalCreator = await getUserById(logRecord.user_id);
                return interaction.reply({ 
                    content: `Only ${originalCreator.username} or a Marauder+ can delete this black box: (${logRecord.id}).`, 
                    ephemeral: false 
                });
            }
            if (channel && channel.isTextBased()) {
                await channel.send(`The following black box was deleted by ${interaction.user.username}: \n` + JSON.stringify(logRecord));
            }

            await deleteBlackBox(killLog); // Pass the selected kill log ID
            await interaction.reply({ content: `Black Box log ${killLog} deleted successfully!`, ephemeral: false });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error deleting the Black Box log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const allPrimaryBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id); // Fetch all black box logs
        const allSecondaryBlackBoxLogs = await getAssistantBlackBoxes(interaction.user.id); // Fetch all assistant black box logs
        const allBlackBoxesCombined = [...allPrimaryBlackBoxLogs, ...allSecondaryBlackBoxLogs]; // Combine both logs

        // Combine ship_used and victims[] into a single searchable array
        const allBlackBoxLogsListed = allBlackBoxesCombined.map(log => ({
            name: `${log.ship_used} - Victims: ${log.victims.join(', ')}`,
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