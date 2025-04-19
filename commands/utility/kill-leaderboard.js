const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getAllBlackBoxes, getBlackBoxesByPatch, getBlackBoxesByUserAndPatch, getBlackBoxesByUserId, getAssistantBlackBoxes, getAssistantBlackBoxesByUserAndPatch } = require('../../api/blackBoxApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById } = require('../../api/userlistApi');
const { generateLeaderboardChart } = require('../../common/chart-generator');
const fs = require('fs');

const command = new SlashCommandBuilder()
    .setName('kill-leaderboard')
    .setDescription('See the BlackBox stats of either an individual or the whole organization.')
    .addStringOption(option =>
        option.setName('patch')
            .setDescription('Which patch to search')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('type')
            .setDescription('FPS, Ships, or Both?')
            .setRequired(true)
            .addChoices(
                { name: 'FPS Kills', value: 'fps' },
                { name: 'Ship Kills', value: 'ships' },
                { name: 'Combined Kills', value: 'overall' }
            ))
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Which user to search (leave blank for all)')
            .setRequired(false));

module.exports = {
    data: command,
    async execute(interaction) {
        const patch = interaction.options.getString('patch');
        const type = interaction.options.getString('type');
        const gamemode = interaction.options.getString('gamemode');
        const user = interaction.options.getUser('user') || null;
        try {
            let blackBoxLogs = [];
            if(type === "ships") {
                if (patch === 'ALL' && user) { //all patches, user identified
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByUserId(user.id) || []; // Fetch all black box logs
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed !== 'FPS' && log.ship_killed !== 'unknown'); // Filter for kills against FPS
                } else if (patch !== 'ALL' && user) { //patch identified, user identified
                    const coupling = {user_id: user.id, patch: patch}
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByUserAndPatch(coupling) || [];
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed !== 'FPS' && log.ship_killed !== 'unknown');
                    // blackBoxLogs = await getBlackBoxesByUserAndPatch(coupling);
                } else if (patch !== 'ALL' && !user) { //patch identified, no user identified (works)
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByPatch(patch);
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed !== 'FPS' && log.ship_killed !== 'unknown');
                } else { //all patches, no user identified
                    const allPrimaryBlackBoxLogs = await getAllBlackBoxes();
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed !== 'FPS' && log.ship_killed !== 'unknown');
                }
            }
            if(type === "fps") {
                if (patch === 'ALL' && user) { //all patches, user identified
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByUserId(user.id) || []; // Fetch all black box logs
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed === 'FPS' || log.ship_killed === 'unknown'); // Filter for kills against FPS
                } else if (patch !== 'ALL' && user) { //patch identified, user identified
                    const coupling = {user_id: user.id, patch: patch}
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByUserAndPatch(coupling) || [];
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed === 'FPS' || log.ship_killed === 'unknown');
                    // blackBoxLogs = await getBlackBoxesByUserAndPatch(coupling);
                } else if (patch !== 'ALL' && !user) { //patch identified, no user identified (works)
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByPatch(patch);
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed === 'FPS' || log.ship_killed === 'unknown');
                } else { //all patches, no user identified
                    const allPrimaryBlackBoxLogs = await getAllBlackBoxes();
                    blackBoxLogs = allPrimaryBlackBoxLogs.filter(log => log.ship_killed === 'FPS' || log.ship_killed === 'unknown');
                }
            }
            if(type === "overall") {
                if (patch === 'ALL' && user) { //all patches, user identified
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByUserId(user.id) || []; // Fetch all black box logs
                    blackBoxLogs = allPrimaryBlackBoxLogs;
                } else if (patch !== 'ALL' && user) { //patch identified, user identified
                    const coupling = {user_id: user.id, patch: patch}
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByUserAndPatch(coupling) || [];
                    blackBoxLogs = allPrimaryBlackBoxLogs;
                } else if (patch !== 'ALL' && !user) { //patch identified, no user identified (works)
                    const allPrimaryBlackBoxLogs = await getBlackBoxesByPatch(patch);
                    blackBoxLogs = allPrimaryBlackBoxLogs;
                } else { //all patches, no user identified
                    const allPrimaryBlackBoxLogs = await getAllBlackBoxes();
                    blackBoxLogs = allPrimaryBlackBoxLogs;
                }
            }

            

            if (blackBoxLogs.length === 0 || blackBoxLogs === null) {
                return interaction.reply({ content: 'No Kill logs found for the given criteria.', ephemeral: true });
            }

            // Generate leaderboard data and embeds
            const acBlackBoxLogs = Object.values(blackBoxLogs).filter(stats => stats.game_mode === 'AC');
            const puBlackBoxLogs = Object.values(blackBoxLogs).filter(stats => stats.game_mode === 'PU');
            let acLeaderBoardData = null;
            let puLeaderBoardData = null;
            let leaderBoardData = null;
            let individualData = null;
            if (user) { //all patches, user identified
                if(type === "fps"){
                    acLeaderBoardData = await generateIndividualFpsData(acBlackBoxLogs, user);
                    puLeaderBoardData = await generateIndividualFpsData(puBlackBoxLogs, user);
                }else if(type === "ships"){
                    acLeaderBoardData = await generateIndividualShipData(acBlackBoxLogs, user);
                    puLeaderBoardData = await generateIndividualShipData(puBlackBoxLogs, user);
                }else{
                    acLeaderBoardData = await generateIndividualCombinedData(acBlackBoxLogs, user);
                    puLeaderBoardData = await generateIndividualCombinedData(puBlackBoxLogs, user);
                }
            }else if (!user) { //patch identified, no user identified (works)
                if(type === "fps"){
                    acLeaderBoardData = await generateFpsLeaderboardData(acBlackBoxLogs);
                    puLeaderBoardData = await generateFpsLeaderboardData(puBlackBoxLogs);
                }else if(type === "ships"){
                    acLeaderBoardData = await generateShipLeaderboardData(acBlackBoxLogs);
                    puLeaderBoardData = await generateShipLeaderboardData(puBlackBoxLogs);
                }else{
                    acLeaderBoardData = await generateCombinedLeaderboardData(acBlackBoxLogs);
                    puLeaderBoardData = await generateCombinedLeaderboardData(puBlackBoxLogs);
                }
            }

            let embeds = null;
            let attachmentMap = {};
            let extKillPath = null;
            let extValuePath = null;
            let extPathThree = null;
            let extPathFour = null;
            let extPathFive = null;
            let extPathSix = null;
            if(!user) {
                if(type === "fps"){
                    const combinedLeaderboardData = { ...acLeaderBoardData, ...puLeaderBoardData };
                    const acSortedByKills = Object.entries(acLeaderBoardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const puSortedByKills = Object.entries(puLeaderBoardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const comSortedByKills = Object.entries(combinedLeaderboardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const { buffer: acKillBuffer, filePath: acKillPath } = await generateLeaderboardChart(acSortedByKills.slice(0, 10), 'kill_count', 'total-ac-kills-chart.png');
                    const { buffer: puKillBuffer, filePath: puKillPath } = await generateLeaderboardChart(puSortedByKills.slice(0, 10), 'kill_count', 'total-pu-kills-chart.png');
                    const { buffer: comKillBuffer, filePath: comKillPath } = await generateLeaderboardChart(comSortedByKills.slice(0, 10), 'kill_count', 'total-comb-kills-chart.png');
                    extKillPath = acKillPath
                    extValuePath = puKillPath
                    extPathThree = comKillPath
                    attachmentMap = {
                        0: new AttachmentBuilder(acKillBuffer, { name: 'total-ac-kills-chart.png' }),
                        1: new AttachmentBuilder(puKillBuffer, { name: 'total-pu-kills-chart.png' }),
                        2: new AttachmentBuilder(comKillBuffer, { name: 'total-comb-kills-chart.png' })
                    };
                    embeds = createFpsLeaderboardEmbeds(puSortedByKills, acSortedByKills, comSortedByKills, patch);
                }
                if(type === "ships"){
                    const combinedLeaderboardData = { ...acLeaderBoardData, ...puLeaderBoardData };
                    const sortedByKills = Object.entries(combinedLeaderboardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const sortedByValue = Object.entries(combinedLeaderboardData).sort((a, b) => b[1].value - a[1].value);
                    const sortedByAcKills = Object.entries(acLeaderBoardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const sortedByAcValue = Object.entries(acLeaderBoardData).sort((a, b) => b[1].value - a[1].value);
                    const sortedByPuKills = Object.entries(puLeaderBoardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const sortedByPuValue = Object.entries(puLeaderBoardData).sort((a, b) => b[1].value - a[1].value);
                    const { buffer: killBuffer, filePath: killPath } = await generateLeaderboardChart(sortedByKills.slice(0, 10), 'kill_count', 'total-kills-chart.png');
                    const { buffer: valueBuffer, filePath: valuePath } = await generateLeaderboardChart(sortedByValue.slice(0, 10), 'value', 'total-value-chart.png');
                    const { buffer: acKillBuffer, filePath: acKillPath } = await generateLeaderboardChart(sortedByAcKills.slice(0, 10), 'kill_count', 'ac-total-kills-chart.png');
                    const { buffer: acValueBuffer, filePath: acValuePath } = await generateLeaderboardChart(sortedByAcValue.slice(0, 10), 'value', 'ac-total-value-chart.png');
                    const { buffer: puKillBuffer, filePath: puKillPath } = await generateLeaderboardChart(sortedByPuKills.slice(0, 10), 'kill_count', 'pu-total-kills-chart.png');
                    const { buffer: puValueBuffer, filePath: puValuePath } = await generateLeaderboardChart(sortedByPuValue.slice(0, 10), 'value', 'pu-total-value-chart.png');
                    extKillPath = killPath
                    extValuePath = valuePath
                    extPathThree = acKillPath
                    extPathFour = acValuePath
                    extPathFive = puKillPath
                    extPathSix = puValuePath
                    attachmentMap = {
                        0: new AttachmentBuilder(killBuffer, { name: 'total-kills-chart.png' }),
                        1: new AttachmentBuilder(valueBuffer, { name: 'total-value-chart.png' }),
                        2: new AttachmentBuilder(acKillBuffer, { name: 'ac-total-kills-chart.png' }),
                        3: new AttachmentBuilder(acValueBuffer, { name: 'ac-total-value-chart.png' }),
                        4: new AttachmentBuilder(puKillBuffer, { name: 'pu-total-kills-chart.png' }),
                        5: new AttachmentBuilder(puValueBuffer, { name: 'pu-total-value-chart.png' })
                    };
                    embeds = createShipLeaderboardEmbeds(sortedByKills, sortedByValue, sortedByAcKills, sortedByAcValue, sortedByPuKills, sortedByPuValue, patch);
                }
                if (type === "overall") {
                    const combinedLeaderboardData = { ...acLeaderBoardData, ...puLeaderBoardData };
                    const sortedByKills = Object.entries(combinedLeaderboardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
                    const sortedByValue = Object.entries(combinedLeaderboardData).sort((a, b) => b[1].value - a[1].value);
                    const { buffer: killBuffer, filePath: killPath } = await generateLeaderboardChart(sortedByKills.slice(0, 10), 'kill_count', 'total-kills-chart.png');
                    const { buffer: valueBuffer, filePath: valuePath } = await generateLeaderboardChart(sortedByValue.slice(0, 10), 'value', 'total-value-chart.png');
                    extKillPath = killPath
                    extValuePath = valuePath
                    attachmentMap = {
                        0: new AttachmentBuilder(killBuffer, { name: 'total-kills-chart.png' }),
                        1: new AttachmentBuilder(valueBuffer, { name: 'total-value-chart.png' })
                    };
                    embeds = createCombinedLeaderboardEmbeds(sortedByKills, sortedByValue, patch);
                }
            }
            if(user) {
                if(type === "fps"){
                    const combinedLeaderboardData = { ...acLeaderBoardData, ...puLeaderBoardData };
                    embeds = createIndividualFpsEmbeds(acLeaderBoardData, puLeaderBoardData, combinedLeaderboardData, patch, user);
                }else if(type === "ships"){
                    embeds = createIndividualShipEmbeds(acLeaderBoardData, puLeaderBoardData, patch, user);
                }else{
                    embeds = createIndividualCombinedEmbeds(individualData, patch, user);
                }
                
            }

            if (embeds.length === 1) {
                // Only one page — no need for buttons
                // return interaction.reply({ embeds: [embeds[0]], ephemeral: false });
                await interaction.reply({ 
                    embeds: [embeds[0]], // Link the attachment to the embed
                    fetchReply: true 
                });
                return;
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
            let message;
            if(!user){
                message = await interaction.reply({ 
                    embeds: [embeds[currentPage].setImage(`attachment://${attachmentMap[currentPage].name}`)], // Link the attachment to the embed
                    components: [buttons], 
                    files: [attachmentMap[currentPage]], 
                    fetchReply: true });
            }
            if(user){
                message = await interaction.reply({ 
                    embeds: [embeds[currentPage]], // Link the attachment to the embed
                    components: [buttons], 
                    fetchReply: true });
            }
            
            
            const killPaths = [extKillPath, extValuePath, extPathThree, extPathFour, extPathFive, extPathSix].filter(path => path && path.length > 0);
            killPaths.forEach(path =>
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

                if(!user){
                    await i.update({ 
                        embeds: [embeds[currentPage].setImage(`attachment://${attachmentMap[currentPage].name}`)], // Link the attachment to the embed
                        components: [buttons], 
                        files: attachmentMap[currentPage] ? [attachmentMap[currentPage]] : [] 
                    });
                }
                if(user){
                    await i.update({ 
                        embeds: [embeds[currentPage]], // Link the attachment to the embed
                        components: [buttons]
                    });
                }
                
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








// Helper function to generate individual data
async function generateIndividualFpsData(blackBoxLogs, user) {
    try{
        const username = user.username;
        const leaderboard = {};

        for (const log of blackBoxLogs) {
            const hitId = log.id;

            if (!leaderboard[username]) {
                leaderboard[username] = { 
                    kill_count: 0, 
                    victims: [],
                    hits: []
                };
            }

            leaderboard[username].kill_count += log.kill_count;
            leaderboard[username].hits.push({
                id: hitId,
                kill_count: log.kill_count,
                ship_killed: log.ship_killed,
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

// Helper function to generate individual data
async function generateIndividualShipData(blackBoxLogs, user) {
    try{
        const username = user.username;
        const leaderboard = {};

        for (const log of blackBoxLogs) {
            const hitId = log.id;

            if (!leaderboard[username]) {
                leaderboard[username] = { 
                    kill_count: 0, 
                    value: 0, 
                    victims: [],
                    hits: []
                };
            }

            leaderboard[username].kill_count += log.kill_count;
            leaderboard[username].value += log.value;
            leaderboard[username].hits.push({
                id: hitId,
                kill_count: log.kill_count,
                ship_used: log.ship_used,
                ship_killed: log.ship_killed,
                value: log.value,
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

// Helper function to generate individual data
async function generateIndividualCombinedData(blackBoxLogs, user) {
    try{
        const username = user.username;
        const leaderboard = {};

        for (const log of blackBoxLogs) {
            const hitId = log.id;

            if (!leaderboard[username]) {
                leaderboard[username] = { 
                    kill_count: 0, 
                    victims: [],
                    hits: []
                };
            }

            killType = log.ship_killed === 'FPS' || log.ship_used === 'unknown' ? 'FPS' : 'Ship';

            leaderboard[username].kill_count += log.kill_count;
            leaderboard[username].hits.push({
                id: hitId,
                kill_count: log.kill_count,
                ship_used: log.ship_used,
                ship_killed: log.ship_killed,
                value: log.value,
                victims: log.victims,
                patch: log.patch,
                type: killType
            });
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating individual data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateFpsLeaderboardData(blackBoxLogs) {
    const leaderboard = {};
    try{
        for (const log of blackBoxLogs) {
            const user = await getUserById(log.user_id);
            const username = user.nickname ? user.nickname : user.username;
    
            if (!leaderboard[username]) {
                leaderboard[username] = { kill_count: 0 };
            }
    
            leaderboard[username].kill_count += log.kill_count;
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to generate leaderboard data
async function generateShipLeaderboardData(blackBoxLogs) {
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

// Helper function to generate leaderboard data
async function generateCombinedLeaderboardData(blackBoxLogs) {
    const leaderboard = {};
    try{
        for (const log of blackBoxLogs) {
            const user = await getUserById(log.user_id);
            const username = user.nickname ? user.nickname : user.username;
    
            if (!leaderboard[username]) {
                leaderboard[username] = { kill_count: 0, value: 0, hits: []};
            }

            killType = log.ship_killed === 'FPS' || log.ship_used === 'unknown' ? 'FPS' : 'Ship';
    
            leaderboard[username].kill_count += log.kill_count;
            leaderboard[username].value += log.value;
            leaderboard[username].hits.push({
                id: log.id,
                kill_count: log.kill_count,
                ship_used: log.ship_used,
                ship_killed: log.ship_killed,
                value: log.value,
                victims: log.victims,
                patch: log.patch,
                type: killType
            });
        }
        return leaderboard;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create leaderboard embeds
function createShipLeaderboardEmbeds(sortedByKills, sortedByValue, sortedByAcKills, sortedByAcValue, sortedByPuKills, sortedByPuValue, patch) {
    try{
        const embeds = [];
        // Top players by kill count
        const killsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Total Ship Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-kills-chart.png')
            .setDescription(`\`\`\`\nIronPoint Ship Kills: ${sortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
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
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Total Ship Damage Done`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-value-chart.png')
            .setDescription(`\`\`\`\nIronPoint Ship Damage: ${formatToCurrency(sortedByValue.reduce((acc, [_, stats]) => acc + stats.value, 0))}\`\`\`\n`)
            .setColor('#7199de');
        sortedByValue.forEach(([username, stats], index) => {
            valueEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Damages Cost:** ${formatToCurrency(stats.value)}`,
                inline: false
            });
        });
        embeds.push(valueEmbed);

        // Top AC kills
        const acKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `AC Ship Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://ac-total-kills-chart.png')
            .setDescription(`\`\`\`\nAC Ship Kills: ${sortedByAcKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');
        sortedByAcKills.forEach(([username, stats], index) => {
            acKillsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });
        embeds.push(acKillsEmbed);

        // Top AC value
        const acValueEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `AC Ship Damage Done`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://ac-total-value-chart.png')
            .setDescription(`\`\`\`\nAC Ship Damage: ${formatToCurrency(sortedByAcValue.reduce((acc, [_, stats]) => acc + stats.value, 0))}\`\`\`\n`)
            .setColor('#7199de');
        sortedByAcValue.forEach(([username, stats], index) => {
            acValueEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Damages Cost:** ${formatToCurrency(stats.value)}`,
                inline: false
            });
        });
        embeds.push(acValueEmbed);

        // Top PU kills
        const puKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `PU Ship Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://pu-total-kills-chart.png')
            .setDescription(`\`\`\`\nPU Ship Kills: ${sortedByPuKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');
        sortedByPuKills.forEach(([username, stats], index) => {
            puKillsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });
        embeds.push(puKillsEmbed);

        // Top PU value
        const puValueEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `PU Ship Damage Done`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://pu-total-value-chart.png')
            .setDescription(`\`\`\`\nPU Ship Damage: ${formatToCurrency(sortedByPuValue.reduce((acc, [_, stats]) => acc + stats.value, 0))}\`\`\`\n`)
            .setColor('#7199de');
        sortedByPuValue.forEach(([username, stats], index) => {
            puValueEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Damages Cost:** ${formatToCurrency(stats.value)}`,
                inline: false
            });
        });
        embeds.push(puValueEmbed);
        return embeds;
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create FPS leaderboard embeds
function createFpsLeaderboardEmbeds(puSortedByKills, acSortedByKills, comSortedByKills, patch) {
    try {
        const embeds = [];

        // Top players by kill count
        const combKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Total FPS Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-comb-kills-chart.png')
            .setDescription(`\`\`\`\nTotal FPS Kills: ${comSortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');
    
        comSortedByKills.forEach(([username, stats], index) => {
            combKillsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });
    
        embeds.push(combKillsEmbed);

        // Top players by kill count
        const puKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `PU FPS Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-pu-kills-chart.png')
            .setDescription(`\`\`\`\nIronPoint PU FPS Kills: ${puSortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');

        puSortedByKills.forEach(([username, stats], index) => {
            puKillsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });

        embeds.push(puKillsEmbed);

        // Top players by kill count
        const acKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `AC FPS Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-ac-kills-chart.png')
            .setDescription(`\`\`\`\nIronPoint AC FPS Kills: ${acSortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');

        acSortedByKills.forEach(([username, stats], index) => {
            acKillsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });

        embeds.push(acKillsEmbed);

        return embeds;
    } catch (error) {
        console.error('Error creating FPS leaderboard embeds:', error);
        return null; // Return null if there's an error
    }
}

// Helper function to create Combined leaderboard embeds
function createCombinedLeaderboardEmbeds(sortedByKills, sortedByValue, patch) {
    try {
        const embeds = [];
        // Top players by combined kills
        const combinedKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Players by Combined Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-kills-chart.png')
            .setDescription(`\`\`\`\nIronPoint Total Combined Kills: ${sortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');

        sortedByKills.forEach(([username, stats], index) => {
            combinedKillsEmbed.addFields({
                name: `${index + 1}. ${username}: ${stats.totalKills} kills.`,
                value: `**FPS Kills:** ${stats.hits.filter(hit => hit.type === 'FPS').reduce((acc, hit) => acc + hit.kill_count, 0)} // **Ship Kills:** ${stats.hits.filter(hit => hit.type === 'Ship').reduce((acc, hit) => acc + hit.kill_count, 0)}`,
                inline: false
            });
        });

        embeds.push(combinedKillsEmbed);

         // Top players by value
        const valueEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Total Ship Damage Done`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('attachment://total-value-chart.png')
            .setDescription(`\`\`\`\nIronPoint Ship Damage: ${formatToCurrency(sortedByValue.reduce((acc, [_, stats]) => acc + stats.value, 0))}\`\`\`\n`)
            .setColor('#7199de');
        sortedByValue.forEach(([username, stats], index) => {
            valueEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Damages Cost:** ${formatToCurrency(stats.value)}`,
                inline: false
            });
        });
        embeds.push(valueEmbed);

        return embeds;
    } catch (error) {
        console.error('Error creating Combined leaderboard embeds:', error);
        return null; // Return null if there's an error
    }
}

// Helper function to create individual stat sheet embeds
function createIndividualShipEmbeds(acLeaderBoardData, puLeaderBoardData, patch, user) {
    try {
        const embeds = [];
        const fieldsPerPage = 25; // Discord's limit for fields per embed
        let combinedLeaderboardData = {};

        const keys = new Set([
        ...Object.keys(acLeaderBoardData),
        ...Object.keys(puLeaderBoardData)
        ]);

        for (const key of keys) {
        const acData = acLeaderBoardData[key] || { kill_count: 0, value: 0, victims: [], hits: [] };
        const puData = puLeaderBoardData[key] || { kill_count: 0, value: 0, victims: [], hits: [] };

        combinedLeaderboardData[key] = {
            kill_count: acData.kill_count + puData.kill_count,
            value: acData.value + puData.value,
            victims: [...acData.victims, ...puData.victims],
            hits: [...acData.hits, ...puData.hits]
        };
        }

        // Calculate total kills and total value
        const totalAcKills = acLeaderBoardData[user.username].kill_count || 0;
        const totalPuKills = puLeaderBoardData[user.username].kill_count || 0;
        const totalKills = totalAcKills + totalPuKills;
        const totalAcValue = formatToCurrency(acLeaderBoardData[user.username].value || 0);
        const totalPuValue = formatToCurrency(puLeaderBoardData[user.username].value || 0);
        const ac = parseFloat(totalAcValue.replace(/[$,]/g, ''));
        const pu = parseFloat(totalPuValue.replace(/[$,]/g, ''));
        const tempTotalValue = ac + pu;
        const totalValue = `$${tempTotalValue.toFixed(2)}`;
        

        let individualShipTotals = {};
        for(const hit of combinedLeaderboardData[user.username].hits){
            const shipName = hit.ship_killed;
            if (!individualShipTotals[shipName]) {
                individualShipTotals[shipName] = { kill_count: 0, value: 0 };
            }
            individualShipTotals[shipName].kill_count += hit.kill_count;
            individualShipTotals[shipName].value += hit.value;
        }

        let individualShipEntryArray = []
        for(const shipName in individualShipTotals){
            const stats = individualShipTotals[shipName];
            individualShipEntryArray.push({
                name: shipName,
                value: `**Total Kills:** ${stats.kill_count}\n**Damages Done:** ${formatToCurrency(stats.value)}`,
                inline: true
            })
        }

        // Make fields for each hit in the hitsFields thing and make some pages, too
        for (let i = 0; i < individualShipEntryArray.length; i += fieldsPerPage) {
            const currentFields = individualShipEntryArray.slice(i, i + fieldsPerPage);

            // Create an embed for the current page
            const embed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Ship Totals`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/HhnpGnN.png')
                .setColor('#7199de')
                .setDescription(`\`\`\`\nTotal Kills: ${totalKills}\nTotal Damage Cost: ${totalValue}\nAC Kills: ${totalAcKills}\nPU Kills: ${totalPuKills}\nAC Damages: ${totalAcValue}\nPU Damages: ${totalPuValue}\`\`\`\n`)
                .addFields(currentFields);

            embeds.push(embed);
        }

        // Prepare the fields for the hits lists
        const hitsFields = [];
        Object.entries(combinedLeaderboardData).forEach(([username, stats]) => {
            stats.hits.forEach(hit => {
                const victims = hit.victims.join(', ');
                const killOrKills = hit.kill_count === 1 ? 'Kill' : 'Kills';

                hitsFields.push({
                    name: `${hit.ship_killed || 'Unknown'}`.slice(0, 256),
                    value: `**Hit ID:** ${hit.id || 'Unknown'}\n**Victims:** ${victims || 'None'}\n**${killOrKills}:** ${hit.kill_count || 0}\n${formatToCurrency(hit.value || 0)}`.slice(0, 1024),
                    inline: true
                });
            });
        });

        // Make fields for each hit in the hitsFields thing and make some pages, too
        for (let i = 0; i < hitsFields.length; i += fieldsPerPage) {
            const currentFields = hitsFields.slice(i, i + fieldsPerPage);

            // Create an embed for the current page
            const embed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Hit History`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/HhnpGnN.png')
                .setColor('#7199de')
                .addFields(currentFields);

            embeds.push(embed);
        }

        return embeds;
    } catch (error) {
        console.error('Error creating individual stat sheet embeds:', error);
        return null; // Return null if there's an error
    }
}

function createIndividualFpsEmbeds(acLeaderBoardData, puLeaderBoardData, combinedLeaderboardData, patch, user) {
    try {
        const embeds = [];
        const fieldsPerPage = 25; // Discord's limit for fields per embed

        // Calculate total kills
        const totalKills = combinedLeaderboardData[user.username].kill_count || 0;
        const totalAcKills = acLeaderBoardData[user.username].kill_count || 0;
        const totalPuKills = puLeaderBoardData[user.username].kill_count || 0;

        // Prepare the fields for the hits list
        const hitsFields = [];
        Object.entries(combinedLeaderboardData).forEach(([username, stats]) => {
            stats.hits.forEach(hit => {
                const victims = hit.victims.join(', ');
                const date = new Date(Number(hit.id)).toLocaleDateString(); ;

                hitsFields.push({
                    name: `${victims || 'None'}`.slice(0, 256),
                    value: `${date}`, // Use the formatted datetime group
                    inline: true
                });
            });
        });

        // Create paginated embeds for the hits
        for (let i = 0; i < hitsFields.length; i += fieldsPerPage) {
            const currentFields = hitsFields.slice(i, i + fieldsPerPage);

            // Create an embed for the current page
            const embed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `FPS Kill History`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/HhnpGnN.png')
                .setColor('#7199de')
                .setDescription(`\`\`\`\nTotal FPS Kills: ${totalKills}\nAC Kills: ${totalAcKills}\nPU Kills: ${totalPuKills}\`\`\`\n`)
                .addFields(currentFields);

            embeds.push(embed);
        }

        return embeds;
    } catch (error) {
        console.error('Error creating individual FPS embeds:', error);
        return null; // Return null if there's an error
    }
}

function createIndividualCombinedEmbeds(individualData, patch, user) {
    try {
        const embeds = [];
        const fieldsPerPage = 25; // Discord's limit for fields per embed

        // Calculate total FPS kills and Ship kills
        const totalFpsKills = individualData[user.username].hits
            .filter(hit => hit.type === 'FPS')
            .reduce((acc, hit) => acc + hit.kill_count, 0);

        const totalShipKills = individualData[user.username].hits
            .filter(hit => hit.type === 'Ship')
            .reduce((acc, hit) => acc + hit.kill_count, 0);

        // Prepare the fields for the hits list, sorted by log.id in descending order
        const hitsFields = [];
        individualData[user.username].hits
            .sort((a, b) => b.id - a.id) // Sort by log.id in descending order
            .forEach(hit => {
                const victims = hit.victims.join(', ') || 'None';
                const killOrKills = hit.kill_count === 1 ? 'Kill' : 'Kills';

                hitsFields.push({
                    name: `Log ID: ${hit.id || 'Unknown'}`.slice(0, 256),
                    value: `**Type:** ${hit.type}\n**Victims:** ${victims}\n**${killOrKills}:** ${hit.kill_count}\n**Patch:** ${hit.patch || 'Unknown'}`.slice(0, 1024),
                    inline: false
                });
            });

        // Create an embed for the totals
        const totalsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Combined Kill Totals`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/HhnpGnN.png')
            .setColor('#7199de')
            .setDescription(`\`\`\`\nTotal FPS Kills: ${totalFpsKills}\nTotal Ship Kills: ${totalShipKills}\`\`\`\n`);

        embeds.push(totalsEmbed);

        // Create paginated embeds for the hits
        for (let i = 0; i < hitsFields.length; i += fieldsPerPage) {
            const currentFields = hitsFields.slice(i, i + fieldsPerPage);

            // Create an embed for the current page
            const embed = new EmbedBuilder()
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Kill Logs`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
                .setTitle(`Patch ${patch}`)
                .setImage('https://i.imgur.com/HhnpGnN.png')
                .setColor('#7199de')
                .addFields(currentFields);

            embeds.push(embed);
        }

        return embeds;
    } catch (error) {
        console.error('Error creating individual combined embeds:', error);
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
