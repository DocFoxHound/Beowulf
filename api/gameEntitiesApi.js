const axios = require('axios');

function baseUrl() {
  const root = process.env.SERVER_URL || '';
  const path = process.env.API_GAME_ENTITIES_ROUTES || '/api/game-entities';
  return `${root}${path}`;
}

function logError(action, error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  console.error(`[GameEntitiesApi] ${action} failed:`, status ? { status, data } : (error?.message || error));
}

async function listGameEntities(params = {}) {
  try {
    const { data } = await axios.get(baseUrl(), { params });
    return data;
  } catch (error) {
    logError('list', error);
    return null;
  }
}

async function getGameEntityById(id) {
  if (!id) return null;
  try {
    const { data } = await axios.get(`${baseUrl()}/${id}`);
    return data;
  } catch (error) {
    logError('getById', error);
    return null;
  }
}

async function createGameEntity(payload) {
  try {
    const { data } = await axios.post(baseUrl(), payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    return data;
  } catch (error) {
    logError('create', error);
    return null;
  }
}

async function updateGameEntity(id, payload) {
  if (!id) return null;
  try {
    const { data } = await axios.put(`${baseUrl()}/${id}`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    return data;
  } catch (error) {
    logError('update', error);
    return null;
  }
}

async function patchGameEntity(id, payload) {
  if (!id) return null;
  try {
    const { data } = await axios.patch(`${baseUrl()}/${id}`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    return data;
  } catch (error) {
    logError('patch', error);
    return null;
  }
}

async function deleteGameEntity(id) {
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

async function searchGameEntities(body = {}) {
  try {
    const { data } = await axios.post(`${baseUrl()}/search`, body, {
      headers: { 'Content-Type': 'application/json' },
    });
    return data;
  } catch (error) {
    logError('search', error);
    return null;
  }
}

module.exports = {
  listGameEntities,
  getGameEntityById,
  createGameEntity,
  updateGameEntity,
  patchGameEntity,
  deleteGameEntity,
  searchGameEntities,
};
