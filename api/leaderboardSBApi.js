const axios = require('axios');

async function getAllPlayerLeaderboardEntries() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all leaderboard entries:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getPlayerLeaderboardEntryById(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/${id}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching leaderboard entry by ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createPlayerLeaderboardLogEntry(entryData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/`;
    try {
        const response = await axios.post(apiUrl, entryData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createPlayerLeaderboardEntriesBulk(entriesArray) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/bulk`;
    try {
        const response = await axios.post(apiUrl, entriesArray, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating leaderboard entries in bulk:', error.response ? error.response.data : error.message);
        return null;
    }
}


async function updatePlayerLeaderboardEntry(id, updatedEntryData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/${id}`;
    try {
        const response = await axios.put(apiUrl, updatedEntryData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deletePlayerLeaderboardEntry(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/${id}`;
    try {
        const response = await axios.delete(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error deleting leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteAllPlayerLeaderboardEntries() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/`;
    try {
        const response = await axios.delete(apiUrl, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error deleting all leaderboard entries:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getAllOrgLeaderboardEntries() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all leaderboard entries:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getOrgLeaderboardEntryById(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/${id}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching leaderboard entry by ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createOrgLeaderboardLogEntry(entryData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/`;
    try {
        const response = await axios.post(apiUrl, entryData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createOrgLeaderboardEntriesBulk(entriesArray) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/bulk`;
    try {
        const response = await axios.post(apiUrl, entriesArray, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating leaderboard entries in bulk:', error.response ? error.response.data : error.message);
        return null;
    }
}


async function updateOrgLeaderboardEntry(id, updatedEntryData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/${id}`;
    try {
        const response = await axios.put(apiUrl, updatedEntryData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteOrgLeaderboardEntry(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/${id}`;
    try {
        const response = await axios.delete(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error deleting leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteAllOrgLeaderboardEntries() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB_ORG}/`;
    try {
        const response = await axios.delete(apiUrl, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error deleting all leaderboard entries:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllPlayerLeaderboardEntries,
    getPlayerLeaderboardEntryById,
    createPlayerLeaderboardLogEntry,
    createPlayerLeaderboardEntriesBulk,
    updatePlayerLeaderboardEntry,
    deletePlayerLeaderboardEntry,
    deleteAllPlayerLeaderboardEntries,
    getAllOrgLeaderboardEntries,
    getOrgLeaderboardEntryById,
    createOrgLeaderboardLogEntry,
    createOrgLeaderboardEntriesBulk,
    updateOrgLeaderboardEntry,
    deleteOrgLeaderboardEntry,
    deleteAllOrgLeaderboardEntries,
};