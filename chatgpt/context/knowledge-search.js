const { listKnowledge } = require('../../api/knowledgeApi');
const { KnowledgeDocsModel } = require('../../api/models/knowledge-docs');
const { getEmbedding } = require('../../common/embeddings');

const KNOWLEDGE_LIMIT = Number(process.env.CHATGPT_KNOWLEDGE_LIMIT || 3);
const KNOWLEDGE_ENABLED = (process.env.CHATGPT_KNOWLEDGE_LOOKUP || 'true').toLowerCase() === 'true';
const KNOWLEDGE_DOC_LIMIT = Number(process.env.CHATGPT_KNOWLEDGE_DOC_LIMIT || 3);
const KNOWLEDGE_DOC_MIN_SCORE = Number(process.env.CHATGPT_KNOWLEDGE_DOC_MIN_SCORE || 0.28);
const KNOWLEDGE_DOCS_ENABLED = (process.env.CHATGPT_KNOWLEDGE_DOC_LOOKUP || 'true').toLowerCase() === 'true';
const KNOWLEDGE_DOC_SCAN_LIMIT = Number(process.env.CHATGPT_KNOWLEDGE_DOC_SCAN_LIMIT || 600);
const KNOWLEDGE_DOC_SCAN_PAGE = Number(process.env.CHATGPT_KNOWLEDGE_DOC_SCAN_PAGE || 150);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

function sanitizeQuery(text) {
  if (!text) return '';
  return String(text).replace(/<@!?\d+>/g, '').replace(/<#[0-9]+>/g, '').replace(/<@&[0-9]+>/g, '').trim();
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 16);
}

async function computeQueryEmbedding({ text, openai }) {
  try {
    const embedding = await getEmbedding({ text, openai });
    if (Array.isArray(embedding) && embedding.length === KnowledgeDocsModel.vectorDim) return embedding;
  } catch (error) {
    console.error('[ChatGPT][KnowledgeDocs] embeddings helper failed:', error?.message || error);
  }
  if (!openai) return null;
  try {
    const resp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: String(text || '').slice(0, 8000) });
    const fallbackEmbedding = resp?.data?.[0]?.embedding;
    if (Array.isArray(fallbackEmbedding) && fallbackEmbedding.length === KnowledgeDocsModel.vectorDim) {
      return fallbackEmbedding;
    }
    return null;
  } catch (error) {
    console.error('[ChatGPT][KnowledgeDocs] direct embedding failed:', error?.message || error);
    return null;
  }
}

function formatKnowledgeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || row.section || 'Knowledge snippet',
    content: (row.content || '').slice(0, 480),
    source: row.source || 'knowledge',
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 5) : [],
    url: row.url || null,
    score: null,
  };
}

function formatKnowledgeDocHit(entry) {
  const row = entry?.row || entry;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || 'Doc knowledge',
    content: (row.text || '').slice(0, 600),
    source: 'knowledge_doc',
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 5) : [],
    url: null,
    score: typeof entry?.score === 'number' ? entry.score : null,
  };
}

async function fetchLegacyKnowledge({ query, guildId, channelId, limit }) {
  if (!KNOWLEDGE_ENABLED || !query) return [];
  try {
    const params = { q: query, limit, order: 'created_at.desc' };
    if (guildId) params.guild_id = guildId;
    if (channelId) params.channel_id = channelId;
    const rows = await listKnowledge(params);
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows.slice(0, limit).map(formatKnowledgeRow).filter(Boolean);
  } catch (error) {
    console.error('[ChatGPT][Knowledge] lookup failed:', error?.message || error);
    return [];
  }
}

