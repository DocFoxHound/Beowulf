const axios = require('axios');


async function getAllGameVersions() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_GAME_VERSION}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function createGameVersion(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_GAME_VERSION}`;
    try {
        /// Create a new city if it does not exist
        await axios.post(apiUrl, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error creating or updating game versions: ', error.response ? error.response.data : error.message);
    }
}

module.exports = {
    getAllGameVersions,
    createGameVersion,
}