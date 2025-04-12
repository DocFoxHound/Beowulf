const axios = require('axios');

async function createEntry(newEntry) {
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

async function getEntriesBetweenDates(startDate, endDate) {
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/betweendates`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                startdate: startDate.toISOString(),
                enddate: endDate.toISOString()
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching users in Queue:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getEntryById(entryId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/completedEntry/${entryId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function getEntryByUserAndClass(userId, classId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/completedEntry/user/${userId}/class/${classId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}


async function editEntry(entryId, updatedEntryData) {
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/${entryId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedEntryData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating Entry in CompletedQueue: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteEntry(entryId) {
    console.log("Deleting Entry from class table")
    console.log("entryId: ", entryId)
    const apiUrl = `${process.env.SERVER_URL}/api/completedEntry/${entryId}`; 
    try {
        const response = await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting entry in completed queue Table: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createEntry,
    getEntries,
    getEntryById,
    editEntry,
    deleteEntry,
    getEntryByUserAndClass,
    getEntriesBetweenDates
};
