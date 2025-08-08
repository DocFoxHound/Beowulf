const fs = require("node:fs");
const { createRecentGathering, getAllRecentGatherings, deleteRecentGathering, updateRecentGathering, getRecentGatheringsWithinTimeframe } = require("../api/recentGatheringsApi.js");
const { getAllVoiceSessionsLastHour } = require("../api/voiceChannelSessionsApi.js");


async function checkRecentGatherings(client, openai, session, users) {
    console.log("Checking recent gatherings...");
    try {
        // Get current time and one hour ago
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        // Format as ISO string for API
        const start = oneHourAgo.toISOString();
        const end = now.toISOString();

        // Retrieve recent gatherings within the last hour
        const recentGatherings = await getRecentGatheringsWithinTimeframe(start, end) || [];

        // Find gathering for this channel
        let gathering = recentGatherings.find(g => String(g.channel_id) === String(session.channelId));

        // Get user IDs and usernames from session/users
        const userIds = session.userIds;
        // Try to get usernames from Discord client if not provided
        let usernames = [];
        if (users && users.length > 0 && typeof users[0] === 'object' && users[0].username) {
            usernames = users.map(u => u.username);
        } else {
            // Fallback: fetch usernames from client
            for (const userId of userIds) {
                try {
                    const member = await client.users.fetch(userId);
                    usernames.push(member.username);
                } catch (e) {
                    usernames.push("Unknown");
                }
            }
        }

        if (gathering) {
            // Update user_ids and usernames arrays to include any new users
            const updatedUserIds = Array.from(new Set([...gathering.user_ids, ...userIds]));
            const updatedUsernames = Array.from(new Set([...gathering.usernames, ...usernames]));
            // Update timestamp (not created_at)
            const updatedGathering = {
                ...gathering,
                user_ids: updatedUserIds,
                usernames: updatedUsernames,
                timestamp: now.toISOString(),
                // Do not touch created_at
            };
            await updateRecentGathering(gathering.id, updatedGathering);
            console.log(`Updated recent gathering for channel ${session.channelName}`);
        } else {
            // Create new gathering
            const newGathering = {
                id: `${Date.now()}_${session.channelId}`,
                channel_id: session.channelId,
                channel_name: session.channelName,
                user_ids: userIds,
                usernames: usernames,
                timestamp: now.toISOString(),
                created_at: now.toISOString()
            };
            await createRecentGathering(newGathering);
            console.log(`Created new recent gathering for channel ${session.channelName}`);
        }
        console.log("Recent gatherings checked successfully.");
    } catch (error) {
        console.error("Error in checkRecentGatherings:", error);
    }
}

module.exports = {
    checkRecentGatherings,
}