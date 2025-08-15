// const handleRequiresAction = require("../threads/handle-requires-action").handleRequiresAction
const runThreadForQueueNotify = require("../threads/run-thread").runThreadForQueueNotify
const addMessageToThread = require("../threads/add-message-to-thread").addMessageToThread
const createNewThread = require("../threads/create-new-thread").createNewThread
const formatResponseForQueueCheck = require("../threads/format-response").formatResponseForQueueCheck
const { sendMessage } = require("../threads/send-response")
const { sendMessageNotifySubject } = require("../threads/send-response")


async function notifyPrestigePromotion(prestige, prestigeLevel, userData, openai, client){
    let channelToNotify = null;
    let messageToBot = '';
    switch (prestige){
        case "RAPTOR":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s dogfighting skills and promotion to ${prestige} ${prestigeLevel}.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ANNOUNCEMENTS_CHANNEL : process.env.TEST_ANNOUNCEMENTS_CHANNEL;
            break; // <- prevent fallthrough
        case "RAIDER":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s piracy skills and promotion to ${prestige} ${prestigeLevel}.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ANNOUNCEMENTS_CHANNEL : process.env.TEST_ANNOUNCEMENTS_CHANNEL;
            break;
        case "CORSAIR":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s fleet skills and promotion to ${prestige} ${prestigeLevel}.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ANNOUNCEMENTS_CHANNEL : process.env.TEST_ANNOUNCEMENTS_CHANNEL;
            break;
    }
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        try{
            await sendMessageNotifySubject(channelToNotify, userData.id, formattedResponse, client);
        }catch(error){
            console.error("Error sending message with user mention: ", error);
        }
        // removed raptorResultArray = null;
    }
}

async function notifyRankPromotion(rank, userData, openai, client){
    let channelToNotify = null;
    let messageToBot = '';

    messageToBot = `Congratulate ${userData.nickname || userData.username} for promoting to ${rank}.`
    channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.ANNOUNCEMENTS_CHANNEL : process.env.TEST_ANNOUNCEMENTS_CHANNEL;

    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessageNotifySubject(channelToNotify, userData.userId, formattedResponse, client);
        // removed raptorResultArray = null;
    }
}

async function notifyForAward(badgeName, badgeDescription, userName, userId, openai, client){
    let channelToNotify = null;
    let messageToBot = '';
    messageToBot = `Write a congratulations to ${userName} for earning the badge ${badgeName}, which has the description of: ${badgeDescription}.`
    channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false); //add the message to the thread
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        await sendMessageNotifySubject(channelToNotify, userId, formattedResponse, client);
        // removed raptorResultArray = null;
    }
}

async function notifyRemovalFromQueue(){
    //YOU NEED TO DO THIS
    // NO I DONT
}

async function notifyRejoinWelcome(userData, openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    let messageToBot = `Comment on ${userData.nickname || userData.username}'s return to IronPoint. Make fun of them for leaving and then returning, and then ask them why they wanted to come back.`;
    // Add ping for bloodedToNotify
    let pingBlooded = `<@&${bloodedToNotify}>`;
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false);
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        // Prepend ping to the message
        const messageWithPing = `${pingBlooded} ${formattedResponse}`;
        await sendMessageNotifySubject(channelToNotify, userData.id, messageWithPing, client);
    }
}

async function notifyJoinMemberWelcome(userData, openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    let messageToBot = `Welcome ${userData.nickname || userData.username} to IronPoint as a prospective new Member! Be sure to mention the website and provide a link (https://www.ironpoint.org/) and bulletize the things they can do on the website: check promotion progress, join a fleet, view leaderboards, record pirate hits. Also be sure to mention the kill-tracking bot called BeowulfHunter and provide a link: (https://github.com/DocFoxHound/BeowulfHunterPy/releases/latest) and describe what it does: tracks and records kills made in-game. Also describe IronPoint as the best Pirate crew in Star Citizen. Talk about how a player has to prove their worth through their fighting prowess and rugged creative problem solving, and that we like to see them taking something valuable. Make a little fun of the player, too.`;
    // Add ping for bloodedToNotify
    let pingBlooded = `<@&${bloodedToNotify}>`;
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false);
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        // Prepend ping to the message
        const messageWithPing = `${pingBlooded} ${formattedResponse}`;
        await sendMessageNotifySubject(channelToNotify, userData.id, messageWithPing, client);
    }
}

async function notifyJoinGuestWelcome(userData, openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    let messageToBot = `Welcome ${userData.nickname || userData.username} to IronPoint as a friendly guest! Make fun of the player for not wanting to join up, but make sure they feel welcome to play with us any time.`;
    // Add ping for bloodedToNotify
    let pingBlooded = `<@&${bloodedToNotify}>`;
    const thread = await createNewThread(channelToNotify, openai);
    await addMessageToThread(thread, openai, messageToBot, false);
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        // Prepend ping to the message
        const messageWithPing = `${pingBlooded} ${formattedResponse}`;
        await sendMessageNotifySubject(channelToNotify, userData.id, messageWithPing, client);
    }
}

//this doesn't ping a channel but returns a statement to use in an embed.
async function notifyWelcomeForEmbed(userData, openai, client, messageToBot){
    const thread = await createNewThread(openai); // now supported by overloaded function
    await addMessageToThread(thread, openai, messageToBot, false);
    let run = await runThreadForQueueNotify(thread, openai, true);
    if (run.status === "completed") {
        const formattedResponse = await formatResponseForQueueCheck(run.thread_id, openai);
        return formattedResponse;
    }
}

module.exports = {
    notifyRemovalFromQueue,
    notifyPrestigePromotion,
    notifyRankPromotion,
    notifyForAward,
    notifyRejoinWelcome,
    notifyJoinMemberWelcome,
    notifyJoinGuestWelcome,
    notifyWelcomeForEmbed
}