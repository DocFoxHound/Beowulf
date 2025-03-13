const userlistApi = require("../api/userlistApi")
const rankRoles = require("../api/rank-roles-api")
const prestigeRoles = require("../api/prestige-roles-api")
const lodash = require('lodash');

async function createNewUser(userData, client, guildId){
    console.log("Create New User")
    newUser = {
        id: '',
        username: null,
        nickname: null,
        corsair_level: 0,
        raptor_level: 0,
        raider_level: 0,
        rank: null,
        raptor_1_solo: null,
        raptor_1_team: null,
        raptor_2_solo: null,
        raptor_2_team: null,
        raptor_3_solo: null,
        raptor_3_team: null,
        corsair_1_turret: null,
        corsair_1_torpedo: null,
        corsair_2_ship_commander: null,
        corsair_2_wing_commander: null,
        corsair_3_fleet_commander: null,
        raider_1_swabbie: null,
        raider_1_linemaster: null,
        raider_1_boarder: null,
        raider_2_powdermonkey: null,
        raider_2_mate: null,
        raider_3_sailmaster: null
    }

    //check if user is still in discord
    const guild = await client.guilds.fetch(guildId);
    member = null;
    try{
        member = await guild.members.fetch(userData.id);
    }catch{
        member = null;
    }
    console.log(member)
    // const discordUser = await client.users.fetch(userData.id);
    if(member){
        console.log("Adding user from Discord to DB")
        const memberRoles = member.roles.cache.map(role => role.id);
        newUser.id = userData.id;
        newUser.username = userData.username;
        newUser.nickname = userData.nickname || null;
        newUser.corsair_level = getCorsairRank(memberRoles, false) || 0;
        newUser.raptor_level = getRaptorRank(memberRoles, false) || 0;
        newUser.raider_level = getRaiderRank(memberRoles, false) || 0;
        newUser.raptor_1_solo = userData.raptor_1_solo;
        newUser.raptor_1_team = userData.raptor_1_team;
        newUser.raptor_2_solo = userData.raptor_2_solo;
        newUser.raptor_2_team = userData.raptor_2_team;
        newUser.raptor_3_solo = userData.raptor_3_solo;
        newUser.raptor_3_team = userData.raptor_3_team;
        newUser.corsair_1_turret = userData.corsair_1_turret;
        newUser.corsair_1_torpedo = userData.corsair_1_torpedo;
        newUser.corsair_2_ship_commander = userData.corsair_2_ship_commander;
        newUser.corsair_2_wing_commander = userData.corsair_2_wing_commander;
        newUser.corsair_3_fleet_commander = userData.corsair_3_fleet_commander;
        newUser.raider_1_swabbie = userData.raider_1_swabbie;
        newUser.raider_1_linemaster = userData.raider_1_linemaster;
        newUser.raider_1_boarder = userData.raider_1_boarder;
        newUser.raider_2_powdermonkey = userData.raider_2_powdermonkey;
        newUser.raider_2_mate = userData.raider_2_mate;
        newUser.raider_3_sailmaster = userData.raider_3_sailmaster;
        newUser.rank = getUserRank(memberRoles) || null;

        userlistApi.createUser(newUser);
    }else{ //if for some reason there's an error OR the person isn't in the discord anymore, do this;
        console.log("Adding user from queue to DB")
        newUser.id = userData.id;
        newUser.username = userData.username;
        newUser.nickname = userData.nickname || null;
        userlistApi.createUser(user);
    }
    
}

