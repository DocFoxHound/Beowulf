const { editUser } = require("../api/userlistApi")
const { getUserById } = require("../api/userlistApi")
const { getRaptorRankDb } = require("../userlist-functions/userlist-controller")
const { getCorsairRankDb } = require("../userlist-functions/userlist-controller")
const { getRaiderRankDb } = require("../userlist-functions/userlist-controller")
const { notifyPrestigePromotion } = require("../common/bot-notify")
const { notifyRankPromotion } = require("../common/bot-notify")
const { getPrestiges } = require("../api/prestige-roles-api")

async function checkForPrestigePromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai){
    try{
        const prestigeRoles = await getPrestiges()
        if(updatedUserData.raptor_level > oldUserData.raptor_level){
            const raptorLevel = updatedUserData.raptor_level
            if(raptorLevel === 1){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "RAPTOR I" : "test_raptor_I";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                notifyPrestigePromotion("RAPTOR", raptorLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove);
            }
            if(raptorLevel === 2){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "RAPTOR II" : "test_raptor_II";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === "RAPTOR I" || role.name === "test_raptor_II");
                notifyPrestigePromotion("RAPTOR", raptorLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove.id);
            }
            if(raptorLevel === 3){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "RAPTOR III" : "test_raptor_III";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === "RAPTOR II" || role.name === "test_raptor_II");
                notifyPrestigePromotion("RAPTOR", raptorLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove.id);
            }
        }
        if(updatedUserData.corsair_level > oldUserData.corsair_level){
            const corsairLevel = updatedUserData.corsair_level
            if(corsairLevel === 1){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "CORSAIR I" : "test_corsair_I";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                notifyPrestigePromotion("CORSAIR", corsairLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove);
            }
            if(corsairLevel === 2){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "CORSAIR II" : "test_corsair_II";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === "CORSAIR I" || role.name === "test_corsair_I");
                notifyPrestigePromotion("CORSAIR", corsairLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove.id);
            }
            if(corsairLevel === 3){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "CORSAIR III" : "test_corsair_III";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === "CORSAIR II" || role.name === "test_corsair_II");
                notifyPrestigePromotion("CORSAIR", corsairLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove.id);
            }
        }
        if(updatedUserData.raider_level > oldUserData.raider_level){
            const raiderLevel = updatedUserData.raider_level
            if(raiderLevel === 1){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "RAIDER I" : "test_raider_I";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                notifyPrestigePromotion("RAIDER", raiderLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove);
            }
            if(raiderLevel === 2){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "RAIDER II" : "test_raider_II";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === "RAIDER I" || role.name === "test_raider_I");
                notifyPrestigePromotion("RAIDER", raiderLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove.id);
            }
            if(raiderLevel === 3){
                const prestigeTitle = process.env.LIVE_ENVIRONMENT === "true" ? "RAIDER III" : "test_raider_III";
                const roleToAdd = prestigeRoles.find(role => role.name === prestigeTitle);
                const roleToRemove = prestigeRoles.find(role => role.name === "RAIDER II" || role.name === "test_raider_II");
                notifyPrestigePromotion("RAIDER", raiderLevel, updatedUserData, openai, client)
                await member.roles.add(roleToAdd.id);
                await member.roles.remove(roleToRemove.id);
            }
        }
        editUser(updatedUserData.id, updatedUserData);
    }catch(error){
        console.log(error)
    }
}

async function checkForRankPromotionUpdateUserlist(oldUserData, updatedUserData, member, client, openai){
    const oldTotalPrestiges = oldUserData.raptorLevel + oldUserData.corsairLevel + oldUserData.raiderLevel;
    const newTotalPrestiges = updatedUserData.raptorLevel + updatedUserData.corsairLevel + updatedUserData.raiderLevel;
    const promotedToRaptorIII = updatedUserData.raptorLevel === 3 && oldUserData.raptorLevel === 2;
    const promotedToCorsairIII = updatedUserData.corsairLevel === 3 && oldUserData.corsairLevel === 2;
    const promotedToRaiderIII = updatedUserData.raiderLevel === 3 && oldUserData.raiderLevel === 2;
    if(newTotalPrestiges > 3 && oldTotalPrestiges < 3){
        const roleToAdd = process.env.LIVE_ENVIRONMENT === "true" ? "CREW" : "test_crew";
        const roleToRemove = process.env.LIVE_ENVIRONMENT === "true" ? "PROSPECT" : "test_prospect";
        notifyRankPromotion("CREW", updatedUserData, openai, client)
        await member.roles.add(roleToAdd);
        await member.roles.remove(roleToRemove);
    }
    if(promotedToRaptorIII || promotedToCorsairIII || promotedToRaiderIII){
        notifyRankPromotion("MARAUDER", updatedUserData, openai, client)
    }
}

module.exports = {
    checkForPrestigePromotionUpdateUserlist,
    checkForRankPromotionUpdateUserlist
}