const { EmbedBuilder } = require('discord.js');
const userlistController = require('../userlist-functions/userlist-controller.js');
const { progressBar } = require('./progress-bar.js');
const { getUsersInQueue } = require('../api/queueApi')
const { getEntriesBetweenDates } = require('../api/completed-queue-api.js')

async function progressEmbed(targetUser, userData){    
    try{
    // Extract boolean fields for each assessment type
    const raptorFields = {
        'RAPTOR 1 Solo': userData.raptor_1_solo || false,
        'RAPTOR 1 Team': userData.raptor_1_team || false,
        'RAPTOR 2 Solo': userData.raptor_2_solo || false,
        'RAPTOR 2 Team': userData.raptor_2_team || false,
        'RAPTOR 3 Solo': userData.raptor_3_solo || false,
        'RAPTOR 3 Team': userData.raptor_3_team || false
    };
    
    const corsairFields = {
        'CORSAIR 1 Turret': userData.corsair_1_turret || false,
        'CORSAIR 1 Torpedo': userData.corsair_1_torpedo || false,
        'CORSAIR 2 Ship Commander': userData.corsair_2_ship_commander || false,
        'CORSAIR 2 Wing Commander': userData.corsair_2_wing_commander || false,
        'CORSAIR 3 Fleet Commander': userData.corsair_3_fleet_commander || false
    };
    
    const raiderFields = {
        'RAIDER 1 Swabbie': userData.raider_1_swabbie || false,
        'RAIDER 1 Linemaster': userData.raider_1_linemaster || false,
        'RAIDER 1 Boarder': userData.raider_1_boarder || false,
        'RAIDER 2 Powdermonkey': userData.raider_2_powdermonkey || false,
        'RAIDER 2 Mate': userData.raider_2_mate || false,
        'RAIDER 3 Sailmaster': userData.raider_3_sailmaster || false
    };

    //calculate tier eligibility
    let raptorEligibility = 0;
    let corsairEligibility = 0;
    let raiderEligibility = 0;
    if(userData.raptor_1_solo === true && userData.raptor_1_team === true){
        raptorEligibility++;
    }
    if(userData.raptor_2_solo === true && userData.raptor_2_team === true){
        raptorEligibility++;
    }
    if(userData.raptor_3_solo === true && userData.raptor_3_team === true){
        raptorEligibility++;
    }
    if(userData.corsair_1_torpedo === true && userData.corsair_1_turret === true){
        corsairEligibility++;
    }
    if(userData.corsair_2_ship_commander === true && userData.corsair_2_wing_commander === true){
        corsairEligibility++;
    }
    if(userData.corsair_3_fleet_commander === true){
        corsairEligibility++;
    }
    if(userData.raider_1_boarder === true && userData.raider_1_linemaster === true && userData.raider_1_swabbie === true){
        raiderEligibility++;
    }
    if(userData.raider_2_mate === true && userData.raider_2_powdermonkey === true){
        raiderEligibility++;
    }
    if(userData.raider_3_sailmaster === true){
        raiderEligibility++;
    }
    
    // Helper function to format assessment status
    const formatAssessments = (assessments) => {
        return Object.entries(assessments)
            .map(([name, completed]) => `${completed ? '✅' : '❌'} ${name}`)
            .join('\n');
    };
    
    // Calculate completion percentages
    const calculateCompletion = (assessments) => {
        const total = Object.keys(assessments).length;
        const completed = Object.values(assessments).filter(Boolean).length;
        return Math.round((completed / total) * 100);
    };
    
    const raptorLevel = await userlistController.getRaptorRankDb(targetUser.id);
    const corsairLevel = await userlistController.getCorsairRankDb(targetUser.id);
    const raiderLevel = await userlistController.getRaiderRankDb(targetUser.id);
    const crewCompletion = Math.min(100, Math.round(((raptorLevel + corsairLevel + raiderLevel) / 3) * 100));
    const marauderCompletion = Math.max(
        Math.round((raptorLevel / 3) * 100),
        Math.round((corsairLevel / 3) * 100),
        Math.round((raiderLevel / 3) * 100)
    );
    const raptorCompletion = calculateCompletion(raptorFields);
    const corsairCompletion = calculateCompletion(corsairFields);
    const raiderCompletion = calculateCompletion(raiderFields);
    const overallCompletion = Math.round(
        (raptorCompletion + corsairCompletion + raiderCompletion) / 3
    );

    const totalProgressBar = await progressBar(overallCompletion, 100, 40, '■', '□');
    const crewProgressBar = await progressBar(crewCompletion, 100, 30, '𝅛', '𝅚');
    const marauderProgressBar = await progressBar(marauderCompletion, 100, 30, '𝅛', '𝅚');

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(`Promotion Progress for ${targetUser.username}`)
        .setDescription(`**Overall Completion: __${overallCompletion}%__** ${totalProgressBar}
            \n**Crew Progress: __${crewCompletion}%__** (earn 3 total prestige levels)
            ${crewProgressBar}
            \n**Marauder Progress: __${marauderCompletion}%__**  (TIER 3 in at least one Prestige)
            ${marauderProgressBar}\n
            `)
        .setColor('#ff0000')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .addFields(
            { 
                name: `__RAPTOR Assessments (${raptorCompletion}%)__`, 
                value: `Prestige Eligibility: **TIER ${raptorEligibility}**` + `\n` + formatAssessments(raptorFields), 
                inline: false 
            },
            { 
                name: `__CORSAIR Assessments (${corsairCompletion}%)__`, 
                value: `Prestige Eligibility: **TIER ${corsairEligibility}**` + `\n` + formatAssessments(corsairFields), 
                inline: false 
            },
            { 
                name: `__RAIDER Assessments (${raiderCompletion}%)__`, 
                value: `Prestige Eligibility: **TIER ${raiderEligibility}**` + `\n` + formatAssessments(raiderFields), 
                inline: false 
            }
        )
        .setFooter({ text: 'Contact an administrator if you believe there are any errors in your progress tracking.' });
        return embed;
    } catch (error) {
        console.error(error);
    }
}

