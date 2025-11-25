const { saveMemoryEntry } = require('./memory-store');
const { isBotUser } = require('../../common/bot-identity');

function shouldWriteMemories() {
  return (process.env.KNOWLEDGE_INGEST_ENABLE || 'false').toLowerCase() === 'true';
}

async function persistUserMessageMemory({ message, meta, openai }) {
  if (!message || !meta?.guildId) return;
  if (isBotUser(message.author?.id)) return;
  const content = (message.content || '').trim();
  if (!content) return;
  await saveMemoryEntry({
    content,
    type: 'episodic',
    importance: 1,
    tags: ['chatlog', 'user_message'],
    guildId: meta.guildId,
    channelId: meta.channelId,
    userId: meta.authorId,
    openai,
  });
}

async function writeMemories({ message, meta, openai }) {
  if (!shouldWriteMemories()) return;
  await persistUserMessageMemory({ message, meta, openai });
}

module.exports = {
  writeMemories,
};
