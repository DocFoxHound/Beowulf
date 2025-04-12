const { getUserByUsername } = require('../api/userlistApi')
const { getBadgesByUserId } = require('../api/badgeApi')
const logger = require('../logger');

async function badgeQuery(run, message) {
    try{
        toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        parsedArgs = JSON.parse(toolCall.function.arguments);
        selfOrOther = parsedArgs.self_other || "self";
        username = parsedArgs.username;
        let targetUser = null;

        if (selfOrOther === "self") {
            targetUser = message.author;
        }else{
            targetUser = await getUserByUsername(username);
            if(targetUser === null){
                return "User not found";
            }
        }

        const badges = await getBadgesByUserId(targetUser.id);
        if (!badges || badges.length === 0) {
            return "User has no badges.";
        }

    // Sort badges by badge_weight in descending order
        badges.sort((a, b) => b.badge_weight - a.badge_weight);

        // Map badges to formatted strings and join them with \n
        const badgeList = badges.map(badge => 
            `**${badge.badge_name} (Weight: ${badge.badge_weight})**\n${badge.badge_description || 'No description'}`
        ).join('\n');

        return badgeList;
    }catch(error){
        console.error('Error fetching badges:', error);
        return 'An error occurred while fetching the badges. Please try again later.';
    }
}

module.exports = {
    badgeQuery
}