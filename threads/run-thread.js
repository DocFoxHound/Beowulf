

async function runThread(thread, openai) {
    console.log("Running thread")
    try{
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: myAssistant.id
        });
        return run;
    }catch(error){
        console.error(`Error running thread: ${error}`);
    }
}

async function runThreadForQueueCheck(thread, openai, isNew) {
    console.log("Running Thread for Queue Check")
    try{
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: myAssistant.id,
            additional_instructions: process.env.BOT_INSTRUCTIONS,
            // tool_choice: "none",
            tool_choice: {"type": "function", "function": {"name": "get_users_in_queue"}}
        });
        return run;
    }catch(error){
        console.error(`Error running thread: ${error}`);
    }
}

async function runThreadForQueueNotify(thread, openai) {
    console.log("Running Thread for Queue Notify")
    try{
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: myAssistant.id,
            additional_instructions: process.env.BOT_INSTRUCTIONS,
            tool_choice: "none",
            // tool_choice: "{"type": "function", "function": {"name": "notify_queue_entry"}}"
        });
        return run;
    }catch(error){
        console.error(`Error running thread: ${error}`);
    }
}

module.exports = {
    runThread,
    runThreadForQueueCheck,
    runThreadForQueueNotify,
}