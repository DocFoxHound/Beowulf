

async function createNewThread(channelId, openai){
    try{
        const newThread = await openai.beta.threads.create();
        return newThread;
    }catch (error) {
        console.error('Error creating new thread:', error);
        throw error; // Re-throw the error for further handling
    }
    
}

module.exports = {
    createNewThread,
}