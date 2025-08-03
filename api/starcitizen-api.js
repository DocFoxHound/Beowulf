const axios = require('axios');

async function getPlayer(handle){
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_SCI_API_ROUTES}`;
    try {
        const response = await axios.get(`${apiUrl}/${handle}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

module.exports = getPlayer;
