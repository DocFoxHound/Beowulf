const axios = require('axios');

const MAX_VOICE_SESSION_MINUTES = 32767;

function clampMinutesValue(value) {
    const numericMinutes = Number(value);
    if (!Number.isFinite(numericMinutes)) {
        return 0;
    }
    const rounded = Math.round(numericMinutes);
    if (rounded < 0) return 0;
    if (rounded > MAX_VOICE_SESSION_MINUTES) return MAX_VOICE_SESSION_MINUTES;
    return rounded;
}

function sanitizeVoiceSessionPayload(payload = {}) {
    const sanitized = {};
    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined) {
            continue;
        }

        if (key === 'minutes') {
            sanitized.minutes = clampMinutesValue(value);
            continue;
        }

        sanitized[key] = value;
    }

    if (sanitized.minutes === undefined) {
        sanitized.minutes = 0;
    }

    return sanitized;
}

function ensureVoiceSessionIdentifier(payload = {}) {
    const hasValidId = typeof payload.id === 'string'
        ? payload.id.trim().length > 0
        : payload.id != null;
    if (hasValidId) {
        return payload;
    }

    const userFragmentSource = payload.user_id || payload.userId || 'user';
    const userFragment = String(userFragmentSource).slice(-6) || 'user';
    const randomFragment = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    const generatedId = `${Date.now()}_${userFragment}_${randomFragment}`;

    return {
        ...payload,
        id: generatedId,
    };
}

async function getAllVoiceSessions({ pageSize = 500, maxPages = 500, order = 'id.asc' } = {}) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_VOICE_CHANNEL_SESSION}/`;
    const sessions = [];
    let offset = 0;

    try {
        for (let page = 0; page < maxPages; page++) {
            const params = { limit: pageSize, offset };
            if (order) params.order = order;

            const response = await axios.get(apiUrl, { params });
            const rows = Array.isArray(response.data)
                ? response.data
                : Array.isArray(response.data?.data)
                    ? response.data.data
                    : [];

            if (!rows.length) {
                break;
            }

            sessions.push(...rows);

            if (rows.length < pageSize) {
                break; // Last partial page fetched.
            }

            offset += rows.length;
        }

        return sessions;
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
        const payloadWithId = ensureVoiceSessionIdentifier(gatheringData);
        const sanitizedPayload = sanitizeVoiceSessionPayload(payloadWithId);
        const response = await axios.post(apiUrl, sanitizedPayload, {
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
        const sanitizedPayload = sanitizeVoiceSessionPayload(updateData);
        const response = await axios.put(apiUrl, sanitizedPayload, {
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