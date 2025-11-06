const { SlashCommandBuilder } = require('@discordjs/builders');
const { getHitLogByEntryId, getHitLogsByUserId, deleteHitLog } = require('../../api/hitTrackerApi');
const { getUserById } = require('../../api/userlistApi');
const { handleHitPostDelete } = require('../../functions/post-new-hit');

const command = new SlashCommandBuilder()
    .setName('hit-tracker-remove')
    .setDescription('Remove one of your hit tracker logs.')
    .addStringOption(option => 
        option.setName('hit')
            .setDescription('Select the Hit Log you want to remove')
            .setRequired(true)
            .setAutocomplete(true)
    );

module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        const hitId = interaction.options.getString('hit');
        try {
            const logRecord = await getHitLogByEntryId(hitId);
            if (!logRecord) {
                await interaction.reply({ content: `I couldn't find hit ${hitId}.`, ephemeral: true });
                return;
            }
            // Authorize: original author or Blooded role
            const isLive = process.env.LIVE_ENVIRONMENT === 'true';
            const bloodedRoleId = process.env[isLive ? 'BLOODED_ROLE' : 'TEST_BLOODED_ROLE'];
            const hasBlooded = bloodedRoleId ? interaction.member?.roles?.cache?.has(bloodedRoleId) : false;
            if (interaction.user.id !== String(logRecord.user_id) && !hasBlooded) {
                const originalCreator = await getUserById(logRecord.user_id);
                await interaction.reply({ 
                    content: `Only the original author or Blooded role can delete this hit (${logRecord.id}).`, 
                    ephemeral: false 
                });
                return;
            }
            const ok = await deleteHitLog(hitId);
            if (!ok) {
                await interaction.reply({ content: 'There was an error deleting that hit. Please try again shortly.', ephemeral: true });
                return;
            }
            try { await handleHitPostDelete(client, logRecord); } catch (e) { console.error('post delete embed failed:', e?.message || e); }
            await interaction.reply({ content: `Hit ${hitId} deleted. The thread remains for history.`, ephemeral: false });
        } catch (error) {
            console.error('Error deleting the Hit Log:', error);
            await interaction.reply({ content: 'There was an error deleting the Hit Tracker Log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const allHitLogs = await getHitLogsByUserId(interaction.user.id) || [];
        allHitLogs.sort((a,b)=> Number(b.id||0) - Number(a.id||0));
        const listed = allHitLogs.map(hit => ({
            name: `${hit.id} — ${hit.title || (hit.total_scu ? `${hit.total_scu} SCU` : '')} (${Math.round(Number(hit.total_value||0)).toLocaleString()} aUEC)`,
            value: String(hit.id)
        }));
        const filtered = listed.filter(h => h.name.toLowerCase().includes(String(focusedValue||'').toLowerCase()));
        await interaction.respond(filtered.slice(0, 25));
    }
};
