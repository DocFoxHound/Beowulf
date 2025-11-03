const { createThreadDb } = require('../api/threadApi.js');

// Discord hard-limits message content length. Default historical limit is ~2000 chars;
// some contexts allow up to 4000. We'll conservatively cap at 1900 (configurable via env).
const MAX_CONTENT = Math.max(500, Number(process.env.DISCORD_MESSAGE_MAX || 1900));

function splitIntoChunks(text, maxLen = MAX_CONTENT) {
    if (typeof text !== 'string') return [];
    if (text.length <= maxLen) return [text];
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let current = '';
    for (let line of lines) {
        // If a single line itself is too long, hard-split it
        while (line.length > maxLen) {
            if (current) {
                chunks.push(current);
                current = '';
            }
            chunks.push(line.slice(0, maxLen));
            line = line.slice(maxLen);
        }
        if ((current + (current ? '\n' : '') + line).length > maxLen) {
            if (current) chunks.push(current);
            current = line;
        } else {
            current = current ? (current + '\n' + line) : line;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

async function sendResponse(message, formattedMessage, isReply, threadId) {
    console.log("Sending response")
    try {
        // Normalize to content + options
        const isObj = formattedMessage && typeof formattedMessage === 'object' && !Array.isArray(formattedMessage);
        const content = isObj ? (formattedMessage.content ?? '') : String(formattedMessage ?? '');
        const baseOptions = isObj ? { ...formattedMessage } : {};

        const chunks = splitIntoChunks(content);

        if (chunks.length <= 1) {
            if (isReply === true) {
                await message.reply(isObj ? { ...baseOptions } : content);
            } else {
                const sentMessage = await message.channel.send(isObj ? { ...baseOptions } : content);
                if (sentMessage && threadId) {
                    const threadData = {
                        message_id: sentMessage.id,
                        thread_id: threadId,
                        createdAt: new Date(),
                        is_active: false,
                    };
                    createThreadDb(threadData);
                }
            }
            return;
        }

        // If too long, send in parts. For the first part, preserve any non-content options.
        const firstPayload = isObj ? { ...baseOptions, content: chunks[0] } : chunks[0];
        let firstSent;
        if (isReply === true) {
            firstSent = await message.reply(firstPayload);
        } else {
            firstSent = await message.channel.send(firstPayload);
            if (firstSent && threadId) {
                const threadData = {
                    message_id: firstSent.id,
                    thread_id: threadId,
                    createdAt: new Date(),
                    is_active: false,
                };
                createThreadDb(threadData);
            }
        }

        // Send remaining chunks as follow-up messages in the same channel
        for (let i = 1; i < chunks.length; i++) {
            await message.channel.send({ content: chunks[i] });
        }
    } catch (error) {
        console.error("Error running the thread: ", error);
        try {
            await message.reply("Sorry, there was an error processing your request.");
        } catch {}
    }
}

async function sendMessage(channelId, msg, client) {
    const channel = client.channels.cache.get(channelId);
    try {
        const isObj = msg && typeof msg === 'object' && !Array.isArray(msg);
        const content = isObj ? (msg.content ?? '') : String(msg ?? '');
        const baseOptions = isObj ? { ...msg } : {};
        const chunks = splitIntoChunks(content);
        if (chunks.length <= 1) {
            await channel.send(isObj ? baseOptions : content);
            return;
        }
        // Send first with options, rest as plain content
        await channel.send(isObj ? { ...baseOptions, content: chunks[0] } : chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
            await channel.send({ content: chunks[i] });
        }
    } catch (error) {
        console.error("Error running the thread: ", error);
        try { await channel.send("Sorry, there was an error processing your request."); } catch {}
    }
}

async function sendMessageNotifySubject(channelId, userId, message, client) {
    // const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    // const guild = client.guilds.cache.get(guildId);

    const channel = client.channels.cache.get(channelId);
    const userMention = `<@${userId}>`;
    const messageWithMention = `${userMention} ${message}`;
    try {
        const chunks = splitIntoChunks(messageWithMention);
        for (let i = 0; i < chunks.length; i++) {
            await channel.send(chunks[i]);
        }
    } catch (error) {
        console.error("Error running the thread: ", error);
        try { await channel.send("Sorry, there was an error processing your request."); } catch {}
    }
}

module.exports = {
    sendResponse,
    sendMessage,
    sendMessageNotifySubject,
}