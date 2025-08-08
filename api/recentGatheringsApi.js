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
    console.log("Creating recent gathering...");
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
    console.log("Updating recent gathering...");
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

module.exports = {
    getAllRecentGatherings,
    createRecentGathering,
    updateRecentGathering,
    deleteRecentGathering
};
    

// RECENT GATHERINGS EXAMPLE
// {
//     "id": "12345",
//     "channel_id": "123456789012345678",
//     "channel_name": "Dogfighting Practice",
//     "user_ids": [
//         "123456789012345678",
//         "234567890123456789"
//     ],
//     "usernames": [
//         "DocHound",
//         "Kowolski"
//     ],
//     "timestamp": "2023-10-01T10:00:00Z",

// }    