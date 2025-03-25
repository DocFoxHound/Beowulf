const userlistApi = require("../api/userlistApi")
const rankRoles = require("../api/rank-roles-api")
const getClasses = require("../api/classApi").getClasses;
const editQueue = require("../api/queueApi").editQueue;
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
        raptor_1_solo: false,
        raptor_1_team: false,
        raptor_2_solo: false,
        raptor_2_team: false,
        raptor_3_solo: false,
        raptor_3_team: false,
        corsair_1_turret: false,
        corsair_1_torpedo: false,
        corsair_2_ship_commander: false,
        corsair_2_wing_commander: false,
        corsair_3_fleet_commander: false,
        raider_1_swabbie: false,
        raider_1_linemaster: false,
        raider_1_boarder: false,
        raider_2_powdermonkey: false,
        raider_2_mate: false,
        raider_3_sailmaster: false
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

async function updateUserClassStatus(userDataForUserList, requestedClass, classCompleted) {
    console.log("Update User Class Status")
    // const classList = await getClasses();
    // let classToEdit;
    // for(const clss of classList){
    //     if(clss.name.toLowerCase() === requestedClass.toLowerCase() || clss.aliases.includes(requestedClass.toLowerCase())){
    //         classToEdit = clss;
    //         // if(classCompleted){
    //         //     userDataForUserList.classes[requestedClass] = true;
    //         // }else{
    //         //     userDataForUserList.classes[requestedClass] = false;
    //         // }
    //     }
    // }
    // console.log(userDataForUserList[classToEdit.name]);
    // userDataForUserList[classToEdit.name] = classCompleted;
    switch (requestedClass.toLowerCase()){
        case "raptor_1_solo":
            userDataForUserList.raptor_1_solo = classCompleted;
            break;
        case "dogfighting":
            userDataForUserList.raptor_1_solo = classCompleted;
            break;
        case "dogfighting 101":
            userDataForUserList.raptor_1_solo = classCompleted;
            break;
        case "raptor_1_team":
            userDataForUserList.raptor_1_team = classCompleted;
            break;
        case "teamfighting":
            userDataForUserList.raptor_1_team = classCompleted;
            break;
        case "teamfighting 101":
            userDataForUserList.raptor_1_team = classCompleted;
            break;
        case "raptor_2_solo":
            userDataForUserList.raptor_2_solo = classCompleted;
            break;
        case "solo2":
            userDataForUserList.raptor_2_solo = classCompleted;
            break;
        case "raptor ii solo assessment":
            userDataForUserList.raptor_2_solo = classCompleted;
            break;
        case "raptor_2_team":
            userDataForUserList.raptor_2_team = classCompleted;
            break; 
        case "team2":
            userDataForUserList.raptor_2_team = classCompleted;
            break;    
        case "raptor ii team assessment":
            userDataForUserList.raptor_2_team = classCompleted;
            break;   
        case "raptor_3_solo":
            userDataForUserList.raptor_3_solo = classCompleted;
            break;
        case "solo3":
            userDataForUserList.raptor_3_solo = classCompleted;
            break;
        case "raptor iii solo assessment":
            userDataForUserList.raptor_3_solo = classCompleted;
            break;
        case "raptor_3_team":
            userDataForUserList.raptor_3_team = classCompleted;
            break;
        case "team3":
            userDataForUserList.raptor_3_team = classCompleted;
            break;
        case "raptor iii team assessment":
            userDataForUserList.raptor_3_team = classCompleted;
            break;
        case "corsair_1_turret":
            userData.corsair_1_turret = classCompleted;
        case "turret":
            userData.corsair_1_turret = classCompleted;
        case "turret assessment":
            userDataForUserList.corsair_1_turret = classCompleted;
            break;
        case "corsair_1_torpedo":
            userDataForUserList.corsair_1_torpedo = classCompleted;
            break;
        case "torpedo":
            userDataForUserList.corsair_1_torpedo = classCompleted;
            break;
        case "torpedo assessment":
            userDataForUserList.corsair_1_torpedo = classCompleted;
            break;
        case "corsair_2_ship_commander":
            userDataForUserList.corsair_2_ship_commander = classCompleted;
            break;
        case "ship commander":
            userDataForUserList.corsair_2_ship_commander = classCompleted;
            break;
        case "ship":
            userDataForUserList.corsair_2_ship_commander = classCompleted;
            break;
        case "ship commander assessment":
            userDataForUserList.corsair_2_ship_commander = classCompleted;
            break;
        case "corsair_2_wing_commander":
            userDataForUserList.corsair_2_wing_commander = classCompleted;
            break;
        case "wing commander":
            userDataForUserList.corsair_2_wing_commander = classCompleted;
            break;
        case "wing commander assessment":
            userDataForUserList.corsair_2_wing_commander = classCompleted;
            break;
        case "wing":
            userDataForUserList.corsair_2_wing_commander = classCompleted;
            break;
        case "corsair_3_fleet_commander":
            userDataForUserList.corsair_3_fleet_commander = classCompleted;
            break;
        case "fleet commander":
            userDataForUserList.corsair_3_fleet_commander = classCompleted;
            break;
        case "fleet":
            userDataForUserList.corsair_3_fleet_commander = classCompleted;
            break;
        case "fleet commander assessment":
            userDataForUserList.corsair_3_fleet_commander = classCompleted;
            break;
        case "raider_1_swabbie":
            userDataForUserList.raider_1_swabbie = classCompleted;
            break;
        case "swabbie":
            userDataForUserList.raider_1_swabbie = classCompleted;
            break;
        case "swabbie assessment":
            userDataForUserList.raider_1_swabbie = classCompleted;
            break;
        case "raider_1_linemaster":
            userDataForUserList.raider_1_linemaster = classCompleted;
            break;
        case "line master":
            userDataForUserList.raider_1_linemaster = classCompleted;
            break;
        case "line master assessment":
            userData.raider_1_linemaster = classCompleted;
            break;
        case "raider_1_boarder":
            userDataForUserList.raider_1_boarder = classCompleted;
            break;
        case "boarder":
            userDataForUserList.raider_1_boarder = classCompleted;
            break;
        case "boarding assessment":
            userDataForUserList.raider_1_boarder = classCompleted;
            break;
        case "raider_2_powdermonkey":
            userDataForUserList.raider_2_powdermonkey = classCompleted;
            break;
        case "powder monkey":
            userDataForUserList.raider_2_powdermonkey = classCompleted;
            break;
        case "powder monkey assessment":
            userDataForUserList.raider_2_powdermonkey = classCompleted;
            break;
        case "raider_2_mate":
            userDataForUserList.raider_2_mate = classCompleted;
            break;
        case "mate":
            userDataForUserList.raider_2_mate = classCompleted;
            break;
        case "mate assessment":
            userDataForUserList.raider_2_mate = classCompleted;
            break;
        case "raider_3_sailmaster":
            userDataForUserList.raider_3_sailmaster = classCompleted;
            break;
        case "sail master":
            userDataForUserList.raider_3_sailmaster = classCompleted;
            break;
        case "sail master assessment":
            userDataForUserList.raider_3_sailmaster = classCompleted;
            break;
    }
    return await userlistApi.editUser(userDataForUserList.id, userDataForUserList);
}

async function getUserRank(memberRoles) {
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

async function getRaptorRankDb(userId) {
    const user = await userlistApi.getUserById(userId);
    if (!user) return 0;

    if (user.raptor_3_solo && user.raptor_3_team) return 3;
    if (user.raptor_2_solo && user.raptor_2_team) return 2;
    if (user.raptor_1_solo && user.raptor_1_team) return 1;
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

async function getCorsairRankDb(userId) {
    const user = await userlistApi.getUserById(userId);
    if (!user) return 0;

    if (user.corsair_3_fleet_commander) return 3;
    if (user.corsair_2_ship_commander && user.corsair_2_wing_commander) return 2;
    if (user.corsair_1_turret && user.corsair_1_torpedo) return 1;
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
    getUserRank
}