const { getUsersInQueue } = require('../api/queueApi')
const { getEntriesBetweenDates } = require('../api/completed-queue-api.js')

async function handlerQuery(run, client){
    toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
    parsedArgs = JSON.parse(toolCall.function.arguments);
    targetTimeframe = parsedArgs.timeframe || "all-time";
    // targetPlayer = parsedArgs.user_id;
    // targetPrestige = parsedArgs.prestige_area; //can be 'all'
    return await getTopHandlers(targetTimeframe, client);
}

async function getTopHandlers(targetTimeframe, client){
    try{
        let quarterDescription = '';
        let entries = null;
        let year = null;
        let endDescription = null;

        if(targetTimeframe === 'all-time'){
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
            if(targetTimeframe === "this-quarter"){
                if(date >= quarterOneStart && date <= quarterOneEnd){
                    quarterDescription = "Quarter 1";
                    startDate = new Date(`${year}-01-01`);
                    endDate = new Date(`${year}-03-31`);
                    endDescription = `${year}-03-31`;
                }else if(date >= quarterTwoStart && date <= quarterTwoEnd){
                    quarterDescription = "Quarter 2";
                    startDate = new Date(`${year}-04-01`);
                    endDate = new Date(`${year}-06-30`);
                    endDescription = `${year}-06-30`;
                }else if(date >= quarterThreeStart && date <= quarterThreeEnd){
                    quarterDescription = "Quarter 3";
                    startDate = new Date(`${year}-07-01`);
                    endDate = new Date(`${year}-09-30`);
                    endDescription = `${year}-09-30`;
                }else if(date >= quarterFourStart && date <= quarterFourEnd){
                    quarterDescription = "Quarter 4";
                    startDate = new Date(`${year}-10-01`);
                    endDate = new Date(`${year}-12-31`);
                    endDescription = `${year}-12-31`;
                }else{
                    return 'Invalid date range';
                }
                entries = await getEntriesBetweenDates(startDate, endDate);
            }else if(targetTimeframe === "last-quarter"){
                if(date >= quarterOneStart && date <= quarterOneEnd){
                    year = year-1;
                    quarterDescription = "Quarter 4";
                    startDate = new Date(`${year}-10-01`);
                    endDate = new Date(`${year}-12-31`);
                    endDescription = `${year}-12-31`;
                }else if(date >= quarterTwoStart && date <= quarterTwoEnd){
                    quarterDescription = "Quarter 1";
                    startDate = new Date(`${year}-01-011`);
                    endDate = new Date(`${year}-03-31`);
                    endDescription = `${year}-03-31`;
                }else if(date >= quarterThreeStart && date <= quarterThreeEnd){
                    quarterDescription = "Quarter 2";
                    startDate = new Date(`${year}-04-01`);
                    endDate = new Date(`${year}-06-30`);
                    endDescription = `${year}-06-30`;
                }else if(date >= quarterFourStart && date <= quarterFourEnd){
                    quarterDescription = "Quarter 3";
                    startDate = new Date(`${year}-07-01`);
                    endDate = new Date(`${year}-09-30`);
                    endDescription = `${year}-09-30`;
                }else{
                    return 'Invalid date range';
                }
            }
        }

        if(entries !== null){
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
            // const member = await guild.members.fetch(user.id);
            const user = await client.users.fetch(handler_id);
                return `• **${user.username}**: ${count} entries`;
            }));

            return `Top Handlers for ${quarterDescription ? quarterDescription : "All time"}, ${year ? year : ""} \nEnding: ${endDescription ? endDescription : "Today"}\n ${handlerList.join('\n')} `
        }else{
            return `No entries could be found.`
        }
        
    }catch(error){
        console.error(error);
    }   
}

module.exports = {
    handlerQuery,
}