function scoreRowAgainstTokens(row, tokens = []) {
  if (!row || !tokens.length) return 0;
  const haystack = `${row.title || ''}\n${row.text || ''}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length;
  }
  return score;
}

async function fetchKnowledgeDocsKeywordFallback({ query, limit }) {
  if (KNOWLEDGE_DOC_SCAN_LIMIT <= 0) return [];
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const pageSize = Math.max(25, Math.min(KNOWLEDGE_DOC_SCAN_PAGE, KNOWLEDGE_DOC_SCAN_LIMIT));
  let scanned = 0;
  let offset = 0;
  const hits = [];
  const seenPages = new Set();

  while (scanned < KNOWLEDGE_DOC_SCAN_LIMIT) {
    const remaining = KNOWLEDGE_DOC_SCAN_LIMIT - scanned;
    const take = Math.min(pageSize, remaining);
    let rows = [];
    try {
      rows = await KnowledgeDocsModel.list({ limit: take, offset, order: 'created_at.desc' });
    } catch (error) {
      console.error('[ChatGPT][KnowledgeDocs] fallback list failed:', error?.message || error);
      break;
    }
    if (!Array.isArray(rows) || !rows.length) break;
    const signature = rows.map((row) => row?.id || row?.title || '').join('|');
    if (signature && seenPages.has(signature)) break;
    if (signature) seenPages.add(signature);
    scanned += rows.length;
    offset += rows.length;
    for (const row of rows) {
      const score = scoreRowAgainstTokens(row, tokens);
      if (score <= 0) continue;
      hits.push({ row, score });
    }
    if (hits.length >= limit * 2) break;
    if (rows.length < take) break;
  }

  if (!hits.length) return [];
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((entry) => formatKnowledgeDocHit(entry)).filter(Boolean);
}

function mergeKnowledgeDocResults(primary = [], secondary = []) {
  if (!Array.isArray(primary) || !primary.length) {
    return Array.isArray(secondary) ? secondary.slice() : [];
  }
  const seen = new Set(primary.map((entry) => entry?.id).filter(Boolean));
  const merged = primary.slice();
  if (!Array.isArray(secondary)) return merged;
  for (const entry of secondary) {
    if (!entry) continue;
    const id = entry.id || null;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(entry);
  }
  return merged;
}

async function fetchKnowledgeDocs({ query, openai, limit }) {
  if (!KNOWLEDGE_DOCS_ENABLED || !query) return [];
  let embedding = null;
  try {
    embedding = await computeQueryEmbedding({ text: query, openai });
  } catch (error) {
    console.error('[ChatGPT][KnowledgeDocs] embedding computation failed:', error?.message || error);
  }
  let docHits = [];
  if (Array.isArray(embedding) && embedding.length === KnowledgeDocsModel.vectorDim) {
    let results;
    try {
      results = await KnowledgeDocsModel.vectorSearch({ queryEmbedding: embedding, limit });
    } catch (error) {
      console.error('[ChatGPT][KnowledgeDocs] vector lookup failed:', error?.message || error);
      results = null;
    }
    if (Array.isArray(results) && results.length) {
      docHits = results
        .filter((entry) => entry?.row && typeof entry.row.text === 'string')
        .filter((entry) => entry?.score == null || entry.score >= KNOWLEDGE_DOC_MIN_SCORE)
        .slice(0, limit)
        .map(formatKnowledgeDocHit)
        .filter(Boolean);
    }
  }

  if (docHits.length < limit) {
    const fallbackLimit = Math.max(limit, docHits.length ? limit - docHits.length : limit);
    const keywordHits = await fetchKnowledgeDocsKeywordFallback({ query, limit: fallbackLimit });
    docHits = mergeKnowledgeDocResults(docHits, keywordHits).slice(0, limit);
  }

  return docHits;
}

async function fetchKnowledgeSnippets({ content, guildId, channelId, openai, limit = KNOWLEDGE_LIMIT } = {}) {
  const query = sanitizeQuery(content).slice(0, 400);
  if (!query) return [];

  const [legacy, docs] = await Promise.all([
    fetchLegacyKnowledge({ query, guildId, channelId, limit }),
    fetchKnowledgeDocs({ query, openai, limit: KNOWLEDGE_DOC_LIMIT }),
  ]);

  const combined = legacy.concat(docs).filter(Boolean);
  if (combined.length <= 1) return combined;
  combined.sort((a, b) => {
    const scoreA = typeof a.score === 'number' ? a.score : 0;
    const scoreB = typeof b.score === 'number' ? b.score : 0;
    return scoreB - scoreA;
  });
  return combined;
}

module.exports = {
  fetchKnowledgeSnippets,
};
