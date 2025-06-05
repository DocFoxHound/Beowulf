const axios = require('axios');


// Get all fleets
async function getAllFleets() {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.get(apiBase);
        return response.data;
    } catch (error) {
        console.error('Error fetching all fleets:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Get fleets by commander user ID
async function getFleetsByCommanderId(user_id) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.get(`${apiBase}/commander`, {
            params: { user_id }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching fleets by commander:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Get fleet by fleet ID
async function getFleetById(id) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.get(`${apiBase}/fleet`, {
            params: { id }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching fleet by ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Get fleets by member user ID
async function getFleetByMember(user_id) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.get(`${apiBase}/members`, {
            params: { user_id }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching fleets by member:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Get fleets by activity (active or not)
async function getFleetsByActivityOrNot(activeOrNot) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.get(`${apiBase}/activeornot`, {
            params: { activeOrNot }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching fleets by activity:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Create a new fleet
async function createFleet(fleetData) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.post(apiBase, fleetData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating fleet:', error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Update a fleet by ID.
 * @param {string|number} id - Fleet ID.
 * @param {object} updatedFleetData - Data to update, may include 'action' and 'changed_user_id'.
 * @returns {Promise<object|null>}
 */
async function updateFleet(id, updatedFleetData) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.put(`${apiBase}/${id}`, updatedFleetData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating fleet:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Delete a fleet by ID
async function deleteFleet(id) {
    const apiBase = `${process.env.SERVER_URL}${process.env.API_USER_FLEETS}`;
    try {
        const response = await axios.delete(`${apiBase}/${id}`, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error deleting fleet:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllFleets,
    getFleetsByCommanderId,
    getFleetById,
    getFleetByMember,
    getFleetsByActivityOrNot,
    createFleet,
    updateFleet,
    deleteFleet
};
