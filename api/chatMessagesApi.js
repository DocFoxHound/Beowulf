const axios = require('axios');

function baseUrl() {
    const root = process.env.SERVER_URL || '';
    const path = process.env.API_CHAT_MESSAGES_ROUTES || '/api/chatmessages';
    return `${root}${path}`;
}

function logError(action, error) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    console.error(`[ChatMessagesApi] ${action} failed:`, status ? { status, data } : (error?.message || error));
}

async function listChatMessages(params = {}) {
    try {
        const { data } = await axios.get(baseUrl(), { params });
        return data;
    } catch (error) {
        logError('list', error);
        return null;
    }
}

async function getChatMessageById(id) {
    if (!id) return null;
    try {
        const { data } = await axios.get(`${baseUrl()}/${id}`);
        return data;
    } catch (error) {
        logError('getById', error);
        return null;
    }
}

async function createChatMessage(doc) {
    try {
        const { data } = await axios.post(baseUrl(), doc, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (error) {
        logError('create', error);
        return null;
    }
}

async function deleteChatMessage(id) {
    if (!id) return false;
    try {
        await axios.delete(`${baseUrl()}/${id}`, {
            headers: { 'Content-Type': 'application/json' },
        });
        return true;
    } catch (error) {
        logError('delete', error);
        return false;
    }
}

async function deleteChatMessagesBefore({ before, guild_id, channel_id, user_id }) {
    try {
        await axios.delete(`${baseUrl()}/before`, {
            headers: { 'Content-Type': 'application/json' },
            data: { before, guild_id, channel_id, user_id },
        });
        return true;
    } catch (error) {
        logError('deleteBefore', error);
        return false;
    }
}

module.exports = {
    listChatMessages,
    getChatMessageById,
    createChatMessage,
    deleteChatMessage,
    deleteChatMessagesBefore,
};
