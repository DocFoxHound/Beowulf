const fs = require("node:fs");
const { createRecentGathering, getAllRecentGatherings, deleteRecentGathering, updateRecentGathering } = require("../api/recentGatheringsApi.js");
const { getAllVoiceSessionsLastHour } = require("../api/voiceChannelSessionsApi.js");


async function checkRecentGatherings(client, openai) {
    console.log("Checking recent gatherings...");
    try {
        // 1. Get all voice sessions from the last hour
        const sessions = await getAllVoiceSessionsLastHour();
        if (!sessions || !Array.isArray(sessions)) return;

        // 2. Group sessions by channel
        const channelSessions = {};
        for (const session of sessions) {
            if (!channelSessions[session.channel_id]) channelSessions[session.channel_id] = [];
            channelSessions[session.channel_id].push(session);
        }

        // 3. For each channel, find intervals with 3+ users present
        for (const [channel_id, sessArr] of Object.entries(channelSessions)) {
            // Build timeline of join/leave events
            const events = [];
            for (const s of sessArr) {
                    let username;
                    try {
                        const user = await client.users.fetch(s.user_id);
                        username = user ? user.username : undefined;
                    } catch (err) {
                        console.error(`Failed to fetch username for user_id ${s.user_id}:`, err);
                    }
                    events.push({ time: new Date(s.joined_at), type: 'join', user_id: s.user_id, username });
                    events.push({ time: new Date(s.left_at), type: 'leave', user_id: s.user_id, username });
            }
            // Sort events by time
            events.sort((a, b) => a.time - b.time);

            let currentUsers = new Map();
            let gatheringActive = false;
            let gatheringStartTime = null;
            let gatheringUserIds = [];
            let gatheringUsernames = [];
            // Fetch recent gatherings for this channel in the last hour
            const allGatherings = await getAllRecentGatherings();
            const now = new Date();
            let recentGathering = null;
            if (Array.isArray(allGatherings)) {
                recentGathering = allGatherings.find(g => g.channel_id === channel_id &&
                    g.timestamp && (now - new Date(g.timestamp)) <= 60 * 60 * 1000);
            }

            for (const event of events) {
                if (event.type === 'join') {
                    currentUsers.set(event.user_id, event.username);
                } else {
                    currentUsers.delete(event.user_id);
                }
                // Gathering starts
                if (!gatheringActive && currentUsers.size >= 3) {
                    gatheringActive = true;
                    gatheringStartTime = event.time;
                    gatheringUserIds = Array.from(currentUsers.keys());
                    gatheringUsernames = Array.from(currentUsers.values());
                }
                // Gathering ends
                if (gatheringActive && currentUsers.size < 3) {
                    gatheringActive = false;
                    // Log the gathering
                    const gatheringData = {
                        channel_id,
                        channel_name: sessArr[0].channel_name,
                        user_ids: gatheringUserIds,
                        usernames: gatheringUsernames,
                        timestamp: gatheringStartTime.toISOString(),
                        end_timestamp: event.time.toISOString(),
                    };
                    await createRecentGathering(gatheringData);
                    gatheringStartTime = null;
                    gatheringUserIds = [];
                    gatheringUsernames = [];
                }
            }
            // If gathering is still active at the end, log it
            if (gatheringActive) {
                const gatheringData = {
                    channel_id,
                    channel_name: sessArr[0].channel_name,
                    user_ids: gatheringUserIds,
                    usernames: gatheringUsernames,
                    timestamp: gatheringStartTime.toISOString(),
                    end_timestamp: events[events.length-1].time.toISOString(),
                };
                await createRecentGathering(gatheringData);
            }
        }
    } catch (error) {
        console.error("Error in checkRecentGatherings:", error);
    }
}

module.exports = {
    checkRecentGatherings,
}