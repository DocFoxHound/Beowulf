const axios = require('axios');

async function createBadge(badgeData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGES}`;
    try {
        const response = await axios.post(apiUrl, badgeData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created badge data
    } catch (error) {
        console.error('Error creating badge:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAllBadges() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGES}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all badges:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getBadgesByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGES}/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user badges:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getBadgesByPatch(patch) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGES}/patch`;
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

//this isn't setup for editing yet, but is just a copy of editUser
async function editBadge(badgeId, updatedBadgeData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGES}/${badgeId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedBadgeData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating badge: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteBadge(id) {
    console.log("Deleting badge")
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_BADGES}/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting badge: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createBadge,
    getAllBadges,
    getBadgesByUserId,
    editBadge,
    deleteBadge,
    getBadgesByPatch
};
