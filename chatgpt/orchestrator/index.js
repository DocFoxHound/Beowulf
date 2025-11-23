const { classifyIntent } = require('../intent/classifier');
const { buildContext } = require('../context/builder');
const { generatePersonaResponse } = require('../persona/responder');
const { writeMemories } = require('../memory/writer');
const { ensureCachesReady } = require('../context/cache-readiness');
const { searchGameEntities } = require('../context/entity-index');

const STAGE_WARN_THRESHOLD_MS = Number(process.env.CHATGPT_STAGE_WARN_THRESHOLD_MS || 5000);
const PERF_LOGGING_ENABLED = (process.env.CHATGPT_PERF_LOGGING || 'false').toLowerCase() === 'true';
const INTERACTION_LOGGING_ENABLED = (process.env.CHATGPT_INTERACTION_LOGGING || 'false').toLowerCase() === 'true';

async function runStage(stageName, operation) {
  const start = Date.now();
  try {
    return await operation();
  } finally {
    if (PERF_LOGGING_ENABLED) {
      const duration = Date.now() - start;
      const prefix = `[ChatGPT][Perf] ${stageName} took ${duration}ms`;
      if (duration >= STAGE_WARN_THRESHOLD_MS) {
        console.warn(prefix);
      } else {
        console.log(prefix);
      }
    }
  }
}

function getRequestMeta(message, client) {
  return {
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    authorId: message.author?.id,
    authorTag: message.author?.tag || message.author?.username || 'unknown-user',
    channelName: message.channel?.name || 'unknown-channel',
    guildName: message.guild?.name || 'unknown-guild',
    botUserId: client.user?.id,
  };
}

async function handleChatGptInteraction({ message, client, openai }) {
  const meta = getRequestMeta(message, client);
  const timerStart = Date.now();
  try {
    if (!message || !client || !openai) throw new Error('Missing orchestrator dependencies');
    try { await message.channel.sendTyping(); } catch {}

    const intent = await runStage('intent', () => classifyIntent({ message, meta, openai }));
    const entityMatches = await runStage('entities', async () => {
      if (!message?.content) return [];
      try {
        await ensureCachesReady();
        return await searchGameEntities({ query: message.content });
      } catch (error) {
        console.error('[ChatGPT][Orchestrator] entity search failed', error?.message || error);
        return [];
      }
    });
    const context = await runStage('context', () => buildContext({ message, meta, intent, openai, entityMatches }));
    const personaResponse = await runStage('persona', () => generatePersonaResponse({ message, meta, intent, context, openai }));

    let sentReply = null;
    if (personaResponse?.text) {
      sentReply = await message.reply({ content: personaResponse.text.slice(0, 2000) });
    }

    await runStage('memory', () => writeMemories({ message, meta, intent, context, personaResponse, client, openai, replyMessage: sentReply }));

    if (INTERACTION_LOGGING_ENABLED) {
      const elapsed = Date.now() - timerStart;
      console.log(`[ChatGPT] Interaction handled in ${elapsed}ms (intent=${intent.intent}, channel=${meta.channelName})`);
    }
    return { intent, context, personaResponse, sentReply };
  } catch (error) {
    console.error('[ChatGPT] Interaction failed:', error?.message || error);
    try {
      await message.reply('I hit a snag while thinking that through. Give me a second and try again.');
    } catch {}
    return null;
  }
}

module.exports = {
  handleChatGptInteraction,
};
