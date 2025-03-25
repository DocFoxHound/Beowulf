const axios = require('axios');

async function createThreadDb(threadData) {
    const apiUrl = `${process.env.SERVER_URL}/api/threads`;
    try {
        const response = await axios.post(apiUrl, threadData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created badge data
    } catch (error) {
        console.error('Error creating thread:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getThreadByMessageId(message_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/threads/message`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                message_id: message_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching thread:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function deleteThreadsBeforeDate() {
    const apiUrl = `${process.env.SERVER_URL}/api/threads/older-than`; 
    const date = new Date();
    date.setDate(date.getDate() - 3);  // Subtract 3 days from the current date
    const formattedDate = date.toISOString();  // Format the date as an ISO string
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            },
            data: {
                date: formattedDate
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting threads: ', error.response ? error.response.data : error.message);
        return false;
    }
}

//this isn't setup for editing yet, but is just a copy of editUser
async function editThread(message_id, updatedThreadData) {
    const apiUrl = `${process.env.SERVER_URL}/api/threads/${message_id}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedThreadData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updated thread: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createThreadDb,
    getThreadByMessageId,
    deleteThreadsBeforeDate,
    editThread
};
