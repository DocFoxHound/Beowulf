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

module.exports = {
    getAllRecentGatherings,
    createRecentGathering,
    deleteRecentGathering
};
