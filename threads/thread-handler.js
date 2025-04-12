const { editThread } = require('../api/threadApi.js');
const { createThreadDb } = require('../api/threadApi.js');
const { getThreadByMessageId } = require('../api/threadApi.js');
const { getUserById } = require('../api/userlistApi.js');
const { runThread } = require('./run-thread.js');
const { handleRequiresAction } = require('./handle-requires-action.js');
const { formatResponse } = require('./format-response.js');
const { sendResponse } = require('./send-response.js');



async function handleMessage(message, openai, client, preloadedDbTables){
    try{
        //if the message originated from the bot, we're going to log it but not respond
        const isBot = message.author.id === client.user.id;
    
        //if it is a bot message responding to a thread we log it
        if(isBot && message.reference?.messageId){
            const originatingThread = await getThreadByMessageId(message.reference.messageId) || null;

            if(originatingThread){
                //create a new db entry for the thread and message
                let threadData = {
                    message_id: message.id,
                    thread_id: originatingThread.thread_id,
                    createdAt: new Date(),
                    is_active: false
                }
                createThreadDb(threadData);
            }else{
                return;
            }
        }

        //if the message is notifying the bot we process it
        if(message.mentions.users.has(client.user.id)){

            const originatingThread = await getThreadByMessageId(message.reference?.messageId) || null;
            
            //get the thread that's been used for this conversation, or make a new one if it doesn't exist
            let getThread = null;
            if(originatingThread !== null){
                getThread = await openai.beta.threads.retrieve(
                    originatingThread.thread_id
                );
            }else{
                getThread = await openai.beta.threads.create();
            }
            const thread = getThread;

            //create a new db entry for the thread and message
            let threadData = {
                message_id: message.id,
                thread_id: thread.id,
                createdAt: new Date(),
                is_active: true
            }
            createThreadDb(threadData);

            //we need to make sure names are readable in the message to the bot
            const formattedMessage = await formatMessage(message);

            //add message to thread - this also checks if the thread is busy or not
            await addMessageToThread(thread, openai, formattedMessage, isBot, originatingThread);
            
            //run the thread
            message.channel.sendTyping();  
            const run = await runThread(thread, openai); //this is slow

            if (run.status === "requires_action") {
                await handleRequiresAction(message, run, client, preloadedDbTables, openai, false);
            } else if (run.status === "completed") {
                const formattedResponse = await formatResponse(run, thread, openai, client);
                await sendResponse(message, formattedResponse, true);
            }

            //free up the thread for follow-on work
            threadData.is_active = false;
            await editThread(threadData.message_id, thread);
        }
    }catch(error){
        console.error(`Error handling message: ${error}`);
        message.reply("There was an error processing this message.");
    }
}

async function formatMessage(message) {
    // Used for finding user mentions
    const mentionRegex = /<@!?(\d+)>/g;

    try {
        // Extract user IDs from the message content
        const userIds = [];
        let match;
        while ((match = mentionRegex.exec(message.content)) !== null) {
            userIds.push(match[1]);
        }

        // Fetch user information asynchronously
        const userPromises = userIds.map(userId => getUserById(userId));
        const users = await Promise.all(userPromises);

        // Create a map of user IDs to display names
        const userMap = new Map();
        users.forEach(user => {
            if (user) {
                userMap.set(user.id, `@${user.nickname || user.username}`);
            } else {
                userMap.set(user.id, "@unknown-user");
            }
        });

        // Replace user mentions with display names
        const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
            return userMap.get(userId) || "@unknown-user";
        });

        return message.member?.nickname 
            ? `${message.member.nickname}: ${readableMessage}` 
            : message.author?.username 
            ? `${message.author.username}: ${readableMessage}` 
            : `unknown-user: ${readableMessage}`;
    } catch (error) {
        console.error(`Error formatting the message: ${error}`);
        return message.content; // Return the original message content in case of an error
    }
}

//Add discord message to a thread
async function addMessageToThread(thread, openai, formattedMessage, isBot, originatingThread) {
    try{
        while(originatingThread?.is_active){
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await openai.beta.threads.messages.create(thread.id, {
            role: (isBot ? "assistant" : "user"),
            content: formattedMessage,
        });
    }catch(error){
        console.log("There was an error adding to this conversation's thread: ", error)
        // message.reply("There was an error adding to this conversation's thread.");
    }
}

module.exports = {
    handleMessage
};
