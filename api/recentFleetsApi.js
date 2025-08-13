const axios = require('axios');

async function getAllRecentFleets() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_FLEETS}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all recent fleets:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createRecentFleet(fleetData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_FLEETS}/`;
    try {
        const response = await axios.post(apiUrl, fleetData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating recent fleet:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteRecentFleet(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_FLEETS}/${id}`;
    try {
        await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting recent fleet:', error.response ? error.response.data : error.message);
        return false;
    }
}

async function updateRecentFleet(id, fleetData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_FLEETS}/${id}`;
    try {
        const response = await axios.put(apiUrl, fleetData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating recent fleet:', error.response ? error.response.data : error.message);
        return null;
    }
}

// GET recent fleets within a timeframe
async function getRecentFleetsWithinTimeframe(start, end) {
    if (!start || !end) {
        throw new Error('Start and end parameters are required');
    }
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_RECENT_FLEETS}/timeframe?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching recent fleets within timeframe:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllRecentFleets,
    createRecentFleet,
    updateRecentFleet,
    deleteRecentFleet,
    getRecentFleetsWithinTimeframe
};