const { runWithResponses } = require('../chatgpt/responses-run.js');
const { sendMessage } = require("../threads/send-response")
const { sendMessageNotifySubject } = require("../threads/send-response")


async function notifyPrestigePromotion(prestige, prestigeLevel, userData, openai, client){
    let channelToNotify = null;
    let messageToBot = '';
    switch (prestige){
        case "RAPTOR":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s dogfighting skills and promotion to ${prestige} ${prestigeLevel}.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            break; // <- prevent fallthrough
        case "RAIDER":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s piracy skills and promotion to ${prestige} ${prestigeLevel}.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            break;
        case "CORSAIR":
            messageToBot = `Write a short poem on ${userData.nickname || userData.username}'s fleet skills and promotion to ${prestige} ${prestigeLevel}.`
            channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
            break;
    }
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    try {
        const formattedResponse = await runWithResponses({
            openai,
            formattedUserMessage: messageToBot,
            guildId,
            channelId: channelToNotify,
            rank: userData?.rank,
            contextSnippets: []
        });
        if (formattedResponse) {
            await sendMessageNotifySubject(channelToNotify, userData.id, formattedResponse, client);
        }
    } catch (error) {
        console.error("Error sending message with user mention: ", error);
    }
}

async function notifyRankPromotion(rank, userData, openai, client){
    let channelToNotify = null;
    let messageToBot = '';

    messageToBot = `Congratulate ${userData.nickname || userData.username} for promoting to ${rank}.`
    channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;

    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const formattedResponse = await runWithResponses({
        openai,
        formattedUserMessage: messageToBot,
        guildId,
        channelId: channelToNotify,
        rank: userData?.rank,
        contextSnippets: []
    });
    if (formattedResponse) await sendMessageNotifySubject(channelToNotify, userData.userId, formattedResponse, client);
}

async function notifyForAward(badgeName, badgeDescription, userName, userId, openai, client){
    let channelToNotify = null;
    let messageToBot = '';
    messageToBot = `Write a congratulations to ${userName} for earning the badge ${badgeName}, which has the description of: ${badgeDescription}.`
    channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const formattedResponse = await runWithResponses({
        openai,
        formattedUserMessage: messageToBot,
        guildId,
        channelId: channelToNotify,
        contextSnippets: []
    });
    if (formattedResponse) await sendMessageNotifySubject(channelToNotify, userId, formattedResponse, client);
}

async function notifyRemovalFromQueue(){
    //YOU NEED TO DO THIS
    // NO I DONT
}

async function notifyRejoinWelcome(userData, openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RECRUITER_ROLE : process.env.TEST_RECRUITER_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    let messageToBot = `Comment on ${userData.nickname || userData.username}'s return to IronPoint and welcome them back to the fold.`;
    // Add ping for bloodedToNotify
    let pingRecruiter = `<@&${bloodedToNotify}>`;
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const formattedResponse = await runWithResponses({
        openai,
        formattedUserMessage: messageToBot,
        guildId,
        channelId: channelToNotify,
        rank: userData?.rank,
        contextSnippets: []
    });
    if (formattedResponse) {
        const messageWithPing = `${pingRecruiter} ${formattedResponse}`;
        await sendMessageNotifySubject(channelToNotify, userData.id, messageWithPing, client);
    }
}

async function notifyJoinMemberWelcome(userData, openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RECRUITER_ROLE : process.env.TEST_RECRUITER_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    let messageToBot = `Welcome ${userData.nickname || userData.username} to IronPoint as a prospective new Member! Be sure to mention the website and provide a link (https://www.ironpoint.org/) and bulletize the things they can do on the website: check promotion progress, join a fleet, view leaderboards, record pirate hits. Also be sure to mention the kill-tracking bot called BeowulfHunter and provide a link: (https://github.com/DocFoxHound/BeowulfHunterPy/releases/latest) and describe what it does: tracks and records kills made in-game. Also describe IronPoint as the best Pirate crew in Star Citizen. Talk about how a player has to prove their worth through their fighting prowess and rugged creative problem solving, and that we like to see them taking something valuable. Make a little fun of the player, too.`;
    // Add ping for bloodedToNotify
    let pingRecruiter = `<@&${bloodedToNotify}>`;
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const formattedResponse = await runWithResponses({
        openai,
        formattedUserMessage: messageToBot,
        guildId,
        channelId: channelToNotify,
        rank: userData?.rank,
        contextSnippets: []
    });
    if (formattedResponse) {
        const messageWithPing = `${pingRecruiter} ${formattedResponse}`;
        await sendMessageNotifySubject(channelToNotify, userData.id, messageWithPing, client);
    }
}

async function notifyJoinGuestWelcome(userData, openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RECRUITER_ROLE : process.env.TEST_RECRUITER_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    let messageToBot = `Welcome ${userData.nickname || userData.username} to IronPoint as a friendly guest! Make fun of the player for not wanting to join up, but make sure they feel welcome to play with us any time.`;
    // Add ping for bloodedToNotify
    let pingRecruiter = `<@&${bloodedToNotify}>`;
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const formattedResponse = await runWithResponses({
        openai,
        formattedUserMessage: messageToBot,
        guildId,
        channelId: channelToNotify,
        rank: userData?.rank,
        contextSnippets: []
    });
    if (formattedResponse) {
        const messageWithPing = `${pingRecruiter} ${formattedResponse}`;
        await sendMessageNotifySubject(channelToNotify, userData.id, messageWithPing, client);
    }
}

//this doesn't ping a channel but returns a statement to use in an embed.
async function notifyWelcomeForEmbed(userData, openai, client, messageToBot){
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    const formattedResponse = await runWithResponses({
        openai,
        formattedUserMessage: messageToBot,
        guildId,
        channelId: undefined,
        rank: userData?.rank,
        contextSnippets: []
    });
    return formattedResponse;
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