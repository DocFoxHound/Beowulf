const { notifyRankPromotion } = require("./bot-notify");
const { getUserById } = require("../api/userlistApi.js");
const { notifyPrestigePromotion } = require("./bot-notify");

async function grantPrestigeNotify(user_id, prestige_name, prestige_level, openai, client) {
    console.log(`Grant Prestige Notify for user: ${user_id}`);
    // Fetch user from DB
    const user = await getUserById(user_id);
    if (!user) {
        console.error(`User with ID ${user_id} not found.`);
        return false;
    }

    // Get the guild and member
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
        console.error(`Guild with ID ${guildId} not found.`);
        return false;
    }
    let member;
    try {
        member = await guild.members.fetch(user_id);
    } catch (e) {
        console.error(`Could not fetch member ${user_id} in guild ${guildId}`);
        return false;
    }
    if (!member) {
        console.error(`Member with ID ${user_id} not found in guild.`);
        return false;
    }

    // Collect all prestige role IDs from env
    const prestigeRoles = {
        raptor: [
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_1_ROLE : process.env.RAPTOR_1_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_2_ROLE : process.env.RAPTOR_2_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_3_ROLE : process.env.RAPTOR_3_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_4_ROLE : process.env.RAPTOR_4_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_5_ROLE : process.env.RAPTOR_5_TEST_ROLE
        ],
        corsair: [
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_1_ROLE : process.env.CORSAIR_1_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_2_ROLE : process.env.CORSAIR_2_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_3_ROLE : process.env.CORSAIR_3_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_4_ROLE : process.env.CORSAIR_4_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_5_ROLE : process.env.CORSAIR_5_TEST_ROLE
        ],
        raider: [
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_1_ROLE : process.env.RAIDER_1_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_2_ROLE : process.env.RAIDER_2_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_3_ROLE : process.env.RAIDER_3_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_4_ROLE : process.env.RAIDER_4_TEST_ROLE,
            process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_5_ROLE : process.env.RAIDER_5_TEST_ROLE
        ]
    };

    // Find which prestige roles the user currently has
    const userRoleIds = member.roles.cache.map(role => role.id);
    const currentPrestigeRoles = {
        raptor: prestigeRoles.raptor.filter(roleId => userRoleIds.includes(roleId)),
        corsair: prestigeRoles.corsair.filter(roleId => userRoleIds.includes(roleId)),
        raider: prestigeRoles.raider.filter(roleId => userRoleIds.includes(roleId)),
    };

    console.log("User's current prestige roles:", currentPrestigeRoles);


    // Detect the current prestige role for the given prestige_name and prestige_level
    const prestigeType = prestige_name.toLowerCase();
    let currentLevel = parseInt(prestige_level, 10);
    if (!prestigeRoles[prestigeType] || isNaN(currentLevel) || currentLevel < 0 || currentLevel > 5) {
        console.error(`Invalid prestige type (${prestigeType}) or level (${currentLevel})`);
        return false;
    }

    // If the user's prestige role array for this type is empty, treat as level 0
    if (currentPrestigeRoles[prestigeType].length === 0) {
        currentLevel = 0;
    }

    // If already at max prestige, skip all role changes
    if (currentLevel === 5) {
        console.log(`User is already at max prestige level (${currentLevel}) for ${prestigeType}, skipping role changes.`);
        return true;
    }

    // Remove the current prestige role if present (only if currentLevel > 0)
    if (currentLevel > 0) {
        const currentRoleId = prestigeRoles[prestigeType][currentLevel - 1];
        if (userRoleIds.includes(currentRoleId)) {
            try {
                await member.roles.remove(currentRoleId);
                console.log(`Removed role ${currentRoleId} from user ${user_id}`);
            } catch (e) {
                console.error(`Failed to remove role ${currentRoleId}:`, e);
            }
        } else {
            console.log(`User does not have role ${currentRoleId}, nothing to remove.`);
        }
    }

    // Add the next-level prestige role if it exists
    const nextRoleId = prestigeRoles[prestigeType][currentLevel];
    if (nextRoleId) {
        try {
            await member.roles.add(nextRoleId);
            console.log(`Granted next prestige role ${nextRoleId} to user ${user_id}`);
        } catch (e) {
            console.error(`Failed to add next prestige role ${nextRoleId}:`, e);
        }
    } else {
        console.error(`Next prestige role ID not found for ${prestigeType} level ${currentLevel + 1}`);
    }

    // Optionally: notify the user or log the promotion
    // await notifyRankPromotion(...)

    // Update user's prestige level in the database
    const { editUser } = require("../api/userlistApi.js");
    let updateField;
    switch (prestigeType) {
        case "raptor":
            updateField = "raptor_level";
            break;
        case "corsair":
            updateField = "corsair_level";
            break;
        case "raider":
            updateField = "raider_level";
            break;
        default:
            updateField = null;
    }
    if (updateField) {
        const updatedUserData = { ...user };
        updatedUserData[updateField] = currentLevel + 1;
        // Remove _id if present, as some APIs may not accept it
        if (updatedUserData._id) delete updatedUserData._id;
        const editResult = await editUser(user_id, updatedUserData);
        if (!editResult) {
            console.error(`Failed to update user prestige level in DB for user ${user_id}`);
        } else {
            console.log(`Updated user ${user_id} ${updateField} to ${currentLevel + 1}`);
            // Notify Discord of the promotion
            await notifyPrestigePromotion(
                prestigeType.toUpperCase(),
                currentLevel + 1,
                updatedUserData,
                openai,
                client
            );
        }
    }

    return true;
}

module.exports = { grantPrestigeNotify };