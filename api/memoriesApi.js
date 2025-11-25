const axios = require('axios');

function baseUrl() {
    const root = process.env.SERVER_URL || '';
    const path = process.env.API_MEMORIES_ROUTES || '/api/memories';
    return `${root}${path}`;
}

function logError(action, error) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    console.error(`[MemoriesApi] ${action} failed:`, status ? { status, data } : (error?.message || error));
}

async function listMemories(params = {}) {
    try {
        const { data } = await axios.get(baseUrl(), { params });
        return data;
    } catch (error) {
        logError('list', error);
        return null;
    }
}

async function getMemoryById(id) {
    if (!id) return null;
    try {
        const { data } = await axios.get(`${baseUrl()}/${id}`);
        return data;
    } catch (error) {
        logError('getById', error);
        return null;
    }
}

async function createMemory(doc) {
    try {
        const { data } = await axios.post(baseUrl(), doc, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('create', error);
        return null;
    }
}

async function updateMemory(id, doc) {
    if (!id) return null;
    try {
        const { data } = await axios.put(`${baseUrl()}/${id}`, doc, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('update', error);
        return null;
    }
}

async function patchMemory(id, doc) {
    if (!id) return null;
    try {
        const { data } = await axios.patch(`${baseUrl()}/${id}`, doc, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('patch', error);
        return null;
    }
}

async function deleteMemory(id) {
    if (!id) return false;
    try {
        await axios.delete(`${baseUrl()}/${id}`, {
            headers: { 'Content-Type': 'application/json' },
        });
        return true;
    } catch (error) {
        logError('delete', error);
        return false;
    }
}

async function vectorSearchMemories(body) {
    try {
        const { data } = await axios.post(`${baseUrl()}/search/vector`, body, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('vectorSearch', error);
        return null;
    }
}

async function updateMemoryEmbedding(id, embedding) {
    if (!id) return false;
    try {
        await axios.put(`${baseUrl()}/${id}/embedding`, { embedding }, {
            headers: { 'Content-Type': 'application/json' },
        });
        return true;
    } catch (error) {
        logError('updateEmbedding', error);
        return false;
    }
}

module.exports = {
    listMemories,
    getMemoryById,
    createMemory,
    updateMemory,
    patchMemory,
    deleteMemory,
    vectorSearchMemories,
    updateMemoryEmbedding,
};
