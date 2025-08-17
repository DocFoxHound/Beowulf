const axios = require('axios');

// Base path for knowledge endpoints; fallback to '/api/knowledge' if env var not set
function baseUrl() {
    const root = process.env.SERVER_URL || '';
    const path = process.env.API_KNOWLEDGE_ROUTES || '/api/knowledge';
    return `${root}${path}`;
}

// GET /api/knowledge
// Supports query params: q, category, guild_id, channel_id, tag, tags_any, tags_all, limit, offset, order
async function listKnowledge(params = {}) {
    const url = `${baseUrl()}`;
    try {
        const { data } = await axios.get(url, { params });
        return data;
    } catch (error) {
        console.error('Error listing knowledge:', error.response ? error.response.data : error.message);
        return null;
    }
}

// GET /api/knowledge/:id
async function getKnowledgeById(id) {
    const url = `${baseUrl()}/${id}`;
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (error) {
        console.error('Error fetching knowledge by id:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Helpers to sanitize payloads for stricter validators
function sanitizeDocLevel1(doc) {
    const out = {};
    for (const [k, v] of Object.entries(doc || {})) {
        if (v === undefined || v === null) continue;
        if (k === 'content') out.content = String(v).slice(0, 12000);
        else if (k === 'title') out.title = String(v).slice(0, 300);
        else if (k === 'tags') {
            if (Array.isArray(v)) out.tags = v.map(s => String(s).slice(0, 64)).slice(0, 20);
    } else if (['source','category','section','guild_id','channel_id','url','version'].includes(k)) {
            out[k] = v;
        }
        // drop any other unknown fields at level1
    }
    return out;
}

function minimalDoc(doc) {
    return {
    source: doc?.source || 'discord',
        category: doc?.category || 'chat',
        title: String(doc?.title || 'Untitled').slice(0, 300),
        content: String(doc?.content || '').slice(0, 12000),
    section: String(doc?.section || 'note'),
    guild_id: doc?.guild_id,
    channel_id: doc?.channel_id,
    tags: Array.isArray(doc?.tags) ? doc.tags.slice(0, 10) : [],
    url: doc?.url || `discord://note/${Date.now()}`,
    version: doc?.version || 'v1',
    };
}

// POST /api/knowledge with fallbacks for validation errors
async function createKnowledge(doc) {
    const url = `${baseUrl()}`;
    try {
        const { data } = await axios.post(url, doc, { headers: { 'Content-Type': 'application/json' } });
        return data;
    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        console.error('Error creating knowledge (primary):', { status, data });
        // Retry with sanitized payload
        try {
            const doc1 = sanitizeDocLevel1(doc);
            const { data: data1 } = await axios.post(url, doc1, { headers: { 'Content-Type': 'application/json' } });
            return data1;
        } catch (error2) {
            const status2 = error2?.response?.status;
            const data2 = error2?.response?.data;
            console.error('Error creating knowledge (sanitized):', { status: status2, data: data2 });
            // Final fallback: minimal payload
            try {
                const doc2 = minimalDoc(doc);
                // Log compact shape to help debugging
                console.error('createKnowledge minimal payload (shape):', {
                    has_source: !!doc2.source,
                    category: doc2.category,
                    section: doc2.section,
                    has_title: !!doc2.title,
                    content_len: (doc2.content || '').length,
                    has_guild: !!doc2.guild_id,
                    has_channel: !!doc2.channel_id,
                    tags_len: Array.isArray(doc2.tags) ? doc2.tags.length : 0,
                });
                const { data: data2ok } = await axios.post(url, doc2, { headers: { 'Content-Type': 'application/json' } });
                return data2ok;
            } catch (error3) {
                const status3 = error3?.response?.status;
                const data3 = error3?.response?.data;
                console.error('Error creating knowledge (minimal):', { status: status3, data: data3 });
                return null;
            }
        }
    }
}

// PUT /api/knowledge/:id
async function updateKnowledge(id, doc) {
    const url = `${baseUrl()}/${id}`;
    try {
        await axios.put(url, doc, { headers: { 'Content-Type': 'application/json' } });
        return true;
    } catch (error) {
        console.error('Error updating knowledge:', error.response ? error.response.data : error.message);
        return false;
    }
}

// DELETE /api/knowledge/:id
async function deleteKnowledge(id) {
    const url = `${baseUrl()}/${id}`;
    try {
        await axios.delete(url, { headers: { 'Content-Type': 'application/json' } });
        return true;
    } catch (error) {
        console.error('Error deleting knowledge:', error.response ? error.response.data : error.message);
        return false;
    }
}

// POST /api/knowledge/search/vector
// { queryEmbedding: number[], limit?, filter_category?, filter_guild_id?, filter_channel_id? }
async function vectorSearchKnowledge(body) {
    const url = `${baseUrl()}/search/vector`;
    try {
        const { data } = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
        return data;
    } catch (error) {
        console.error('Error vector-searching knowledge:', error.response ? error.response.data : error.message);
        return null;
    }
}

// PUT /api/knowledge/:id/embedding { embedding: number[] }
async function updateKnowledgeEmbedding(id, embedding) {
    const url = `${baseUrl()}/${id}/embedding`;
    try {
        await axios.put(url, { embedding }, { headers: { 'Content-Type': 'application/json' } });
        return true;
    } catch (error) {
        console.error('Error updating knowledge embedding:', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    listKnowledge,
    getKnowledgeById,
    createKnowledge,
    updateKnowledge,
    deleteKnowledge,
    vectorSearchKnowledge,
    updateKnowledgeEmbedding,
};
