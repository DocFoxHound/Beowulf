const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { deleteBlackBox, getAllBlackBoxes } = require('../../api/blackBoxApi');

const command = new SlashCommandBuilder()
    .setName('zmoderator-black-box-remove')
    .setDescription('Add a kill log for your ship to the Black Box.')
    .addStringOption(option => 
        option.setName('kill')
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
                content: 'You do not have permission to use this command.', 
                ephemeral: true 
            });
        }
        // Get the needed variables
        const killLog = interaction.options.getString('kill');
        // const allBlackBoxLogs = await getBlackBoxesByUserId(interaction.user.id); // Fetch all black box logs

        // Call your delete logic from the external file
        try {
            await deleteBlackBox(killLog); // Pass the selected kill log ID
            await interaction.reply({ content: 'Black Box log deleted successfully!', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error deleting the Black Box log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const allPrimaryBlackBoxLogs = await getAllBlackBoxes(); // Fetch all black box logs

        // Combine ship_used and victims[] into a single searchable array
        const allBlackBoxLogsListed = allPrimaryBlackBoxLogs.map(log => ({
            name: `${log.id} - Victims: ${log.victims.join(', ')}`,
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