const { getAllVoiceSessions, deleteVoiceSession } = require("../api/voiceChannelSessionsApi");
const { normalizeSession } = require("./voice-channel-sessions.js");

function hasMissingUserId(rawSession = {}) {
    const userId = rawSession.user_id || rawSession.userId || rawSession.user?.id;
    if (userId === null || userId === undefined) return true;
    return String(userId).trim().length === 0;
}

function deriveFallbackTimestamps(rawSession = {}) {
    const createdSource = rawSession.created_at || rawSession.createdAt || rawSession.updated_at || rawSession.timestamp || new Date().toISOString();
    const createdDate = new Date(createdSource);
    const safeCreated = Number.isFinite(createdDate.getTime()) ? createdDate : new Date();
    const joinedIso = safeCreated.toISOString();
    const leftIso = new Date(safeCreated.getTime() + 60000).toISOString();
    return { joinedIso, leftIso };
}

async function repairVoiceSessionsWithNullMinutes(guildId) {
    try {
        const allSessions = await getAllVoiceSessions();
        if (!Array.isArray(allSessions) || allSessions.length === 0) {
            console.info("[VoiceSessionRepair] No voice sessions returned by API; nothing to repair.");
            return { scanned: 0, repaired: 0 };
        }

        let scanned = 0;
        let deleted = 0;
        for (const rawSession of allSessions) {
            scanned += 1;
            if (!hasMissingUserId(rawSession)) {
                continue;
            }

            const normalized = normalizeSession(rawSession, guildId);
            if (!normalized?.id) {
                continue; // Cannot update without an identifier.
            }

            await deleteVoiceSession(normalized.id);
            deleted += 1;
        }

        if (deleted > 0) {
            console.info(`[VoiceSessionRepair] Deleted ${deleted} session(s) missing user ids across ${scanned} record(s).`);
        } else {
            console.info(`[VoiceSessionRepair] No sessions missing user ids detected across ${scanned} record(s).`);
        }
        return { scanned, deleted };
    } catch (error) {
        console.error("[VoiceSessionRepair] Failed to repair sessions:", error);
        throw error;
    }
}

module.exports = {
    repairVoiceSessionsWithNullMinutes,
};
