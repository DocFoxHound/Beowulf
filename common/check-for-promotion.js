const { editUser } = require("../api/userlistApi");
const { notifyPrestigePromotion } = require("../common/bot-notify");
const { notifyRankPromotion } = require("../common/bot-notify");
const { getPrestiges } = require("../api/prestige-roles-api");
const { getClasses } = require('../api/classApi');

async function checkForPrestigePromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai) {
    try {
        // Fetch all classes dynamically
        const allClasses = await getClasses();
        const classData = await generateClassData(allClasses); // Organize classes by category
        const prestigeRoles = await getPrestiges(); // Fetch prestige roles dynamically

        // Iterate through each prestige category dynamically
        for (const [prestige, classes] of Object.entries(classData)) {
            // Group classes by level
            const classesByLevel = {};
            for (const classObj of classes) {
                if (!classesByLevel[classObj.level]) {
                    classesByLevel[classObj.level] = [];
                }
                classesByLevel[classObj.level].push(classObj);
            }

            // Determine the user's current level for this prestige
            let currentLevel = 0;
            for (const level in classesByLevel) {
                const levelClasses = classesByLevel[level];
                const completed = levelClasses.every(classObj => updatedUserData[classObj.name] === true);
                if (completed) {
                    currentLevel = Math.max(currentLevel, parseInt(level)); // Update to the highest completed level
                }
            }

            // Get the user's previous level for this prestige
            const previousLevel = oldUserData[`${prestige}_level`] || 0;

            // If the user has advanced in this prestige, assign the appropriate role
            if (currentLevel > previousLevel) {
                const prestigeTitle = `${prestige.toUpperCase()} ${currentLevel}`;
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === `${prestige.toUpperCase()} ${previousLevel}`);

                if (roleToAdd) {
                    notifyPrestigePromotion(prestige.toUpperCase(), currentLevel, updatedUserData, openai, client);
                    await member.roles.add(roleToAdd.rank_role);
                }
                if (roleToRemove) {
                    await member.roles.remove(roleToRemove.rank_role);
                }

                // Update the user's level in the database
                updatedUserData[`${prestige}_level`] = currentLevel;
            }
        }

        // Save the updated user data
        await editUser(updatedUserData.id, updatedUserData);
    } catch (error) {
        console.error('Error in checkForPrestigePromotionUpdateUserlist:', error);
    }
}

async function checkForRankPromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai) {
    try {
        // Fetch all classes dynamically
        const allClasses = await getClasses();
        const classData = await generateClassData(allClasses); // Organize classes by category

        // Calculate the total number of completed prestige levels for old and updated data
        const oldTotalPrestiges = Object.keys(classData).reduce((total, prestige) => {
            return total + (oldUserData[`${prestige}_level`] || 0);
        }, 0);

        const newTotalPrestiges = Object.keys(classData).reduce((total, prestige) => {
            return total + (updatedUserData[`${prestige}_level`] || 0);
        }, 0);

        // Check if the user has been promoted to CREW
        if (newTotalPrestiges >= 3 && oldTotalPrestiges < 3) {
            const roleToAdd = process.env.LIVE_ENVIRONMENT === "true" ? "CREW" : "test_crew";
            const roleToRemove = process.env.LIVE_ENVIRONMENT === "true" ? "PROSPECT" : "test_prospect";

            notifyRankPromotion("CREW", updatedUserData, openai, client);
            await member.roles.add(roleToAdd);
            await member.roles.remove(roleToRemove);
        }

        // Check if the user has achieved level 3 in any prestige category
        for (const prestige of Object.keys(classData)) {
            const oldLevel = oldUserData[`${prestige}_level`] || 0;
            const newLevel = updatedUserData[`${prestige}_level`] || 0;

            if (newLevel === 3 && oldLevel < 3) {
                notifyRankPromotion("MARAUDER", updatedUserData, openai, client);
            }
        }
    } catch (error) {
        console.error('Error in checkForRankPromotionUpdateUserlist:', error);
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
    } catch (error) {
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

module.exports = {
    checkForPrestigePromotionUpdateUserlist,
    checkForRankPromotionUpdateUserlist
};