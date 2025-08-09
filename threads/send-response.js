const { createThreadDb } = require('../api/threadApi.js');


async function sendResponse(message, formattedMessage, isReply, threadId) {
    console.log("Sending response")
    try{
        if(isReply === true){
            await message.reply(formattedMessage);
        }else{
            const sentMessage = await message.channel.send(formattedMessage);
            let threadData = {
                message_id: sentMessage.id,
                thread_id: threadId,
                createdAt: new Date(),
                is_active: false
            }
            createThreadDb(threadData);
        }
    }catch(error){
        console.error("Error running the thread: ", error);
        await message.reply("Sorry, there was an error processing your request.");
        
    }
}

async function sendMessage(channelId, message, client) {
    const channel = client.channels.cache.get(channelId);
    try{
        await channel.send(message);
    }catch(error){
        console.error("Error running the thread: ", error);
        await channel.send("Sorry, there was an error processing your request.");
    }
}

async function sendMessageNotifySubject(channelId, userId, message, client, guild) {
    console.log("Sending message with user mention")
    let channel;
    const userMention = `<@${userId}>`;
    const messageWithMention = `${userMention} ${message}`;
    channel = client.channels.cache.get(channelId);
    if (channel) {
        try {
            await channel.send(messageWithMention);
        } catch (error) {
            console.error("Error sending message with client.channels.cache: ", error);
            try {
                channel = guild.channels.cache.get(channelId);
                if (channel) {
                    await channel.send(messageWithMention);
                } else {
                    console.error(`Channel with ID ${channelId} not found in guild.channels.cache.`);
                }
            } catch (guildError) {
                console.error("Error sending message with guild.channels.cache: ", guildError);
            }
        }
    } else {
        console.error(`Channel with ID ${channelId} not found in client.channels.cache.`);
        channel = guild.channels.cache.get(channelId);
        if (channel) {
            try {
                await channel.send(messageWithMention);
            } catch (guildError) {
                console.error("Error sending message with guild.channels.cache: ", guildError);
            }
        } else {
            console.error(`Channel with ID ${channelId} not found in guild.channels.cache.`);
        }
    }
}

module.exports = {
    sendResponse,
    sendMessage,
    sendMessageNotifySubject,
}