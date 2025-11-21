const { ingestChatMessage } = require('../../vector-handling/chat-ingest');

function shouldWriteMemories() {
  return (process.env.KNOWLEDGE_INGEST_ENABLE || 'false').toLowerCase() === 'true';
}

function toPayload(message, contentOverride) {
  return {
    id: message.id,
    content: contentOverride || message.content,
    username: message.member?.displayName || message.author?.username || 'user',
    channel_name: message.channel?.name || 'unknown-channel',
    timestamp: message.createdAt?.toISOString?.() || new Date().toISOString(),
  };
}

async function writeMemories({ message, personaResponse, replyMessage, openai }) {
  if (!shouldWriteMemories()) return;
  try {
    await ingestChatMessage(toPayload(message), openai);
  } catch (error) {
    console.error('[ChatGPT][Memory] failed to ingest user message:', error?.message || error);
  }
  if (personaResponse?.text) {
    try {
      const payload = toPayload(replyMessage || message, personaResponse.text);
      payload.username = 'Beowulf';
      await ingestChatMessage(payload, openai);
    } catch (error) {
      console.error('[ChatGPT][Memory] failed to ingest response:', error?.message || error);
    }
  }
}

module.exports = {
  writeMemories,
};
