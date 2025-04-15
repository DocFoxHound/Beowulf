const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllBlackBoxes, getBlackBoxesByPatch, getBlackBoxesByUserAndPatch, getBlackBoxesByUserId, getAssistantBlackBoxes, getAssistantBlackBoxesByUserAndPatch } = require('../../api/blackBoxApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getUserById } = require('../../api/userlistApi');


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
            .setDescription('This quarter or all time?')
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
            let leaderBoardData = null;
            let individualData = null;
            if (user) { //all patches, user identified
                if(type === "fps"){
                    individualData = await generateIndividualFpsData(blackBoxLogs, user);
                }else if(type === "ships"){
                    individualData = await generateIndividualShipData(blackBoxLogs, user);
                }else{
                    individualData = await generateIndividualCombinedData(blackBoxLogs, user);
                }
            }else if (!user) { //patch identified, no user identified (works)
                if(type === "fps"){
                    leaderBoardData = await generateFpsLeaderboardData(blackBoxLogs);
                }else if(type === "ships"){
                    leaderBoardData = await generateShipLeaderboardData(blackBoxLogs);
                }else{
                    leaderBoardData = await generateCombinedLeaderboardData(blackBoxLogs);
                }
            }

            let embeds = null;
            if(leaderBoardData !== null) {
                if(type === "fps"){
                    embeds = createFpsLeaderboardEmbeds(leaderBoardData, patch);
                }else if(type === "ships"){
                    embeds = createShipLeaderboardEmbeds(leaderBoardData, patch);
                }else{
                    embeds = createCombinedLeaderboardEmbeds(leaderBoardData, patch);
                }
            }
            if(individualData !== null) {
                if(type === "fps"){
                    embeds = createIndividualFpsEmbeds(individualData, patch, user);
                }else if(type === "ships"){
                    embeds = createIndividualShipEmbeds(individualData, patch, user);
                }else{
                    embeds = createIndividualCombinedEmbeds(individualData, patch, user);
                }
                
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
function createShipLeaderboardEmbeds(leaderboardData, patch) {
    try{
        const sortedByKills = Object.entries(leaderboardData).sort((a, b) => b[1].kill_count - a[1].kill_count);
        const sortedByValue = Object.entries(leaderboardData).sort((a, b) => b[1].value - a[1].value);
        // const sortedByVictims = Object.entries(leaderboardData).sort((a, b) => b[1].victims - a[1].victims);

        const embeds = [];

        // Top players by kill count
        const killsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Players by Total Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/HhnpGnN.png')
            .setDescription(`\`\`\`\nIronPoint Total Kills: ${sortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
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
            .setAuthor({ name: `Top Players by Damage Done`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/HhnpGnN.png')
            .setDescription(`\`\`\`\nIronPoint Total Damage Cost: ${formatToCurrency(sortedByValue.reduce((acc, [_, stats]) => acc + stats.value, 0))}\`\`\`\n`)
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
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}

// Helper function to create FPS leaderboard embeds
function createFpsLeaderboardEmbeds(leaderboardData, patch) {
    try {
        // Sort leaderboard data by kill count in descending order
        const sortedByKills = Object.entries(leaderboardData).sort((a, b) => b[1].kill_count - a[1].kill_count);

        const embeds = [];

        // Top players by kill count
        const killsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Players by FPS Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/HhnpGnN.png')
            .setDescription(`\`\`\`\nIronPoint Total FPS Kills: ${sortedByKills.reduce((acc, [_, stats]) => acc + stats.kill_count, 0)}\`\`\`\n`)
            .setColor('#7199de');

        sortedByKills.forEach(([username, stats], index) => {
            killsEmbed.addFields({
                name: `${index + 1}. ${username}`,
                value: `**Kill Count:** ${stats.kill_count}`,
                inline: false
            });
        });

        embeds.push(killsEmbed);

        return embeds;
    } catch (error) {
        console.error('Error creating FPS leaderboard embeds:', error);
        return null; // Return null if there's an error
    }
}

// Helper function to create Combined leaderboard embeds
function createCombinedLeaderboardEmbeds(leaderboardData, patch) {
    try {
        // Convert leaderboardData into an array of [username, stats] pairs and calculate total kills
        const combinedKills = Object.entries(leaderboardData).map(([username, stats]) => {
            const totalKills = stats.hits.reduce((acc, hit) => acc + hit.kill_count, 0);
            return [username, { ...stats, totalKills }];
        });

        // Sort by total kills in descending order
        combinedKills.sort((a, b) => b[1].totalKills - a[1].totalKills);

        const embeds = [];

        // Top players by combined kills
        const combinedKillsEmbed = new EmbedBuilder()
            .setThumbnail('https://i.imgur.com/UoZsrrM.png')
            .setAuthor({ name: `Top Players by Combined Kills`, iconURL: 'https://i.imgur.com/vRqPoqk.png' })
            .setTitle(`Patch ${patch}`)
            .setImage('https://i.imgur.com/HhnpGnN.png')
            .setDescription(`\`\`\`\nIronPoint Total Combined Kills: ${combinedKills.reduce((acc, [_, stats]) => acc + stats.totalKills, 0)}\`\`\`\n`)
            .setColor('#7199de');

        combinedKills.forEach(([username, stats], index) => {
            combinedKillsEmbed.addFields({
                name: `${index + 1}. ${username}: ${stats.totalKills} kills.`,
                value: `**FPS Kills:** ${stats.hits.filter(hit => hit.type === 'FPS').reduce((acc, hit) => acc + hit.kill_count, 0)} // **Ship Kills:** ${stats.hits.filter(hit => hit.type === 'Ship').reduce((acc, hit) => acc + hit.kill_count, 0)}`,
                inline: false
            });
        });

        embeds.push(combinedKillsEmbed);

        return embeds;
    } catch (error) {
        console.error('Error creating Combined leaderboard embeds:', error);
        return null; // Return null if there's an error
    }
}

// Helper function to create individual stat sheet embeds
function createIndividualShipEmbeds(individualData, patch, user) {
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
                .setDescription(`\`\`\`\nTotal Kills: ${totalKills}\nTotal Damage Cost: ${totalValue}\`\`\`\n`)
                .addFields(currentFields);

            embeds.push(embed);
        }

        // Prepare the fields for the hits lists
        const hitsFields = [];
        Object.entries(individualData).forEach(([username, stats]) => {
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

function createIndividualFpsEmbeds(individualData, patch, user) {
    try {
        const embeds = [];
        const fieldsPerPage = 25; // Discord's limit for fields per embed

        // Calculate total kills
        const totalKills = individualData[user.username].kill_count || 0;

        // Prepare the fields for the hits list
        const hitsFields = [];
        Object.entries(individualData).forEach(([username, stats]) => {
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
                .setDescription(`\`\`\`\nTotal FPS Kills: ${totalKills}\`\`\`\n`)
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
