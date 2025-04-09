const checkUserListForUser = require("../userlist-functions/userlist-controller").checkUserListForUser;
const checkQueueForUser = require("../queue-functions/queue-controller").checkQueueForUser
const { getRaptorRankDb } = require("../userlist-functions/userlist-controller");
const { getCorsairRankDb } = require("../userlist-functions/userlist-controller");
const { getRaiderRankDb } = require("../userlist-functions/userlist-controller");
const getClasses = require("../api/classApi").getClasses;

// async function getAvailableClasses(user, whichClasses) {
//     //lookup the classes
//     let allClasses = [];
//     if(whichClasses === "available"){
//         console.log("Available Classes")
//         allClasses = await getAvailableUserClasses(user);
//     }else if(whichClasses === "current"){
//         console.log("Current Classes")
//         allClasses = await getCurrentUserClasses(user);
//     }else if(whichClasses === "all"){
//         console.log("All Classes")
//         // allClasses = await getCurrentUserClasses(user);
//         //add a way to retrieve all classes
//         const classList = await getClasses();
//         allClasses = classList.map(c => c.name);
//     }
//     return allClasses.filter(c => allClasses.includes(c));
// }

async function getAvailableUserClassesQueueRemove(user){
    try{
        const queueData = await checkQueueForUser(user.id) || null;
        const userData = await checkUserListForUser(user);
        const userRaptorLevel = await getRaptorRankDb(user.id);
        const userCorsairLevel = await getCorsairRankDb(user.id);
        const userRaiderLevel = await getRaiderRankDb(user.id);
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
                classList.push("RAPTOR II Solo Assessment")
            }
            if(userData.raptor_2_team === false && queueData.raptor_2_team === false){
                classList.push("RAPTOR II Team Assessment")
            }
        }
        if(userRaptorLevel === 2){ //all classes a RAPTOR 2 can take
            if(userData.raptor_3_solo === false && queueData.raptor_3_solo === false){
                classList.push("RAPTOR III Solo Assessment")
            }
            if(userData.raptor_3_team === false && queueData.raptor_3_team === false){
                classList.push("RAPTOR III Team Assessment")
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
    }catch(error){
        console.error("Error getting available classes: ", error);
        return [];
    }
}

// async function getAvailableUserClasses(user){
//     try{
//         const queueData = await checkQueueForUser(user.id) || null;
//         const userData = await checkUserListForUser(user);
//         // const userRaptorLevel = await getRaptorRankDb(user.id);
//         // const userCorsairLevel = await getCorsairRankDb(user.id);
//         // const userRaiderLevel = await getRaiderRankDb(user.id);
//         let classList = [];

//         if(userData.raptor_1_solo === false){
//             classList.push("Dogfighting 101")
//         }
//         if(userData.raptor_1_team === false){
//             classList.push("Teamfighting 101")
//         }
//         if(userData.raptor_2_solo === false && userData.raptor_1_solo === true && userData.raptor_1_team === true){
//             classList.push("RAPTOR II Solo Assessment")
//         }
//         if(userData.raptor_2_team === false && userData.raptor_1_solo === true && userData.raptor_1_team === true){
//             classList.push("RAPTOR II Team Assessment")
//         }
//         if(userData.raptor_3_solo === false && userData.raptor_2_solo === true && userData.raptor_2_team === true){
//             classList.push("RAPTOR III Solo Assessment")
//         }
//         if(userData.raptor_3_team === false && userData.raptor_2_solo === true && userData.raptor_2_team === true){
//             classList.push("RAPTOR III Team Assessment")
//         }
//         if(userData.corsair_1_turret === false){
//             classList.push("Turret Assessment")
//         }
//         if(userData.corsair_1_torpedo === false){
//             classList.push("Torpedo Assessment")
//         }
//         if(userData.corsair_2_ship_commander === false && userData.corsair_1_turret === true && userData.corsair_1_torpedo === true){
//             classList.push("Ship Commander Assessment")
//         }
//         if(userData.corsair_2_wing_commander === false && userData.corsair_1_turret === true && userData.corsair_1_torpedo === true && userData.corsair_2_ship_commander === true){
//             classList.push("Wing Commander Assessment")
//         }
//         if(userData.corsair_3_fleet_commander === false && userData.corsair_2_ship_commander === true && userData.corsair_2_wing_commander === true){
//             classList.push("Fleet Commander Assessment")
//         }
//         if(userData.raider_1_swabbie === false){
//             classList.push("Swabbie Assessment")
//         }
//         if(userData.raider_1_linemaster === false && userData.raider_1_swabbie === true){
//             classList.push("Line Master Assessment")
//         }
//         if(userData.raider_1_boarder === false && userData.raider_1_swabbie === true){
//             classList.push("Boarding Assessment")
//         }
//         if(userData.raider_2_powdermonkey === false && userData.raider_1_swabbie === true && userData.raider_1_linemaster === true){
//             classList.push("Powder Monkey Assessment")
//         }
//         if(userData.raider_2_mate === false && userData.raider_1_swabbie === true && userData.raider_1_linemaster === true){
//             classList.push("Mate Assessment")
//         }
//         if(userData.raider_3_sailmaster === false && userData.raider_2_powdermonkey === true && userData.raider_2_mate === true){
//             classList.push("Sail Master Assessment")
//         }
//         return classList;
//     }catch(error){
//         console.error("Error getting available classes: ", error);
//         return [];
//     }
// }

async function getCurrentUserClasses(user){
    const queueData = await checkQueueForUser(user.id)
    let classList = [];
    if(queueData){
        let classList = [];
        if(queueData.raptor_1_solo === true){
            classList.push("Dogfighting 101")
        }
        if(queueData.raptor_1_team === true){
            classList.push("Teamfighting 101")
        }
        if(queueData.raptor_2_solo === true){
            classList.push("RAPTOR II Solo Assessment")
        }
        if(queueData.raptor_2_team === true){
            classList.push("RAPTOR II Team Assessment")
        }
        if(queueData.raptor_3_solo === true){
            classList.push("RAPTOR III Solo Assessment")
        }
        if(queueData.raptor_3_team === true){
            classList.push("RAPTOR III Team Assessment")
        }
        if(queueData.corsair_1_turret === true){
            classList.push("Turret Assessment")
        }
        if(queueData.corsair_1_torpedo === true){
            classList.push("Torpedo Assessment")
        }
        if(queueData.corsair_2_ship_commander === true){
            classList.push("Ship Commander Assessment")
        }
        if(queueData.corsair_2_wing_commander === true){
            classList.push("Wing Commander Assessment")
        }
        if(queueData.corsair_3_fleet_commander === true){
            classList.push("Fleet Commander Assessment")
        }
        if(queueData.raider_1_swabbie === true){
            classList.push("Swabbie Assessment")
        }
        if(queueData.raider_1_linemaster === true){
            classList.push("Line Master Assessment")
        }
        if(queueData.raider_1_boarder === true){
            classList.push("Boarding Assessment")
        }
        if(queueData.raider_2_powdermonkey === true){
            classList.push("Powder Monkey Assessment")
        }
        if(queueData.raider_2_mate === true){
            classList.push("Mate Assessment")
        }
        if(queueData.raider_3_sailmaster === true){
            classList.push("Sail Master Assessment")
        }
        return classList;
    }else{
        return classList.push("Error retrieving classes");
    }
    
}

module.exports = {
    getAvailableUserClassesQueueRemove
}