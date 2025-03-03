const createNewThread = require("./create-new-thread")
async function findExistingThread(channelId, threadArray, openai){
    //check if there is a thread that exists that's already paired with the userID
    try{
        const threadPair = threadArray.find(item => item.channelId === channelId);
        const myThread = await openai.beta.threads.retrieve(
            threadPair.threadId
        );
        return myThread
    }catch{ //if not, create a new thread and log the threadId - userId pair
        console.log(`Created thread for ${channelId}`)
        return createNewThread.createNewThread(channelId, threadArray, openai);
    }
}

module.exports = {
    findExistingThread,
}