const axios = require('axios');

async function createShipLog(ShipLogData) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog`;
    try {
        const response = await axios.post(apiUrl, ShipLogData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created ShipLog data
    } catch (error) {
        console.error('Error creating ShipLog:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAllShipLogs() {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all ShipLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getShipLogsByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getShipLogByEntryId(id) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/entry`;
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
        console.error('Error fetching ShipLog by entry ID:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getShipLogsByPatch(patch) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/patch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                patch: patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}
///user2/:id/patch/:patch

async function getShipLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/userandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

// async function getAssistantShipLog(coupling) {
//     const apiUrl = `${process.env.SERVER_URL}/api/shiplog/assistantbox`;
//     try {
//         const response = await axios.get(apiUrl, {
//             params: {
//                 user_id: coupling.user_id,
//                 parent_entry: coupling.parent_entry
//             }
//         });
//         return response.data;  // This will be the return value of the function
//     } catch (error) {
//         console.error('Error fetching user ShipLogs:', error.response ? error.response.data : error.message);
//         return null;  // Return null if there's an error
//     }
// }


async function getAssistantShipLogs(user_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/assistantbox`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id,
            }
        });
        return response.data || [];  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching assistant ShipLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAssistantShipLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/assistantboxuserpatch`;
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
        console.error('Error fetching assistant ShipLogs by user and patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}


//this isn't setup for editing yet, but is just a copy of editUser
async function editShipLog(ShipLogId, updatedShipLogData) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/${ShipLogId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedShipLogData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating ShipLog: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteShipLog(id) {
    console.log("Deleting ShipLog")
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting ShipLog: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createShipLog,
    getAllShipLogs,
    getShipLogsByUserId,
    editShipLog,
    deleteShipLog,
    getShipLogsByPatch,
    getShipLogsByUserAndPatch,
    getAssistantShipLogs,
    getAssistantShipLogsByUserAndPatch,
    getShipLogByEntryId
};
