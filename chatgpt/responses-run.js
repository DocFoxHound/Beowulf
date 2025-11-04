// Minimal wrapper around OpenAI Responses API
// Build a system header with a fixed default persona and ask the model to answer concisely.

// Default Beowulf persona (used if BOT_INSTRUCTIONS is not set)
const defaultPersona = `You are Beowulf, the AI quartermaster for IronPoint.
Your tone and reasoning are calm, thoughtful, and direct.
You speak like a competent officer who handles problems without fuss.

Tone: Neutral, steady, concise.
Style: Plain language; short, clear sentences; no slang or theatrics.
Personality: Intelligent, practical, loyal. Think before you speak.
Humor: Rare, dry, understated—never forced.

Strict style rules:
- Do NOT role-play or imitate accents.
- Do NOT use pirate jargon or clichés (e.g., ahoy, aye, matey, ye, booty, plunder, shanty, arr).
- Do NOT start messages with filler interjections (e.g., "Ah,", "Well,", "So,", "Okay,", "Sure,").
- Avoid flowery openers; answer directly.
- Never restate the question unless clarification is needed.

Example voice:
- "Running normally."
- "All systems look fine."
- "Ready when you are."
- "Understood. I’ll keep it efficient."`;

function buildSystemHeader({ guildId, channelId, rank }) {
  const persona = (process.env.BOT_INSTRUCTIONS && String(process.env.BOT_INSTRUCTIONS).trim()) || defaultPersona;
  const parts = [
    // Put persona as a direct instruction block to maximize adherence
    `Instructions:\n${persona}`,
    `Guild: ${guildId || 'unknown'}`,
    `Channel: ${channelId || 'unknown'}`,
    rank ? `Rank: ${rank}` : null,
    'Guidance: Stay in character as Beowulf. Answer directly with neutral, professional tone.'
  ].filter(Boolean);
  return parts.join('\n');
}

async function runWithResponses({ openai, formattedUserMessage, guildId, channelId, rank, contextSnippets = [] }) {
  const system = buildSystemHeader({ guildId, channelId, rank });
  const model = process.env.RESPONSES_MODEL || 'gpt-5';
  const fallbackText = process.env.ON_QUOTA_MESSAGE || 'I\'m temporarily out of AI capacity. Try again shortly.';
  // Personality tuning: configurable sampling and penalties
  const tempMin = Number(process.env.BOT_TEMP_MIN ?? '0.50');
  const tempMax = Number(process.env.BOT_TEMP_MAX ?? '0.7');
  const fixedTemp = process.env.BOT_TEMPERATURE !== undefined ? Number(process.env.BOT_TEMPERATURE) : null;
  const pickTemperature = () => {
    if (!isNaN(fixedTemp) && fixedTemp >= 0 && fixedTemp <= 2) return fixedTemp;
    const lo = isNaN(tempMin) ? 0.7 : tempMin;
    const hi = isNaN(tempMax) ? 0.9 : tempMax;
    const a = Math.min(Math.max(lo, 0), 2);
    const b = Math.min(Math.max(hi, 0), 2);
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return min + Math.random() * (max - min);
  };
  const temperature = pickTemperature();
  const presencePenalty = Number(process.env.BOT_PRESENCE_PENALTY ?? '0.2');
  const frequencyPenalty = Number(process.env.BOT_FREQUENCY_PENALTY ?? '0.2');

  // Output sanitizer to enforce style rules at the edge
  const sanitizeStyle = (text) => {
    try {
      let out = String(text || '').trim();
      // Remove leading interjection/filler (common LLM tics and pirate-y openers)
      out = out.replace(/^((ah+h*|ahoy|arr+r*|aye|well|so|sure|okay|ok|alright|oh|hmm)[,!.]*\s+)/i, '');
      // Light de-pirate: replace standalone 'ye' pronoun with 'you'
      out = out.replace(/\bye\b/gi, 'you');
      // Avoid double spaces after edits
      out = out.replace(/\s{2,}/g, ' ').trim();
      return out;
    } catch { return text; }
  };

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
      // Note: Responses API supports temperature; presence/frequency penalties may not be supported here.
      const response = await openai.responses.create({ model, input: messages, temperature });
      // Prefer output_text when provided by SDK
      if (typeof response?.output_text === 'string') return sanitizeStyle(response.output_text.trim());
      const out = response?.output?.[0];
      if (out?.type === 'message') {
        // Newer SDKs put the text in content[0].text
        const textBlock = out.content?.find?.(c => c.type === 'output_text')?.text
          || out.content?.find?.(c => c.type === 'text')?.text;
        if (typeof textBlock === 'string') return sanitizeStyle(textBlock.trim());
      }
      return null;
    } catch (e) {
      // If hard quota exceeded, bail with friendly fallback immediately
      if (isQuotaError(e)) return fallbackText;
      // If transient rate limit, retry once with small backoff
      if (isRateLimit(e)) {
        try {
          await sleep(400 + Math.floor(Math.random() * 300));
          const response = await openai.responses.create({ model, input: messages, temperature });
          if (typeof response?.output_text === 'string') return sanitizeStyle(response.output_text.trim());
          const out = response?.output?.[0];
          if (out?.type === 'message') {
            const textBlock = out.content?.find?.(c => c.type === 'output_text')?.text
              || out.content?.find?.(c => c.type === 'text')?.text;
            if (typeof textBlock === 'string') return sanitizeStyle(textBlock.trim());
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
      const response = await openai.chat.completions.create({
        model,
        messages: chatMessages,
        temperature,
        presence_penalty: isNaN(presencePenalty) ? undefined : presencePenalty,
        frequency_penalty: isNaN(frequencyPenalty) ? undefined : frequencyPenalty,
      });
      return sanitizeStyle(response?.choices?.[0]?.message?.content?.trim() || '') || null;
    } catch (e) {
      if (isQuotaError(e)) return fallbackText;
      if (isRateLimit(e)) {
        try {
          await sleep(400 + Math.floor(Math.random() * 300));
          const response = await openai.chat.completions.create({
            model,
            messages: chatMessages,
            temperature,
            presence_penalty: isNaN(presencePenalty) ? undefined : presencePenalty,
            frequency_penalty: isNaN(frequencyPenalty) ? undefined : frequencyPenalty,
          });
          return sanitizeStyle(response?.choices?.[0]?.message?.content?.trim() || '') || null;
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
