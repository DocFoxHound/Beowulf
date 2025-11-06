const { SlashCommandBuilder } = require('@discordjs/builders');
const { getHitLogByEntryId, getAllHitLogs, deleteHitLog } = require('../../api/hitTrackerApi');
const { getUserById, getUsers } = require('../../api/userlistApi');


const command = new SlashCommandBuilder()
    .setName('xmoderator-hit-tracker-remove')
    .setDescription('Remove a hit tracker log.')
    .addStringOption(option => 
        option.setName('hit')
            .setDescription('Select the Hit Log you want to remove')
            .setRequired(true)
            .setAutocomplete(true))
    ;
    
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

        const hitLog = interaction.options.getString('hit');
        try{
            const channelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AUDIT_CHANNEL : process.env.TEST_AUDIT_CHANNEL; // Replace with actual channel ID
            const channel = await client.channels.fetch(channelId);
            const logRecord = await getHitLogByEntryId(hitLog); // Fetch the kill log record
            // Allow: original author, Blooded, or moderator (already passed)
            const isLive = process.env.LIVE_ENVIRONMENT === "true";
            const bloodedRoleId = process.env[isLive ? 'BLOODED_ROLE' : 'TEST_BLOODED_ROLE'];
            const hasBlooded = bloodedRoleId ? interaction.member?.roles?.cache?.has(bloodedRoleId) : false;
            if(interaction.user.id !== logRecord.user_id && !hasBlooded){
                const originalCreator = await getUserById(logRecord.user_id);
                return interaction.reply({ 
                    content: `Only the original author, Blooded, or a moderator can delete this hit (${logRecord.id}).`, 
                    ephemeral: false 
                });
            }
            if (channel && channel.isTextBased()) {
                await channel.send(`The following black box was deleted by ${interaction.user.username}: \n` + JSON.stringify(logRecord));
            }

            await deleteHitLog(hitLog); // Pass the selected kill log ID
            await interaction.reply({ content: `Black Box log ${hitLog} deleted successfully!`, ephemeral: false });
        }catch(error){
            console.error('Error deleting the Hit Log:', error);
            await interaction.reply({ content: 'There was an error deleting the Hit Tracker Log.', ephemeral: true });
            return;
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
        const allHitLogs = await getAllHitLogs(); // Fetch all hit logs
        const allDbUsers = await getUsers();

        if (optionName.includes('hit')) {
            const allHitsListed = allHitLogs.map(hit => ({
                name: `${hit.id} (Cargo Value: ${hit.total_value} by: ${getUsername(hit.user_id, allDbUsers)})`, // Include both ship name and model in the name
                value: hit.id // Use ship name as the value
            }));

            // Filter ships based on the focused value
            const filtered = allHitsListed.filter(hit =>
                hit.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            // Respond with up to 25 suggestions
            await interaction.respond(filtered.slice(0, 25));
        }
    }
};

function getUsername(userId, userList){
    const user = userList.find(user => user.id === userId);
    if (user) {
        return user.username;
    } else {
        return 'Unknown User';
    }
}