const userlistApi = require("../api/userlistApi")
const { getUsers } = require("../api/userlistApi")
const rankRoles = require("../api/rank-roles-api")
const getClasses = require("../api/classApi").getClasses;
const editQueue = require("../api/queueApi").editQueue;
const prestigeRoles = require("../api/prestige-roles-api")
const lodash = require('lodash');

async function createNewUser(userData, client, guildId) {
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
    } catch {
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
}

async function updatedUserListData(userData){

}

async function updateUserClassStatus(userlistData, className, classCompleted) {
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

    console.log(`Class "${className}" not found in the database.`);
    return null;
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
        console.log(error)
    }
}

async function getRaptorRank(memberRoles) {
    try {
        const discordPrestigeRanks = await prestigeRoles.getPrestiges();

        // Filter roles that contain "RAPTOR" (case-insensitive) in their name
        const raptorRoles = discordPrestigeRanks.filter(role =>
            role.name.toLowerCase().includes("raptor")
        );

        // Create a map of role IDs to their corresponding rank levels for quick lookup
        const rankMap = new Map(raptorRoles.map(role => [role.id, role.rank_level]));

        // Iterate through the memberRoles array and check for a match in the rankMap
        for (const roleId of memberRoles) {
            if (rankMap.has(roleId)) {
                return rankMap.get(roleId); // Return the rank_level value if a match is found
            }
        }

        // If no match is found, return 0 or a default value
        return 0;
    } catch (error) {
        console.error("Error in getRaptorRank: ", error);
        return 0; // Return a default value in case of an error
    }
}

async function getRaptorRankDb(userId) {
    const user = await userlistApi.getUserById(userId);
    if (!user) return 0;

    if (user.raptor_3_solo && user.raptor_3_team) return 3;
    if (user.raptor_2_solo && user.raptor_2_team) return 2;
    if (user.raptor_1_solo && user.raptor_1_team) return 1;
    return 0;
}

async function getCorsairRank(memberRoles) {
    try {
        const discordPrestigeRanks = await prestigeRoles.getPrestiges();

        // Filter roles that contain "RAPTOR" (case-insensitive) in their name
        const raptorRoles = discordPrestigeRanks.filter(role =>
            role.name.toLowerCase().includes("corsair")
        );

        // Create a map of role IDs to their corresponding rank levels for quick lookup
        const rankMap = new Map(discordPrestigeRanks.map(role => [role.id, role.rank_level]));

        // Iterate through the memberRoles array and check for a match in the rankMap
        for (const roleId of memberRoles) {
            if (rankMap.has(roleId)) {
                return rankMap.get(roleId); // Return the rank_level value if a match is found
            }
        }

        // If no match is found, return 0 or a default value
        return 0;
    } catch (error) {
        console.error("Error in getCorsairRank: ", error);
        return 0; // Return a default value in case of an error
    }
}

async function getCorsairRankDb(userId) {
    const user = await userlistApi.getUserById(userId);
    if (!user) return 0;

    if (user.corsair_3_fleet_commander) return 3;
    if (user.corsair_2_ship_commander && user.corsair_2_wing_commander) return 2;
    if (user.corsair_1_turret && user.corsair_1_torpedo) return 1;
    return 0;
}

async function getRaiderRank(memberRoles) {
    try {
        const discordPrestigeRanks = await prestigeRoles.getPrestiges();

        // Filter roles that contain "RAPTOR" (case-insensitive) in their name
        const raptorRoles = discordPrestigeRanks.filter(role =>
            role.name.toLowerCase().includes("raider")
        );

        // Create a map of role IDs to their corresponding rank levels for quick lookup
        const rankMap = new Map(discordPrestigeRanks.map(role => [role.id, role.rank_level]));

        // Iterate through the memberRoles array and check for a match in the rankMap
        for (const roleId of memberRoles) {
            if (rankMap.has(roleId)) {
                return rankMap.get(roleId); // Return the rank_level value if a match is found
            }
        }

        // If no match is found, return 0 or a default value
        return 0;
    } catch (error) {
        console.error("Error in getRaiderRank: ", error);
        return 0; // Return a default value in case of an error
    }
}

async function getRaiderRankDb(userId) {
    const user = await userlistApi.getUserById(userId);
    if (!user) return 0;

    if (user.raider_3_sailmaster) return 3;
    if (user.raider_2_powdermonkey && user.raider_2_mate) return 2;
    if (user.raider_1_swabbie && user.raider_1_linemaster && user.raider_1_boarder) return 1;
    return 0;
}

//checks if the user is in a queue already or not
async function checkUserListForUser(targetUserData){
    const user = await userlistApi.getUserById(targetUserData.id);
    //if the user is in the database, we'll return the user data
    if(user){
        return user;
    //if the user IS NOT in the database, we have to create a new queue entry for them
    }else{
        return null;
    }
}

//checks if the user is in a queue already or not
async function checkUserListForUserById(userId){
    const user = await userlistApi.getUserById(userId);
    //if the user is in the database, we'll return the user data
    if(user){
        return user;
    //if the user IS NOT in the database, we have to create a new queue entry for them
    }else{
        return null;
    }
}

//checks if the user is in a queue already or not
async function checkUserListForUserByNameOrId(username){
    const users = await getUsers();
        user = null;
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
        
}

async function generateDynamicClassFields() {
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
}

module.exports = {
    checkUserListForUser,
    createNewUser,
    getRaptorRank,
    getCorsairRank,
    getRaiderRank,
    updateUserClassStatus,
    getRaptorRankDb,
    getCorsairRankDb,
    getRaiderRankDb,
    getUserRank,
    checkUserListForUserByNameOrId,
    updatedUserListData,
    generateDynamicClassFields,
    checkUserListForUserById
}