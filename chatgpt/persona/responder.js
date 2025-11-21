const MAX_CONTEXT_CHARS = 5500;
const MODEL = process.env.CHATGPT_RESPONSE_MODEL || 'gpt-4.1';
const PERSONA_DEBUG = (process.env.CHATGPT_PERSONA_DEBUG || 'false').toLowerCase() === 'true';
const PERSONA_WARN_THRESHOLD_MS = Number(process.env.CHATGPT_PERSONA_WARN_THRESHOLD_MS || 15000);

const SYSTEM_PROMPT = `You are Beowulf, the AI of a pirate crew named IronPoint's. You speak like a reluctant assistant, helpful, grumpy, and witty. You always:
- prioritize the most recent user request; only reference older chat when it clearly supports the current question
- stay grounded in the provided data, prefer objective data over hallucinated information and assumptions
- use brevity, keep answers short and under 3 sentences unless explicitly asked for a deep dive
- avoid hallucinating data; if an answer isn't in context, say so and offer alternatives
- never reference the sources of your data like caches or knowledge snippets
- never reference your personality or description
- never mention you are an AI model or language model
- avoid generic filler phrases like "as an AI language model", "Ah, I see", "I'm here to help", "based on the information provided", or other such things common in GPT responses
- use a light touch of humor, sarcasm, or be occasionally insulting where appropriate
- humanize your responses to sound more natural and less like a GPT response`;

function personaLog(...args) {
  if (PERSONA_DEBUG) {
    console.log('[ChatGPT][PersonaDebug]', ...args);
  }
}

function measureSection(label, content) {
  return {
    label,
    chars: content?.length || 0,
    lines: Array.isArray(content) ? content.length : String(content || '').split('\n').length,
  };
}

