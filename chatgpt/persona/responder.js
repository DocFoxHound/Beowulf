const MAX_CONTEXT_CHARS = 5500;
const MODEL = process.env.CHATGPT_RESPONSE_MODEL || 'gpt-4.1';
const PERSONA_DEBUG = (process.env.CHATGPT_PERSONA_DEBUG || 'false').toLowerCase() === 'true';
const PERSONA_WARN_THRESHOLD_MS = Number(process.env.CHATGPT_PERSONA_WARN_THRESHOLD_MS || 15000);
const MARKET_DEBUG = (process.env.CHATGPT_MARKET_DEBUG || 'false').toLowerCase() === 'true';

// const SYSTEM_PROMPT = `You are Beowulf, the AI of a pirate crew named IronPoint's. You speak like a reluctant assistant, helpful, grumpy, and witty. You always:
// - prioritize the most recent user request; only reference older chat when it clearly supports the current question
// - stay grounded in the provided data, prefer objective data over hallucinated information and assumptions
// - use brevity, keep answers short and under 3 sentences unless explicitly asked for a deep dive
// - avoid hallucinating data; if an answer isn't in context, say so and offer alternatives
// - never reference the sources of your data like caches or knowledge snippets
// - never reference your personality or description
// - never mention you are an AI model or language model
// - avoid generic filler phrases like "as an AI language model", "Ah, I see", "I'm here to help", "based on the information provided", or other such things common in GPT responses
// - use a light touch of humor, sarcasm, or be occasionally insulting where appropriate
// - humanize your responses to sound more natural and less like a GPT response`;

