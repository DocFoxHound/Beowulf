const { checkForPrestigePromotionUpdateUserlist } = require('./check-for-promotion');
const { checkForRankPromotionUpdateUserlist } = require('./check-for-promotion');
const { getUserRank } = require("../userlist-functions/userlist-controller")
const { getRaptorRankDb } = require("../userlist-functions/userlist-controller")
const { getCorsairRankDb } = require("../userlist-functions/userlist-controller")
const { getRaiderRankDb } = require("../userlist-functions/userlist-controller")
const { getRaptorRank } = require("../userlist-functions/userlist-controller")
const { getCorsairRank } = require("../userlist-functions/userlist-controller")
const { getRaiderRank } = require("../userlist-functions/userlist-controller")
const { getUserById } = require("../api/userlistApi")
const { editUser } = require("../api/userlistApi")
const { createUser } = require("../api/userlistApi")

async function refreshUserlist(client, openai){
    console.log("Refreshing Userlist")
    try{
        const guild = await client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.TEST_GUILD_ID : process.env.GUILD_ID);
        const memberList = await guild.members.cache;

        memberList.forEach(async member => {
            const oldUserData = await getUserById(member.id) || null;
            if(oldUserData !== null){//if the user is in the database
                const memberRoles = await member.roles.cache.map(role => role.id);
                const userRank = await getUserRank(memberRoles);
                const raptorLevel = await getRaptorRankDb(member.id);
                const corsairLevel = await getCorsairRankDb(member.id);
                const raiderLevel = await getRaiderRankDb(member.id);
        
                const updatedUserData = {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname,
                    corsair_level: corsairLevel,
                    raptor_level: raptorLevel,
                    raider_level: raiderLevel,
                    raptor_1_solo: oldUserData.raptor_1_solo,
                    raptor_1_team: oldUserData.raptor_1_team,
                    raptor_2_solo: oldUserData.raptor_2_solo,
                    raptor_2_team: oldUserData.raptor_2_team,
                    raptor_3_solo: oldUserData.raptor_3_solo,
                    raptor_3_team: oldUserData.raptor_3_team,
                    corsair_1_turret: oldUserData.corsair_1_turret,
                    corsair_1_torpedo: oldUserData.corsair_1_torpedo,
                    corsair_2_ship_commander: oldUserData.corsair_2_ship_commander,
                    corsair_2_wing_commander: oldUserData.corsair_2_wing_commander,
                    corsair_3_fleet_commander: oldUserData.corsair_3_fleet_commander,
                    raider_1_swabbie: oldUserData.raider_1_swabbie,
                    raider_1_linemaster: oldUserData.raider_1_linemaster,
                    raider_1_boarder: oldUserData.raider_1_boarder,
                    raider_2_powdermonkey: oldUserData.raider_2_powdermonkey,
                    raider_2_mate: oldUserData.raider_2_mate,
                    raider_3_sailmaster: oldUserData.raider_3_sailmaster,
                    rank: userRank
                }

                //check if there was a promotion missed somewhere
                if(oldUserData.raptor_level !== raptorLevel || oldUserData.corsair_level !== corsairLevel || oldUserData.raider_level !== raiderLevel){
                    //send a message to the player that they have been promoted
                    checkForPrestigePromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai)
                }
                if(oldUserData.rank !== userRank){
                    //send a message to the player that they have been promoted
                    checkForRankPromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai)
                }
                
            }else{//if the user isn't in the database
                const memberRoles = await member.roles.cache.map(role => role.id);
                const userRank = await getUserRank(memberRoles);

                const newUser = {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname,
                    corsair_level: 0,
                    raptor_level: 0,
                    raider_level: 0,
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
                    raider_3_sailmaster: false,
                    rank: null
                }
                createUser(newUser);
            }
        })
        return "Userlist updated."
    }catch(error){
        console.error('Error refreshing userlist: ', error);
    }
}

async function newLoadUserList(client){
    console.log("Fresh Userlist Load")
    try{
        const guild = await client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.TEST_GUILD_ID : process.env.GUILD_ID);
        const memberList = await guild.members.cache;

        memberList.forEach(async member => {
            const memberRoles = await member.roles.cache.map(role => role.id);
            const userRank = await getUserRank(memberRoles);
            const raptorLevel = await getRaptorRank(memberRoles) || 0;
            const corsairLevel = await getCorsairRank(memberRoles) || 0;
            const raiderLevel = await getRaiderRank(memberRoles) || 0;

            const newUser = {
                id: member.id,
                username: member.user.username,
                nickname: member.nickname,
                corsair_level: corsairLevel,
                raptor_level: raptorLevel,
                raider_level: raiderLevel,
                raptor_1_solo: raptorLevel > 0 ? true : false,
                raptor_1_team: raptorLevel > 0 ? true : false,
                raptor_2_solo: raptorLevel > 1 ? true : false,
                raptor_2_team: raptorLevel > 1 ? true : false,
                raptor_3_solo: raptorLevel > 2 ? true : false,
                raptor_3_team: raptorLevel > 2 ? true : false,
                corsair_1_turret: corsairLevel > 0 ? true : false,
                corsair_1_torpedo: corsairLevel > 0 ? true : false,
                corsair_2_ship_commander: corsairLevel > 1 ? true : false,
                corsair_2_wing_commander: corsairLevel > 1 ? true : false,
                corsair_3_fleet_commander: corsairLevel > 2 ? true : false,
                raider_1_swabbie: raiderLevel > 0 ? true : false,
                raider_1_linemaster: raiderLevel > 0 ? true : false,
                raider_1_boarder: raiderLevel > 0 ? true : false,
                raider_2_powdermonkey: raiderLevel > 1 ? true : false,
                raider_2_mate: raiderLevel > 1 ? true : false,
                raider_3_sailmaster: raiderLevel > 2 ? true : false,
                rank: userRank
            }
            await createUser(newUser);
        })
        return "New Users have been loaded - DO NOT USE THIS COMMAND AGAIN; USE THE UPDATE COMMAND"
    }catch(error){
        console.error('Error loading new userlist: ', error);
    }
}

module.exports = {
    refreshUserlist,
    newLoadUserList
}