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
        let skippedHealthy = 0;
        let skippedNoId = 0;
        let skippedOtherGuild = 0;

        const isNullMinutes = (value) => value === null || value === undefined;
        const isInvalidMinutes = (value) => {
            if (isNullMinutes(value)) return true;
            if (typeof value === 'string' && value.trim() === '') return true;
            const numeric = Number(value);
            return !Number.isFinite(numeric);
        };

        const matchesGuild = (rawSession) => {
            if (!guildId) return true;
            const sessionGuildId = rawSession?.guild_id ?? rawSession?.guildId;
            if (sessionGuildId === null || sessionGuildId === undefined || String(sessionGuildId).trim() === '') {
                // Older rows may not have guild_id; don't assume mismatch.
                return true;
            }
            return String(sessionGuildId) === String(guildId);
        };

        for (const rawSession of allSessions) {
            scanned += 1;
            if (!matchesGuild(rawSession)) {
                skippedOtherGuild += 1;
                continue;
            }

            // Only delete sessions whose minutes are actually missing/invalid.
            // NOTE: normalizeSession coerces non-numeric minutes to 0, so we must inspect rawSession.minutes.
            if (!isInvalidMinutes(rawSession?.minutes)) {
                skippedHealthy += 1;
                continue;
            }

            const normalized = normalizeSession(rawSession, guildId);
            const sessionId = normalized?.id ? String(normalized.id).trim() : '';
            if (!sessionId) {
                skippedNoId += 1;
                continue;
            }

            const ok = await deleteVoiceSession(sessionId);
            if (ok) deleted += 1;
        }

        console.info(
            `[VoiceSessionRepair] scanned=${scanned} deleted=${deleted} skippedHealthy=${skippedHealthy} skippedNoId=${skippedNoId} skippedOtherGuild=${skippedOtherGuild}`
        );
        return { scanned, deleted, skippedHealthy, skippedNoId, skippedOtherGuild };
    } catch (error) {
        console.error("[VoiceSessionRepair] Failed to repair sessions:", error);
        throw error;
    }
}

module.exports = {
    repairVoiceSessionsWithNullMinutes,
};
