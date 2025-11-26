const { getAllVoiceSessions, updateVoiceSession } = require("../api/voiceChannelSessionsApi");
const { normalizeSession, calculateSessionMinutes } = require("./voice-channel-sessions.js");

function hasNullishMinutes(rawMinutes) {
    if (rawMinutes === null || rawMinutes === undefined || rawMinutes === "") {
        return true;
    }
    const numeric = Number(rawMinutes);
    return Number.isNaN(numeric);
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
        let repaired = 0;
        for (const rawSession of allSessions) {
            scanned += 1;
            if (!hasNullishMinutes(rawSession?.minutes)) {
                continue;
            }

            const normalized = normalizeSession(rawSession, guildId);
            if (!normalized?.id) {
                continue; // Cannot update without an identifier.
            }

            const { joinedIso, leftIso } = deriveFallbackTimestamps(rawSession);
            const requiresFallbackTimestamps = !normalized.joined_at || !normalized.left_at;
            const joinedAt = normalized.joined_at || joinedIso;
            const leftAt = normalized.left_at || leftIso;

            const recalculatedMinutes = requiresFallbackTimestamps
                ? 1
                : calculateSessionMinutes(joinedAt, leftAt, 1);

            await updateVoiceSession(normalized.id, {
                minutes: recalculatedMinutes,
                joined_at: joinedAt,
                left_at: leftAt,
                guild_id: normalized.guild_id || guildId,
            });
            repaired += 1;
        }

        if (repaired > 0) {
            console.info(`[VoiceSessionRepair] Repaired ${repaired} session minute value(s) across ${scanned} record(s).`);
        } else {
            console.info(`[VoiceSessionRepair] No null minute sessions detected across ${scanned} record(s).`);
        }
        return { scanned, repaired };
    } catch (error) {
        console.error("[VoiceSessionRepair] Failed to repair sessions:", error);
        throw error;
    }
}

module.exports = {
    repairVoiceSessionsWithNullMinutes,
};
