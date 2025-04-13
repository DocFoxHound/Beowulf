const axios = require('axios');

async function createHitLog(HitLogData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}`;
    try {
        const response = await axios.post(apiUrl, HitLogData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created HitLog data
    } catch (error) {
        console.error('Error creating HitLog:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAllHitLogs() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all HitLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getHitLogsByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user HitLogs by Player ID:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getHitLogByEntryId(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/entry`;
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
        console.error('Error fetching HitLog by entry ID:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getHitLogsByPatch(patch) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/patch`;
    console.log("Patch: ", patch)
    try {
        const response = await axios.get(apiUrl, {
            params: {
                patch: patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user HitLogs by Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getHitLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/userandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user HitLogs by Owner ID and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAssistHitLogs(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/assists`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id,
            }
        });
        return response.data || [];  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching assistant HitLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAssistHitLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/assistsuserpatch`;
    // console.log(coupling)
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data || [];  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching assistant HitLogs by user and patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}


//this isn't setup for editing yet, but is just a copy of editUser
async function editHitLog(HitLogId, updatedHitLogData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/${HitLogId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedHitLogData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating HitLog: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteHitLog(id) {
    console.log("Deleting HitLog")
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting HitLog: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createHitLog,
    getAllHitLogs,
    editHitLog,
    deleteHitLog,
    getHitLogsByPatch,
    getHitLogsByUserAndPatch,
    getAssistHitLogs,
    getAssistHitLogsByUserAndPatch,
    getHitLogByEntryId,
    getHitLogsByUserId,
};
