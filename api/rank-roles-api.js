const axios = require('axios');

async function getRanks() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_NORMAL_RANKS}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching users in Queue:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getRankById(rankId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_NORMAL_RANKS}/${rankId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}


module.exports = {
    getRanks,
    getRankById
};
