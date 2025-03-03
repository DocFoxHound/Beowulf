async function sendResponse(message, finalFormatedResponse, isReply) {
    try{
        if(isReply === true){
            await message.reply(finalFormatedResponse);
        }else{
            await message.channel.send(finalFormatedResponse);
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

module.exports = {
    sendResponse,
    sendMessage,
}