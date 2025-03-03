const addMessageToThread = require("./add-message-to-thread")

async function retryMessageAdd(thread, openai, messageAddQueue, threadPair, isBot){
    threadPair.isRetrying = true;
    while(threadPair.isActive === true){
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    try{
        while (messageAddQueue.length > 0) { //this is a safe way to remove the front message after its processed
            const frontMessage = messageAddQueue.shift();
            await addMessageToThread.addMessageToThread(thread, openai, frontMessage, isBot);
        }
        threadPair.isRetrying = false;
    }catch(error){
        console.log(`Error retrying message: ${error}`)
    }
}

module.exports = {
    retryMessageAdd,
}