const axios = require('axios');

function baseUrl() {
  const root = process.env.SERVER_URL || '';
  const path = process.env.API_LIST_SHIPS_ROUTES || '/api/list-ships';
  return `${root}${path}`;
}

async function listShipList(params = {}) {
  const url = `${baseUrl()}`;
  try {
    const { data } = await axios.get(url, { params });
    return data;
  } catch (error) {
    console.error('Error listing ship entries:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function getShipListById(id) {
  const url = `${baseUrl()}/${id}`;
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    console.error('Error fetching ship entry:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function createShipListEntry(doc) {
  const url = `${baseUrl()}`;
  try {
    const { data } = await axios.post(url, doc, { headers: { 'Content-Type': 'application/json' } });
    return data;
  } catch (error) {
    console.error('Error creating ship entry:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function updateShipListEntry(id, patch) {
  const url = `${baseUrl()}/${id}`;
  try {
    const { data } = await axios.put(url, patch, { headers: { 'Content-Type': 'application/json' } });
    return data;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    console.error('Error updating ship entry:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function deleteShipListEntry(id) {
  const url = `${baseUrl()}/${id}`;
  try {
    await axios.delete(url, { headers: { 'Content-Type': 'application/json' } });
    return true;
  } catch (error) {
    if (error?.response?.status === 404) return false;
    console.error('Error deleting ship entry:', error?.response?.data || error?.message || error);
    return false;
  }
}

module.exports = {
  listShipList,
  getShipListById,
  createShipListEntry,
  updateShipListEntry,
  deleteShipListEntry,
};
