const axios = require('axios');

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

// async function deleteUserInQueue(user) {
//     console.log("Deleting user from queue:", user)
//     const apiUrl = `${process.env.SERVER_URL}/api/queue/`; 
//     try {
//         const response = await axios.delete(apiUrl, user, {
//             headers: {
//                 'Content-Type': 'application/json'
//             }
//         });
//         return true;
//     } catch (error) {
//         console.error('Error removing user from Queue: ', error.response ? error.response.data : error.message);
//         return false;
//     }
// }

// async function deleteUserInQueue(user) {
//     console.log("Deleting user from queue:", user)
//     const apiUrl = `${process.env.SERVER_URL}/api/queue/${user}`; // Assuming user ID is required to delete

//     try {
//         const response = await axios.delete(apiUrl, {
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             data: user // Some APIs may require details in the request body even for DELETE requests
//         });
//         console.log('User successfully removed from queue:', response.data);
//         return true;
//     } catch (error) {
//         console.error('Error removing user from Queue:', error.response ? error.response.data : error.message);
//         return false;
//     }
// }

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
        return false;
    }
}

module.exports = {
    createUserInQueue,
    getUsersInQueue,
    getUserById,
    editUserInQueue,
    deleteUserInQueue
};
