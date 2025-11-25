const axios = require('axios');

function baseUrl() {
    const root = process.env.SERVER_URL || '';
    const path = process.env.API_ITEMS_FPS_ROUTES || '/api/items-fps';
    return `${root}${path}`;
}

async function listItemsFps(params = {}) {
    const url = `${baseUrl()}`;
    try {
        const { data } = await axios.get(url, { params });
        return data;
    } catch (error) {
        console.error('Error listing FPS items:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function getItemsFpsById(id) {
    const url = `${baseUrl()}/${id}`;
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (error) {
        if (error?.response?.status === 404) return null;
        console.error('Error fetching FPS item:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function createItemsFps(doc) {
    const url = `${baseUrl()}`;
    try {
        const { data } = await axios.post(url, doc, { headers: { 'Content-Type': 'application/json' } });
        return data;
    } catch (error) {
        console.error('Error creating FPS item:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function updateItemsFps(id, patch) {
    const url = `${baseUrl()}/${id}`;
    try {
        const { data } = await axios.put(url, patch, { headers: { 'Content-Type': 'application/json' } });
        return data;
    } catch (error) {
        if (error?.response?.status === 404) return null;
        console.error('Error updating FPS item:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function deleteItemsFps(id) {
    const url = `${baseUrl()}/${id}`;
    try {
        await axios.delete(url, { headers: { 'Content-Type': 'application/json' } });
        return true;
    } catch (error) {
        if (error?.response?.status === 404) return false;
        console.error('Error deleting FPS item:', error?.response?.data || error?.message || error);
        return false;
    }
}

module.exports = {
    listItemsFps,
    getItemsFpsById,
    createItemsFps,
    updateItemsFps,
    deleteItemsFps,
};
