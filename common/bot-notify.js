// const handleRequiresAction = require("../threads/handle-requires-action").handleRequiresAction
const runThreadForQueueNotify = require("../threads/run-thread").runThreadForQueueNotify
const addMessageToThread = require("../threads/add-message-to-thread").addMessageToThread
const createNewThread = require("../threads/create-new-thread").createNewThread
const formatResponseForQueueCheck = require("../threads/format-response").formatResponseForQueueCheck
const sendMessage = require("../threads/send-response").sendMessage


async function notifyNewQueue(queue, requestedText, user, openai, client){
    console.log(`Notify for new queue addition for ${user}`)
    channelToNotify = null;
    switch (queue){
        case "RAPTOR":
            channelToNotify = process.env.RAPTOR_CHANNEL;
            break;
        case "RAIDER":
            channelToNotify = process.env.RAIDER_CHANNEL;
            break;
        case "CORSAIR":
            channelToNotify = process.env.CORSAIR_CHANNEL;
            break;
    }
    messageToBot = `Rewrite the following: "${user} has been added to the ${queue} queue for ${requestedText} class/assessment"`
    const thread = await createNewThread(channelToNotify, threadArray, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    console.log("Run Status: " + run.status)
    if (run.status === "completed") {
        // await handleRequiresAction(null, run, null, null, openai, true);
        
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessage(channelToNotify, formattedResponse, client);
        raptorResultArray = null;
    }
}

async function notifyOldQueue(queue, requestedText, openai, client){
    console.log("queue: " + queue)
    console.log(requestedText)
    channelToNotify = null;
    switch (queue){
        case "RAPTOR":
            channelToNotify = process.env.RAPTOR_CHANNEL;
            break;
        case "RAIDER":
            channelToNotify = process.env.RAIDER_CHANNEL;
            break;
        case "CORSAIR":
            channelToNotify = process.env.CORSAIR_CHANNEL;
            break;
    }
    messageToBot = `Rewrite the following: "${requestedText}"`
    const thread = await createNewThread(channelToNotify, threadArray, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    console.log(run.status)
    if (run.status === "completed") {
        // await handleRequiresAction(null, run, null, null, openai, true);
        
        console.log("Completed Notify")
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessage(channelToNotify, formattedResponse, client);
        raptorResultArray = null;
    }
}

module.exports = {
    notifyNewQueue,
    notifyOldQueue,
    // notifyNewQueueThreadResponse,
}