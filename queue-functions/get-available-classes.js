const checkUserListForUser = require("../userlist-functions/userlist-controller").checkUserListForUser;
const checkQueueForUser = require("../queue-functions/queue-controller").checkQueueForUser
const getRaptorRank = require("../userlist-functions/userlist-controller").getRaptorRank;
const getCorsairRank = require("../userlist-functions/userlist-controller").getCorsairRank;
const getRaiderRank = require("../userlist-functions/userlist-controller").getRaiderRank;

async function getAvailableClasses(user, guild) {
    //lookup the classes
    // const allClasses = ['Math', 'Science', 'History', 'Art'];
    const allClasses = await getUserClasses(user, guild);
    // Simulate a lookup for classes the user has already taken:
    // const takenClasses = ['Math']; // This would be dynamic per user
    return allClasses.filter(c => allClasses.includes(c));
}

async function getUserClasses(user, guild){
    const queueData = await checkQueueForUser(user.id)
    const userData = await checkUserListForUser(user)
    const member = await guild.members.fetch(user.id);
    const memberRoles = member.roles.cache.map(role => role.id);
    const userRaptorLevel = await getRaptorRank(memberRoles, true);
    const userCorsairLevel = await getCorsairRank(memberRoles, true);
    const userRaiderLevel = await getRaiderRank(memberRoles, true);
    let classList = [];
    if(userRaptorLevel === 0){ //all classes a RAPTOR 0 can take
        if(userData.raptor_1_solo === false && queueData.raptor_1_solo === false){
            classList.push("Dogfighting 101")
        }
        if(userData.raptor_1_team === false && queueData.raptor_1_team === false){
            classList.push("Teamfighting 101")
        }
    }
    if(userRaptorLevel === 1){ //all classes a RAPTOR 1 can take
        if(userData.raptor_2_solo === false && queueData.raptor_2_solo === false){
            classList.push("Dogfighting 101")
        }
        if(userData.raptor_2_team === false && queueData.raptor_2_team === false){
            classList.push("Teamfighting 101")
        }
    }
    if(userRaptorLevel === 2){ //all classes a RAPTOR 2 can take
        if(userData.raptor_3_solo === false && queueData.raptor_3_solo === false){
            classList.push("Dogfighting 101")
        }
        if(userData.raptor_3_team === false && queueData.raptor_3_team === false){
            classList.push("Teamfighting 101")
        }
    }
    if(userCorsairLevel === 0){ //all classes a CORSAIR 0 can take
        if(userData.corsair_1_turret === false && queueData.corsair_1_turret === false){
            classList.push("Turret Assessment")
        }
        if(userData.corsair_1_torpedo === false && queueData.corsair_1_torpedo === false){
            classList.push("Torpedo Assessment")
        }
    }
    if(userCorsairLevel === 1){ //all classes a CORSAIR 1 can take
        if(userData.corsair_2_ship_commander === false && queueData.corsair_2_ship_commander === false){
            classList.push("Ship Commander Assessment")
        }
        if(userData.corsair_2_wing_commander === false && queueData.corsair_2_wing_commander === false && userData.corsair_2_ship_commander === true){
            classList.push("Wing Commander Assessment")
        }
    }
    if(userCorsairLevel === 2){ //all classes a CORSAIR 2 can take
        if(userData.corsair_3_fleet_commander === false && queueData.corsair_3_fleet_commander === false){
            classList.push("Fleet Commander Assessment")
        }
    }
    if(userRaiderLevel === 0){ //all classes a RAIDER 0 can take
        if(userData.raider_1_swabbie === false && queueData.raider_1_swabbie === false){
            classList.push("Swabbie Assessment")
        }
        if(userData.raider_1_linemaster === false && queueData.raider_1_linemaster === false){
            classList.push("Line Master Assessment")
        }
        if(userData.raider_1_boarder === false && queueData.raider_1_boarder === false){
            classList.push("Boarding Assessment")
        }
    }
    if(userRaiderLevel === 1){ //all classes a CORSAIR 0 can take
        if(userData.raider_2_powdermonkey === false && queueData.raider_2_powdermonkey === false){
            classList.push("Powder Monkey Assessment")
        }
        if(userData.raider_2_mate === false && queueData.raider_2_mate === false){
            classList.push("Mate Assessment")
        }
    }
    if(userRaiderLevel === 2){ //all classes a CORSAIR 0 can take
        if(userData.raider_3_sailmaster === false && queueData.raider_3_sailmaster === false){
            classList.push("Sail Master Assessment")
        }
    }
    return classList;
}

// raptor_1_solo: null,
// raptor_1_team: null,
// raptor_2_solo: null,
// raptor_2_team: null,
// raptor_3_solo: null,
// raptor_3_team: null,
// corsair_1_turret: null,
// corsair_1_torpedo: null,
// corsair_2_ship_commander: null,
// corsair_2_wing_commander: null,
// corsair_3_fleet_commander: null,
// raider_1_swabbie: null,
// raider_1_linemaster: null,
// raider_1_boarder: null,
// raider_2_powdermonkey: null,
// raider_2_mate: null,
// raider_3_sailmaster: null


module.exports = {
    getAvailableClasses,
}