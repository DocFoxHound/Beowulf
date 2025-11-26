const { getAllVoiceSessions, deleteVoiceSession } = require("../api/voiceChannelSessionsApi");
const { normalizeSession } = require("./voice-channel-sessions.js");

async function repairVoiceSessionsWithNullMinutes(guildId) {
    try {
        const allSessions = await getAllVoiceSessions();
        if (!Array.isArray(allSessions) || allSessions.length === 0) {
            console.info("[VoiceSessionRepair] No voice sessions returned by API; nothing to delete.");
            return { scanned: 0, deleted: 0 };
        }

        let scanned = 0;
        let deleted = 0;
        for (const rawSession of allSessions) {
            scanned += 1;
            const normalized = normalizeSession(rawSession, guildId);
            if (!normalized?.id) {
                continue;
            }

            await deleteVoiceSession(normalized.id);
            deleted += 1;
        }

        console.info(`[VoiceSessionRepair] Deleted ${deleted} session(s) out of ${scanned} fetched record(s).`);
        return { scanned, deleted };
    } catch (error) {
        console.error("[VoiceSessionRepair] Failed to repair sessions:", error);
        throw error;
    }
}

module.exports = {
    repairVoiceSessionsWithNullMinutes,
};
