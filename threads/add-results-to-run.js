//a tool and/or Function Call
const logger = require('../logger');

async function addResultsToRun(contentText, openai, threadId, toolId, runId) {
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
        console.error("Error adding tool/function results to run: ", error);
        throw error; // Re-throw the error to propagate it
    }
}

  module.exports = {
    addResultsToRun,
  }