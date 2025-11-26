
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { updateVoiceSession, createVoiceSession, getAllActiveVoiceSessions } = require("../api/voiceChannelSessionsApi");
const { ChannelType } = require("discord.js");
const { checkRecentGatherings } = require("./recent-gatherings.js");
const { checkRecentGangs } = require("./recent-fleets.js");

const MAX_VOICE_SESSION_MINUTES = 32767;

function normalizeSession(rawSession = {}, fallbackGuildId) {
    const parsedMinutes = Number(rawSession.minutes);
    const boundedMinutes = Number.isFinite(parsedMinutes)
        ? Math.min(MAX_VOICE_SESSION_MINUTES, Math.max(0, Math.round(parsedMinutes)))
        : 0;
    const normalized = {
        id: String(rawSession.id ?? rawSession.session_id ?? ""),
        user_id: rawSession.user_id || rawSession.userId || rawSession.user || null,
        channel_id: rawSession.channel_id || rawSession.channelId || null,
        channel_name: rawSession.channel_name || rawSession.channelName || null,
        joined_at: rawSession.joined_at || rawSession.joinedAt || null,
        left_at: rawSession.left_at || rawSession.leftAt || null,
        minutes: boundedMinutes,
        guild_id: rawSession.guild_id || rawSession.guildId || fallbackGuildId,
    };
    return normalized;
}

function clampSessionMinutes(value, fallback = 1) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        const rounded = Math.round(numeric);
        return Math.max(1, Math.min(MAX_VOICE_SESSION_MINUTES, rounded));
    }
    const fallbackNumeric = Number(fallback);
    if (Number.isFinite(fallbackNumeric) && fallbackNumeric > 0) {
        const rounded = Math.round(fallbackNumeric);
        return Math.max(1, Math.min(MAX_VOICE_SESSION_MINUTES, rounded));
    }
    return 1;
}

function ensureJoinedAt(session, fallbackIso) {
    if (session?.joined_at) return session.joined_at;
    if (session?.joinedAt) return session.joinedAt;
    if (fallbackIso) return fallbackIso;
    return new Date().toISOString();
}

// Ensures we never send NaN/null minutes back to the API when closing a session.
function calculateSessionMinutes(joinedAt, leftAt, fallbackMinutes = 1) {
    const joinedTimestamp = Date.parse(joinedAt);
    const leftTimestamp = Date.parse(leftAt);
    if (Number.isFinite(joinedTimestamp) && Number.isFinite(leftTimestamp) && leftTimestamp >= joinedTimestamp) {
        const diffMinutes = Math.round((leftTimestamp - joinedTimestamp) / 60000);
        return clampSessionMinutes(diffMinutes, fallbackMinutes);
    }
    return clampSessionMinutes(fallbackMinutes, 1);
}

function generateSessionId(userId, channelId) {
    const userSegment = String(userId || "user").slice(-6);
    const channelSegment = String(channelId || "chan").slice(-6);
    const unique = randomUUID ? randomUUID() : Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    return `${Date.now()}_${userSegment}_${channelSegment}_${unique}`;
}


async function voiceChannelSessions(client, openai) {
    const guildId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID;
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error("Guild not found");
            return [];
        }
        await guild.channels.fetch();
        // await guild.members.fetch();

        // Use voiceStates for accurate membership
        const voiceStates = guild.voiceStates.cache;
        const channelUserMap = {};
        // Get AFK channel ID from env
        const afkChannelId = process.env.LIVE_ENVIRONMENT === "true" ? process.env.AFK_CHANNEL : process.env.TEST_AFK_CHANNEL;

        // Map: channelId -> [userId], ignore AFK channel
        voiceStates.forEach(voiceState => {
            const channelId = voiceState.channelId;
            if (!channelId || channelId === afkChannelId) return; // User not in a voice channel or in AFK channel
            if (!channelUserMap[channelId]) channelUserMap[channelId] = [];
            channelUserMap[channelId].push(voiceState.member.user.id);
        });

        // Get all active sessions from API
        const activeSessionsRaw = await getAllActiveVoiceSessions() || [];
        const activeSessions = activeSessionsRaw
            .map(session => normalizeSession(session, guildId))
            .filter(session => session?.user_id);

        const activeSessionsByUser = new Map();
        for (const session of activeSessions) {
            if (!activeSessionsByUser.has(session.user_id)) {
                activeSessionsByUser.set(session.user_id, []);
            }
            activeSessionsByUser.get(session.user_id).push(session);
        }

        const handledSessionIds = new Set();
        const now = new Date();
        const nowIso = now.toISOString();

        const closeSession = async (session) => {
            if (session.left_at) {
                return;
            }
            const joinedAt = ensureJoinedAt(session, nowIso);
            const minutes = calculateSessionMinutes(joinedAt, nowIso, 1);
            const payload = {
                ...session,
                joined_at: joinedAt,
                left_at: nowIso,
                minutes,
                guild_id: session.guild_id || guildId,
            };
            await updateVoiceSession(session.id, payload);
            handledSessionIds.add(session.id);
        };

        const refreshSession = async (session) => {
            if (session.left_at) {
                return;
            }
            const joinedAt = ensureJoinedAt(session, nowIso);
            const minutes = calculateSessionMinutes(joinedAt, nowIso, 1);
            const payload = {
                ...session,
                joined_at: joinedAt,
                left_at: null,
                minutes,
                guild_id: session.guild_id || guildId,
            };
            await updateVoiceSession(session.id, payload);
            handledSessionIds.add(session.id);
        };

        // Process current channel occupancy
        for (const [channelId, userIds] of Object.entries(channelUserMap)) {
            if (channelId === afkChannelId) continue;

            for (const userId of userIds) {
                const sessionsForUser = (activeSessionsByUser.get(userId) || []).filter(s => !s.left_at);
                const matchingSession = sessionsForUser.find(s => s.channel_id === channelId);

                if (matchingSession) {
                    await refreshSession(matchingSession);
                    continue;
                }

                const sessionToClose = sessionsForUser.find(s => !handledSessionIds.has(s.id));
                if (sessionToClose) {
                    await closeSession(sessionToClose);
                }

                const channel = guild.channels.cache.get(channelId);
                const newSession = {
                    id: generateSessionId(userId, channelId),
                    user_id: userId,
                    channel_id: channelId,
                    channel_name: channel ? channel.name : "Unknown",
                    joined_at: nowIso,
                    left_at: null,
                    minutes: 1,
                    guild_id: guildId,
                };
                await createVoiceSession(newSession);
            }
        }

        // Close sessions for users no longer present (or sitting in AFK)
        for (const session of activeSessions) {
            if (handledSessionIds.has(session.id)) {
                continue;
            }

            await closeSession(session);
        }

        // Optional: log current state
        guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).forEach(channel => {
            const users = channelUserMap[channel.id] || [];
                // If 3 or more users, call checkRecentGatherings
                // if (users.length >= 3) {
                //     const session = {
                //         channelId: channel.id,
                //         channelName: channel.name,
                //         userIds: users
                //     };
                //     checkRecentGatherings(client, openai, session, users);
                // }
                // If 3 or more users, call checkRecentGatherings
                if (users.length >= 3) {
                    const session = {
                        channelId: channel.id,
                        channelName: channel.name,
                        userIds: users
                    };
                    // checkRecentGatherings(client, openai, session, users);
                    checkRecentGangs(client, openai, session, users);
                }
        });
    } catch (error) {
        console.error("Error in voiceChannelSessions:", error);
        return [];
    }
}

module.exports = {
    voiceChannelSessions,
    normalizeSession,
    calculateSessionMinutes,
}