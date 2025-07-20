const fs = require("node:fs");
const { createRecentGathering, getAllRecentGatherings, deleteRecentGathering } = require("../api/recentGatheringsApi.js");


async function checkRecentGatherings(client, openai) {
    try {
        // 1. Delete old gatherings (>12 hours)
        const allGatherings = await getAllRecentGatherings();
        if (Array.isArray(allGatherings)) {
            const now = Date.now();
            const twelveHoursMs = 12 * 60 * 60 * 1000;
            for (const gathering of allGatherings) {
                const gatheringTime = new Date(gathering.timestamp).getTime();
                if (now - gatheringTime > twelveHoursMs) {
                    await deleteRecentGathering(gathering.id);
                }
            }
        }

        // 2. Log current gatherings
        for (const [guildId, guild] of client.guilds.cache) {
            const voiceChannels = guild.channels.cache.filter(
                channel => channel.type === 2 // 2 = GuildVoice
            );

            for (const [channelId, channel] of voiceChannels) {
                let members;
                try {
                    members = channel.members;
                } catch {
                    members = undefined;
                }
                if (!members || members.size === 0) {
                    continue; // Skip channels with no members
                }

                const userIds = [];
                const usernames = [];
                members.forEach(member => {
                    if (!member.user.bot) {
                        userIds.push(member.user.id);
                        usernames.push(member.user.username);
                    }
                });

                if (userIds.length === 0) continue;

                const gatheringData = {
                    id: Math.floor(10000000 + Math.random() * 90000000),
                    channel_id: channel.id,
                    channel_name: channel.name,
                    user_ids: userIds,
                    usernames: usernames,
                    timestamp: new Date().toISOString()
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