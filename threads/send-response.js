async function sendResponse(message, formattedMessage, isReply) {
    console.log("Sending response")
    try{
        if(isReply === true){
            await message.reply(formattedMessage);
        }else{
            await message.channel.send(formattedMessage);
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