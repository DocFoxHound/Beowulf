const { sendMessageNotifySubject } = require("../threads/send-response")

function getDisplayName(userData) {
    return userData?.nickname || userData?.username || 'member';
}

function getUserId(userData) {
    return userData?.id || userData?.userId;
}

async function notifyPrestigePromotion(prestige, prestigeLevel, userData, _openai, client){
    const channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    if (!channelToNotify) return;
    const prestigeBlurbs = {
        RAPTOR: 'razor-sharp dogfighting instincts',
        RAIDER: 'audacious piracy chops',
        CORSAIR: 'steady fleet command and logistics',
    };
    const displayName = getDisplayName(userData);
    const userId = getUserId(userData);
    if (!userId) return;
    const prestigeLabel = prestigeLevel ? `${prestige} ${prestigeLevel}` : prestige;
    const description = prestigeBlurbs[prestige] || 'hard-earned skills';
    const message = `🎖️ ${displayName} just advanced to ${prestigeLabel}! Their ${description} keep IronPoint sharp—drop your congratulations below.`;
    await sendMessageNotifySubject(channelToNotify, userId, message, client);
}

async function notifyRankPromotion(rank, userData, _openai, client){
    const channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    if (!channelToNotify) return;
    const displayName = getDisplayName(userData);
    const userId = getUserId(userData);
    if (!userId) return;
    const message = `📣 ${displayName} just leveled up to ${rank}! Give them some love and help them settle into the new responsibilities.`;
    await sendMessageNotifySubject(channelToNotify, userId, message, client);
}

async function notifyForAward(badgeName, badgeDescription, userName, userId, _openai, client){
    const channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GENERAL_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    if (!channelToNotify || !userId) return;
    const message = `🏅 ${userName} just earned the **${badgeName}** badge — ${badgeDescription}. Send your props and share a favorite moment!`;
    await sendMessageNotifySubject(channelToNotify, userId, message, client);
}

async function notifyRemovalFromQueue(){
    //YOU NEED TO DO THIS
    // NO I DONT
}

async function notifyRejoinWelcome(userData, _openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RECRUITER_ROLE : process.env.TEST_RECRUITER_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    if (!channelToNotify) return;
    const pingRecruiter = `<@&${bloodedToNotify}>`;
    const displayName = getDisplayName(userData);
    const userId = getUserId(userData);
    if (!userId) return;
    const message = `${pingRecruiter} ${displayName} just returned to IronPoint—welcome them back and get them into the fight.`;
    await sendMessageNotifySubject(channelToNotify, userId, message, client);
}

async function notifyJoinMemberWelcome(userData, _openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RECRUITER_ROLE : process.env.TEST_RECRUITER_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    if (!channelToNotify) return;
    const pingRecruiter = `<@&${bloodedToNotify}>`;
    const displayName = getDisplayName(userData);
    const userId = getUserId(userData);
    if (!userId) return;
    const message = `${pingRecruiter} ${displayName} is diving in as a prospective Member. Point them at https://www.ironpoint.org/ for promotion tracking, fleets, leaderboards, and pirate hit logs, and remind them to grab BeowulfHunter for in-game kill tracking.`;
    await sendMessageNotifySubject(channelToNotify, userId, message, client);
}

async function notifyJoinGuestWelcome(userData, _openai, client) {
    let bloodedToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RECRUITER_ROLE : process.env.TEST_RECRUITER_ROLE;
    let channelToNotify = process.env.LIVE_ENVIRONMENT === "true" ? process.env.WELCOME_CHANNEL : process.env.TEST_GENERAL_CHANNEL;
    if (!channelToNotify) return;
    const pingRecruiter = `<@&${bloodedToNotify}>`;
    const displayName = getDisplayName(userData);
    const userId = getUserId(userData);
    if (!userId) return;
    const message = `${pingRecruiter} ${displayName} is hanging around as a guest—make sure they feel welcome and nudge them toward CREW life when they slip up.`;
    await sendMessageNotifySubject(channelToNotify, userId, message, client);
}

//this doesn't ping a channel but returns a statement to use in an embed.
async function notifyWelcomeForEmbed(userData, _openai, _client, messageToSend){
    const message = messageToSend || `Welcome ${getDisplayName(userData)}! Glad to have you aboard.`;
    return message;
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