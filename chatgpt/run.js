// Run helpers for per-run vector store selection using Assistants API
// Usage: runWithRouting({ openai, threadId, assistantId, messageText, guildId, channelId, roles })

const { pickVectorStores } = require('./router');

function buildSystemHeader({ guildId, channelId, roles }) {
  const r = Array.isArray(roles) && roles.length ? roles.join(', ') : 'Member';
  return `Context:\n- Guild: ${guildId || 'unknown'}\n- Channel: ${channelId || 'unknown'}\n- User roles: ${r}\nGuidance:\n- Keep answers concise and cite sources when possible.`;
}

async function runWithRouting({ openai, threadId, assistantId, messageText, guildId, channelId, roles }) {
  const vectorStoreIds = pickVectorStores({ guildId, channelId, messageText });

  const additional_instructions = buildSystemHeader({ guildId, channelId, roles });

  // If no stores selected, fall back to no file_search resources
  const tool_resources = vectorStoreIds.length
    ? { file_search: { vector_store_ids: vectorStoreIds } }
    : undefined;

  const run = await openai.beta.threads.runs.createAndPoll(threadId, {
    assistant_id: assistantId,
    additional_instructions,
    tool_resources,
  });

  return run;
}

module.exports = {
  runWithRouting,
};
