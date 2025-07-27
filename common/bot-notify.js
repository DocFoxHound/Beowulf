// const handleRequiresAction = require("../threads/handle-requires-action").handleRequiresAction
const runThreadForQueueNotify = require("../threads/run-thread").runThreadForQueueNotify
const addMessageToThread = require("../threads/add-message-to-thread").addMessageToThread
const createNewThread = require("../threads/create-new-thread").createNewThread
const formatResponseForQueueCheck = require("../threads/format-response").formatResponseForQueueCheck
const { sendMessage } = require("../threads/send-response")
const { sendMessageNotifySubject } = require("../threads/send-response")



// async function notifyNewQueue(queue, requestedText, user, openai, client){
//     console.log(`Notify`)
//     channelToNotify = null;
//     switch (queue){
//         case "RAPTOR":
//             channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.DOGFIGHTING_CHANNEL : process.env.TEST_RAPTOR_CHANNEL;
//             break;
//         case "RAIDER":
//             channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.PIRACY_CHANNEL : process.env.TEST_RAIDER_CHANNEL;
//             break;
//         case "CORSAIR":
//             channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_CHANNEL : process.env.TEST_CORSAIR_CHANNEL;
//             break;
//     }
//     messageToBot = `Rewrite the following: "${user} has been added to the ${queue} queue for ${requestedText} class/assessment"`
//     const thread = await createNewThread(channelToNotify, openai);
//     await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
//     let run = await runThreadForQueueNotify(thread, openai, true);

//     if (run.status === "completed") {
//         console.log("Completed Notify")
//         const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
//         await sendMessage(channelToNotify, formattedResponse, client);
//         raptorResultArray = null;
//     }
// }

// async function notifyOldQueue(queue, requestedText, openai, client){
//     console.log("Notify")
//     channelToNotify = null;
//     switch (queue){
//         case "RAPTOR":
//             channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.DOGFIGHTING_CHANNEL : process.env.TEST_RAPTOR_CHANNEL;
//             break;
//         case "RAIDER":
//             channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.PIRACY_CHANNEL : process.env.TEST_RAIDER_CHANNEL;
//             break;
//         case "CORSAIR":
//             channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_CHANNEL : process.env.TEST_CORSAIR_CHANNEL;
//             break;
//     }
//     messageToBot = `Rewrite the following: "${requestedText}"`
//     const thread = await createNewThread(channelToNotify, openai);
//     await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
//     let run = await runThreadForQueueNotify(thread, openai, true);
//     if (run.status === "completed") {
//         console.log("Completed Notify")
//         const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
//         await sendMessage(channelToNotify, formattedResponse, client);
//         raptorResultArray = null;
//     }
// }

async function notifyPrestigePromotion(prestige, prestigeLevel, userData, openai, client){
    console.log(`Notify`)
    let channelToNotify = null;
    let messageToBot = '';
    switch (prestige){
        case "RAPTOR":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s dogfighting skills and new promotion to ${prestige} ${prestigeLevel}.`
            if(prestigeLevel === 1){
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            }else if(prestigeLevel > 1){
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.DOGFIGHTING_CHANNEL : process.env.TEST_RAPTOR_CHANNEL;
            }
            break;
        case "RAIDER":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s piracy skills and new promotion to ${prestige} ${prestigeLevel}.`
            if(prestigeLevel === 1){
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            }else if(prestigeLevel > 1){
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_CHANNEL : process.env.TEST_RAIDER_CHANNEL;
            }
            break;
        case "CORSAIR":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s fleet skills and new promotion to ${prestige} ${prestigeLevel}.`
            if(prestigeLevel === 1){
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            }else if(prestigeLevel > 1){
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_CHANNEL : process.env.TEST_CORSAIR_CHANNEL;
            }
            break;
    }
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessageNotifySubject(channelToNotify, userId, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyRankPromotion(rank, userData, openai, client){
    console.log(`Notify`)
    console.log(`Rank: ${rank}`);
    let channelToNotify = null;
    let messageToBot = '';

    messageToBot = `Congratulate ${userData.nickname || userData.username} for promoting to ${rank}.`
    channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ANNOUNCEMENTS_CHANNEL : process.env.TEST_ANNOUNCEMENTS_CHANNEL;

    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessageNotifySubject(channelToNotify, userData.userId, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyForAward(badgeName, badgeDescription, userName, userId, openai, client){
    console.log(`Notifying for Badge Award: ${badgeName}`);
    let channelToNotify = null;
    let messageToBot = '';
    messageToBot = `Write a congratulations to ${userName} for earning the badge ${badgeName}, which has the description of: ${badgeDescription}.`
    channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessageNotifySubject(channelToNotify, userId, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyRemovalFromQueue(){
    //YOU NEED TO DO THIS
    // NO I DONT
}

module.exports = {
    notifyRemovalFromQueue,
    notifyPrestigePromotion,
    notifyRankPromotion,
    notifyForAward
}