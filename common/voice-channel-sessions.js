
const fs = require("node:fs");
const { updateVoiceSession, createVoiceSession, getAllActiveVoiceSessions } = require("../api/voiceChannelSessionsApi");
const { ChannelType } = require("discord.js");
const { checkRecentGatherings } = require("./recent-gatherings.js");
const { checkRecentGangs } = require("./recent-fleets.js")


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
        const activeSessions = await getAllActiveVoiceSessions() || [];
        const now = new Date();

        // Track users currently in voice
        const currentUserIds = new Set();
        Object.values(channelUserMap).forEach(userIds => userIds.forEach(id => currentUserIds.add(id)));

        // 1. Update minutes for users still in channel or who switched channels
        for (const session of activeSessions) {
            // Find the user's current channel (if any)
            let currentChannelId = null;
            for (const [chanId, userIds] of Object.entries(channelUserMap)) {
                if (userIds.includes(session.user_id)) {
                    currentChannelId = chanId;
                    break;
                }
            }

            // If user is in AFK channel, close session and do not create a new one
            if (currentChannelId === afkChannelId) {
                const leftAt = now.toISOString();
                const joinedAt = new Date(session.joined_at);
                const diffMs = new Date(leftAt) - joinedAt;
                const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
                const updatedSession = {
                    ...session,
                    left_at: leftAt,
                    minutes: diffMinutes,
                    guild_id: session.guild_id || guildId
                };
                await updateVoiceSession(session.id, updatedSession);
                continue;
            }

            if (currentChannelId === session.channel_id && currentChannelId !== null) {
                // User is still in the same voice channel, increment minutes
                const updatedSession = {
                    ...session,
                    minutes: (parseInt(session.minutes) || 0) + 1,
                    guild_id: session.guild_id || guildId
                };
                await updateVoiceSession(session.id, updatedSession);
            } else if (currentChannelId !== null && currentChannelId !== session.channel_id) {
                // User switched channels: close old session, create new one
                const leftAt = now.toISOString();
                const joinedAt = new Date(session.joined_at);
                const diffMs = new Date(leftAt) - joinedAt;
                const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
                const updatedSession = {
                    ...session,
                    left_at: leftAt,
                    minutes: diffMinutes,
                    guild_id: session.guild_id || guildId
                };
                await updateVoiceSession(session.id, updatedSession);

                // Create new session for the new channel
                const channel = guild.channels.cache.get(currentChannelId);
                // Generate a unique bigint ID (timestamp in ms + last 6 digits of userId + last 6 digits of channelId)
                const ts = Date.now();
                const userPart = session.user_id.slice(-6);
                const channelPart = currentChannelId.slice(-6);
                const newId = `${Date.now()}_${userPart}_${channelPart}`;

                const newSession = {
                    id: newId,
                    user_id: session.user_id,
                    channel_id: currentChannelId,
                    channel_name: channel ? channel.name : "Unknown",
                    joined_at: now.toISOString(),
                    left_at: null,
                    minutes: 0,
                    guild_id: guildId
                };
                await createVoiceSession(newSession);
            } else {
                // User has left all voice channels, close session
                const leftAt = now.toISOString();
                const joinedAt = new Date(session.joined_at);
                const diffMs = new Date(leftAt) - joinedAt;
                const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
                const updatedSession = {
                    ...session,
                    left_at: leftAt,
                    minutes: diffMinutes,
                    guild_id: session.guild_id || guildId
                };
                await updateVoiceSession(session.id, updatedSession);
            }
        }

        // 2. Create new sessions for users who joined (no active session)
        const activeUserIds = new Set(activeSessions.filter(s => s.left_at === null).map(s => s.user_id));
        for (const [channelId, userIds] of Object.entries(channelUserMap)) {
            // Ignore AFK channel
            if (channelId === afkChannelId) continue;
            for (const userId of userIds) {
                if (!activeUserIds.has(userId)) {
                    // New user joined, create session
                    const channel = guild.channels.cache.get(channelId);
                    // Generate a unique bigint ID (timestamp in ms + last 6 digits of userId + last 6 digits of channelId)
                    const ts = Date.now();
                    const userPart = userId.slice(-6);
                    const channelPart = channelId.slice(-6);
                    const newId = `${Date.now()}_${userPart}_${channelPart}`;
                    // const newId = BigInt(`${ts}${userPart}${channelPart}`);
                    const newSession = {
                        id: newId,
                        user_id: userId,
                        channel_id: channelId,
                        channel_name: channel ? channel.name : "Unknown",
                        joined_at: now.toISOString(),
                        left_at: null,
                        minutes: 0,
                        guild_id: guildId
                    };
                    await createVoiceSession(newSession);
                }
            }
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
}