async function updateUserClassStatus(userDataForUserList, requestedClass) {
    console.log("Update User Class Status")
    switch (requestedClass.toLowerCase()){
        case "dogfighting":
            userDataForUserList.raptor_1_solo = true;
            break;
        case "dogfighting 101":
            userDataForUserList.raptor_1_solo = true;
            break;
        case "teamfighting":
            userDataForUserList.raptor_1_team = true;
            break;
        case "teamfighting 101":
            userDataForUserList.raptor_1_team = true;
            break;
        case "solo2":
            userDataForUserList.raptor_2_solo = true;
            break;
        case "raptor ii solo assessment":
            userDataForUserList.raptor_2_solo = true;
            break;
        case "team2":
            userDataForUserList.raptor_2_team = true;
            break;    
        case "raptor ii team assessment":
            userDataForUserList.raptor_2_team = true;
            break;   
        case "solo3":
            userDataForUserList.raptor_3_solo = true;
            break;
        case "raptor iii solo assessment":
            userDataForUserList.raptor_3_solo = true;
            break;
        case "team3":
            userDataForUserList.raptor_3_team = true;
            break;
        case "raptor iii team assessment":
            userDataForUserList.raptor_3_team = true;
            break;
        case "turret":
            userData.corsair_1_turret = true;
        case "turret assessment":
            userDataForUserList.corsair_1_turret = true;
            break;
        case "torpedo":
            userDataForUserList.corsair_1_torpedo = true;
            break;
        case "torpedo assessment":
            userDataForUserList.corsair_1_torpedo = true;
            break;
        case "ship commander":
            userDataForUserList.corsair_2_ship_commander = true;
            break;
        case "ship":
            userDataForUserList.corsair_2_ship_commander = true;
            break;
        case "ship commander assessment":
            userDataForUserList.corsair_2_ship_commander = true;
            break;
        case "wing commander":
            userDataForUserList.corsair_2_wing_commander = true;
            break;
        case "wing commander assessment":
            userDataForUserList.corsair_2_wing_commander = true;
            break;
        case "wing":
            userDataForUserList.corsair_2_wing_commander = true;
            break;
        case "fleet commander":
            userDataForUserList.corsair_3_fleet_commander = true;
            break;
        case "fleet":
            userDataForUserList.corsair_3_fleet_commander = true;
            break;
        case "fleet commander assessment":
            userDataForUserList.corsair_3_fleet_commander = true;
            break;
        case "swabbie":
            userDataForUserList.raider_1_swabbie = true;
            break;
        case "swabbie assessment":
            userDataForUserList.raider_1_swabbie = true;
            break;
        case "line master":
            userDataForUserList.raider_1_linemaster = true;
            break;
        case "line master assessment":
            userData.raider_1_linemaster = true;
            break;
        case "boarder":
            userDataForUserList.raider_1_boarder = true;
            break;
        case "boarding assessment":
            userDataForUserList.raider_1_boarder = true;
            break;
        case "powder monkey":
            userDataForUserList.raider_2_powdermonkey = true;
            break;
        case "powder monkey assessment":
            userDataForUserList.raider_2_powdermonkey = true;
            break;
        case "mate":
            userDataForUserList.raider_2_mate = true;
            break;
        case "mate assessment":
            userDataForUserList.raider_2_mate = true;
            break;
        case "sail master":
            userDataForUserList.raider_3_sailmaster = true;
            break;
        case "sail master assessment":
            userDataForUserList.raider_3_sailmaster = true;
            break;
    }
    return await userlistApi.editUser(userDataForUserList.id, userDataForUserList);
}

async function getUserRank(memberRoles) {
    const discordRankRoles = rankRoles.getRanks();
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
}

async function getRaptorRank(memberRoles) {
    const discordPrestigeRanks = await prestigeRoles.getPrestiges();
    // Create a map of role names to roles for quick lookup
    const roleMap = new Map(discordPrestigeRanks.map(role => [role.name, role]));
    // Define the priority of roles from highest to lowest
    const rolePriority = ["RAPTOR Council", "RAPTOR III", "RAPTOR II", "RAPTOR I", "test_raptor_council", "test_raptor_I"];
    // Iterate over the array of roles once to get the highest-priority role that the user has
    for (const roleName of rolePriority) {
        const role = roleMap.get(roleName);
        if (role && memberRoles.includes(role.id)) {
            return role.id;
        }
    }
    return 0;
}

async function getCorsairRank(memberRoles) {
    const discordPrestigeRanks = await prestigeRoles.getPrestiges();
    // Create a map of role names to roles for quick lookup
    const roleMap = new Map(discordPrestigeRanks.map(role => [role.name, role]));
    // Define the priority of roles from highest to lowest
    const rolePriority = ["CORSAIR Council", "CORSAIR III", "CORSAIR II", "CORSAIR I", "test_corsair_council", "test_corsair_I"];
    // Iterate over the array of roles once to get the highest-priority role that the user has
    for (const roleName of rolePriority) {
        const role = roleMap.get(roleName);
        if (role && memberRoles.includes(role.id)) {
            return role.id;
        }
    }
    return 0;
    
}

async function getRaiderRank(memberRoles) {
    const discordPrestigeRanks = await prestigeRoles.getPrestiges();
    // Create a map of role names to roles for quick lookup
    const roleMap = new Map(discordPrestigeRanks.map(role => [role.name, role]));
    // Define the priority of roles from highest to lowest
    const rolePriority = ["RAIDER Council", "RAIDER III", "RAIDER II", "RAIDER I", "test_raider_council", "test_raider_I"];
    // Iterate over the array of roles once to get the highest-priority role that the user has
    for (const roleName of rolePriority) {
        const role = roleMap.get(roleName);
        if (role && memberRoles.includes(role.id)) {
            return role.id;
        }
    }
    return 0;
}

//checks if the user is in a queue already or not
async function checkUserListForUser(author){
    const user = await userlistApi.getUserById(author.id);
    //if the user is in the database, we'll return the user data
    if(user){
        return user;
    //if the user IS NOT in the database, we have to create a new queue entry for them
    }else{
        return null;
    }
}

module.exports = {
    checkUserListForUser,
    createNewUser,
    getRaptorRank,
    getCorsairRank,
    getRaiderRank,
    updateUserClassStatus
}