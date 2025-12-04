const { sendMessageNotifySubject } = require("../threads/send-response")
const WELCOME_EMBED_MODEL = process.env.CHATGPT_WELCOME_MODEL || process.env.CHATGPT_RESPONSE_MODEL || 'gpt-4o-mini';
const WELCOME_EMBED_USE_MODEL = (process.env.CHATGPT_WELCOME_USE_MODEL || 'true').toLowerCase() === 'true';

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
    console.log(`[BotNotify] Award notification skipped for ${userName || userId}: ${badgeName}`);
    return true;
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
async function notifyWelcomeForEmbed(userData, openai, _client, messageToSend){
    const fallback = messageToSend || `Welcome ${getDisplayName(userData)}! Glad to have you aboard.`;
    if (!WELCOME_EMBED_USE_MODEL || !openai) {
        return fallback;
    }
    const displayName = getDisplayName(userData);
    const prompt = [
        { role: 'system', content: 'You write short, hype welcomes for new IronPoint Discord members. Keep it under 3 energetic sentences, stay PG-13, avoid emojis unless provided, and keep Markdown to simple bold text only when it helps emphasis.' },
        { role: 'user', content: `Base message: ${fallback}\nMember: ${displayName}` }
    ];
    try {
        const completion = await openai.chat.completions.create({
            model: WELCOME_EMBED_MODEL,
            temperature: 0.65,
            max_tokens: 180,
            messages: prompt,
        });
        const aiMessage = completion?.choices?.[0]?.message?.content?.trim();
        if (aiMessage) {
            return aiMessage;
        }
    } catch (error) {
        console.error('[BotNotify] Welcome embed prompt failed:', error?.response?.data || error?.message || error);
    }
    return fallback;
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