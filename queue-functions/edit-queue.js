const queue = require("../api/queue");

async function editQueue(requestedText, userData, author){
    switch (requestedText){
        case "dogfighting":
            userData.raptor_1_solo = true;
            break;
        case "dogfighting 101":
            userData.raptor_1_solo = true;
            break;
        case "teamfighting":
            userData.raptor_1_team = true;
            break;
        case "teamfighting 101":
            userData.raptor_1_team = true;
            break;
        case "solo2":
            userData.raptor_2_solo = true;
            break;
        case "team2":
            userData.raptor_2_team = true;
            break;    
        case "solo3":
            userData.raptor_3_solo = true;
            break;
        case "team3":
            userData.raptor_3_team = true;
            break;
        case "turret":
            userData.corsair_1_turret = true;
            break;
        case "torpedo":
            userData.corsair_1_torpedo = true;
            break;
        case "ship commander":
            userData.corsair_2_ship_commander = true;
            break;
        case "ship":
            userData.corsair_2_ship_commander = true;
            break;
        case "wing commander":
            userData.corsair_2_wing_commander = true;
            break;
        case "wing":
            userData.corsair_2_wing_commander = true;
            break;
        case "fleet commander":
            userData.corsair_3_fleet_commander = true;
            break;
        case "fleet":
            userData.corsair_3_fleet_commander = true;
            break;
        case "swabbie":
            userData.raider_1_swabbie = true;
            break;
        case "line master":
            userData.raider_1_linemaster = true;
            break;
        case "boarder":
            userData.raider_1_boarder = true;
            break;
        case "powder monkey":
            userData.raider_2_powdermonkey = true;
            break;
        case "mate":
            userData.raider_2_mate = true;
            break;
        case "sail master":
            userData.raider_3_sailmaster = true;
            break;
        case "queue-reminder": //this resets the timer so that the bot isnt't just blasting the help channels about the same person over and over again
            const currentTime = new Date();
            const fiveMinutesAgo = new Date(currentTime.getTime() - (5 * 60000));
            userData.createdAt = fiveMinutesAgo
            break;
    }
    return await queue.editUserInQueue(author.id, userData);
}

module.exports = {
    editQueue
};