const axios = require('axios');

// Simple safe stringifier to avoid crashes on unexpected structures
function safeStringify(obj) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
}

function digitsOnly(str) {
    return String(str || '').replace(/\D+/g, '');
}

function normalizeAirOrGround(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s.startsWith('a')) return 'air';
    if (s.startsWith('g')) return 'ground';
    if (s.startsWith('m')) return 'mixed';
    return s || undefined;
}

function sanitizeHitPayload(input) {
    const p = { ...(input || {}) };
    // Normalize basic types
    if (p.user_id !== undefined) p.user_id = digitsOnly(p.user_id);
    if (p.id !== undefined && typeof p.id !== 'number') {
        const n = Number(p.id); if (Number.isFinite(n)) p.id = Math.trunc(n);
    }
    if (p.timestamp instanceof Date) p.timestamp = p.timestamp.toISOString();
    if (p.air_or_ground !== undefined) p.air_or_ground = normalizeAirOrGround(p.air_or_ground);
    if (Array.isArray(p.assists)) p.assists = p.assists.map(digitsOnly).filter(Boolean);
    if (Array.isArray(p.cargo)) {
        p.cargo = p.cargo.map(c => ({
            commodity_name: c?.commodity_name || c?.name || '',
            commodity_code: c?.commodity_code || c?.code || undefined,
            scuAmount: Number(c?.scuAmount || c?.scu || 0),
            avg_price: Number(c?.avg_price || c?.price || 0),
        }));
    }
    // Derive missing cuts if needed
    const shares = Math.max(1, (Array.isArray(p.assists) ? p.assists.length : 0) + 1);
    if (p.total_value !== undefined && p.total_cut_value === undefined) {
        const cut = Number(p.total_value) / shares; p.total_cut_value = Math.round(cut * 100) / 100;
    }
    if (p.total_scu !== undefined && p.total_cut_scu === undefined) {
        const cut = Number(p.total_scu) / shares; p.total_cut_scu = Math.round(cut * 100) / 100;
    }
    return p;
}

async function createHitLog(HitLogData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}`;
    const headers = { 'Content-Type': 'application/json' };
    // Preflight log for debugging malformed payloads
        try {
                const sanitized = sanitizeHitPayload(HitLogData);
                if (process.env.DEBUG_HIT_LOGS === '1') {
                    const typeSummary = Object.fromEntries(Object.entries(HitLogData || {}).map(([k,v]) => [k, Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v)]));
                    console.log('[hitTrackerApi.createHitLog] URL:', apiUrl);
                    console.log('[hitTrackerApi.createHitLog] Headers:', headers);
                    console.log('[hitTrackerApi.createHitLog] Payload types:', safeStringify(typeSummary));
                    console.log('[hitTrackerApi.createHitLog] Payload (truncated):', safeStringify({
                        id: sanitized?.id,
                        user_id: sanitized?.user_id,
                        username: sanitized?.username,
                        air_or_ground: sanitized?.air_or_ground,
                        total_value: sanitized?.total_value,
                        total_cut_value: sanitized?.total_cut_value,
                        total_scu: sanitized?.total_scu,
                        total_cut_scu: sanitized?.total_cut_scu,
                        patch: sanitized?.patch,
                        has_cargo: Array.isArray(sanitized?.cargo),
                        cargo_len: Array.isArray(sanitized?.cargo) ? sanitized.cargo.length : undefined,
                        assists_len: Array.isArray(sanitized?.assists) ? sanitized.assists.length : undefined,
                    }));
                }
        } catch (preLogErr) {
                if (process.env.DEBUG_HIT_LOGS === '1') console.warn('[hitTrackerApi.createHitLog] Failed to log preflight payload:', preLogErr?.message || preLogErr);
        }
    try {
        const response = await axios.post(apiUrl, sanitizeHitPayload(HitLogData), { headers });
                if (process.env.DEBUG_HIT_LOGS === '1') {
                    console.log('[hitTrackerApi.createHitLog] Response status:', response.status, response.statusText);
                    console.log('[hitTrackerApi.createHitLog] Response data summary:', safeStringify({
                        id: response?.data?.id ?? response?.data?.entry_id ?? null,
                        thread_id: response?.data?.thread_id ?? null,
                        ok: !!response?.data,
                    }));
                }
        return response.data;  // Return the created HitLog data
    } catch (error) {
        const errResp = error?.response;
                console.error('[hitTrackerApi.createHitLog] Error creating HitLog:', safeStringify({ message: error?.message, status: errResp?.status, statusText: errResp?.statusText, data: errResp?.data }));
        return null;  // Return null if there's an error
    }
}

async function getAllHitLogs() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all HitLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getHitLogsByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user HitLogs by Player ID:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getHitLogByEntryId(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/entry`;
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
        console.error('Error fetching HitLog by entry ID:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getHitLogByThreadId(thread_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/thread`;
    try {
        const response = await axios.get(apiUrl, { params: { thread_id } });
        const data = response.data;
        if (Array.isArray(data)) return data[0] || null;
        return data || null;
    } catch (error) {
        console.error('Error fetching HitLog by thread ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getHitLogsByPatch(patch) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/patch`;
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

async function getHitLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/userandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user HitLogs by Owner ID and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAssistHitLogs(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/assists`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id,
            }
        });
        return response.data || [];  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching assistant HitLogs:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAssistHitLogsByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/assistsuserpatch`;
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
        console.error('Error fetching assistant HitLogs by user and patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}


//this isn't setup for editing yet, but is just a copy of editUser
async function editHitLog(HitLogId, updatedHitLogData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/${HitLogId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedHitLogData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating HitLog: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteHitLog(id) {
    console.log("Deleting HitLog")
    // Ensure we pass the ID via both URL and body for compatibility with API variants
    const idNum = Number(digitsOnly(id));
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_HIT_TRACKR}/${idNum || ''}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            },
            // Some backends require the ID in the request body even for DELETE
            data: { id: idNum }
        });
        return true;
    } catch (error) {
        console.error('Error deleting HitLog: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createHitLog,
    getAllHitLogs,
    editHitLog,
    deleteHitLog,
    getHitLogsByPatch,
    getHitLogsByUserAndPatch,
    getAssistHitLogs,
    getAssistHitLogsByUserAndPatch,
    getHitLogByEntryId,
    getHitLogByThreadId,
    getHitLogsByUserId,
};
