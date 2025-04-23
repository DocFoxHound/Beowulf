const { AttachmentBuilder, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById, getUsers } = require('../../api/userlistApi');
const { getHitLogsByPatch, getAllHitLogs } = require('../../api/hitTrackerApi');
const { generateLeaderboardChart } = require('../../common/chart-generator');
const { getBadgesByPatch, getAllBadges } = require('../../api/badgeApi');
const fs = require('fs');
const path = require('path');

const command = new SlashCommandBuilder()
    .setName('badge-leaderboard')
    .setDescription('See the Badge Leaderboards for IronPoint.')
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
            let allBadgesUnsorted;
            const allUsers = await getUsers();
            
            const patchSelectedBool = patch !== 'ALL' ? true : false;
            if(patchSelectedBool){ //patch selected
                allBadgesUnsorted = await getBadgesByPatch(patch);
            }else{ //'ALL' selected
                allBadgesUnsorted = await getAllBadges();
            }
            const rawValueBadgesByUser = await generateTopValueBadgeEarners(allBadgesUnsorted, allUsers);
            const rawNumberBadgesByUser = await generateTopNumberBadges(allBadgesUnsorted, allUsers);

            const sortedByWeight = structuredClone(Object.entries(rawValueBadgesByUser).sort((a, b) => b[1].total_value - a[1].total_value)).slice(0, 10);
            const sortedByNumber = structuredClone(Object.entries(rawNumberBadgesByUser).sort((a, b) => b[1].total_badges - a[1].total_badges)).slice(0, 10);

            const { buffer: valueBuffer, filePath: valuePath } = await generateLeaderboardChart(sortedByWeight.slice(0, 10), 'total_value', 'value-chart.png');
            const { buffer: actsBuffer, filePath: actsPath } = await generateLeaderboardChart(sortedByNumber.slice(0, 10), 'total_badges', 'acts-chart.png');

            const attachmentMap = {
                0: new AttachmentBuilder(valueBuffer, { name: 'value-chart.png' }),
                1: new AttachmentBuilder(actsBuffer, { name: 'acts-chart.png' })
            };

            // console.log(sortedByWeight)
            embeds = createLeaderboardEmbeds(sortedByWeight, sortedByNumber, patch);

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
              
            [valuePath, actsPath].forEach(path =>
                fs.unlink(path, err => {
                  if (err) console.error(`Failed to delete ${path}:`, err);
                })
            );

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
            console.error('Error in badge leaderboard command:', error);
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
async function generateTopNumberBadges(allBadges, allUsers) {
    const leaderboard = {};
    try{
        for (const log of allBadges) {
            // const userObject = await getUserById(log.user_id);
            const userObject = allUsers.find(user => user.id === log.user_id);
            const userName = userObject.username;
            if (!leaderboard[userName]) {
                leaderboard[userName] = { username: userName, total_badges: 0 };
            }

            leaderboard[userName].total_badges += 1;
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateTopValueBadgeEarners(allBadges, allUsers) {
    const leaderboard = {};
    try{
        for (const log of allBadges) {
            // const userObject = await getUserById(log.user_id);
            const userObject = allUsers.find(user => user.id === log.user_id);
            const userName = userObject.username;
            if (!leaderboard[userName]) {
                leaderboard[userName] = { username: userName, total_value: 0 };
            }

            leaderboard[userName].total_value += Number(log.badge_weight) || 0;
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

function createLeaderboardEmbeds(sortedByWeight, sortedByNumber, patch) {
    try{
        const embeds = [];
        // Top players by value earned
        const topValueBadges = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png') // Use the chart as the thumbnail
            .setAuthor({ name: `Top Badges by Points`, iconURL: 'https://i.imgur.com/JvvqhbV.png' })
            .setTitle(`Patch ${patch}`)
            .setImage(`attachment://value-chart.png`)
            .setDescription(`\`\`\`\nThe following are a list of top players by their total badge score.\n\n\`\`\``)
            .setColor('#e3d15f');
            sortedByWeight.forEach(([username, stats], index) => {
                topValueBadges.addFields({
                    name: `${index + 1}. ${username}`,
                    value: `
                    **Total Points:** ${Math.round(stats.total_value).toLocaleString()}\n`,
                    inline: false
                });
            });
        embeds.push(topValueBadges);

        // Top players by total stolen cargo
        const topBadgeEarners = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Badge Earners`, iconURL: 'https://i.imgur.com/JvvqhbV.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://acts-chart.png')
            .setDescription(`\`\`\`\nThe following are the top total badge earners.\n\`\`\`\n`)
            .setColor('#e3d15f');
        sortedByNumber.forEach(([username, stats], index) => {

            topBadgeEarners.addFields({
                name: `${index + 1}. ${username}`,
                value: `Total Badges: ${Math.round(stats.total_badges)}\n`,
                inline: false
            });
        });
        embeds.push(topBadgeEarners);
        return embeds;
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}