const axios = require('axios');

async function getAllPlayerStats() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_PLAYER_STATS_ROUTES}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all playerStats:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

// Get player stats by user_id
async function getPlayerStatsByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_PLAYER_STATS_ROUTES}/${user_id}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching player stats for user_id ${user_id}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

// Refresh the player_stats materialized view
async function refreshPlayerStatsView() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_PLAYER_STATS_ROUTES}/refresh`;
    try {
        const response = await axios.post(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error refreshing player_stats materialized view:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllPlayerStats,
    getPlayerStatsByUserId,
    refreshPlayerStatsView,
};
