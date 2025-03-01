const queue = require("../api/queue");

async function addQueue(requestedText, message){
    newUser={
        id: message.author.id,
        username: message.author.username,
        nickname: message.member?.nickname || null,
        createdAt: new Date(),
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

    switch (requestedText){
        case "dogfighting":
            newUser.raptor_1_solo = true;
            break;
        case "dogfighting 101":
            newUser.raptor_1_solo = true;
            break;
        case "teamfighting":
            newUser.raptor_1_team = true;
            break;
        case "teamfighting 101":
            newUser.raptor_1_team = true;
            break;
        case "solo2":
            newUser.raptor_2_solo = true;
            break;
        case "team2":
            newUser.raptor_2_team = true;
            break;    
        case "solo3":
            newUser.raptor_3_solo = true;
            break;
        case "team3":
            newUser.raptor_3_team = true;
            break;
        case "turret":
            newUser.corsair_1_turret = true;
            break;
        case "torpedo":
            newUser.corsair_1_torpedo = true;
            break;
        case "ship commander":
            newUser.corsair_2_ship_commander = true;
            break;
        case "ship":
            newUser.corsair_2_ship_commander = true;
            break;
        case "wing commander":
            newUser.corsair_2_wing_commander = true;
            break;
        case "wing":
            newUser.corsair_2_wing_commander = true;
            break;
        case "fleet commander":
            newUser.corsair_3_fleet_commander = true;
            break;
        case "fleet":
            newUser.corsair_3_fleet_commander = true;
            break;
        case "swabbie":
            newUser.raider_1_swabbie = true;
            break;
        case "line master":
            newUser.raider_1_linemaster = true;
            break;
        case "boarder":
            newUser.raider_1_boarder = true;
            break;
        case "powder monkey":
            newUser.raider_2_powdermonkey = true;
            break;
        case "mate":
            newUser.raider_2_mate = true;
            break;
        case "sail master":
            newUser.raider_3_sailmaster = true;
            break;
    }
    return await queue.createUserInQueue(newUser);
}

module.exports = {
    addQueue
};