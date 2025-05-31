const axios = require('axios');

async function createPlayerShip(PlayerShipData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CUSTOM_SHIP}`;
    try {
        const response = await axios.post(apiUrl, PlayerShipData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created PlayerShip data
    } catch (error) {
        console.error('Error creating PlayerShip:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getPlayerShipsByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CUSTOM_SHIP}/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user PlayerShips:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getPlayerShipByEntryId(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CUSTOM_SHIP}/entry`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                id: id
            }
        });
        // Ensure the function returns a single object
        const data = response.data;
        if (Array.isArray(data)) {
            return data[0] || null; // Return the first object or null if the array is empty
        }
        return data; // Return the object directly if it's not an array
    } catch (error) {
        console.error('Error fetching PlayerShip by entry ID:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getPlayerShipsByUexShipId(uex_ship_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CUSTOM_SHIP}/uexshipid`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                uex_ship_id: uex_ship_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user PlayerShips:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

//this isn't setup for editing yet, but is just a copy of editUser
async function editPlayerShip(playerShipId, updatedPlayerShipData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CUSTOM_SHIP}/${playerShipId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedPlayerShipData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating PlayerShip: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deletePlayerShip(id) {
    console.log("Deleting PlayerShip")
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CUSTOM_SHIP}/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting PlayerShip: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createPlayerShip,
    getPlayerShipsByUserId,
    editPlayerShip,
    deletePlayerShip,
    getPlayerShipsByUexShipId,
    getPlayerShipByEntryId
};
