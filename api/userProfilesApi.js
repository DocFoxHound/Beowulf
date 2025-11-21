const axios = require('axios');

function baseUrl() {
    const root = process.env.SERVER_URL || '';
    const path = process.env.API_USER_PROFILES_ROUTES || '/api/userprofiles';
    return `${root}${path}`;
}

function logError(action, error) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    console.error(`[UserProfilesApi] ${action} failed:`, status ? { status, data } : (error?.message || error));
}

async function listUserProfiles(params = {}) {
    try {
        const { data } = await axios.get(baseUrl(), { params });
        return data;
    } catch (error) {
        logError('list', error);
        return null;
    }
}

async function getUserProfile(userId) {
    if (!userId) return null;
    try {
        const { data } = await axios.get(`${baseUrl()}/${userId}`);
        return data;
    } catch (error) {
        logError('getById', error);
        return null;
    }
}

async function createUserProfile(doc) {
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

async function updateUserProfile(userId, doc) {
    if (!userId) return null;
    try {
        const { data } = await axios.put(`${baseUrl()}/${userId}`, doc, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('update', error);
        return null;
    }
}

async function patchUserProfile(userId, doc) {
    if (!userId) return null;
    try {
        const { data } = await axios.patch(`${baseUrl()}/${userId}`, doc, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('patch', error);
        return null;
    }
}

async function deleteUserProfile(userId) {
    if (!userId) return false;
    try {
        await axios.delete(`${baseUrl()}/${userId}`, {
            headers: { 'Content-Type': 'application/json' },
        });
        return true;
    } catch (error) {
        logError('delete', error);
        return false;
    }
}

module.exports = {
    listUserProfiles,
    getUserProfile,
    createUserProfile,
    updateUserProfile,
    patchUserProfile,
    deleteUserProfile,
};
