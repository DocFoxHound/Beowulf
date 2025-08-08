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
            console.log(`Session found: ${session.id} in channel ${session.channel_id}`);
            if (!channelSessions[session.channel_id]) channelSessions[session.channel_id] = [];
            channelSessions[session.channel_id].push(session);
        }

        // 3. For each channel, find intervals with 3+ users present
        for (const [channel_id, sessArr] of Object.entries(channelSessions)) {
            console.log(`Processing channel ${channel_id} with ${sessArr.length} sessions`);
            // Build timeline of join/leave events
            const events = [];
            for (const s of sessArr) {
                console.log("Session found: ", s);
                events.push({ time: new Date(s.joined_at), type: 'join', user_id: s.user_id, username: s.username });
                events.push({ time: new Date(s.left_at), type: 'leave', user_id: s.user_id, username: s.username });
            }
            // Sort events by time
            events.sort((a, b) => a.time - b.time);

            let currentUsers = new Map();
            let lastTime = null;
            // Fetch recent gatherings for this channel in the last hour
            const allGatherings = await getAllRecentGatherings();
            console.log(`Found ${allGatherings ? allGatherings.length : 0} recent gatherings for channel ${channel_id}`);
            const now = new Date();
            let recentGathering = null;
            if (Array.isArray(allGatherings)) {
                recentGathering = allGatherings.find(g => g.channel_id === channel_id &&
                    g.timestamp && (now - new Date(g.timestamp)) <= 60 * 60 * 1000);
            }

            for (const event of events) {
                console.log("Event: ", event);
                if (event.type === 'join') {
                    console.log(`User ${event.username} joined the channel`);
                    currentUsers.set(event.user_id, event.username);
                } else {
                    console.log(`User ${event.username} left the channel`);
                    currentUsers.delete(event.user_id);
                }
                // If 3+ users present, log a gathering
                if (currentUsers.size >= 3) {
                    console.log(`Gathering detected in channel ${channel_id} with ${currentUsers.size} users`);
                    // Only create or update a gathering if this is a new group or time
                    if (!lastTime || lastTime.getTime() !== event.time.getTime()) {
                        console.log("Creating or updating gathering...");
                        const user_ids = Array.from(currentUsers.keys());
                        const usernames = Array.from(currentUsers.values());
                        if (recentGathering) {
                            // Merge users into the existing gathering
                            const mergedUserIds = Array.from(new Set([...recentGathering.user_ids, ...user_ids]));
                            const mergedUsernames = Array.from(new Set([...recentGathering.usernames, ...usernames]));
                            const updatedGathering = {
                                ...recentGathering,
                                user_ids: mergedUserIds,
                                usernames: mergedUsernames,
                                timestamp: now.toISOString(),
                            };
                            await updateRecentGathering(recentGathering.id, updatedGathering);
                        } else {
                            console.log("Creating new gathering...");
                            const gatheringData = {
                                channel_id,
                                channel_name: sessArr[0].channel_name,
                                user_ids,
                                usernames,
                                timestamp: event.time.toISOString(),
                            };
                            await createRecentGathering(gatheringData);
                        }
                        lastTime = event.time;
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error in checkRecentGatherings:", error);
    }
}

module.exports = {
    checkRecentGatherings,
}