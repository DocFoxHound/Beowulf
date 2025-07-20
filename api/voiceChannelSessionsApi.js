const axios = require('axios');

async function getAllVoiceSessions() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all voice sessions:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getAllVoiceSessionsLastHour() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/lasthour`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all voice sessions:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getAllActiveVoiceSessions() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/active`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching all active voice sessions:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function createVoiceSession(gatheringData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/`;
    try {
        const response = await axios.post(apiUrl, gatheringData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating voice session:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function updateVoiceSession(id, updateData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/${id}`;
    try {
        const response = await axios.put(apiUrl, updateData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating voice session:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function deleteVoiceSession(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/${id}`;
    try {
        await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting voice session:', error.response ? error.response.data : error.message);
        return false;
    }
}
module.exports = {
    getAllVoiceSessions,
    getAllVoiceSessionsLastHour,
    getAllActiveVoiceSessions,
    createVoiceSession,
    updateVoiceSession,
    deleteVoiceSession
};

// EXAMPLE VOICECHANNELSESSION OBJECT
// {
//     "user_id": "123456789012345678",
//     "channel_id": "123456789012345678",
//     "channel_name": "General",
//     "joined_at": "2023-10-01T12:00:00Z"
//     "left_at": "2023-10-01T12:00:00Z"
//     "minutes": "13"
//     "id": 12345678,
// }