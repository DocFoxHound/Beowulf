async function createNewThread(channelId, threadArray, openai){
    const newThread = await openai.beta.threads.create();
    const newEntry = { channelId: channelId, threadId: newThread.id, isActive: false, isRetrying: false };
    threadArray.push(newEntry) //log the pair into memory TODO: save this somewhere so it doesn't refresh every time you restart the bot
    return newThread;
}

module.exports = {
    createNewThread,
}