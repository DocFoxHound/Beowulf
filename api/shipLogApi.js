const axios = require('axios');
const logger = require('../logger');

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

async function getShipLogsByCommanderId(commander) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/commander`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                commander: commander
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs by Commander ID:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getShipLogsByOwnerId(owner_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/owner`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                owner_id: owner_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs by Owner ID:', error.response ? error.response.data : error.message);
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
        console.error('Error fetching user ShipLogs by Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}
///user2/:id/patch/:patch

async function getShipLogsByOwnerAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/ownerandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                owner_id: coupling.owner_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs by Owner ID and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getShipLogsByCommanderAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/commanderandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                commander: coupling.commander,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user ShipLogs by Commander and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}


async function getCrewShipLogs(user_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/crew`;
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

async function getCrewShipLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/shiplog/crewuserpatch`;
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
    editShipLog,
    deleteShipLog,
    getShipLogsByPatch,
    getShipLogsByOwnerAndPatch,
    getShipLogsByCommanderAndPatch,
    getCrewShipLogs,
    getCrewShipLogsByUserAndPatch,
    getShipLogByEntryId,
    getShipLogsByCommanderId,
    getShipLogsByOwnerId
};
