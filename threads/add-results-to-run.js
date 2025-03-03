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

  module.exports = {
    addResultsToRun,
  }