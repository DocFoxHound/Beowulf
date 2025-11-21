const { listKnowledge } = require('../../api/knowledgeApi');

const KNOWLEDGE_LIMIT = Number(process.env.CHATGPT_KNOWLEDGE_LIMIT || 3);
const KNOWLEDGE_ENABLED = (process.env.CHATGPT_KNOWLEDGE_LOOKUP || 'true').toLowerCase() === 'true';

function sanitizeQuery(text) {
  if (!text) return '';
  return String(text).replace(/<@!?\d+>/g, '').replace(/<#[0-9]+>/g, '').replace(/<@&[0-9]+>/g, '').trim();
}

async function fetchKnowledgeSnippets({ content, guildId, channelId, limit = KNOWLEDGE_LIMIT } = {}) {
  if (!KNOWLEDGE_ENABLED) return [];
  const query = sanitizeQuery(content).slice(0, 200);
  if (!query) return [];

  try {
    const params = { q: query, limit, order: 'created_at.desc' };
    if (guildId) params.guild_id = guildId;
    if (channelId) params.channel_id = channelId;
    const rows = await listKnowledge(params);
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows.slice(0, limit).map((row) => ({
      id: row.id,
      title: row.title || row.section || 'Knowledge snippet',
      content: (row.content || '').slice(0, 480),
      source: row.source || 'knowledge',
      tags: Array.isArray(row.tags) ? row.tags.slice(0, 5) : [],
      url: row.url || null,
    }));
  } catch (error) {
    console.error('[ChatGPT][Knowledge] lookup failed:', error?.message || error);
    return [];
  }
}

module.exports = {
  fetchKnowledgeSnippets,
};
