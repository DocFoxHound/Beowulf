const { AttachmentBuilder, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById } = require('../../api/userlistApi');
const { getHitLogsByPatch, getAllHitLogs } = require('../../api/hitTrackerApi');
const { generateLeaderboardChart } = require('../../common/chart-generator');
const fs = require('fs');
const path = require('path');

const command = new SlashCommandBuilder()
    .setName('hit-tracker-leaderboard')
    .setDescription('See the Hit Tracker Leaderboards for IronPoint.')
    .addStringOption(option =>
        option.setName('patch')
            .setDescription('Which patch to search')
            .setRequired(true)
            .setAutocomplete(true));

module.exports = {
    data: command,
    async execute(interaction) {
        const patch = interaction.options.getString('patch');

        try {
            const patchSelectedBool = patch !== 'ALL' ? true : false;
            let embeds = null;
            let hitLogs = [];
            let topTotalValue = null;
            let topStolenCargo = null;
            let topPirateActs = null;
            if(patchSelectedBool){ //patch selected
                hitLogs = await getHitLogsByPatch(patch)
                topTotalValue = await generateTotalValueLeaderboard(hitLogs);
                topStolenCargo = await generateTopStolenLeaderboard(hitLogs);
                topPirateActs = await generateTopPirateActs(hitLogs);
            }else{ //'ALL' selected
                hitLogs = await getAllHitLogs()
                topTotalValue = await generateTotalValueLeaderboard(hitLogs);
                topStolenCargo = await generateTopStolenLeaderboard(hitLogs);
                topPirateActs = await generateTopPirateActs(hitLogs);
            }
            const sortedByTopTotalValue = structuredClone(Object.entries(topTotalValue).sort((a, b) => b[1].total_cut_value - a[1].total_cut_value));
            const sortedByTopStolenCargo = structuredClone(Object.entries(topStolenCargo).sort((a, b) => b[1].total_scu - a[1].total_scu));
            const sortedByTopPiracyActs = structuredClone(Object.entries(topPirateActs).sort((a, b) => b[1].total_hits - a[1].total_hits));

            const { buffer: valueBuffer, filePath: valuePath } = await generateLeaderboardChart(sortedByTopTotalValue.slice(0, 10), 'total_cut_value', 'value-chart.png');
            const { buffer: cargoBuffer, filePath: cargoPath } = await generateLeaderboardChart(sortedByTopStolenCargo.slice(0, 10), 'total_scu', 'cargo-chart.png');
            const { buffer: actsBuffer, filePath: actsPath } = await generateLeaderboardChart(sortedByTopPiracyActs.slice(0, 10), 'total_hits', 'acts-chart.png');

            const attachmentMap = {
                0: new AttachmentBuilder(valueBuffer, { name: 'value-chart.png' }),
                1: new AttachmentBuilder(cargoBuffer, { name: 'cargo-chart.png' }),
                2: new AttachmentBuilder(actsBuffer, { name: 'acts-chart.png' })
            };

            embeds = createLeaderboardEmbeds(sortedByTopTotalValue, sortedByTopStolenCargo, sortedByTopPiracyActs, patch);

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
            const message = await interaction.reply({ 
                embeds: [embeds[currentPage]], 
                components: [buttons], 
                files: [attachmentMap[currentPage]], 
                fetchReply: true 
              });
              
            [valuePath, cargoPath, actsPath].forEach(path =>
                fs.unlink(path, err => {
                  if (err) console.error(`Failed to delete ${path}:`, err);
                })
            );

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

                await i.update({ 
                    embeds: [embeds[currentPage]], 
                    components: [buttons], 
                    files: [attachmentMap[currentPage]] 
                  });
            });

            collector.on('end', async () => {
                buttons.components.forEach(button => button.setDisabled(true));
                await message.edit({ components: [buttons] });
            });
        } catch (error) {
            console.error('Error in hit tracker leaderboard command:', error);
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
async function generateTotalValueLeaderboard(hitLogs) {
    const leaderboard = {};
    try{
        for (const log of hitLogs) {
            const userObject = await getUserById(log.user_id);
            const userName = userObject.username;
            if (!leaderboard[userName]) {
                leaderboard[userName] = { username: userName, total_cut_value: 0 };
            }

            leaderboard[userName].total_cut_value += log.total_cut_value;

            for(const assist of log.assists){
                const assistUserObject = await getUserById(assist);
                const assistUserName = assistUserObject.username;
                if (!leaderboard[assistUserName]) {
                    leaderboard[assistUserName] = { username: assistUserName, total_cut_value: 0 };
                }
                leaderboard[assistUserName].total_cut_value += log.total_cut_value;
            }
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateTopStolenLeaderboard(hitLogs) {
    const leaderboard = {};
    try{
        for (const log of hitLogs) {
            const userObject = await getUserById(log.user_id);
            const userName = userObject.username;
            const numberAssists = log.assists.length + 1;
            if (!leaderboard[userName]) {
                leaderboard[userName] = { username: userName, total_scu: 0 };
            }

            leaderboard[userName].total_scu += (log.total_scu / numberAssists);

            for(const assist of log.assists){
                const assistUserObject = await getUserById(assist);
                const assistUserName = assistUserObject.username;
                if (!leaderboard[assistUserName]) {
                    leaderboard[assistUserName] = { username: assistUserName, total_scu: 0 };
                }
                leaderboard[assistUserName].total_scu += (log.total_scu / numberAssists);
            }
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateTopPirateActs(hitLogs) {
    const leaderboard = {};
    try{
        for (const log of hitLogs) {
            const userObject = await getUserById(log.user_id);
            const userName = userObject.username;
            if (!leaderboard[userName]) {
                leaderboard[userName] = { username: userName, total_hits: 0 };
            }

            leaderboard[userName].total_hits += 1;

            for(const assist of log.assists){
                const assistUserObject = await getUserById(assist);
                const assistUserName = assistUserObject.username;
                if (!leaderboard[assistUserName]) {
                    leaderboard[assistUserName] = { username: assistUserName, total_hits: 0 };
                }
                leaderboard[assistUserName].total_hits += 1;
            }
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

function createLeaderboardEmbeds(sortedByTopTotalValue, sortedByTopStolenCargo, sortedByTopPiracyActs, patch) {
    try{
        const embeds = [];

        // Top players by value earned
        const topStolenValueEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png') // Use the chart as the thumbnail
            .setAuthor({ name: `Top Discerning Pirates`, iconURL: 'https://i.imgur.com/SBKHSKb.png' })
            .setTitle(`Patch ${patch}`)
            .setImage(`attachment://value-chart.png`)
            .setDescription(`\`\`\`\nThe following are the top Pirates by Market Value of items stolen. These are the best at finding the best loot.\n\n\`\`\``)
            .setColor('#b519ff');
            sortedByTopTotalValue.forEach(([username, stats], index) => {

                topStolenValueEmbed.addFields({
                    name: `${index + 1}. ${username}`,
                    value: `
                    **Total Value:** ${Math.round(stats.total_cut_value).toLocaleString()} aUEC\n`,
                    inline: false
                });
            });
        embeds.push(topStolenValueEmbed);

        // Top players by total stolen cargo
        const topStolenCargoEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Kleptomaniacss`, iconURL: 'https://i.imgur.com/SBKHSKb.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://cargo-chart.png')
            .setDescription(`\`\`\`\nThe following list are the players who stole the most amount of cargo. This is measured in SCU and individual items pilfered.\n\`\`\`\n`)
            .setColor('#b519ff');
        sortedByTopStolenCargo.forEach(([username, stats], index) => {

            topStolenCargoEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `Total Items Stolen: ${Math.round(stats.total_scu)}\n`,
                inline: false
            });
        });
        embeds.push(topStolenCargoEmbed);

        // Top players by pirate acts
        const topPirateActsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Thugs`, iconURL: 'https://i.imgur.com/SBKHSKb.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://acts-chart.png')
            .setDescription(`\`\`\`\nThe following are the members that pirated the most. Not necessarily the richest or most efficient, but definitely the most active.\n\n\`\`\``)
            .setColor('#b519ff');
            sortedByTopPiracyActs.forEach(([username, stats], index) => {

            topPirateActsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Total Piracy Acts:** ${stats.total_hits}\n`,
                inline: false
            });
        });
        embeds.push(topPirateActsEmbed);
        return embeds;
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}