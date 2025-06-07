const axios = require('axios');

async function getAllLeaderboardEntries() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all leaderboard entries:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getLeaderboardEntryById(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/${id}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching leaderboard entry by ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createLeaderboardEntry(entryData) {
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

async function createLeaderboardEntriesBulk(entriesArray) {
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

async function updateLeaderboardEntry(id, updatedEntryData) {
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

async function deleteLeaderboardEntry(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_LEADERBOARD_SB}/${id}`;
    try {
        const response = await axios.delete(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error deleting leaderboard entry:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteAllLeaderboardEntries() {
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

module.exports = {
    getAllLeaderboardEntries,
    getLeaderboardEntryById,
    createLeaderboardEntry,
    createLeaderboardEntriesBulk,
    updateLeaderboardEntry,
    deleteLeaderboardEntry,
    deleteAllLeaderboardEntries
};