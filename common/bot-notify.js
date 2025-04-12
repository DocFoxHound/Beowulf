// const handleRequiresAction = require("../threads/handle-requires-action").handleRequiresAction
const runThreadForQueueNotify = require("../threads/run-thread").runThreadForQueueNotify
const addMessageToThread = require("../threads/add-message-to-thread").addMessageToThread
const createNewThread = require("../threads/create-new-thread").createNewThread
const formatResponseForQueueCheck = require("../threads/format-response").formatResponseForQueueCheck
const { sendMessage } = require("../threads/send-response")
const { sendMessageNotifySubject } = require("../threads/send-response")



async function notifyNewQueue(queue, requestedText, user, openai, client){
    console.log(`Notify`)
    channelToNotify = null;
    switch (queue){
        case "RAPTOR":
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_CHANNEL : process.env.TEST_RAPTOR_CHANNEL;
            break;
        case "RAIDER":
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_CHANNEL : process.env.TEST_RAIDER_CHANNEL;
            break;
        case "CORSAIR":
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_CHANNEL : process.env.TEST_CORSAIR_CHANNEL;
            break;
    }
    messageToBot = `Rewrite the following: "${user} has been added to the ${queue} queue for ${requestedText} class/assessment"`
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);

    if (run.status === "completed") {
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessage(channelToNotify, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyOldQueue(queue, requestedText, openai, client){
    console.log("Notify")
    channelToNotify = null;
    switch (queue){
        case "RAPTOR":
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_CHANNEL : process.env.TEST_RAPTOR_CHANNEL;
            break;
        case "RAIDER":
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAIDER_CHANNEL : process.env.TEST_RAIDER_CHANNEL;
            break;
        case "CORSAIR":
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CORSAIR_CHANNEL : process.env.TEST_CORSAIR_CHANNEL;
            break;
    }
    messageToBot = `Rewrite the following: "${requestedText}"`
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessage(channelToNotify, formattedResponse, client);
        raptorResultArray = null;
    }
}

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
                channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RAPTOR_CHANNEL : process.env.TEST_RAPTOR_CHANNEL;
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
        await sendMessageNotifySubject(channelId, userId, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyRankPromotion(rank, userData, openai, client){
    console.log(`Notify`)
    let channelToNotify = null;
    let messageToBot = '';
    switch (rank){
        case "CREW":
            messageToBot = `Write a congratulations on ${userData.nickname || userData.username}'s completion of the requirements to make Crew.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            break;
        case "MARAUDER":
            messageToBot = `Write a congratulations on ${userData.nickname || userData.username}'s completion of the requirements to make Marauder, but explain that while they qualify for it that doesn't mean they've earned it. The last step is the Marauder challenge specifically for their Prestige, and that this is the hardest part.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CREW_CHANNEL : process.env.TEST_CREW_CHANNEL;
            break;
    }
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessageNotifySubject(channelId, userId, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyRemovalFromQueue(){
    //YOU NEED TO DO THIS
}

module.exports = {
    notifyNewQueue,
    notifyOldQueue,
    notifyRemovalFromQueue,
    notifyPrestigePromotion,
    notifyRankPromotion
    // notifyNewQueueThreadResponse,
}