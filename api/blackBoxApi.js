const axios = require('axios');

async function createBlackBox(BlackBoxData) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox`;
    try {
        const response = await axios.post(apiUrl, BlackBoxData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created BlackBox data
    } catch (error) {
        console.error('Error creating BlackBox:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAllBlackBoxes() {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all BlackBoxs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getBlackBoxesByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user BlackBoxs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getBlackBoxByEntryId(id) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/entry`;
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
        console.error('Error fetching BlackBox by entry ID:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getBlackBoxesByPatch(patch) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/patch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                patch: patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user BlackBoxs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}
///user2/:id/patch/:patch

async function getBlackBoxesByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/userandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user BlackBoxs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

// async function getAssistantBlackBox(coupling) {
//     const apiUrl = `${process.env.SERVER_URL}/api/blackbox/assistantbox`;
//     try {
//         const response = await axios.get(apiUrl, {
//             params: {
//                 user_id: coupling.user_id,
//                 parent_entry: coupling.parent_entry
//             }
//         });
//         return response.data;  // This will be the return value of the function
//     } catch (error) {
//         console.error('Error fetching user BlackBoxs:', error.response ? error.response.data : error.message);
//         return null;  // Return null if there's an error
//     }
// }


async function getAssistantBlackBoxes(user_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/assistantbox`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id,
            }
        });
        return response.data || [];  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching assistant BlackBoxs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAssistantBlackBoxesByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/assistantboxuserpatch`;
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
        console.error('Error fetching assistant BlackBoxs by user and patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}


//this isn't setup for editing yet, but is just a copy of editUser
async function editBlackBox(BlackBoxId, updatedBlackBoxData) {
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/${BlackBoxId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedBlackBoxData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating BlackBox: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteBlackBox(id) {
    console.log("Deleting BlackBox")
    const apiUrl = `${process.env.SERVER_URL}/api/blackbox/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting BlackBox: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createBlackBox,
    getAllBlackBoxes,
    getBlackBoxesByUserId,
    editBlackBox,
    deleteBlackBox,
    getBlackBoxesByPatch,
    getBlackBoxesByUserAndPatch,
    getAssistantBlackBoxes,
    getAssistantBlackBoxesByUserAndPatch,
    getBlackBoxByEntryId
};
