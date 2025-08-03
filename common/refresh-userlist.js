const { getUserRank, getRaptorRank, getCorsairRank, getRaiderRank } = require("../userlist-functions/userlist-controller")
const { getUserById } = require("../api/userlistApi")
const { editUser } = require("../api/userlistApi")
const { createUser } = require("../api/userlistApi")
const { getClasses } = require("../api/classApi")
const { getPrestiges } = require("../api/prestige-roles-api");
const { checkForPrestigePromotionUpdateUserlist, checkForRankPromotionUpdateUserlist, markOffCompletedClassesDeterminedByPrestigeRank } = require("../common/check-for-promotion")


// Import rank role IDs from .env
const FRIENDLY_ROLE = process.env.FRIENDLY_ROLE;
const TEST_FRIENDLY_ROLE = process.env.TEST_FRIENDLY_ROLE;
const PROSPECT_ROLE = process.env.PROSPECT_ROLE;
const TEST_PROSPECT_ROLE = process.env.TEST_PROSPECT_ROLE;
const CREW_ROLE = process.env.CREW_ROLE;
const TEST_CREW_ROLE = process.env.TEST_CREW_ROLE;
const MARAUDER_ROLE = process.env.MARAUDER_ROLE;
const TEST_MARAUDER_ROLE = process.env.TEST_MARAUDER_ROLE;
const BLOODED_ROLE = process.env.BLOODED_ROLE;
const TEST_BLOODED_ROLE = process.env.TEST_BLOODED_ROLE;

const RANK_ROLE_IDS = [
    FRIENDLY_ROLE,
    TEST_FRIENDLY_ROLE,
    PROSPECT_ROLE,
    TEST_PROSPECT_ROLE,
    CREW_ROLE,
    TEST_CREW_ROLE,
    MARAUDER_ROLE,
    TEST_MARAUDER_ROLE,
    BLOODED_ROLE,
    TEST_BLOODED_ROLE
];

async function refreshUserlist(client, openai) {
    const logChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ENTRY_LOG_CHANNEL : process.env.TEST_ENTRY_LOG_CHANNEL;
    console.log("Refreshing Userlist");
    try {
        const guild = await client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID);
        const memberList = await guild.members.cache;
        const allClasses = await getClasses();
        // const classData = await generateClassData(allClasses); // Organize classes by category
        const prestigeRoles = await getPrestiges(); // Fetch prestige roles dynamically

        memberList.forEach(async member => {
            const oldUserData = await getUserById(member.id) || null;
            const memberRoles = await member.roles.cache.map(role => role.id);
            const userRank = await getUserRank(memberRoles);
            const raptorLevel = await getRaptorRank(memberRoles, prestigeRoles);
            const corsairLevel = await getCorsairRank(memberRoles, prestigeRoles);
            const raiderLevel = await getRaiderRank(memberRoles, prestigeRoles);

            // Check if user has any rank role
            const hasRankRole = memberRoles.some(roleId => RANK_ROLE_IDS.includes(roleId));

            // If user does not have any rank role, fetch joined_date and rsi_handle
            let joined_date = null;
            let rsi_handle = null;
            if (!hasRankRole && oldUserData) {
                joined_date = oldUserData.joined_date || null;
                rsi_handle = oldUserData.rsi_handle || null;
            }

            if (oldUserData !== null) { // If the user is in the database
                let updatedUserData = {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname || null,
                    rank: userRank,
                    roles: memberRoles,
                    raptor_level: raptorLevel,
                    corsair_level: corsairLevel,
                    raider_level: raiderLevel
                    // Optionally add joined_date and rsi_handle if needed
                    , joined_date, rsi_handle
                };
                await editUser(member.id, updatedUserData);
            } else { // If the user isn't in the database
                const newUser = {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname || null,
                    rank: userRank,
                    roles: memberRoles,
                    raptor_level: raptorLevel,
                    corsair_level: corsairLevel,
                    raider_level: raiderLevel
                    // Optionally add joined_date and rsi_handle if needed
                    , joined_date, rsi_handle
                };
                await createUser(newUser);
            }
        });
        console.log("Userlist refreshed successfully.");
        return "Userlist updated.";
    } catch (error) {
        console.error('Error refreshing userlist: ', error);
    }
}

async function newLoadUserList(client) {
    console.log("Fresh Userlist Load");
    try {
        const guild = await client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.TEST_GUILD_ID : process.env.GUILD_ID);
        const memberList = await guild.members.cache;

        // Fetch all classes dynamically
        const allClasses = await getClasses();
        // const classData = await generateClassData(allClasses); // Organize classes by category

        memberList.forEach(async member => {
            const memberRoles = await member.roles.cache.map(role => role.id);
            const userRank = await getUserRank(memberRoles);

            // Initialize the newUser object
            const newUser = {
                id: member.id,
                username: member.user.username,
                nickname: member.nickname || null,
                rank: userRank,
            };

            // // Dynamically populate fields for each class category
            // for (const [category, classes] of Object.entries(classData)) {
            //     for (const classObj of classes) {
            //         newUser[classObj.name] = false; // Default to false (not completed)
            //     }
                // Kick users if joined_date is between 12 and 26 hours old and rsi_handle is null
                if (joined_date && rsi_handle === null) {
                    const joinedTimestamp = new Date(joined_date).getTime();
                    const nowTimestamp = Date.now();
                    const hoursSinceJoined = (nowTimestamp - joinedTimestamp) / (1000 * 60 * 60);
                    if (hoursSinceJoined >= 12 && hoursSinceJoined <= 26) {
                        try {
                            await member.kick("No RSI handle provided within 12-26 hours of joining.");
                            console.log(`Kicked user ${member.username} for missing RSI handle after ${hoursSinceJoined.toFixed(2)} hours.`);
                            // Send message to log channel
                            const channel = client.channels.cache.get(logChannel);
                            if (channel) {
                                channel.send(`Kicked user <@${member.username}> (ID: ${member.id}) for missing RSI handle after ${hoursSinceJoined.toFixed(2)} hours of joining.`);
                            } else {
                                console.error(`Log channel ${logChannel} not found.`);
                            }
                        } catch (kickError) {
                            console.error(`Failed to kick user ${member.username}:`, kickError);
                        }
                    }
                }
            // }

            // Add the new user to the database
            await createUser(newUser);
        });

        return "New Users have been loaded - DO NOT USE THIS COMMAND AGAIN; USE THE UPDATE COMMAND";
    } catch (error) {
        console.error('Error loading new userlist: ', error);
    }
}

// async function generateClassData(allClasses) {
//     const classData = {};
//     try {
//         for (const log of allClasses) {
//             if (!classData[log.prestige_category]) {
//                 classData[log.prestige_category] = [];
//             }
  
//             classData[log.prestige_category].push({
//                 id: log.id,
//                 name: log.name,
//                 prestige_category: log.prestige_category.toUpperCase(),
//                 alt_name: log.alt_name,
//                 description: log.description,
//                 ai_function_class_names: log.ai_function_class_names,
//                 prerequisites: log.prerequisites,
//                 thumbnail_url: log.thumbnail_url,
//                 completed: false,
//                 value: 0,
//                 level: log.level
//             });
//         }
//         return classData;
//     }catch(error){
//         console.error('Error generating leaderboard data:', error);
//         return null;  // Return null if there's an error
//     }
// }

module.exports = {
    refreshUserlist,
    newLoadUserList
}