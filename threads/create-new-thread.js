const logger = require('../logger');

async function createNewThread(channelId, openai){
    const newThread = await openai.beta.threads.create();
    return newThread;
}

module.exports = {
    createNewThread,
}