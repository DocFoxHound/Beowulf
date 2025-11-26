const { getAllVoiceSessions, updateVoiceSession } = require("../api/voiceChannelSessionsApi");
const { normalizeSession, calculateSessionMinutes } = require("./voice-channel-sessions.js");

function hasNullishMinutes(rawMinutes) {
    if (rawMinutes === null || rawMinutes === undefined || rawMinutes === "") {
        return true;
    }
    const numeric = Number(rawMinutes);
    return Number.isNaN(numeric);
}

async function repairVoiceSessionsWithNullMinutes(guildId) {
    try {
        const allSessionsRaw = await getAllVoiceSessions();
        if (!Array.isArray(allSessionsRaw) || allSessionsRaw.length === 0) {
            return { scanned: 0, repaired: 0 };
        }

        let repaired = 0;
        let scanned = 0;
        for (const rawSession of allSessionsRaw) {
            scanned += 1;
            if (!hasNullishMinutes(rawSession.minutes)) {
                continue;
            }

            const normalized = normalizeSession(rawSession, guildId);
            if (!normalized?.id || !normalized.joined_at || !normalized.left_at) {
                continue; // Can't fix without a full session record.
            }

            const recalculatedMinutes = calculateSessionMinutes(normalized.joined_at, normalized.left_at, 1);
            if (!Number.isFinite(recalculatedMinutes)) {
                continue;
            }

            await updateVoiceSession(normalized.id, {
                minutes: recalculatedMinutes,
                joined_at: normalized.joined_at,
                left_at: normalized.left_at,
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
