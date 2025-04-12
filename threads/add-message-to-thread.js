//Add discord message to a thread


async function addMessageToThread(thread, openai, formattedMessage, isBot) {
    console.log(`Adding message to thread: ${thread.id}`)
    try {
        await openai.beta.threads.messages.create(thread.id, {
            role: (isBot ? "assistant" : "user"),
            content: formattedMessage,
    });
    }catch(error){
        console.error(`Error adding message to thread: ${error}`);
    }
}

module.exports = {
    addMessageToThread,
}