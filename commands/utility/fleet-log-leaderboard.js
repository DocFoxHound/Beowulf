const { AttachmentBuilder, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllShipLogs, getShipLogsByPatch, getShipLogsByCommanderAndPatch, getShipLogsByCommanderId } = require('../../api/shipLogApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById, getUsers } = require('../../api/userlistApi');
const { getPlayerShipByEntryId } = require('../../api/playerShipApi');
const { generateLeaderboardChart } = require('../../common/chart-generator');
const fs = require('fs');


const command = new SlashCommandBuilder()
    .setName('fleet-log-leaderboard')
    .setDescription('See the ShipLog Leaderboards for IronPoint.')
    .addStringOption(option =>
        option.setName('patch')
            .setDescription('Which patch to search')
            .setRequired(true)
            .setAutocomplete(true))
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Which user to search (leave blank for all)')
            .setRequired(false));;

module.exports = {
    data: command,
    async execute(interaction) {
        const patch = interaction.options.getString('patch');
        const user = interaction.options.getUser('user');

        try {
            const patchSelectedBool = patch !== 'ALL' ? true : false;
            let embeds = null;
            let shipLogs = [];
            let commanderData = null;
            let crewData = null;
            if(patchSelectedBool && !user){ //patch selected
                shipLogs = await getShipLogsByPatch(patch)
                if(!shipLogs){
                    return interaction.reply({ content: `No Fleet logs found for patch ${patch}.`, ephemeral: true });
                }
                commanderData = await generateCommanderData(shipLogs);
                airsubcommanderData = await generateAirSubcommanderData(shipLogs);
                fpssubcommanderData = await generateFpsSubcommanderData(shipLogs);
                crewData = await generateCrewData(shipLogs);
                embeds = await createLeaderboardEmbeds(null, commanderData, airsubcommanderData, fpssubcommanderData, crewData, patch, null);
            }else if (patchSelectedBool && user){ //user and patch selected
                shipLogs = await getShipLogsByPatch(patch);
                if(!shipLogs){
                    return interaction.reply({ content: `No Fleet logs found for patch ${patch}.`, ephemeral: true });
                }
                individualData = await generateIndividualData(shipLogs, user);
                embeds = await createLeaderboardEmbeds(individualData, null, null, null, null, patch, user);
            }else if(!patchSelectedBool && user){ // ALL and user selected
                shipLogs = await getAllShipLogs(user);
                individualData = await generateIndividualData(shipLogs, user);
                embeds = await createLeaderboardEmbeds(individualData, null, null, null, null, patch, user);
                // individualData, commanderData, airsubcommanderData, fpssubcommanderData, crewData, patch, user
            }else if (!patchSelectedBool && !user){ //ALL and no user
                shipLogs = await getAllShipLogs()
                commanderData = await generateCommanderData(shipLogs);
                airsubcommanderData = await generateAirSubcommanderData(shipLogs);
                fpssubcommanderData = await generateFpsSubcommanderData(shipLogs);
                crewData = await generateCrewData(shipLogs);
                embeds = await createLeaderboardEmbeds(null, commanderData, airsubcommanderData, fpssubcommanderData, crewData, patch, null);
            }

            // Create buttons for navigation
            const buttons = new ActionRowBuilder();

            if (embeds.length > 1) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true), // Disable "Previous" button initially
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            // Send the first embed with navigation buttons (if applicable)
            let currentPage = 0;
            const message = await interaction.reply({
                embeds: [embeds[currentPage]],
                components: embeds.length > 1 ? [buttons] : [], // Only add buttons if there are multiple embeds
                fetchReply: true
            });

            // Only create a collector if there are multiple embeds
            if (embeds.length > 1) {
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
            }
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
async function generateIndividualData(shipLogs, user) {
    try{
        let userStats = { timesCommanding: 0, subcommandInstances: 0, airsubcommandInstances: 0, fpssubcommandInstances: 0, totalInstances: 0, crewedInstances: 0, totalSubcommanders: 0, totalCrewWhileCommanding: 0, totalCrewWhileSubCommanding: 0};
        for (const log of shipLogs) {
            if(log.commander === user.id) {
                userStats.timesCommanding += 1;
                userStats.totalInstances += 1;
                if(log.air_subcommanders === null && log.fps_subcommanders === null){
                    userStats.totalSubcommanders += 0;
                }else if(log.air_subcommanders !== null && log.fps_subcommanders === null){
                    userStats.totalSubcommanders += log.air_subcommanders.length;
                }else if(log.air_subcommanders === null && log.fps_subcommanders !== null){
                    userStats.totalSubcommanders += log.fps_subcommanders.length;
                }else{
                    userStats.totalSubcommanders += log.air_subcommanders.length + log.fps_subcommanders.length;
                }
                if(log.crew === null || log.crew.length === 0){
                    userStats.totalCrewWhileCommanding += 0;
                }else{
                    userStats.totalCrewWhileCommanding += log.crew.length;
                }
            }
            const totalAirSubCommandersInLog = log.air_subcommanders !== null ? log.air_subcommanders.length : 0;
            const totalFpsSubCommandersInLog = log.fps_subcommanders !== null ? log.fps_subcommanders.length : 0;
            const totalSubCommandersInLog = totalAirSubCommandersInLog + totalFpsSubCommandersInLog;
            if(log.air_subcommanders !== null && log.air_subcommanders.includes(user.id)){
                userStats.subcommandInstances += 1;
                userStats.airsubcommandInstances += 1;
                userStats.totalCrewWhileSubCommanding += (log.crew.length / totalSubCommandersInLog);
                userStats.totalInstances += 1;
            }
            if(log.fps_subcommanders !== null && log.fps_subcommanders.includes(user.id)){
                userStats.subcommandInstances += 1;
                userStats.fpssubcommandInstances += 1;
                userStats.totalCrewWhileSubCommanding += (log.crew.length / totalSubCommandersInLog);
                userStats.totalInstances += 1;
            }
            if(log.crew !== null && log.crew.includes(user.id)){
                userStats.crewedInstances += 1;
                userStats.totalInstances += 1;
            }
        }
        commandStats = {
            timesCommanding: userStats.timesCommanding,
            totalSubcommanders: userStats.totalSubcommanders,
            totalCrew: userStats.totalCrewWhileCommanding
        }
        subcommandStats = {
            subcommandInstances: userStats.subcommandInstances,
            totalCrew: userStats.totalCrewWhileSubCommanding
        }
        // userStats.commandEffectiveness = calculateCommandEffectiveness(commandStats);
        // userStats.subcommandEffectiveness = subCommanderEffectivenessScore(subcommandStats);
        return userStats;
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
                commanderboard[commanderUser.username] = { commanderName: commanderUser.username, air_subcommanders: [], fps_subcommanders: [], crew: [], totalSubcommanders: 0, totalCrew: 0, timesCommanding: 0 };
            }
            let airsubcommanderList = [];
            let fpssubcommanderList = [];
            if(log.air_subcommanders !== null && log.air_subcommanders.length > 0){
                for(const sub of log.air_subcommanders){
                    const subUser = await getUserById(sub);
                    if(subUser === null){
                        airsubcommanderList.push(subUser)
                    }else{
                        airsubcommanderList.push(subUser.username);
                    }
                }
            }else{
                airsubcommanderList.push('None');
            }
            if(log.fps_subcommanders !== null && log.fps_subcommanders.length > 0){
                for(const sub of log.fps_subcommanders){
                    const subUser = await getUserById(sub);
                    if(subUser === null){
                        fpssubcommanderList.push(subUser)
                    }else{
                        fpssubcommanderList.push(subUser.username);
                    }
                }
            }else{
                fpssubcommanderList.push('None');
            }
            let crewList = [];
            if(log.crew !== null && log.crew.length > 0){
                for(const crew of log.crew){
                    const crewUser = await getUserById(crew);
                    if(crewUser === null){
                        crewList.push(crew)
                    }else{
                        crewList.push(crewUser.username);
                    }
                }
            }else{
                crewList.push('None');
            }
            commanderboard[commanderUser.username].air_subcommanders.push(...airsubcommanderList);
            commanderboard[commanderUser.username].fps_subcommanders.push(...fpssubcommanderList);
            commanderboard[commanderUser.username].crew.push(...crewList);
            commanderboard[commanderUser.username].timesCommanding += 1;
            if(log.air_subcommanders !== null && log.air_subcommanders.length > 0){
                commanderboard[commanderUser.username].totalSubcommanders += airsubcommanderList.length;
            }
            if(log.fps_subcommanders !== null && log.fps_subcommanders.length > 0){
                commanderboard[commanderUser.username].totalSubcommanders += fpssubcommanderList.length;
            }
            if(log.crew !== null && log.crew.length > 0){
                commanderboard[commanderUser.username].totalCrew += crewList.length;
            }
        }
        return commanderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateAirSubcommanderData(shipLogs) {
    const subcommandboard = {};
    try{
        for (const log of shipLogs) {
            // const shipUsedObject = await getPlayerShipByEntryId(log.ship_used);
            // const shipName = log.ship_used_name;
            let subcomUser = null
            if(log.air_subcommanders === null || log.air_subcommanders.length === 0){
                continue;
            }
            for(const subcom of log.air_subcommanders){
                subcomUser = await getUserById(subcom);
                if(subcomUser === null){
                    continue;
                }
                if (!subcommandboard[subcomUser.username]) {
                    subcommandboard[subcomUser.username] = { subcomName: subcomUser.username, subcommandInstances: 0, totalCrew: 0 };
                }
                
                subcommandboard[subcomUser.username].subcommandInstances += 1;
                subcommandboard[subcomUser.username].totalCrew += log.crew.length;

            }
        }
        return subcommandboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

async function generateFpsSubcommanderData(shipLogs) {
    const subcommandboard = {};
    try{
        for (const log of shipLogs) {
            // const shipUsedObject = await getPlayerShipByEntryId(log.ship_used);
            // const shipName = log.ship_used_name;
            let subcomUser = null
            if(log.fps_subcommanders === null || log.fps_subcommanders.length === 0){
                continue;
            }
            for(const subcom of log.fps_subcommanders){
                subcomUser = await getUserById(subcom);
                if(subcomUser === null){
                    continue;
                }
                if (!subcommandboard[subcomUser.username]) {
                    subcommandboard[subcomUser.username] = { subcomName: subcomUser.username, subcommandInstances: 0, totalCrew: 0 };
                }
                
                subcommandboard[subcomUser.username].subcommandInstances += 1;
                subcommandboard[subcomUser.username].totalCrew += log.crew.length;

            }
        }
        return subcommandboard;
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
            if(log.crew === null || log.crew.length === 0){
                continue;
            }
            for(const crew of log.crew){
                crewUser = await getUserById(crew);
                if(crewUser === null){
                    continue;
                }
                if (!crewboard[crewUser.username]) {
                    crewboard[crewUser.username] = { crewName: crewUser.username, crewedInstances: 0 };
                }

                crewboard[crewUser.username].crewedInstances += 1;
            }
        }
        return crewboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create leaderboard embeds
async function createLeaderboardEmbeds(individualData, commanderData, airsubcommanderData, fpssubcommanderData, crewData, patch, user) {
    try{
        const embeds = [];
        if(individualData === null){
            const sortedByTopCommanders = structuredClone(Object.entries(commanderData).sort((a, b) => b[1].timesCommanding - a[1].timesCommanding));
            const sortedByTopAirSubCommanders = structuredClone(Object.entries(airsubcommanderData).sort((a, b) => b[1].subcommandInstances - a[1].subcommandInstances));
            const sortedByTopFpsSubCommanders = structuredClone(Object.entries(fpssubcommanderData).sort((a, b) => b[1].subcommandInstances - a[1].subcommandInstances));
            const sortedByTopCrew = structuredClone(Object.entries(crewData).sort((a, b) => b[1].crewedInstances - a[1].crewedInstances));

            // const { buffer: commanderBuffer, filePath: commanderPath } = await generateLeaderboardChart(sortedByTopCommanders.slice(0, 10), 'timesCommanding', 'commander-chart.png');
            // const { buffer: airSubBuffer, filePath: airSubPath } = await generateLeaderboardChart(sortedByTopAirSubCommanders.slice(0, 10), 'subcommandInstances', 'airsub-chart.png');
            // const { buffer: fpsSubBuffer, filePath: fpsSubPath } = await generateLeaderboardChart(sortedByTopFpsSubCommanders.slice(0, 10), 'subcommandInstances', 'fpssub-chart.png');
            // const { buffer: crewBuffer, filePath: crewPath } = await generateLeaderboardChart(sortedByTopCrew.slice(0, 10), 'crewedInstances', 'crew-chart.png');

            // attachmentMap = {
            //     0: new AttachmentBuilder(commanderBuffer, { name: 'commander-chart.png' }),
            //     1: new AttachmentBuilder(airSubBuffer, { name: 'airsub-chart.png' }),
            //     2: new AttachmentBuilder(fpsSubBuffer, { name: 'fpssub-chart.png' }),
            //     3: new AttachmentBuilder(crewBuffer, { name: 'crew-chart.png' })
            // };






            // Top Commanders by value
            const topCommandersEmbed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Top Commanders in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/g8GdSLJ.png')
                .setDescription(`\`\`\`\nThe following list are the top Commanders in the IronPoint fleet. The amount of times they lead is taken into account, but so is their balance of subcommand and total crew. They understand how to balance their leadership and delegate appropriately.
                    \`\`\`\n\n`)
                .setColor('#3e6606');
                sortedByTopCommanders.forEach(([username, stats], index) => {
                    topCommandersEmbed.addFields({
                        name: `${index + 1}. **${username}**`,
                        value: `Times Commanding: ${stats.timesCommanding}
                        Total Sub-Commanders: ${stats.totalSubcommanders}
                        Total Crew: ${stats.totalCrew}
                        `,
                        inline: false
                    });
            });
            embeds.push(topCommandersEmbed);

            // Top Crew by value
            const topAirSubCommanders = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Top Air Sub-Commanders in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/g8GdSLJ.png')
                .setDescription(`\`\`\`\nThe following are the top Sub-Commanders of the IronPoint fleet. Their value is measured by the amount of times they assisted a commander, and in a smaller way how many individuals were involved in the fleet as a whole.
                    \`\`\`\n\n`)
                .setColor('#3e6606');
                sortedByTopAirSubCommanders.forEach(([username, stats], index) => {
                    topAirSubCommanders.addFields({
                        name: `${index + 1}. **${username}**`,
                        value: `Air Sub-Commands: ${stats.subcommandInstances}
                        Total Crew: ${stats.totalCrew}`
                        ,
                        inline: false
                    });
            });
            embeds.push(topAirSubCommanders);

            // Top Crew by value
            const topFpsSubCommanders = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Top FPS Sub-Commanders in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/g8GdSLJ.png')
                .setDescription(`\`\`\`\nThe following are the top Sub-Commanders of the IronPoint fleet. Their value is measured by the amount of times they assisted a commander, and in a smaller way how many individuals were involved in the fleet as a whole.
                    \`\`\`\n\n`)
                .setColor('#3e6606');
                sortedByTopFpsSubCommanders.forEach(([username, stats], index) => {
                    topFpsSubCommanders.addFields({
                        name: `${index + 1}. **${username}**`,
                        value: `FPS Sub-Commands: ${stats.subcommandInstances}
                        Total Crew: ${stats.totalCrew}`
                        ,
                        inline: false
                    });
            });
            embeds.push(topFpsSubCommanders);

            // Top Crew by value
            const topCrewEmbed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Top Participants in the Fleet`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/g8GdSLJ.png')
                .setDescription(`\`\`\`\nThe following are the top Participants Members of the IronPoint fleet. They're value is measured in participation.
                    \`\`\`\n\n`)
                .setColor('#3e6606');
                sortedByTopCrew.forEach(([username, stats], index) => {
                topCrewEmbed.addFields({
                    name: `${index + 1}. **${username}**`,
                    value: `Total Fleets: ${stats.crewedInstances}
                    \n`,
                    inline: false
                });
            });
            embeds.push(topCrewEmbed);

        }else{
            // Top Crew by value
            const individualEmbed = new EmbedBuilder()
                .setThumbnail(user.displayAvatarURL())
                .setAuthor({ name: `Individual Player Stats`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/g8GdSLJ.png')
                .setDescription(`\`\`\`\nThe following are the stats by the player ${user.username}.\nTotal Events: ${individualData.timesCommanding + individualData.subcommandInstances + individualData.crewedInstances}
                    \`\`\`\n\n`)
                .setColor('#3e6606')
                .addFields({
                    name: `**Command**`,
                    value: `Times Commanding: ${individualData.timesCommanding}
                    Total Sub-Commanders: ${individualData.totalSubcommanders}
                    Total Crew: ${individualData.totalCrewWhileCommanding}
                    \n`,
                    inline: false
                })
                .addFields({
                    name: `**Sub-Command**`,
                    value: `Total Sub-Commands: ${individualData.subcommandInstances}
                    Air Sub-Commands: ${individualData.airsubcommandInstances}
                    FPS Sub-Commands: ${individualData.fpssubcommandInstances}
                    Total Crew: ${individualData.totalCrewWhileSubCommanding}
                    \n`,
                    inline: false
                })
                .addFields({
                    name: `**Crew Participation**`,
                    value: `Total Crew Instances: ${individualData.crewedInstances}
                    \n`,
                    inline: false
                })
            embeds.push(individualEmbed);
        }
        
        return embeds;
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}

// function formatToCurrency(value){
//     try{
//         const formatted = new Intl.NumberFormat('en-US', {
//             style: 'currency',
//             currency: 'USD',
//           }).format(value);
//         return formatted;
//     }catch(error){
//         console.error('Error formatting value to currency:', error);
//         return null;  // Return null if there's an error
//     }
// }

// const calculateCommandEffectiveness = (stats) => {
//     const { timesCommanding, totalSubcommanders, totalCrew } = stats;

//     // Avoid divide-by-zero
//     if (totalCrew === 0 || timesCommanding === 0) return 0;

//     // === Experience Score ===
//     const experienceWeight = 0.7;
//     const experienceScore = timesCommanding; // scaled raw

//     // === Leadership Balance Score ===
//     const idealRatio = 1 / 6; // 1 subcommander for every 6 crew
//     const actualRatio = totalSubcommanders / totalCrew;

//     // Calculate how close to ideal (lower is better)
//     const ratioDifference = Math.abs(actualRatio - idealRatio);

//     // Invert it so closer to ideal is better (perfect = 1, bad = 0)
//     const ratioScore = Math.max(0, 1 - ratioDifference * 10); // scale tolerance

//     const ratioWeight = 0.3;
//     const finalScore = (experienceScore * experienceWeight) + (ratioScore * ratioWeight);

//     return Math.round(finalScore * 100) / 100; // rounded to 2 decimals
// };

// const subCommanderEffectivenessScore = (stats) => {
//     const { subcommandInstances, totalCrew } = stats;

//     if (subcommandInstances === 0) return 0;

//     // === Experience Component ===
//     const experienceWeight = 0.8;
//     const experienceScore = subcommandInstances;

//     // === Crew Impact Component ===
//     const crewWeight = 0.2;

//     // We normalize the crew per instance (higher is better)
//     const avgCrewPerInstance = totalCrew / subcommandInstances;
    
//     // Cap or scale it if needed (optional)
//     const normalizedCrewScore = Math.min(avgCrewPerInstance / 10, 1); // max out bonus after 10 crew per instance

//     const finalScore =
//         (experienceScore * experienceWeight) +
//         (normalizedCrewScore * crewWeight);

//     return Math.round(finalScore * 100) / 100;
// };

// function calculateCrewEffectiveness(crew) {
//     const CREW_WEIGHT = 5;
//     const KILL_WEIGHT = 2;
//     const DAMAGE_WEIGHT = 1;
//     const VARIETY_WEIGHT = 1.5;

//     const uniqueShips = new Set(crew.shipsCrewed);
//     const uniqueShipCount = uniqueShips.size;

//     const crewedInstances = crew.shipsCrewed.length;
//     const sharedKills = crew.sharedKills;
//     const sharedDamage = crew.sharedDamage;
//     const shipsCrewed = uniqueShipCount;
  
//     const score = (
//       (crewedInstances * CREW_WEIGHT) +
//       (Math.sqrt(sharedKills) * KILL_WEIGHT) +
//       (Math.sqrt(sharedDamage) * DAMAGE_WEIGHT) +
//       (Math.log2(shipsCrewed + 1) * VARIETY_WEIGHT)
//     );
  
//     return score;
// }