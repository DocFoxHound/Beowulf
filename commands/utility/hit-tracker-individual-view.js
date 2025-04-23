const { AttachmentBuilder, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getAssistHitLogsByUserAndPatch, getAssistHitLogs, getHitLogsByUserAndPatch, getHitLogsByUserId } = require('../../api/hitTrackerApi');


const command = new SlashCommandBuilder()
    .setName('hit-tracker-individual-view')
    .setDescription('See the Hit Tracker Leaderboards for IronPoint.')
    .addStringOption(option =>
        option.setName('patch')
            .setDescription('Which patch to search')
            .setRequired(true)
            .setAutocomplete(true))
    .addUserOption(option => 
        option.setName('user')
            .setDescription('The user to view')
            .setRequired(true));

module.exports = {
    data: command,
    async execute(interaction) {
        const patch = interaction.options.getString('patch');
        const user = interaction.options.getUser('user');
        try {
            const patchSelectedBool = patch !== 'ALL';
            let hitLogs = null;
            let assistLogs = null;
            let combinedLogs = null;

            if (patchSelectedBool) {
                const coupling = { user_id: user.id, patch: patch };
                hitLogs = await getHitLogsByUserAndPatch(coupling);
                assistLogs = await getAssistHitLogsByUserAndPatch(coupling);
            } else {
                hitLogs = await getHitLogsByUserId(user.id);
                assistLogs = await getAssistHitLogs(user.id);
            }

            combinedLogs = [...hitLogs, ...assistLogs];

            let totalAuthored = 0;
            let totalHits = 0;
            let totalValue = 0;
            let totalCutValue = 0;
            let totalAir = 0;
            let totalGround = 0;
            if(hitLogs !== null){
                totalAuthored = hitLogs.length;
            }
            if (combinedLogs !== null) {
                totalHits = combinedLogs.length;
                totalValue = combinedLogs.reduce((sum, log) => sum + log.total_value, 0);
                totalCutValue = combinedLogs.reduce((sum, log) => sum + log.total_cut_value, 0);
                totalAir = 0;
                totalGround = 0;
                for(const log of combinedLogs) {
                    if(log.air_or_ground?.toLowerCase() === 'air'){
                        totalAir += 1;
                    }
                    if(log.air_or_ground?.toLowerCase() === 'ground'){
                        totalGround += 1;
                    }
                }
            }
            
            let totalCargo = 0;

            // Consolidate cargo by type
            let allListedCargo = [];
            for (const log of combinedLogs) {
                allListedCargo.push(...log.cargo);
            }

            let cargoByType = [];
            for (const cargo of allListedCargo) {
                totalCargo += cargo.scuAmount;
                cargoByType.push([cargo.commodity_name, cargo.scuAmount]);
            }

            let consolidatedCargo = new Map();
            for (const [name, amount] of cargoByType) {
                if (consolidatedCargo.has(name)) {
                    consolidatedCargo.set(name, consolidatedCargo.get(name) + amount);
                } else {
                    consolidatedCargo.set(name, amount);
                }
            }

            // Convert the Map back to an array
            consolidatedCargo = Array.from(consolidatedCargo, ([name, amount]) => [name, amount]);

            // Create embeds
            const embeds = [];
            const embedFields = [];
            for (const [name, amount] of consolidatedCargo) {
                embedFields.push({ name: name, value: `${amount} SCU/units`, inline: true });
            }

            // Paginate fields if they exceed Discord's limit
            const fieldsPerPage = 25;
            for (let i = 0; i < embedFields.length; i += fieldsPerPage) {
                const embed = new EmbedBuilder()
                    .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                    .setImage('https://i.imgur.com/ejdkl5B.png')
                    .setAuthor({ name: `Hit Tracker for ${user.username}`, iconURL: user.displayAvatarURL() })
                    .setDescription(`**Patch:** ${patch}\n**Total Hits:** ${totalHits}      **Total Authored:** ${totalAuthored}\n**Total Air:** ${totalAir}        **Total Ground:** ${totalGround}\n**Total Value:** ${totalValue.toLocaleString()} aUEC\n**Total Cut Value:** ${totalCutValue.toLocaleString()} aUEC\n**Total Cargo:** ${totalCargo} SCU`)
                    .addFields(embedFields.slice(i, i + fieldsPerPage))
                    .setColor('#ff0000')
                    .setTimestamp()
                    .setFooter({ text: 'Contact an administrator if you have any questions.' });

                embeds.push(embed);
            }

            // Create buttons for navigation
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(embeds.length === 1)
                );

            // Send the first embed with navigation buttons
            let currentPage = 0;
            const message = await interaction.reply({ embeds: [embeds[currentPage]], components: [buttons], fetchReply: true });

            // Create a collector to handle button interactions
            const collector = message.createMessageComponentCollector({ time: 300000 });

            collector.on('collect', async i => {
                if (i.customId === 'previous') {
                    currentPage--;
                } else if (i.customId === 'next') {
                    currentPage++;
                }

                // Update buttons
                buttons.components[0].setDisabled(currentPage === 0);
                buttons.components[1].setDisabled(currentPage === embeds.length - 1);

                await i.update({ embeds: [embeds[currentPage]], components: [buttons] });
            });

            collector.on('end', async () => {
                buttons.components.forEach(button => button.setDisabled(true));
                await message.edit({ components: [buttons] });
            });
        } catch (error) {
            console.error('Error in hit-tracker-individual-view command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the hit tracker data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();

        try {
            const gameVersions = await getAllGameVersions();
            const patches = gameVersions.map(version => version.version);
            patches.unshift('ALL');

            const filtered = patches.filter(patch =>
                patch.toLowerCase().includes(focusedValue.toLowerCase())
            );

            await interaction.respond(
                filtered.map(patch => ({ name: patch, value: patch })).slice(0, 25)
            );
        } catch (error) {
            console.error('Error fetching game versions for autocomplete:', error);
            await interaction.respond([]);
        }
    }
};