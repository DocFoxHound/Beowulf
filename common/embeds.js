const { EmbedBuilder } = require('discord.js');
const userlistController = require('../userlist-functions/userlist-controller.js');
const { progressBar } = require('./progress-bar.js');

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
        .setColor('#0099ff')
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


module.exports = {
    progressEmbed
};