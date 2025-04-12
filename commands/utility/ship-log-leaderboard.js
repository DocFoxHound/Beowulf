const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllShipLogs, getShipLogsByPatch, getShipLogByEntryId, getShipLogsByCommanderId, getShipLogsByOwnerId, getCrewShipLogs, getShipLogsByCommanderAndPatch, getShipLogsByOwnerAndPatch, getCrewShipLogsByUserAndPatch } = require('../../api/shipLogApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById } = require('../../api/userlistApi');
const { getPlayerShipByEntryId } = require('../../api/playerShipApi');


const command = new SlashCommandBuilder()
    .setName('ship-log-leaderboard')
    .setDescription('See the ShipLog Leaderboards for IronPoint.')
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
            let shipLogs = [];
            let leaderBoardData = null;
            let commanderData = null;
            let crewData = null;
            if(patchSelectedBool){ //patch selected
                shipLogs = await getShipLogsByPatch(patch)
                leaderBoardData = await generateLeaderboardData(shipLogs);
                commanderData = await generateCommanderData(shipLogs);
                crewData = await generateCrewData(shipLogs);
                embeds = createLeaderboardEmbeds(leaderBoardData, commanderData, crewData, patch);
            }else{ //'ALL' selected
                shipLogs = await getAllShipLogs()
                leaderBoardData = await generateLeaderboardData(shipLogs);
                commanderData = await generateCommanderData(shipLogs);
                crewData = await generateCrewData(shipLogs);
                embeds = createLeaderboardEmbeds(leaderBoardData, commanderData, crewData, patch);
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
async function generateLeaderboardData(shipLogs) {
    const leaderboard = {};
    try{
        for (const log of shipLogs) {
            const shipUsedObject = await getPlayerShipByEntryId(log.ship_used);
            const shipName = log.ship_used_name;

            if (!leaderboard[shipName]) {
                leaderboard[shipName] = { shipType: shipUsedObject.ship_model , commanders: [], crew: [], owner: log.owner_id, orgs: [], totalDamage: 0, totalKills: 0};
            }
            let crewList = [];
            if(log.crew.length > 0){
                for(const crew of log.crew){
                    const crewUser = await getUserById(crew);
                    crewList.push(crewUser.username);
                }
            }
            const commanderUserObject = await getUserById(log.commander);
            
            
            leaderboard[shipName].commanders.push(commanderUserObject.username);
            leaderboard[shipName].crew.push(...crewList);
            leaderboard[shipName].orgs.push(...log.victim_orgs);
            leaderboard[shipName].totalDamage += log.value;
            leaderboard[shipName].totalKills += log.total_kills;
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate commander data
async function generateCommanderData(shipLogs) {
    const commanderboard = {};
    try{
        for (const log of shipLogs) {
            // const shipUsedObject = await getPlayerShipByEntryId(log.ship_used);
            // const shipName = log.ship_used_name;
            const commanderUser = await getUserById(log.commander);

            if (!commanderboard[commanderUser.username]) {
                commanderboard[commanderUser.username] = { commanderName: commanderUser.username, ships: [], crew: [], totalCrew: 0, totalDamage: 0, totalKills: 0, timesCommanding: 0};
            }
            let crewList = [];
            if(log.crew.length > 0){
                for(const crew of log.crew){
                    const crewUser = await getUserById(crew);
                    crewList.push(crewUser.username);
                }
            }
            commanderboard[commanderUser.username].crew.push(...crewList);
            commanderboard[commanderUser.username].ships.push(log.ship_used_name);
            commanderboard[commanderUser.username].totalCrew += crewList.length;
            commanderboard[commanderUser.username].totalDamage += log.value;
            commanderboard[commanderUser.username].totalKills += log.total_kills;
            commanderboard[commanderUser.username].timesCommanding += 1;
        }
        return commanderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateCrewData(shipLogs) {
    const crewboard = {};
    try{
        for (const log of shipLogs) {
            // const shipUsedObject = await getPlayerShipByEntryId(log.ship_used);
            // const shipName = log.ship_used_name;
            let crewUser = null
            for(const crew of log.crew){
                crewUser = await getUserById(crew);
                if (!crewboard[crewUser.username]) {
                    crewboard[crewUser.username] = { crewName: crewUser.username, crewedInstances: 0, sharedDamage: 0, sharedKills: 0, shipsCrewed: []};
                }
                let crewList = [];
                if(log.crew.length > 0){
                    for(const crew of log.crew){
                        const crewUser = await getUserById(crew);
                        crewList.push(crewUser.username);
                    }
                }
                crewboard[crewUser.username].crewedInstances += 1;
                crewboard[crewUser.username].sharedDamage += log.divided_value;
                crewboard[crewUser.username].sharedKills += log.divided_kills;
                crewboard[crewUser.username].shipsCrewed.push(log.ship_used_name);
            }
        }
        return crewboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create leaderboard embeds
function createLeaderboardEmbeds(leaderboardData, commanderData, crewData, patch) {
    try{
        const sortedByTopShip = structuredClone(Object.entries(leaderboardData).sort((a, b) => (b[1].totalDamage / b[1].totalKills) - (a[1].totalDamage / a[1].totalKills)));
        const sortedByTopCommanders = structuredClone(Object.entries(commanderData).sort((a, b) => calculateEffectiveness(b[1]) - calculateEffectiveness(a[1])));
        const sortedByTopCrew = structuredClone(Object.entries(crewData).sort((a, b) => calculateCrewEffectiveness(b[1]) - calculateCrewEffectiveness(a[1])));
        const sortedByKills = Object.entries(leaderboardData).sort((a, b) => b[1].totalKills - a[1].totalKills);
        const sortedByDamages = Object.entries(leaderboardData).sort((a, b) => b[1].totalDamage - a[1].totalDamage);

        const embeds = [];

        // Top players by kill count
        const topShipsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Ships in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/g8GdSLJ.png')
            .setDescription(`\`\`\`\nThe following ships are the most effective in the IronPoint Fleet. They are measured by their Total Damage Done divided by their Total Kills.
                \n-Total Damages: ${formatToCurrency(sortedByDamages.reduce((acc, [_, stats]) => acc + stats.totalDamage, 0))}\n-Total Kills: ${sortedByKills.reduce((acc, [_, stats]) => acc + stats.totalKills, 0)}\n\n\`\`\``)
            .setColor('#689e81');
            sortedByTopShip.forEach(([username, stats], index) => {
                // Get top 3 commanders
                const commanderCounts = stats.commanders.reduce((acc, commander) => {
                    acc[commander] = (acc[commander] || 0) + 1;
                    return acc;
                }, {});
                const topCommanders = Object.entries(commanderCounts)
                    .sort((a, b) => b[1] - a[1]) // sort by frequency
                    .slice(0, 3)
                    .map(([name, count]) => `${name} (${count})`)
                    .join(', ');

                // Get top 3 crew
                const crewCounts = stats.crew.reduce((acc, crew) => {
                    acc[crew] = (acc[crew] || 0) + 1;
                    return acc;
                }, {});
                const topCrew = Object.entries(crewCounts)
                    .sort((a, b) => b[1] - a[1]) // sort by frequency
                    .slice(0, 3)
                    .map(([name, count]) => `${name} (${count})`)
                    .join(', ');

                // Get top 3 victim orgs
                const orgCounts = stats.orgs.reduce((acc, orgs) => {
                    acc[orgs] = (acc[orgs] || 0) + 1;
                    return acc;
                }, {});
                const topOrgs = Object.entries(orgCounts)
                    .sort((a, b) => b[1] - a[1]) // sort by frequency
                    .slice(0, 3)
                    .map(([name, count]) => `${name} (${count})`)
                    .join(', ');

                topShipsEmbed.addFields({
                    name: `${index + 1}. ${username}`,
                    value: `
                    **Ship Type:** ${stats.shipType}
                    **Kill Count:** ${stats.totalKills}
                    **Total Damage Done:** ${formatToCurrency(stats.totalDamage)}
                    **Top Commanders:** ${topCommanders}
                    **Top Crew:** ${topCrew}
                    **Top Org Victims:** ${topOrgs}\n`,
                    inline: false
                });
            });
        embeds.push(topShipsEmbed);

        // Top Commanders by value
        const topCommandersEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Commanders in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/g8GdSLJ.png')
            .setDescription(`\`\`\`\nThe following list are the top commanders in the IronPoint fleet. They are measured by their effectiveness as a commander and take the following metrics into account:
                \n-Combat Output: Using total kills and total damages done.\n-Leadership Load: Taking into account how many crew they have commanded.\n-Initiative: The numbers of times they have commanded a ship.\`\`\`\n\n`)
            .setColor('#3e6606');
        sortedByTopCommanders.forEach(([username, stats], index) => {
            // Get top 3 ships
            const shipsCount = stats.ships.reduce((acc, ships) => {
                acc[ships] = (acc[ships] || 0) + 1;
                return acc;
            }, {});
            const topShips = Object.entries(shipsCount)
                .sort((a, b) => b[1] - a[1]) // sort by frequency
                .slice(0, 3)
                .map(([name, count]) => `${name} (${count})`)
                .join(', ');

            topCommandersEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Effectiveness:** ${calculateEffectiveness(stats).toFixed(2)}
                **Top Ships:** ${topShips}
                **Total Kills:** ${stats.totalKills}
                **Total Damage Done:** ${formatToCurrency(stats.totalDamage)}
                **Total Crew:** ${stats.totalCrew}
                **Times Commanding:** ${stats.timesCommanding}\n`,
                inline: false
            });
        });
        embeds.push(topCommandersEmbed);

        // Top Crew by value
        const topCrewEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Crew Members in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/g8GdSLJ.png')
            .setDescription(`\`\`\`\nThe following are the top Crew Members of the IronPoint fleet. Their effectiveness as a Crew Member is measured using the following metrics:
                \n-Crewed Instances: How many times they've joined a ship crew.\n-Unique Ships: How many distinct ships have been served on.\n-Shared Kills: The sum of all kills divided by the numbers of crew on the ship.\n-Shared Damages: The sum of all damages dealt to another org divided by the numbers of crew on the ship.
                \`\`\`\n\n`)
            .setColor('#3e6606');
            sortedByTopCrew.forEach(([username, stats], index) => {
                // Get top 3 ships
                const shipsCount = stats.shipsCrewed.reduce((acc, shipsCrewed) => {
                    acc[shipsCrewed] = (acc[shipsCrewed] || 0) + 1;
                    return acc;
            }, {});
            const topShips = Object.entries(shipsCount)
                .sort((a, b) => b[1] - a[1]) // sort by frequency
                .slice(0, 3)
                .map(([name, count]) => `${name} (${count})`)
                .join(', ');

            const uniqueShips = new Set(stats.shipsCrewed);
            const uniqueShipCount = uniqueShips.size;

            topCrewEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Effectiveness:** ${calculateCrewEffectiveness(stats).toFixed(2)}
                **Top Ships:** ${topShips}
                **Total Shared Kills:** ${stats.sharedKills}
                **Total Shared Damages:** ${formatToCurrency(stats.sharedDamage)}
                **Unique Ships:** ${uniqueShipCount}\n`,
                inline: false
            });
        });
        embeds.push(topCrewEmbed);
        return embeds;
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
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

function calculateEffectiveness(commander) {
    const KILL_WEIGHT = 5;
    const DAMAGE_WEIGHT = 0.5;
    const CREW_WEIGHT = 2;
    const totalKills = commander.totalKills;
    const totalDamages = commander.totalDamage;
    const totalCrew = commander.totalCrew;
    const totalTimesCommanding = commander.timesCommanding;
  
    const score = (
      (totalKills * KILL_WEIGHT) +
      (Math.sqrt(totalDamages) * DAMAGE_WEIGHT) +
      (Math.log2(totalCrew + 1) * CREW_WEIGHT)
    ) / totalTimesCommanding;
  
    return score;
}

function calculateCrewEffectiveness(crew) {
    const CREW_WEIGHT = 5;
    const KILL_WEIGHT = 2;
    const DAMAGE_WEIGHT = 1;
    const VARIETY_WEIGHT = 1.5;

    const uniqueShips = new Set(crew.shipsCrewed);
    const uniqueShipCount = uniqueShips.size;

    const crewedInstances = crew.shipsCrewed.length;
    const sharedKills = crew.sharedKills;
    const sharedDamage = crew.sharedDamage;
    const shipsCrewed = uniqueShipCount;
  
    const score = (
      (crewedInstances * CREW_WEIGHT) +
      (Math.sqrt(sharedKills) * KILL_WEIGHT) +
      (Math.sqrt(sharedDamage) * DAMAGE_WEIGHT) +
      (Math.log2(shipsCrewed + 1) * VARIETY_WEIGHT)
    );
  
    return score;
}