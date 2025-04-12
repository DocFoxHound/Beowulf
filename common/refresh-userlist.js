const { getUserRank } = require("../userlist-functions/userlist-controller")
const { getUserById } = require("../api/userlistApi")
const { editUser } = require("../api/userlistApi")
const { createUser } = require("../api/userlistApi")
const { getClasses } = require("../api/classApi")
const { checkForPrestigePromotionUpdateUserlist, checkForRankPromotionUpdateUserlist } = require("../common/check-for-promotion")
const logger = require('../logger');

async function refreshUserlist(client, openai) {
    console.log("Refreshing Userlist");
    try {
        const guild = await client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID);
        const memberList = await guild.members.cache;

        // Fetch all classes dynamically
        const allClasses = await getClasses();
        const classData = await generateClassData(allClasses); // Organize classes by category

        memberList.forEach(async member => {
            const oldUserData = await getUserById(member.id) || null;

            if (oldUserData !== null) { // If the user is in the database
                const memberRoles = await member.roles.cache.map(role => role.id);
                const userRank = await getUserRank(memberRoles);

                // Initialize the updatedUserData object
                const updatedUserData = {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname || null,
                    rank: userRank,
                };

                // Dynamically populate fields for each class category
                for (const [category, classes] of Object.entries(classData)) {
                    for (const classObj of classes) {
                        updatedUserData[classObj.name] = oldUserData[classObj.name] || false; // Retain the user's existing completion status
                    }
                }

                // Check for promotions
                checkForPrestigePromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai);
                checkForRankPromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai);

                // Update the user's data in the database
                await editUser(member.id, updatedUserData);
            } else { // If the user isn't in the database
                const memberRoles = await member.roles.cache.map(role => role.id);
                const userRank = await getUserRank(memberRoles);

                // Initialize the newUser object
                const newUser = {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname || null,
                    rank: userRank,
                };

                // Dynamically populate fields for each class category
                for (const [category, classes] of Object.entries(classData)) {
                    for (const classObj of classes) {
                        newUser[classObj.name] = false; // Default to false (not completed)
                    }
                }

                // Add the new user to the database
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
        const classData = await generateClassData(allClasses); // Organize classes by category

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

            // Dynamically populate fields for each class category
            for (const [category, classes] of Object.entries(classData)) {
                for (const classObj of classes) {
                    newUser[classObj.name] = false; // Default to false (not completed)
                }
            }

            // Add the new user to the database
            await createUser(newUser);
        });

        return "New Users have been loaded - DO NOT USE THIS COMMAND AGAIN; USE THE UPDATE COMMAND";
    } catch (error) {
        console.error('Error loading new userlist: ', error);
    }
}

async function generateClassData(allClasses) {
    const classData = {};
    try {
        for (const log of allClasses) {
            if (!classData[log.prestige_category]) {
                classData[log.prestige_category] = [];
            }
  
            classData[log.prestige_category].push({
                id: log.id,
                name: log.name,
                alt_name: log.alt_name,
                description: log.description,
                ai_function_class_names: log.ai_function_class_names,
                prerequisites: log.prerequisites,
                thumbnail_url: log.thumbnail_url,
                completed: false,
                value: 0,
                level: log.level
            });
        }
        return classData;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

module.exports = {
    refreshUserlist,
    newLoadUserList
}