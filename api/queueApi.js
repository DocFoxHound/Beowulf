const axios = require('axios');
const logger = require('../logger');

async function deleteUserInQueue(userId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.delete(`${apiUrl}/api/queue/${userId}`);
        return true;  // This now properly returns the response data to the caller
    } catch (error) {
        console.error('Error removing user from Queue: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function getUsersInQueue() {
    const apiUrl = `${process.env.SERVER_URL}/api/queue/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching users in Queue:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getUserById(userId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/queue/${userId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function editUserInQueue(userId, updatedUserData) {
    const apiUrl = `${process.env.SERVER_URL}/api/queue/${userId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedUserData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating user in Queue: ', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function createUserInQueue(newUser) {
    console.log("Inserting new user into Queue")
    const apiUrl = `${process.env.SERVER_URL}/api/queue/`; 
    try {
        const response = await axios.post(apiUrl, newUser, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error placing user in Queue: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function editOrAddUserInQueue(userId, updatedUserData) {
    try {
        // Try to edit the user in the queue
        const editResult = await editUserInQueue(userId, updatedUserData);
        if (editResult) {
            return true;
        }
    } catch (error) {
        // If the user is not found (404 error), add the user to the queue
        if (error.response && error.response.status === 404) {
            console.log(`User not found in queue, creating new user: ${userId}`);
            return await createUserInQueue(updatedUserData);
        } else {
            console.error('Error editing or adding user in Queue: ', error.response ? error.response.data : error.message);
            return false;
        }
    }
}

module.exports = {
    createUserInQueue,
    getUsersInQueue,
    getUserById,
    editUserInQueue,
    deleteUserInQueue,
    editOrAddUserInQueue
};
