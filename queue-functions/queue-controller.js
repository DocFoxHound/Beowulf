const checkQueue = require("./check-queue");
const editQueue = require("./edit-queue");
const addQueue = require("./add-queue");

async function queueController(run, message){
    const author = message.author;
    const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
    const parsedArgs = JSON.parse(toolCall.function.arguments);
    const requestedText = parsedArgs.class_request;

    userData = await checkQueue.checkQueue(requestedText, author);
    if(userData !== null){
        console.log("Editing User in Queue")
        const editQueueSuccess = await editQueue.editQueue(requestedText, userData, author);
        if(editQueueSuccess === true){
            return `${author.username} was added to ${requestedText}`;
            //bot respond with success
            //bot asks for someone to take queue
        }else{
            return "There was an error adding to the queue"
            //bot responds with failure
        }
    }else{
        const addQueueSuccess = await addQueue.addQueue(requestedText, message);
        console.log("addQueueSuccess: " + addQueueSuccess)
        if(addQueueSuccess === true){
            return `${author.username} was added to ${requestedText}`;
        }else{
            return "There was an error adding to the queue"
            //bot responds with failure
        }
    }
}

module.exports = {
    queueController
};