const axios = require('axios');

async function getAllRecentGatherings() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_GATHERINGS}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all recent gatherings:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createRecentGathering(gatheringData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_GATHERINGS}/`;
    try {
        const response = await axios.post(apiUrl, gatheringData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating recent gathering:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteRecentGathering(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_GATHERINGS}/${id}`;
    try {
        await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting recent gathering:', error.response ? error.response.data : error.message);
        return false;
    }
}

async function updateRecentGathering(id, gatheringData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_GATHERINGS}/${id}`;
    try {
        const response = await axios.put(apiUrl, gatheringData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating recent gathering:', error.response ? error.response.data : error.message);
        return null;
    }
}

// GET recent gatherings within a timeframe
async function getRecentGatheringsWithinTimeframe(start, end) {
    if (!start || !end) {
        throw new Error('Start and end parameters are required');
    }
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_GATHERINGS}/timeframe?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching recent gatherings within timeframe:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllRecentGatherings,
    createRecentGathering,
    updateRecentGathering,
    deleteRecentGathering,
    getRecentGatheringsWithinTimeframe
};