async function queueEmbed(interaction, status){
    try{
        allUsers = await getUsersInQueue();
        raptorQueue = allUsers.filter(user => user.raptor_1_solo === true
            || user.raptor_1_team === true
            || user.raptor_2_solo === true
            || user.raptor_2_team === true
            || user.raptor_3_solo === true
            || user.raptor_3_team === true);
        corsairQueue = allUsers.filter(user => user.corsair_1_turret === true
            || user.corsair_1_torpedo === true
            || user.corsair_2_ship_commander === true
            || user.corsair_2_wing_commander === true
            || user.corsair_3_fleet_commander === true);
        raiderQueue = allUsers.filter(user => user.raider_1_swabbie === true
            || user.raider_1_linemaster === true
            || user.raider_1_boarder === true
            || user.raider_2_powdermonkey === true
            || user.raider_2_mate === true
            || user.raider_3_sailmaster === true);

        let raptorQueueFormatted = '';
        for(const user of raptorQueue){
            raptorQueueFormatted += `• **${user.username}:** ${user.raptor_1_solo ? 'RAPTOR 1 Solo, ' : ''} ${user.raptor_1_team ? 'RAPTOR 1 Team, ' : ''} ${user.raptor_2_solo ? 'RAPTOR 2 Solo, ' : ''} ${user.raptor_2_team ? 'RAPTOR 2 Team, ' : ''} ${user.raptor_3_solo ? 'RAPTOR 3 Solo, ' : ''} ${user.raptor_3_team ? 'RAPTOR 3 Team.' : ''}\n`;
        }
        let corsairQueueFormatted = '';
        for(const user of corsairQueue){
            corsairQueueFormatted += `• **${user.username}:** ${user.corsair_1_turret ? 'CORSAIR 1 Turret, ' : ''} ${user.corsair_1_torpedo ? 'CORSAIR 1 Torpedo, ' : ''} ${user.corsair_2_ship_commander ? 'CORSAIR 2 Ship Commander, ' : ''} ${user.corsair_2_wing_commander ? 'CORSAIR 2 Wing Commander, ' : ''} ${user.corsair_3_fleet_commander ? 'CORSAIR 3 Fleet Commander.' : ''}\n`;
        }
        let raiderQueueFormatted = '';
        for(const user of raiderQueue){
            raiderQueueFormatted += `• **${user.username}:** ${user.raider_1_swabbie ? 'RAIDER 1 Swabbie, ' : ''} ${user.raider_1_linemaster ? 'RAIDER 1 Linemaster, ' : ''} ${user.raider_1_boarder ? 'RAIDER 1 Boarder, ' : ''} ${user.raider_2_powdermonkey ? 'RAIDER 2 Powdermonkey, ' : ''} ${user.raider_2_mate ? 'RAIDER 2 Mate, ' : ''} ${user.raider_3_sailmaster ? 'RAIDER 3 Sailmaster.' : ''}\n`;
        }

        const guildIconUrl = interaction.guild.iconURL({
            dynamic: true,  // true -> animated icon if available
            size: 512      // specify size e.g. 128, 256, 512, 1024, 2048
        });

        const embed = new EmbedBuilder()
            .setTitle(`Queue List`)
            .setColor('#ff0000')
            .setThumbnail(guildIconUrl)
            .setTimestamp()
            .addFields(
                { 
                    name: `__RAPTOR Queue__`, 
                    value: raptorQueueFormatted, 
                    inline: false 
                },
                { 
                    name: `__CORSAIR Queue__`, 
                    value: corsairQueueFormatted, 
                    inline: false 
                },
                { 
                    name: `__RAIDER Queue__`, 
                    value: raiderQueueFormatted, 
                    inline: false 
                }
            )
            .setFooter({ text: 'Contact an administrator if you believe there are any errors.' });
        return embed;
        
    }catch(error){
        console.error(error);
    }   
}

