const axios = require('axios');

function baseUrl() {
    const root = process.env.SERVER_URL || '';
    const path = process.env.API_ITEMS_COMPONENTS_ROUTES || '/api/items-components';
    return `${root}${path}`;
}

async function listItemsComponents(params = {}) {
    const url = `${baseUrl()}`;
    try {
        const { data } = await axios.get(url, { params });
        return data;
    } catch (error) {
        console.error('Error listing component items:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function getItemsComponentById(id) {
    const url = `${baseUrl()}/${id}`;
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (error) {
        if (error?.response?.status === 404) return null;
        console.error('Error fetching component item:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function createItemsComponent(doc) {
    const url = `${baseUrl()}`;
    try {
        const { data } = await axios.post(url, doc, { headers: { 'Content-Type': 'application/json' } });
        return data;
    } catch (error) {
        console.error('Error creating component item:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function updateItemsComponent(id, patch) {
    const url = `${baseUrl()}/${id}`;
    try {
        const { data } = await axios.put(url, patch, { headers: { 'Content-Type': 'application/json' } });
        return data;
    } catch (error) {
        if (error?.response?.status === 404) return null;
        console.error('Error updating component item:', error?.response?.data || error?.message || error);
        return null;
    }
}

async function deleteItemsComponent(id) {
    const url = `${baseUrl()}/${id}`;
    try {
        await axios.delete(url, { headers: { 'Content-Type': 'application/json' } });
        return true;
    } catch (error) {
        if (error?.response?.status === 404) return false;
        console.error('Error deleting component item:', error?.response?.data || error?.message || error);
        return false;
    }
}

module.exports = {
    listItemsComponents,
    getItemsComponentById,
    createItemsComponent,
    updateItemsComponent,
    deleteItemsComponent,
};
