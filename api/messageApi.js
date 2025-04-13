const axios = require('axios');

async function getMessages() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_MSG}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching classes in class table:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function createMessage(chunk){
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_MSG}/`;
    try {
        const response = await axios.post(apiUrl, chunk, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error saving message: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteMessagesBeforeDate() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_MSG}/older-than`; 
    const date = new Date();
    date.setDate(date.getDate() - 30);  // Subtract 3 days from the current date
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

async function deleteMessagesByCount(channel, number) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_MSG}/name/${channel}/number/${number}`;
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting threads: ', error.response ? error.response.data : error.message);
        return false;
    }

}

module.exports = {
    createMessage,
    deleteMessagesBeforeDate,
    getMessages,
    deleteMessagesByCount
};