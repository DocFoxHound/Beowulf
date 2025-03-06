newUser = {
    id: '',
    username: '',
    nickname: '',
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

async function createNewUser(){

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
}