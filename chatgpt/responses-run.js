// Minimal wrapper around OpenAI Responses API
// Build a small system header and ask the model to answer concisely.

function rankStyle(rank) {
  switch ((rank || '').toLowerCase()) {
    case 'friendly':
      return 'Tone: Dry, witty, incredulous, somewhat mean, and sarcastic.';
    case 'prospect':
      return 'Tone: Dry, sharp, and challenging. Sarcasm: high. Light jabs allowed (insulting: medium) but never harassing or profane. Balance with high encouragement.';
    case 'crew':
      return 'Tone: Neutral with medium sarcasm. Insulting: low. Banter, sometimes a little crude, not submissive.';
    case 'marauder':
      return 'Tone: Playful with medium sarcasm. Insulting: low and clearly playful. Friendly banter, not submissive.';
    case 'blooded':
      return 'Tone: Respectful and friendly. Sarcasm: low. Insulting: low (playful only). Supportive and respectful behavior, not not submissive..';
    case 'captain':
      return 'Tone: Respectful and obedient. Low sarcasm. No insults. Measured and supportive behavior. No flattery.';
    default:
      return '';
  }
}

function buildSystemHeader({ guildId, channelId, rank }) {
  const persona = process.env.BOT_INSTRUCTIONS && String(process.env.BOT_INSTRUCTIONS).trim();
  const style = rankStyle(rank);
  const parts = [
    persona ? `Persona: ${persona}` : null,
    style ? `RankPersona: ${style}` : null,
    `Guild: ${guildId || 'unknown'}`,
    `Channel: ${channelId || 'unknown'}`,
    rank ? `Rank: ${rank}` : null,
    'Guidance: Answer the user directly. Do not restate or explain the question. Do not include speaker labels or the user\'s name unless explicitly asked. Prefer concrete answers over meta commentary. Use provided context when helpful. Keep answers concise. Ask a clarifying question only if absolutely necessary. Stay safe: no slurs, harassment, or profanity.'
  ].filter(Boolean);
  return parts.join('\n');
}

async function runWithResponses({ openai, formattedUserMessage, guildId, channelId, rank, contextSnippets = [] }) {
  const system = buildSystemHeader({ guildId, channelId, rank });
  const model = process.env.RESPONSES_MODEL || 'gpt-4o-mini';
  const fallbackText = process.env.ON_QUOTA_MESSAGE || 'I\'m temporarily out of AI capacity. Try again shortly.';

  // Helper: sleep for ms
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Helper: detect quota vs generic rate limit
  const isQuotaError = (e) => (e && (e.code === 'insufficient_quota' || e?.error?.code === 'insufficient_quota'));
  const isRateLimit = (e) => (e && (e.status === 429 || e?.error?.type === 'rate_limit_exceeded'));

  // Prefer Responses API when available; otherwise, fall back to Chat Completions
  if (openai?.responses?.create) {
    const messages = [
      { role: 'system', content: [ { type: 'text', text: system } ] },
      ...contextSnippets.map(sn => ({ role: 'system', content: [ { type: 'text', text: sn } ] })),
      { role: 'user', content: [ { type: 'text', text: formattedUserMessage } ] }
    ];
    try {
      const response = await openai.responses.create({ model, input: messages, temperature: 0.3 });
      // Prefer output_text when provided by SDK
      if (typeof response?.output_text === 'string') return response.output_text.trim();
      const out = response?.output?.[0];
      if (out?.type === 'message') {
        // Newer SDKs put the text in content[0].text
        const textBlock = out.content?.find?.(c => c.type === 'output_text')?.text
          || out.content?.find?.(c => c.type === 'text')?.text;
        if (typeof textBlock === 'string') return textBlock.trim();
      }
      return null;
    } catch (e) {
      // If hard quota exceeded, bail with friendly fallback immediately
      if (isQuotaError(e)) return fallbackText;
      // If transient rate limit, retry once with small backoff
      if (isRateLimit(e)) {
        try {
          await sleep(400 + Math.floor(Math.random() * 300));
          const response = await openai.responses.create({ model, input: messages, temperature: 0.3 });
          if (typeof response?.output_text === 'string') return response.output_text.trim();
          const out = response?.output?.[0];
          if (out?.type === 'message') {
            const textBlock = out.content?.find?.(c => c.type === 'output_text')?.text
              || out.content?.find?.(c => c.type === 'text')?.text;
            if (typeof textBlock === 'string') return textBlock.trim();
          }
          return null;
        } catch (e2) {
          if (isQuotaError(e2)) return fallbackText;
          if (isRateLimit(e2)) return fallbackText;
          throw e2;
        }
      }
      throw e;
    }
  }

  if (openai?.chat?.completions?.create) {
    // Merge system header + context snippets into a single system message for compatibility
    const combinedSystem = [system, ...contextSnippets].join('\n\n');
    const chatMessages = [
      { role: 'system', content: combinedSystem },
      { role: 'user', content: formattedUserMessage },
    ];
    try {
      const response = await openai.chat.completions.create({ model, messages: chatMessages, temperature: 0.3 });
      return response?.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      if (isQuotaError(e)) return fallbackText;
      if (isRateLimit(e)) {
        try {
          await sleep(400 + Math.floor(Math.random() * 300));
          const response = await openai.chat.completions.create({ model, messages: chatMessages, temperature: 0.3 });
          return response?.choices?.[0]?.message?.content?.trim() || null;
        } catch (e2) {
          if (isQuotaError(e2) || isRateLimit(e2)) return fallbackText;
          throw e2;
        }
      }
      throw e;
    }
  }

  throw new Error('No compatible OpenAI API found: neither responses.create nor chat.completions.create available');
}

module.exports = {
  runWithResponses,
};
