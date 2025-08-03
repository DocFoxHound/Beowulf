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



    // Detect the current prestige role for the given prestige_name by checking the user's roles, not the argument
    const prestigeType = prestige_name.toLowerCase();
    if (!prestigeRoles[prestigeType]) {
        console.error(`Invalid prestige type (${prestigeType})`);
        return false;
    }
    // Find the highest prestige role index the user currently has for this type
    let currentLevel = 0;
    for (let i = prestigeRoles[prestigeType].length - 1; i >= 0; i--) {
        if (userRoleIds.includes(prestigeRoles[prestigeType][i])) {
            currentLevel = i + 1; // Level is 1-based
            break;
        }
    }
    // If already at max prestige, skip all role changes
    if (currentLevel === 5) {
        console.log(`User is already at max prestige level (${currentLevel}) for ${prestigeType}, skipping role changes.`);
        return true;
    }


    // Remove all prestige roles of this type before adding the next one, with a single retry if it fails
    const rolesToRemove = currentPrestigeRoles[prestigeType];
    async function tryRemoveRoles() {
        try {
            await member.roles.remove(rolesToRemove);
            console.log(`Removed roles [${rolesToRemove.join(", ")}] from user ${user_id}`);
            return true;
        } catch (e) {
            console.error(`Failed to remove prestige roles [${rolesToRemove.join(", ")}] from user ${user_id}:`, e);
            return false;
        }
    }
    if (rolesToRemove.length > 0) {
        let removed = await tryRemoveRoles();
        if (!removed) {
            // Wait 1 second and try again
            await new Promise(res => setTimeout(res, 1000));
            removed = await tryRemoveRoles();
            if (!removed) {
                console.error(`Second attempt to remove prestige roles [${rolesToRemove.join(", ")}] from user ${user_id} also failed.`);
            }
        }
    } else {
        console.log(`User does not have any ${prestigeType} prestige roles to remove.`);
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