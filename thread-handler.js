const functionHandler = require("./function-handler");
const generalPurpose = require("./general-purpose-functions")

//convert the message into something we'll store to use for later
function formatMessage(message, mentionRegex, userCache) {
    try{
        const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
            const user = generalPurpose.getCachedUser(message.guild, userId, userCache);
            const displayName = user ? `@${user.displayName}` : "@unknown-user";
            return displayName;
        });
        return `${message.member.nickname}: ${readableMessage}`
    }catch(error){
        console.error(`Error formatting the message: ${error}`)
    }
}

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
        return createNewThread(channelId, threadArray, openai);
    }
}

async function createNewThread(channelId, threadArray, openai){
    const newThread = await openai.beta.threads.create();
    const newEntry = { channelId: channelId, threadId: newThread.id, isActive: false, isRetrying: false };
    threadArray.push(newEntry) //log the pair into memory TODO: save this somewhere so it doesn't refresh every time you restart the bot
    return newThread;
}

async function retryMessageAdd(thread, openai, messageAddQueue, threadPair, isBot){
    threadPair.isRetrying = true;
    while(threadPair.isActive === true){
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    try{
        while (messageAddQueue.length > 0) { //this is a safe way to remove the front message after its processed
            const frontMessage = messageAddQueue.shift();
            await addMessageToThread(thread, openai, frontMessage, isBot);
        }
        threadPair.isRetrying = false;
    }catch(error){
        console.log(`Error retrying message: ${error}`)
    }
}

//Add discord message to a thread
async function addMessageToThread(thread, openai, formattedMessage, isBot) {
    try {
        await openai.beta.threads.messages.create(thread.id, {
            role: (isBot ? "assistant" : "user"),
            content: formattedMessage,
    });
    }catch(error){
        console.error(`Error adding message to thread: ${error}`);
    }
}

//a tool and/or Function Call
async function addResultsToRun(contentText, openai, threadId, toolId, runId) {
  // if the toolId is populated, that means this is a tool call and we need
  // to add the results back to the thread
  const maxLength = 2000; // Maximum length for a Discord message
  if (contentText.length > maxLength) {
        contentText = contentText.slice(-maxLength);
    }
  try {
    const run = await openai.beta.threads.runs.submitToolOutputsAndPoll(
      threadId,
      runId,
      {
        tool_outputs: [
          {
            tool_call_id: toolId,
            output: contentText,
          },
        ],
      }
    );
    return run;
  } catch (error) {
    console.log("Error adding tool/function results to run: " + error);
  }
}

async function runThread(message, thread, openai, threadPair, client) {
    console.log("Responding")
    try{
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: myAssistant.id,
            additional_instructions: process.env.BOT_INSTRUCTIONS,
        });
        if (run.status === "requires_action") {
            await handleRequiresAction(message, run, openai, client);
        } else if (run.status === "completed") {
            return await formatResponse(message, threadPair, openai, client);
        }
    }catch(error){
        console.error(`Error running thread: ${error}`);
    }
}

async function handleRequiresAction(message, run, openai, client) {
    console.log("Requires Action");
    message.channel.sendTyping();
    const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
    const contentText = await functionHandler.executeFunction(toolCall, message, client, openai);
    const newRun = await addResultsToRun(contentText, openai, run.thread_id, toolCall.id, run.id);

    if (newRun.status === "completed") {
        console.log("Completed Request");
        await sendResponse(message, newRun.thread_id, openai, client);
    }
}

async function formatResponse(message, threadPair, openai, client) {
    threadPair.isActive = false;
    try {
        const messages = await openai.beta.threads.messages.list(threadPair.threadId);
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
        await message.reply("Sorry, there was an error processing your request.");
    }
}

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

module.exports = {
    formatMessage,
    addMessageToThread,
    runThread,
    findExistingThread,
    sendResponse,
    retryMessageAdd,
    formatResponse,
};
