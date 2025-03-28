const axios = require('axios');

async function createUser(newUser) {
    console.log("Inserting new user into UserList")
    const apiUrl = `${process.env.SERVER_URL}/api/users/`; 
    try {
        const response = await axios.post(apiUrl, newUser, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error placing user in UserList: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function getUsers() {
    const apiUrl = `${process.env.SERVER_URL}/api/users/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching users in UserList:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getUserById(userId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/users/${userId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function getUserByUsername(username){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/users/${username}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}


async function editUser(userId, updatedUserData) {
    const apiUrl = `${process.env.SERVER_URL}/api/users/${userId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedUserData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating user in UserList: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteUser(userId) {
    console.log("Deleting User")
    const apiUrl = `${process.env.SERVER_URL}/api/users/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting user: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createUser,
    getUsers,
    getUserById,
    editUser,
    getUserByUsername,
    deleteUser
};
