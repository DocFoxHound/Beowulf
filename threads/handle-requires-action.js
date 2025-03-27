const addResultsToRun = require("./add-results-to-run")
const functionHandler = require("../functions/function-handler");
const sendResponse = require("../threads/send-response").sendResponse


//this is called if a thread comes back with "Requires Action" instead of completed, meaning its a tool/function call from the bot
async function handleRequiresAction(message, run, client, preloadedDbTables, openai, isAutoGenerated) { 
    console.log("Requires Action");
    if(isAutoGenerated === true){ //if this message originated from a user
        const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        const contentText = await functionHandler.executeFunction(run, message, preloadedDbTables, openai, client);
        try {
            run = await addResultsToRun.addResultsToRun(contentText, openai, run.thread_id, toolCall.id, run.id);
        } catch (error) {
            console.error("Error in addResultsToRun: ", error);
            return error; // Exit the function if there's an error
        }
        console.log("After response thread run")
        // let messages = await client.beta.threads.messages.list(thread.id);
        try{
            let messages = await openai.beta.threads.messages.list(run.thread_id);
        }catch(error){
            console.log("Error in getting messages: ", error);
            return error;
        }

        if (run.status === "completed") {
            console.log("Completed Request");
            await sendResponse(message, messages.data[0].content[0].text.value, openai, client);
        }
    }else{ //if this message originated from an automated process
        const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        const contentText = await functionHandler.executeFunction(run, message, preloadedDbTables, openai, client);
        run = await addResultsToRun.addResultsToRun(contentText, openai, run.thread_id, toolCall.id, run.id);
        // let messages = await client.beta.threads.messages.list(thread.id);
        let messages = await openai.beta.threads.messages.list(run.thread_id);

        if (run.status === "completed") {
            console.log("Completed Request");
            await sendResponse(message, messages.data[0].content[0].text.value, openai, client);
        }
    }
    
}

module.exports = {
    handleRequiresAction
}