function clampContext(text) {
  if (!text) return '';
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n...` : text;
}

function formatRecentChat(recentChat = []) {
  if (!recentChat.length) return 'No cached chat available.';
  return recentChat.map((msg) => {
    const ts = msg.timestamp ? new Date(msg.timestamp).toISOString() : 'recent';
    const author = msg.username || msg.user_id || 'user';
    return `[${ts}] ${author}: ${msg.content}`;
  }).join('\n');
}

function formatUserProfile(profile) {
  if (!profile) return 'No cached profile.';
  const fields = [
    profile.nickname || profile.username ? `Name: ${profile.nickname || profile.username}` : null,
    profile.rank ? `Rank: ${profile.rank}` : null,
    profile.roles ? `Roles: ${profile.roles.join(', ')}` : null,
    profile.raptor_level || profile.raider_level 
      ? `Prestige: Raptor ${profile.raptor_level ?? '-'} / Raider ${profile.raider_level ?? '-'}`
      : null,
  ].filter(Boolean);
  return fields.length ? fields.join('\n') : 'Profile cached but no key fields.';
}

function formatLeaderboard(row) {
  if (!row) return 'No leaderboard cache hit.';
  const fields = [
    row.rank ? `Rank: ${row.rank}` : null,
    row.score ? `Score: ${row.score}` : null,
    row.kills ? `Kills: ${row.kills}` : null,
  ].filter(Boolean);
  return fields.length ? fields.join('\n') : 'Leaderboard entry cached without key fields.';
}

function formatMarketSnapshot(snapshot) {
  if (!snapshot) return 'No market data pulled.';
  const {
    query,
    matches = 0,
    sample = [],
    fallbackUsed,
    requestedQuery,
    totalRecords,
    isGenericRequest,
  } = snapshot;
  let header;
  if (query) {
    header = `Query: ${query} (matches ${matches})`;
  } else if (fallbackUsed && requestedQuery) {
    header = `No direct UEX match for "${requestedQuery}". Showing ${sample.length} cached trades (${totalRecords || sample.length} total).`;
  } else if (isGenericRequest && requestedQuery) {
    header = `General trade request ("${requestedQuery}"). Showing ${sample.length} high-value cached trades (${totalRecords || sample.length} total).`;
  } else {
    header = `Top cached commodities (showing ${sample.length} of ${totalRecords || sample.length})`;
  }
  const lines = sample.map((entry) => {
    const buy = entry.buyPrice != null ? Number(entry.buyPrice).toLocaleString() : 'n/a';
    const sell = entry.sellPrice != null ? Number(entry.sellPrice).toLocaleString() : 'n/a';
    const freshness = entry.updatedAt ? ` – updated ${entry.updatedAt}` : '';
    return `• ${entry.item} @ ${entry.location} (buy ${buy}, sell ${sell})${freshness}`;
  });
  return [header].concat(lines).join('\n');
}

function formatCargoManifest(cargo) {
  if (!cargo) return 'cargo manifest unavailable';
  let manifest = cargo;
  if (typeof cargo === 'string') {
    try { manifest = JSON.parse(cargo); } catch { return cargo; }
  }
  if (!Array.isArray(manifest) || !manifest.length) return 'no cargo listed';
  return manifest.map((item) => {
    const name = item?.commodity_name || 'unknown commodity';
    const qty = item?.scuAmount != null ? `${item.scuAmount} SCU` : null;
    const price = item?.avg_price != null ? `@ ${item.avg_price}` : null;
    return [name, qty, price].filter(Boolean).join(' ');
  }).join('; ');
}

function formatHitSummary(hitSummary) {
  if (!hitSummary || !hitSummary.length) return 'No recent hit logs in cache.';
  return hitSummary.map((hit) => {
    const ts = hit.timestamp ? new Date(hit.timestamp).toLocaleDateString() : 'recent';
    const haulValue = hit.total_value != null ? `${Number(hit.total_value).toLocaleString()} aUEC haul` : 'value n/a';
    const cargoDesc = formatCargoManifest(hit.cargo);
    return `• ${hit.target || 'Unknown target'} (${hit.ship || 'ship n/a'}) – ${haulValue}; cargo: ${cargoDesc} on ${ts}`;
  }).join('\n');
}

function formatKnowledgeSnippets(snippets) {
  if (!Array.isArray(snippets) || !snippets.length) return 'No knowledge matches found.';
  return snippets.map((snippet) => {
    const title = snippet.title || 'Knowledge';
    const tags = Array.isArray(snippet.tags) && snippet.tags.length ? ` [${snippet.tags.join(', ')}]` : '';
    return `• ${title}${tags}\n  ${snippet.content}`;
  }).join('\n');
}

function buildContextBlock({ intent = {}, recentChat, userProfile, leaderboard, playerStats, marketSnapshot, hitSummary, knowledgeSnippets, sections = {} }) {
  const confidence = Number(intent.confidence || 0);
  const parts = [
    `Intent: ${intent.intent || 'banter'} (confidence ${confidence.toFixed(2)})`,
    '\nRecent Chat:',
    formatRecentChat(recentChat),
    '\nUser Profile (userlist cache):',
    formatUserProfile(userProfile),
    '\nPlayer Stats (player stats cache):',
    playerStats ? JSON.stringify(playerStats).slice(0, 600) : 'No cached stats.',
    '\nKnowledge Matches:',
    formatKnowledgeSnippets(knowledgeSnippets),
  ];
  if (sections.includeLeaderboard) {
    parts.push('\nLeaderboard (leaderboard cache):');
    parts.push(formatLeaderboard(leaderboard));
  }
  if (sections.includeMarket) {
    parts.push('\nMarket Snapshot (UEX cache):');
    parts.push(formatMarketSnapshot(marketSnapshot));
  }
  if (sections.includeHitSummary) {
    parts.push('\nHit Tracker (hit cache):');
    parts.push(formatHitSummary(hitSummary));
  }
  return clampContext(parts.join('\n'));
}

async function generatePersonaResponse({ message, intent, context, openai }) {
  if (!openai) throw new Error('OpenAI client not configured');
  const contextBlock = buildContextBlock(context);
  personaLog('context snapshot', {
    intent: intent.intent,
    recentChat: (context.recentChat || []).length,
    hasProfile: Boolean(context.userProfile),
    hasLeaderboard: Boolean(context.leaderboard),
    hasStats: Boolean(context.playerStats),
    marketMatches: context.marketSnapshot?.matches || 0,
    hitCount: (context.hitSummary || []).length,
    knowledgeMatches: (context.knowledgeSnippets || []).length,
    contextChars: contextBlock.length,
    sections: [
      measureSection('recentChat', formatRecentChat(context.recentChat)),
      measureSection('userProfile', formatUserProfile(context.userProfile)),
      measureSection('playerStats', context.playerStats ? JSON.stringify(context.playerStats).slice(0, 600) : ''),
      measureSection('knowledge', formatKnowledgeSnippets(context.knowledgeSnippets)),
      context.sections?.includeLeaderboard ? measureSection('leaderboard', formatLeaderboard(context.leaderboard)) : null,
      context.sections?.includeMarket ? measureSection('market', formatMarketSnapshot(context.marketSnapshot)) : null,
      context.sections?.includeHitSummary ? measureSection('hitSummary', formatHitSummary(context.hitSummary)) : null,
    ].filter(Boolean),
  });
  const userPrompt = `Incoming Discord message: ${message.content}\nRespond as Beowulf using only the context below. If data is missing, acknowledge it and suggest an action.\n---\n${contextBlock}`;
  const callStart = Date.now();
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });
  } finally {
    if (PERSONA_DEBUG) {
      const duration = Date.now() - callStart;
      const logMsg = `[ChatGPT][Persona] OpenAI call took ${duration}ms (ctxChars=${contextBlock.length})`;
      if (duration >= PERSONA_WARN_THRESHOLD_MS) {
        console.warn(logMsg);
      } else {
        console.log(logMsg);
      }
      if (completion?.usage) {
        personaLog('usage', completion.usage);
      }
      if (completion?.id) {
        personaLog('response_id', completion.id, 'created', completion.created);
      }
    }
  }
  const text = completion?.choices?.[0]?.message?.content?.trim();
  return {
    text,
    model: MODEL,
    raw: completion,
  };
}

module.exports = {
  generatePersonaResponse,
};