async function topHandlers(client, interaction, timeframe){
    try{
        let quarterDescription = '';
        let entries = null;
        let year = null;

        if(timeframe === 'all'){
            // Fetch all entries
            entries = await getEntriesBetweenDates(new Date(0), new Date());
        }else{
            const date = new Date();
            let startDate;
            let endDate;
            let quarterOneStart = new Date(date.getFullYear(), 0, 1);
            let quarterOneEnd = new Date(date.getFullYear(), 2, 31);
            let quarterTwoStart = new Date(date.getFullYear(), 3, 1);
            let quarterTwoEnd = new Date(date.getFullYear(), 5, 30);
            let quarterThreeStart = new Date(date.getFullYear(), 6, 1);
            let quarterThreeEnd = new Date(date.getFullYear(), 8, 30);
            let quarterFourStart = new Date(date.getFullYear(), 9, 1);
            let quarterFourEnd = new Date(date.getFullYear(), 11, 31);
            const now = new Date();
            const currentYear = now.getFullYear();
            year = currentYear;
            if(timeframe === "this-quarter"){
                if(date >= quarterOneStart && date <= quarterOneEnd){
                    quarterDescription = "Quarter 1";
                    startDate = new Date(`${currentYear}-01-01`);
                    endDate = new Date(`${currentYear}-03-31`);
                }else if(date >= quarterTwoStart && date <= quarterTwoEnd){
                    quarterDescription = "Quarter 2";
                    startDate = new Date(`${currentYear}-04-01`);
                    endDate = new Date(`${currentYear}-06-30`);
                }else if(date >= quarterThreeStart && date <= quarterThreeEnd){
                    quarterDescription = "Quarter 3";
                    startDate = new Date(`${currentYear}-07-01`);
                    endDate = new Date(`${currentYear}-09-30`);
                }else if(date >= quarterFourStart && date <= quarterFourEnd){
                    quarterDescription = "Quarter 4";
                    startDate = new Date(`${currentYear}-10-01`);
                    endDate = new Date(`${currentYear}-12-31`);
                }else{
                    return 'Invalid date range';
                }
                entries = await getEntriesBetweenDates(startDate, endDate);
            }else if(timeframe === "last-quarter"){

            }
        }

        // Group entries by handler_id and count total entries for each handler
        const handlerCounts = entries.reduce((acc, entry) => {
            acc[entry.handler_id] = (acc[entry.handler_id] || 0) + 1;
            return acc;
        }, {});

        // Convert the handlerCounts object to an array of [handler_id, count] pairs
        const sortedHandlers = Object.entries(handlerCounts).sort((a, b) => b[1] - a[1]);

        // Format the sorted handlers for the embed
        // const handlerList = sortedHandlers.map(([handler_id, count]) => `• **<@${handler_id}>**: ${count} entries`)

        // Fetch usernames for each handler_id
        const handlerList = await Promise.all(sortedHandlers.map(async ([handler_id, count]) => {
            const user = await client.users.fetch(handler_id);
            return `• **${user.username}**: ${count} entries`;
        }));

        const guildIconUrl = interaction.guild.iconURL({
            dynamic: true,  // true -> animated icon if available
            size: 512      // specify size e.g. 128, 256, 512, 1024, 2048
        });

        const embed = new EmbedBuilder()
            .setTitle(`Top Handlers`)
            .setDescription(`${quarterDescription}, ${year}`)
            .setColor('#ff0000')
            .setThumbnail(guildIconUrl)
            .setTimestamp()
            .addFields(
                { 
                    name: `__Top Handlers__`, 
                    value: handlerList.join('\n'),
                    inline: false 
                }
            )
            .setFooter({ text: 'Contact an administrator if you believe there are any errors.' });
        return embed;
    }catch(error){
        console.error(error);
    }   
}

module.exports = {
    progressEmbed,
    queueEmbed,
    topHandlers,
};