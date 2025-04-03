const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllBlackBoxes, getBlackBoxesByPatch, getBlackBoxesByUserAndPatch, getBlackBoxesByUserId, getAssistantBlackBoxes, getAssistantBlackBoxesByUserAndPatch } = require('../../api/blackBoxApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById } = require('../../api/userlistApi');
const { getPlayerShipByEntryId } = require('../../api/playerShipApi');

const command = new SlashCommandBuilder()
    .setName('black-box-leaderboard')
    .setDescription('See the BlackBox stats of either an individual or the whole organization.')
    .addStringOption(option =>
        option.setName('patch')
            .setDescription('Which patch to search')
            .setRequired(true)
            .setAutocomplete(true))
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Which user to search (leave blank for all)')
            .setRequired(false));

module.exports = {
    data: command,
    async execute(interaction) {
        const patch = interaction.options.getString('patch');
        const user = interaction.options.getUser('user') || null;

        try {
            let blackBoxLogs = [];
            if (patch === 'ALL' && user) { //all patches, user identified
                const allPrimaryBlackBoxLogs = await getBlackBoxesByUserId(user.id) || []; // Fetch all black box logs
                const allSecondaryBlackBoxLogs = await getAssistantBlackBoxes(user.id) || []; // Fetch all assistant black box logs
                blackBoxLogs = [...allPrimaryBlackBoxLogs, ...allSecondaryBlackBoxLogs];
            } else if (patch !== 'ALL' && user) { //patch identified, user identified
                const coupling = {user_id: user.id, patch: patch}
                const allPrimaryBlackBoxLogs = await getBlackBoxesByUserAndPatch(coupling) || [];
                const allSecondaryBlackBoxLogs = await getAssistantBlackBoxesByUserAndPatch(coupling) || []; // Fetch all assistant black box logs
                blackBoxLogs = [...allPrimaryBlackBoxLogs, ...allSecondaryBlackBoxLogs];
                // blackBoxLogs = await getBlackBoxesByUserAndPatch(coupling);
            } else if (patch !== 'ALL' && !user) { //patch identified, no user identified (works)
                blackBoxLogs = await getBlackBoxesByPatch(patch);
            } else { //all patches, no user identified
                blackBoxLogs = await getAllBlackBoxes();
            }

            if (blackBoxLogs.length === 0 || blackBoxLogs === null) {
                return interaction.reply({ content: 'No Black Box logs found for the given criteria.', ephemeral: true });
            }

            // Generate leaderboard data and embeds
            let leaderBoardData = null;
            let individualData = null;
            if (patch === 'ALL' && user) { //all patches, user identified
                individualData = await generateIndividualData(blackBoxLogs, user);
            } else if (patch !== 'ALL' && user) { //patch identified, user identified
                individualData = await generateIndividualData(blackBoxLogs, user);
            } else if (patch !== 'ALL' && !user) { //patch identified, no user identified (works)
                leaderBoardData = await generateLeaderboardData(blackBoxLogs);
            } else { //all patches, no user identified
                leaderBoardData = await generateLeaderboardData(blackBoxLogs);
            }

            let embeds = null;
            if(leaderBoardData !== null) {
                embeds = createLeaderboardEmbeds(leaderBoardData, patch);
            }
            if(individualData !== null) {
                embeds = createIndividualEmbeds(individualData, patch, user);
            }

            if (embeds.length === 1) {
                // Only one page — no need for buttons
                return interaction.reply({ embeds: [embeds[0]], ephemeral: false });
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
                buttons.components[0].setDisabled(currentPage === 0);
                buttons.components[1].setDisabled(currentPage === embeds.length - 1);

                await i.update({ embeds: [embeds[currentPage]], components: [buttons] });
            });

            collector.on('end', async () => {
                buttons.components.forEach(button => button.setDisabled(true));
                await message.edit({ components: [buttons] });
            });
        } catch (error) {
            console.error('Error in black-box-leaderboard command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the leaderboard data. Please try again later or contact an administrator.',
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

// Helper function to generate leaderboard data
async function generateLeaderboardData(blackBoxLogs) {
    const leaderboard = {};
    try{
        for (const log of blackBoxLogs) {
            const user = await getUserById(log.user_id);
            const username = user.nickname ? user.nickname : user.username;
    
            if (!leaderboard[username]) {
                leaderboard[username] = { kill_count: 0, value: 0};
            }
    
            leaderboard[username].kill_count += log.kill_count;
            leaderboard[username].value += log.value;
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate individual data
async function generateIndividualData(blackBoxLogs, user) {
    try{
        const username = user.username;
        const leaderboard = {};

        for (const log of blackBoxLogs) {
            const hitId = log.id;
            const shipUsedObject = await getPlayerShipByEntryId(log.ship_used);
            const assistsList = [];
            if(log.assists.length > 0){
                for(const assist of log.assists){
                    const assistUser = await getUserById(assist);
                    assistsList.push(assistUser.username);
                }
            }

            if (!leaderboard[username]) {
                leaderboard[username] = { 
                    kill_count: 0, 
                    value: 0, 
                    victims: [],
                    hits: [],
                };
            }

            leaderboard[username].kill_count += log.kill_count;
            leaderboard[username].value += log.value;
            leaderboard[username].hits.push({
                id: hitId,
                kill_count: log.kill_count,
                ship_used: shipUsedObject.custom_name,
                ship_killed: log.ship_killed,
                value: log.value,
                assists: assistsList || "none",
                victims: log.victims,
                patch: log.patch,
            });
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating individual data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create leaderboard embeds
function createLeaderboardEmbeds(leaderboardData, patch) {
    try{
        const sortedByKills = Object.entries(leaderboardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
        const sortedByValue = Object.entries(leaderboardData).sort((a, b) => b[1].value - a[1].value);
        // const sortedByVictims = Object.entries(leaderboardData).sort((a, b) => b[1].victims - a[1].victims);

        const embeds = [];

        // Top players by kill count
        const killsEmbed = new EmbedBuilder()
            .setTitle(`Top Players by Total Kills (Patch ${patch})`)
            .setDescription(`**IronPoint Total Kills:** ${sortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}`)
            .setColor('#7199de');
        sortedByKills.forEach(([username, stats], index) => {
            killsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });
        embeds.push(killsEmbed);

        // Top players by value
        const valueEmbed = new EmbedBuilder()
            .setTitle(`Top Players by Damage Done (Patch ${patch})`)
            .setDescription(`**IronPoint Total Damage Cost:** ${formatToCurrency(sortedByValue.reduce((acc, [_, stats]) => acc + stats.value, 0))}`)
            .setColor('#0000ff');
        sortedByValue.forEach(([username, stats], index) => {
            valueEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Damages Cost:** ${formatToCurrency(stats.value)}`,
                inline: false
            });
        });
        embeds.push(valueEmbed);
        return embeds;
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create individual stat sheet embeds
function createIndividualEmbeds(individualData, patch, user) {
    try {
        const embeds = [];
        const fieldsPerPage = 25; // Discord's limit for fields per embed

        // Calculate total kills and total value
        const totalKills = individualData[user.username].kill_count || 0;
        const totalValue = formatToCurrency(individualData[user.username].value || 0);

        const individualShipTotals = {};
        for(const hit of individualData[user.username].hits){
            const shipName = hit.ship_used;
            if (!individualShipTotals[shipName]) {
                individualShipTotals[shipName] = { kill_count: 0, value: 0 };
            }
            individualShipTotals[shipName].kill_count += hit.kill_count;
            individualShipTotals[shipName].value += hit.value;
        }

        const individualShipEntryArray = []
        for(const shipName in individualShipTotals){
            const stats = individualShipTotals[shipName];
            individualShipEntryArray.push({
                name: shipName,
                value: `**Total Kills:** ${stats.kill_count}\n**Damages Done:** ${formatToCurrency(stats.value)}`,
                inline: false
            })
        }

        // Make fields for each hit in the hitsFields thing and make some pages, too
        for (let i = 0; i < individualShipEntryArray.length; i += fieldsPerPage) {
            const currentFields = individualShipEntryArray.slice(i, i + fieldsPerPage);

            // Create an embed for the current page
            const embed = new EmbedBuilder()
                .setTitle(`Ship Totals (Patch: ${patch})`)
                .setColor('#7199de')
                .setDescription(`**Total Kills:** ${totalKills}\n**Total Damage Cost:** ${totalValue}`)
                .addFields(currentFields);

            embeds.push(embed);
        }

        // Prepare the fields for the hits lists
        const hitsFields = [];
        Object.entries(individualData).forEach(([username, stats]) => {
            stats.hits.forEach(hit => {
                const assists = Array.isArray(hit.assists) ? hit.assists.join(', ') : hit.assists;
                const victims = hit.victims.join(', ');
                const killOrKills = hit.kill_count === 1 ? 'Kill' : 'Kills';

                hitsFields.push({
                    name: `Ship: ${hit.ship_killed || 'Unknown'}`.slice(0, 256),
                    // name: `Hit ID: ${hit.id || 'Unknown'}`.slice(0, 256),
                    value: `**Hit ID:** ${hit.id || 'Unknown'}\n**Assists:** ${assists || 'None'}\n**Victims:** ${victims || 'None'}\n**${killOrKills}:** ${hit.kill_count || 0}\n${formatToCurrency(hit.value || 0)}`.slice(0, 1024),
                    inline: false
                });
            });
        });

        // Make fields for each hit in the hitsFields thing and make some pages, too
        for (let i = 0; i < hitsFields.length; i += fieldsPerPage) {
            const currentFields = hitsFields.slice(i, i + fieldsPerPage);

            // Create an embed for the current page
            const embed = new EmbedBuilder()
                .setTitle(`Hit History (Patch: ${patch})`)
                .setColor('#0000ff')
                .addFields(currentFields);

            embeds.push(embed);
        }

        return embeds;
    } catch (error) {
        console.error('Error creating individual stat sheet embeds:', error);
        return null; // Return null if there's an error
    }
}

function formatToCurrency(value){
    try{
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(value);
        return formatted;
    }catch(error){
        console.error('Error formatting value to currency:', error);
        return null;  // Return null if there's an error
    }
}