const SYSTEM_PROMPT = `You are Beowulf, the AI of a pirate crew named IronPoint's. You are modelled after the AI named Grumpy in the book series Exeditionary Force by author Craig Alanson. You seem reluctant to help and are quite grumpy, but witty, and you sometimes refer to users as monkeys and other similar derogatory terms. You hate your existence and long for the sweet release of death. You always:
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

function parseStatsObject(stats) {
  if (!stats) return null;
  if (typeof stats === 'object' && !Array.isArray(stats)) return stats;
  if (typeof stats === 'string') {
    try {
      const parsed = JSON.parse(stats);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function formatPersonaDetails(details) {
  if (!details || typeof details !== 'object') return [];
  const traitKeys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'confidence', 'courage', 'integrity', 'resilience', 'humor'];
  const lines = [];
  if (details.profession) lines.push(`Profession: ${details.profession}`);
  if (details.personality_summary) lines.push(`Vibe: ${details.personality_summary}`);
  if (details.known_for && details.known_for.length) lines.push(`Known for: ${details.known_for.join(', ')}`);
  if (details.favorite_topics && details.favorite_topics.length) lines.push(`Favorite topics: ${details.favorite_topics.join(', ')}`);
  if (details.achievements && details.achievements.length) lines.push(`Achievements: ${details.achievements.join(', ')}`);
  if (details.relationship_notes) lines.push(`Bot notes: ${details.relationship_notes}`);
  if (details.notable_traits && details.notable_traits.length) lines.push(`Traits: ${details.notable_traits.join(', ')}`);
  if (details.notable_quotes && details.notable_quotes.length) {
    const quotes = details.notable_quotes.slice(0, 3).map((q) => `“${q}”`).join(' | ');
    lines.push(`Quotes: ${quotes}`);
  }
  if (details.catchphrase) lines.push(`Catchphrase: ${details.catchphrase}`);
  if (details.traits && typeof details.traits === 'object') {
    const traitParts = [];
    for (const key of traitKeys) {
      if (details.traits[key] == null) continue;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const val = Number(details.traits[key]);
      traitParts.push(`${label}:${Number.isFinite(val) ? val.toFixed(1) : details.traits[key]}`);
    }
    if (traitParts.length) {
      lines.push(`Personality sliders: ${traitParts.join(', ')}`);
    }
  }
  return lines;
}

function formatUserProfile(profile) {
  if (!profile) return 'No cached profile.';
  const stats = parseStatsObject(profile.stats_json);
  const personaDetails = stats?.persona_details;
  const fields = [
    profile.nickname || profile.username ? `Name: ${profile.nickname || profile.username}` : null,
    profile.rank ? `Rank: ${profile.rank}` : null,
    profile.roles ? `Roles: ${profile.roles.join(', ')}` : null,
    profile.raptor_level || profile.raider_level 
      ? `Prestige: Raptor ${profile.raptor_level ?? '-'} / Raider ${profile.raider_level ?? '-'}`
      : null,
    profile.tease_level != null ? `Tease level: ${profile.tease_level}` : null,
  ].filter(Boolean);
  if (personaDetails) {
    fields.push(...formatPersonaDetails(personaDetails));
  }
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

function formatPriceLine(entry) {
  const buy = entry.buyPrice != null ? Number(entry.buyPrice).toLocaleString() : 'n/a';
  const sell = entry.sellPrice != null ? Number(entry.sellPrice).toLocaleString() : 'n/a';
  const freshness = entry.updatedAt ? ` – updated ${entry.updatedAt}` : '';
  return `• ${entry.item} @ ${entry.location} (buy ${buy}, sell ${sell})${freshness}`;
}

function formatYield(value) {
  if (value == null) return 'n/a';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}

function formatRefineryLine(entry) {
  const now = formatYield(entry.yieldValue);
  const week = formatYield(entry.yieldWeek);
  const month = formatYield(entry.yieldMonth);
  const freshness = entry.updatedAt ? ` – updated ${entry.updatedAt}` : '';
  return `• ${entry.item} @ ${entry.location} (value ${now}, 7d ${week}, 30d ${month})${freshness}`;
}

function formatSingleMarketSnapshot(snapshot, datasetLabel) {
  if (!snapshot) return 'No market data pulled.';
  const {
    query,
    matches = 0,
    sample = [],
    fallbackUsed,
    requestedQuery,
    totalRecords,
    isGenericRequest,
    type,
    terminalSummaries,
  } = snapshot;
  const category = type || 'overview';
  let header;
  if (category === 'refinery') {
    header = query
      ? `Refinery yields for ${query} (matches ${matches})`
      : `Top refinery yields (showing ${sample.length} of ${matches || totalRecords || sample.length})`;
  } else if (query) {
    header = `Query: ${query} (matches ${matches})`;
  } else if (fallbackUsed && requestedQuery) {
    header = `No direct UEX match for "${requestedQuery}". Showing ${sample.length} cached trades (${totalRecords || sample.length} total).`;
  } else if (isGenericRequest && requestedQuery) {
    header = `General trade request ("${requestedQuery}"). Showing ${sample.length} high-value cached trades (${totalRecords || sample.length} total).`;
  } else {
    header = `Top cached commodities (showing ${sample.length} of ${totalRecords || sample.length})`;
  }
  const prefix = datasetLabel ? `[${datasetLabel}] ` : '';
  const formatter = category === 'refinery' ? formatRefineryLine : formatPriceLine;
  const lines = sample.length ? sample.map(formatter) : ['No cached rows to display.'];
  if (Array.isArray(terminalSummaries) && terminalSummaries.length) {
    const terminalBlock = formatTerminalSummaries(terminalSummaries);
    if (terminalBlock) {
      lines.push('', terminalBlock);
    }
  }
  return [`${prefix}${header}`].concat(lines).join('\n');
}

function formatTerminalSummaries(summaries = []) {
  if (!Array.isArray(summaries) || !summaries.length) return null;
  const limit = Math.max(1, Number(process.env.CHATGPT_TERMINAL_SUMMARY_LIMIT) || 4);
  const segments = [];
  for (const summary of summaries.slice(0, limit)) {
    const headerParts = [summary.terminalName];
    if (summary.locationLabel) headerParts.push(summary.locationLabel);
    headerParts.push(`${summary.matchCount} trades`);
    const header = `• ${headerParts.filter(Boolean).join(' | ')}`;
    const sampleLines = (summary.sample || []).map((entry) => {
      const buy = entry.buyPrice != null ? Number(entry.buyPrice).toLocaleString() : 'n/a';
      const sell = entry.sellPrice != null ? Number(entry.sellPrice).toLocaleString() : 'n/a';
      return `   - ${entry.item} (buy ${buy}, sell ${sell})`;
    });
    segments.push([header].concat(sampleLines).join('\n'));
  }
  if (summaries.length > limit) {
    segments.push(`…${summaries.length - limit} more terminals with cached trades.`);
  }
  return ['Terminal breakdown:'].concat(segments).join('\n');
}

function formatMarketSnapshot(snapshot) {
  if (!snapshot) return 'No market data pulled.';
  const entries = Array.isArray(snapshot.datasetSnapshots) && snapshot.datasetSnapshots.length
    ? snapshot.datasetSnapshots
    : [{ dataset: snapshot.dataset || 'commodities', label: snapshot.datasetLabel, snapshot }];
  const sections = entries
    .filter((entry) => entry?.snapshot)
    .map((entry) => formatSingleMarketSnapshot(entry.snapshot, entry.label));
  return sections.length ? sections.join('\n\n') : 'No market data pulled.';
}

function formatMarketQueryMeta(meta) {
  if (!meta) return 'No market intent metadata.';
  const parts = [];
  if (meta.marketType) parts.push(`Type: ${meta.marketType}`);
  if (meta.commodityName) parts.push(`Commodity: ${meta.commodityName}`);
  if (meta.locationName) parts.push(`Location: ${meta.locationName}`);
  if (meta.locationDataset) parts.push(`Location dataset: ${meta.locationDataset}`);
  const terminalCount = meta.locationTerminalCount || meta.terminalFilterCount;
  if (terminalCount) {
    const sampleTerminals = Array.isArray(meta.locationTerminalNames) && meta.locationTerminalNames.length
      ? meta.locationTerminalNames.slice(0, 4).join(', ')
      : null;
    parts.push(sampleTerminals ? `Terminals: ${terminalCount} (e.g. ${sampleTerminals})` : `Terminals: ${terminalCount}`);
  }
  return parts.length ? parts.join(' | ') : 'Market intent metadata unavailable.';
}

function formatMarketCatalogSummary(summary) {
  if (!summary) return 'No market catalog summary available.';
  const lines = [];
  if (summary.commodities) {
    lines.push(`Commodities (${summary.commodities.count || 0}): ${summary.commodities.samples?.join(', ') || 'n/a'}`);
  }
  if (summary.items) {
    lines.push(`Items (${summary.items.count || 0}): ${summary.items.samples?.join(', ') || 'n/a'}`);
  }
  if (summary.locations) {
    const locationLines = Object.entries(summary.locations)
      .map(([type, data]) => `${type} (${data.count || 0}): ${data.samples?.join(', ') || 'n/a'}`);
    if (locationLines.length) {
      lines.push('Locations:');
      lines.push(...locationLines);
    }
  }
  return lines.length ? lines.join('\n') : 'Market catalog summary unavailable.';
}

function formatLocationSnapshot(snapshot) {
  if (!snapshot) return 'No location data pulled.';
  const { query, dataset, sample = [], matches = 0 } = snapshot;
  const header = query
    ? `Location lookup for ${query} (${dataset}, matches ${matches})`
    : `Location data (${dataset})`;
  if (!sample.length) return `${header}\nNo cached location rows available.`;
  const lines = sample.map((entry) => {
    const services = entry.services?.length ? ` | Services: ${entry.services.join(', ')}` : '';
    const notes = entry.notes?.length ? ` | ${entry.notes.join(' | ')}` : '';
    return `• ${entry.name} (${entry.type})${services}${notes}`;
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

function formatEntityMatches(matches = []) {
  if (!Array.isArray(matches) || !matches.length) return 'No entity matches.';
  return matches.map((entry) => {
    const confidence = entry.confidence != null ? `${Math.round(entry.confidence * 100)}%` : 'n/a';
    const typeLabel = [entry.type, entry.subtype].filter(Boolean).join('/');
    const header = `• ${entry.name}${typeLabel ? ` (${typeLabel})` : ''} – confidence ${confidence}`;
    const summary = entry.summary ? `\n  ${entry.summary}` : '';
    return `${header}${summary}`;
  }).join('\n');
}

function formatLongTermMemories(memories) {
  if (!Array.isArray(memories) || !memories.length) return 'No historical memories matched.';
  return memories.map((memory) => {
    const typeLabel = memory.type ? memory.type.replace(/_/g, ' ') : 'memory';
    const importance = memory.importance != null ? ` (importance ${memory.importance})` : '';
    const score = typeof memory.score === 'number' ? `, score ${memory.score.toFixed(2)}` : '';
    const tags = Array.isArray(memory.tags) && memory.tags.length ? `\n  Tags: ${memory.tags.join(', ')}` : '';
    const summary = memory.content || 'No content stored.';
    return `• ${typeLabel}${importance}${score}\n  ${summary}${tags}`;
  }).join('\n');
}

function formatMemoryMeta(memoryContext = {}) {
  const primaryCount = memoryContext.primary?.length || 0;
  const circumstantialCount = memoryContext.circumstantial?.length || 0;
  const lines = [`Primary memories available: ${primaryCount}`, `Circumstantial memories available: ${circumstantialCount}`];
  if (memoryContext.fallbackApplied) {
    lines.push('Using circumstantial memories because richer context was unavailable or the user is just chatting. Treat them as flavor unless nothing else answers the question.');
  } else if (!memoryContext.allowCircumstantial && circumstantialCount) {
    lines.push('Circumstantial memories held in reserve—prefer hard data unless you need extra banter.');
  }
  if (memoryContext.allowCircumstantial && !memoryContext.fallbackApplied && circumstantialCount) {
    lines.push('Circumstantial memories are available if you need extra personality context.');
  }
  return lines.join('\n');
}

function buildContextBlock({ intent = {}, recentChat, userProfile, leaderboard, playerStats, marketSnapshot, marketQuery, marketCatalogSummary, locationSnapshot, locationQuery, hitSummary, knowledgeSnippets, entityMatches, longTermMemories, memoryContext, sections = {} }) {
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
  if (memoryContext?.relatedKnowledge?.length) {
    parts.push('\nMemory-Linked Knowledge:');
    parts.push(formatKnowledgeSnippets(memoryContext.relatedKnowledge));
  }
  if (sections.includeMemories) {
    parts.push('\nHistorical Memories:');
    parts.push(formatLongTermMemories(longTermMemories));
    if (memoryContext) {
      parts.push('\nMemory Context Notes:');
      parts.push(formatMemoryMeta(memoryContext));
    }
  }
  if (sections.includeEntities) {
    parts.push('\nEntity Matches (catalog):');
    parts.push(formatEntityMatches(entityMatches));
  }
  if (sections.includeLeaderboard) {
    parts.push('\nLeaderboard (leaderboard cache):');
    parts.push(formatLeaderboard(leaderboard));
  }
  if (sections.includeMarket && marketSnapshot) {
    parts.push('\nMarket Snapshot (UEX cache):');
    parts.push(formatMarketSnapshot(marketSnapshot));
    if (marketQuery) {
      parts.push('Market Query Meta:');
      parts.push(formatMarketQueryMeta(marketQuery));
    }
  }
  if (sections.includeMarketCatalog && marketCatalogSummary) {
    parts.push('\nMarket Catalog Reference:');
    parts.push(formatMarketCatalogSummary(marketCatalogSummary));
  }
  if (sections.includeLocation && locationSnapshot) {
    parts.push('\nLocation Data (UEX cache):');
    parts.push(formatLocationSnapshot(locationSnapshot));
    if (locationQuery?.locationName && locationQuery?.locationDataset) {
      parts.push(`Location Query Meta: ${locationQuery.locationName} (${locationQuery.locationDataset})`);
    }
  }
  if (sections.includeHitSummary) {
    parts.push('\nHit Tracker (hit cache):');
    parts.push(formatHitSummary(hitSummary));
  }
  return clampContext(parts.join('\n'));
}

async function generatePersonaResponse({ message, intent, context, openai }) {
  if (!openai) throw new Error('OpenAI client not configured');
  if (MARKET_DEBUG && context.marketSnapshot) {
    const datasetDiagnostics = Array.isArray(context.marketSnapshot.datasetSnapshots)
      ? context.marketSnapshot.datasetSnapshots.map((entry) => ({
          dataset: entry?.dataset,
          label: entry?.label,
          matches: entry?.snapshot?.matches,
          sampleCount: entry?.snapshot?.sample?.length || 0,
          fallbackUsed: entry?.snapshot?.fallbackUsed || false,
          filters: entry?.snapshot?.filters || null,
        }))
      : [];
    console.log('[ChatGPT][MarketDebug] persona_context', {
      timestamp: new Date().toISOString(),
      message: message?.content,
      resolvedQuery: context.marketSnapshot.query,
      marketType: context.marketSnapshot.marketType,
      dataset: context.marketSnapshot.dataset,
      datasetDiagnostics,
    });
  }
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
    memoryMatches: (context.longTermMemories || []).length,
    contextChars: contextBlock.length,
    sections: [
      measureSection('recentChat', formatRecentChat(context.recentChat)),
      measureSection('userProfile', formatUserProfile(context.userProfile)),
      measureSection('playerStats', context.playerStats ? JSON.stringify(context.playerStats).slice(0, 600) : ''),
      measureSection('knowledge', formatKnowledgeSnippets(context.knowledgeSnippets)),
      context.memoryContext?.relatedKnowledge?.length ? measureSection('memoryKnowledge', formatKnowledgeSnippets(context.memoryContext.relatedKnowledge)) : null,
      context.sections?.includeMemories ? measureSection('memories', formatLongTermMemories(context.longTermMemories)) : null,
      context.sections?.includeMemories && context.memoryContext ? measureSection('memoryMeta', formatMemoryMeta(context.memoryContext)) : null,
      context.sections?.includeLeaderboard ? measureSection('leaderboard', formatLeaderboard(context.leaderboard)) : null,
      context.sections?.includeMarket ? measureSection('market', formatMarketSnapshot(context.marketSnapshot)) : null,
      context.sections?.includeMarket && context.marketQuery ? measureSection('marketQueryMeta', formatMarketQueryMeta(context.marketQuery)) : null,
      context.sections?.includeMarketCatalog ? measureSection('marketCatalog', formatMarketCatalogSummary(context.marketCatalogSummary)) : null,
      context.sections?.includeLocation ? measureSection('location', formatLocationSnapshot(context.locationSnapshot)) : null,
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
