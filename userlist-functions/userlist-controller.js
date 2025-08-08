const userlistApi = require("../api/userlistApi")
const { getUsers } = require("../api/userlistApi")
const rankRoles = require("../api/rank-roles-api")
const prestigeRoles = require("../api/prestige-roles-api")

async function createNewUser(userData, client, guildId) {
    try {
        console.log("Create New User");
        const classData = await generateDynamicClassFields(); // Dynamically fetch class data
        const newUser = {
            id: '',
            username: null,
            nickname: null,
            corsair_level: 0,
            raptor_level: 0,
            raider_level: 0,
            rank: null
        };

        // Dynamically add class fields based on the database data
        for (const [category, classes] of Object.entries(classData)) {
            for (const classObj of classes) {
                const fieldName = `${category}_${classObj.name.toLowerCase().replace(/\s+/g, '_')}`;
                newUser[fieldName] = false; // Default to false (not completed)
            }
        }

        // Check if the user is still in Discord
        const guild = await client.guilds.fetch(guildId);
        let member = null;
        try {
            member = await guild.members.fetch(userData.id);
        } catch (err) {
            console.error(err);
            member = null;
        }

        if (member) {
            console.log("Adding user from Discord to DB");
            const memberRoles = member.roles.cache.map(role => role.id);
            newUser.id = userData.id;
            newUser.username = userData.username;
            newUser.nickname = userData.nickname || null;
            newUser.corsair_level = getCorsairRank(memberRoles, false) || 0;
            newUser.raptor_level = getRaptorRank(memberRoles, false) || 0;
            newUser.raider_level = getRaiderRank(memberRoles, false) || 0;
            newUser.rank = getUserRank(memberRoles) || null;

            userlistApi.createUser(newUser);
        } else {
            console.log("Adding user from queue to DB");
            newUser.id = userData.id;
            newUser.username = userData.username;
            newUser.nickname = userData.nickname || null;
            userlistApi.createUser(newUser);
        }
    } catch (error) {
        console.error(error);
    }
}

async function updatedUserListData(userData){
    // No implementation, so no try-catch needed
}

async function updateUserClassStatus(userlistData, className, classCompleted) {
    try {
        console.log("Update User Class Status");
        const classData = await generateDynamicClassFields(); // Dynamically fetch class data
        // Find the matching class in the database
        for (const [category, classes] of Object.entries(classData)) {
            for (const classObj of classes) {
                if (
                    classObj.name.toLowerCase() === className.toLowerCase() ||
                    classObj.alt_name.toLowerCase() === className.toLowerCase()
                ) {
                    const fieldName = `${classObj.name.toLowerCase().replace(/\s+/g, '_')}`;
                    userlistData[fieldName] = classCompleted; // Update the class status
                    return await userlistApi.editUser(userlistData.id, userlistData);
                }
            }
        }
        return null;
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function getUserRank(memberRoles) {
    try{
        const discordRankRoles = await rankRoles.getRanks();
        // Create a map of role names to roles for quick lookup
        const roleMap = new Map(discordRankRoles.map(role => [role.name, role]));
        // Define the priority of roles from highest to lowest
        const rolePriority = ["Captain", "Crew Chief", "Blooded", "Blood Qualified", "Marauder", "Crew", "Prospect", "Friendly", "Guest", "test_captain", "test_blooded", "test_marauder", "test_crew", "test_prospect"];
        // Iterate over the array of roles once to get the highest-priority role that the user has
        for (const roleName of rolePriority) {
            const role = roleMap.get(roleName);
            if (role && memberRoles.includes(role.id)) {
                return role.id;
            }
        }
        return null;
    }catch(error){
        console.error(error)
    }
}

async function getPrestigeRanks(memberRoles) {
    try {
        // Load role IDs from environment variables
        const raptorRoles = [
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_1_ROLE : process.env.RAPTOR_1_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_2_ROLE : process.env.RAPTOR_2_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_3_ROLE : process.env.RAPTOR_3_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_4_ROLE : process.env.RAPTOR_4_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_5_ROLE : process.env.RAPTOR_5_TEST_ROLE
        ];
        const corsairRoles = [
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_1_ROLE : process.env.CORSAIR_1_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_2_ROLE : process.env.CORSAIR_2_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_3_ROLE : process.env.CORSAIR_3_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_4_ROLE : process.env.CORSAIR_4_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_5_ROLE : process.env.CORSAIR_5_TEST_ROLE
        ];
        const raiderRoles = [
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_1_ROLE : process.env.RAIDER_1_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_2_ROLE : process.env.RAIDER_2_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_3_ROLE : process.env.RAIDER_3_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_4_ROLE : process.env.RAIDER_4_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_5_ROLE : process.env.RAIDER_5_TEST_ROLE
        ];

        // Helper to get highest level for a prestige type
        function getLevel(roleList) {
            let maxLevel = 0;
            roleList.forEach((roleId, idx) => {
                if (memberRoles.includes(roleId)) {
                    if (idx + 1 > maxLevel) {
                        maxLevel = idx + 1;
                    }
                }
            });
            return maxLevel;
        }

        return {
            raptor_level: getLevel(raptorRoles),
            corsair_level: getLevel(corsairRoles),
            raider_level: getLevel(raiderRoles)
        };
    } catch (error) {
        console.error(error);
        return {
            raptor_level: 0,
            corsair_level: 0,
            raider_level: 0
        };
    }
}

// Wrapper functions for specific prestige categories
async function getRaptorRankDb(userId) {
    try {
        return await getPrestigeRankDb(userId, 'raptor');
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function getCorsairRankDb(userId) {
    try {
        return await getPrestigeRankDb(userId, 'corsair');
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function getRaiderRankDb(userId) {
    try {
        return await getPrestigeRankDb(userId, 'raider');
    } catch (error) {
        console.error(error);
        return null;
    }
}

//checks if the user is in a queue already or not
async function checkUserListForUser(targetUserData){
    try {
        const user = await userlistApi.getUserById(targetUserData.id);
        //if the user is in the database, we'll return the user data
        if(user){
            return user;
        //if the user IS NOT in the database, we have to create a new queue entry for them
        }else{
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

//checks if the user is in a queue already or not
async function checkUserListForUserById(userId){
    try {
        const user = await userlistApi.getUserById(userId);
        //if the user is in the database, we'll return the user data
        if(user){
            return user;
        //if the user IS NOT in the database, we have to create a new queue entry for them
        }else{
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

//checks if the user is in a queue already or not
async function checkUserListForUserByNameOrId(username){
    try {
        const users = await getUsers();
        let user = null;
        for (const element of users) {
            if(element.id === username || element.username === username || element.nickname === username){
                user = element;
            }
        }
        //if the user is in the database, we'll return the user data
        if(user){
            return user;
        //if the user IS NOT in the database, we have to create a new queue entry for them
        }else{
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function generateDynamicClassFields() {
    try {
        const allClasses = await getClasses(); // Fetch all classes from the database
        const classData = {};

        // Organize classes by their prestige category
        for (const classObj of allClasses) {
            if (!classData[classObj.prestige_category]) {
                classData[classObj.prestige_category] = [];
            }
            classData[classObj.prestige_category].push(classObj);
        }

        return classData;
    } catch (error) {
        console.error(error);
        return {};
    }
}

module.exports = {
    checkUserListForUser,
    createNewUser,
    getPrestigeRanks,
    updateUserClassStatus,
    getRaptorRankDb,
    getCorsairRankDb,
    getRaiderRankDb,
    getUserRank,
    checkUserListForUserByNameOrId,
    updatedUserListData,
    generateDynamicClassFields,
    checkUserListForUserById,
}