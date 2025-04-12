

async function formatResponse(run, thread, openai, client) {
    try {
        const messages = await openai.beta.threads.messages.list(thread.id);
        let response = messages.data[0].content[0].text.value;
        response = response.replace(client.user.username + ": ", "") //replace some common bot-isms
                           .replace(/【.*?】/gs, "")
                           .replace("Ah, ", "")
                           .replace(/<.*?>/gs, "");
        const index = response.indexOf(":");
        response.slice(index + 1);
        finalFormatedResponse = response.charAt(0).toUpperCase() + response.slice(1);
        return finalFormatedResponse;
    } catch (error) {
        console.error("Error running the thread: ", error);
        // await message.reply("Sorry, there was an error processing your request.");
    }
}

async function formatResponseForQueueCheck(threadId, openai) {
    try {
        const messages = await openai.beta.threads.messages.list(threadId);
        let response = messages.data[0].content[0].text.value;
        response = response.replace(/【.*?】/gs, "")
                           .replace("Ah, ", "")
                           .replace(/<.*?>/gs, "");
        const index = response.indexOf(":");
        response.slice(index + 1);
        finalFormatedResponse = response.charAt(0).toUpperCase() + response.slice(1);
        return finalFormatedResponse;
    } catch (error) {
        console.error("Error running the thread: ", error);
        // await message.reply("Sorry, there was an error processing your request.");
    }
}

module.exports = {
    formatResponse,
    formatResponseForQueueCheck,
}