const axios = require('axios');

async function createKey(keyData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_AUTH_KEY}`;
    try {
        const response = await axios.post(apiUrl, keyData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created key data
    } catch (error) {
        console.error('Error creating key:', error);
        return null;  // Return null if there's an error
    }
}

async function getAllKeys() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_AUTH_KEY}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all keys:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getKeyByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_AUTH_KEY}/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user keys:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

//this isn't setup for editing yet, but is just a copy of editUser
async function editKey(keyId, updatedKeyData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_AUTH_KEY}/${keyId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedKeyData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating key: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteKey(id) {
    console.log("Deleting key")
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_AUTH_KEY}/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting key: ', error.response ? error.response.data : error.message);
        return false;
    }
}


async function validateKey(key) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_AUTH_KEY}/validatekey`;
    try {
        const response = await axios.post(apiUrl, {
            params: {
                key: key
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user keys:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

module.exports = {
    createKey,
    getClasses: getAllKeys,
    getKeyByUserId,
    editKey,
    deleteKey,
    validateKey
};
