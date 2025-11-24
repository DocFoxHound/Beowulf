const axios = require('axios');

function baseUrl() {
  const root = process.env.SERVER_URL || '';
  const path = process.env.API_RCO_MINING_DATA_ROUTES || '/api/rco-mining-data';
  return `${root}${path}`;
}

async function listRcoMiningData(params = {}) {
  const url = `${baseUrl()}`;
  try {
    const { data } = await axios.get(url, { params });
    return data;
  } catch (error) {
    console.error('[RcoMiningDataApi] list failed:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function getRcoMiningDataById(id) {
  const url = `${baseUrl()}/${id}`;
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    console.error('[RcoMiningDataApi] get failed:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function createRcoMiningData(doc) {
  const url = `${baseUrl()}`;
  try {
    const { data } = await axios.post(url, doc, { headers: { 'Content-Type': 'application/json' } });
    return data;
  } catch (error) {
    console.error('[RcoMiningDataApi] create failed:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function updateRcoMiningData(id, patch) {
  const url = `${baseUrl()}/${id}`;
  try {
    const { data } = await axios.put(url, patch, { headers: { 'Content-Type': 'application/json' } });
    return data;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    console.error('[RcoMiningDataApi] update failed:', error?.response?.data || error?.message || error);
    return null;
  }
}

async function deleteRcoMiningData(id) {
  const url = `${baseUrl()}/${id}`;
  try {
    await axios.delete(url, { headers: { 'Content-Type': 'application/json' } });
    return true;
  } catch (error) {
    if (error?.response?.status === 404) return false;
    console.error('[RcoMiningDataApi] delete failed:', error?.response?.data || error?.message || error);
    return false;
  }
}

module.exports = {
  listRcoMiningData,
  getRcoMiningDataById,
  createRcoMiningData,
  updateRcoMiningData,
  deleteRcoMiningData,
};
