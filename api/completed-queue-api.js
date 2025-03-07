const axios = require('axios');

async function createEntry(newEntry) {
    console.log("Inserting new Completed Entry")
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/`; 
    try {
        const response = await axios.post(apiUrl, newEntry, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error placing user in CompletedQueue: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteEntry(user) {
    console.log("Deleting user from CompletedQueue")
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/`; 
    try {
        const response = await axios.delete(apiUrl, user, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error placing user in CompletedQueue: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function getEntries() {
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching users in Queue:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getEntryById(userId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/completedEntry/${userId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}


async function editEntry(userId, updatedUserData) {
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/${userId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedUserData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating user in CompletedQueue: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createEntry,
    getEntries,
    getEntryById,
    editEntry,
    deleteEntry
};
