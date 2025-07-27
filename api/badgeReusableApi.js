const axios = require('axios');

// Get all badge reusables
async function getAllBadgeReusables() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGE_REUSABLES_ROUTES}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all badge reusables:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Get all active badge reusables (deleted !== true)
async function getActiveBadgeReusables() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGE_REUSABLES_ROUTES}`;
    try {
        const response = await axios.get(`${apiUrl}/active`);
        return response.data;
    } catch (error) {
        console.error('Error fetching active badge reusables:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Get badge reusables by ID (expects id as query param)
async function getBadgeReusableById(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGE_REUSABLES_ROUTES}`;
    try {
        const response = await axios.get(`${apiUrl}/id`, { params: { id } });
        return response.data;
    } catch (error) {
        console.error('Error fetching badge reusable by ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Create a new badge reusable
async function createBadgeReusable(badgeData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGE_REUSABLES_ROUTES}`;
    try {
        const response = await axios.post(apiUrl, badgeData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating badge reusable:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Update a badge reusable by ID
async function updateBadgeReusable(id, badgeData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGE_REUSABLES_ROUTES}`;
    try {
        const response = await axios.put(`${apiUrl}/${id}`, badgeData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating badge reusable:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Delete a badge reusable by ID
async function deleteBadgeReusable(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGE_REUSABLES_ROUTES}`;
    try {
        const response = await axios.delete(`${apiUrl}/${id}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting badge reusable:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllBadgeReusables,
    getActiveBadgeReusables,
    getBadgeReusableById,
    createBadgeReusable,
    updateBadgeReusable,
    deleteBadgeReusable
};