const getUsers = require('../api/userlistApi').getUsers;
const userlistController = require('../userlist-functions/userlist-controller');


async function progressQuery(run, message, openai, client){
    try{
        toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        parsedArgs = JSON.parse(toolCall.function.arguments);
        playerType = parsedArgs.user_type;
        optionalArea = parsedArgs.optional_area || null;
        otherPlayer = parsedArgs.optional_other_user || null; 
        let userData;
        if(playerType === "self"){
            userData = message.author;
        }else{
            const allUsers = await getUsers();
            for(const user of allUsers){
                if(user.id === otherPlayer || user.username === otherPlayer || user.nickname === otherPlayer){
                    userData = user;
                }
            }
        }
            
        if(userData !== null){
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
            
            const raptorLevel = await userlistController.getRaptorRankDb(userData.id);
            const corsairLevel = await userlistController.getCorsairRankDb(userData.id);
            const raiderLevel = await userlistController.getRaiderRankDb(userData.id);
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
            // Start with a header (or any text you always want shown)
            let response = `${userData.username} has the following progress:\n\n`;

            // If we only want RAPTOR or everything:
            if (optionalArea === 'raptor' || optionalArea === 'overall' || optionalArea === null) {
                response += `**RAPTOR**\n`;
                response += `${formatAssessments(raptorFields)}\n`;
                response += `Completion: ${raptorCompletion}%\n\n`;
            }

            // If we only want CORSAIR or everything:
            if (optionalArea === 'corsair' || optionalArea === 'overall' || optionalArea === null) {
                response += `**CORSAIR**\n`;
                response += `${formatAssessments(corsairFields)}\n`;
                response += `Completion: ${corsairCompletion}%\n\n`;
            }

            // If we only want RAIDER or everything:
            if (optionalArea === 'raider' || optionalArea === 'overall' || optionalArea === null) {
                response += `**RAIDER**\n`;
                response += `${formatAssessments(raiderFields)}\n`;
                response += `Completion: ${raiderCompletion}%\n\n`;
            }

            // If it’s overall, include the overall section
            if (optionalArea === 'overall' || optionalArea === null) {
                response += `**Overall Progress**\n`;
                response += `Crew: ${crewCompletion}%\n`;
                response += `Marauder: ${marauderCompletion}%\n`;
                response += `Overall: ${overallCompletion}%\n`;
            }
            return response;
        }else{
            return "Issue with finding the other user mentioned."
        }
    }catch(error){
        return error;
    }
}

module.exports = {
    progressQuery
}