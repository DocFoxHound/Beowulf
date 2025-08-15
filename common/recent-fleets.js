const fs = require("node:fs");
const { getAllVoiceSessionsLastHour } = require("../api/voiceChannelSessionsApi.js");
const { createRecentFleet, updateRecentFleet, getRecentFleetsWithinTimeframe } = require("../api/recentFleetsApi.js");
const { getUserBlackBoxesBetweenTimestamps } = require("../api/blackBoxApi.js");
const { getAllGameVersions } = require("../api/gameVersionApi.js");

async function checkRecentGangs(client, openai, session, users) {
    try {
        // Get current time and one hour ago
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        // Format as ISO string for API
        const start = oneHourAgo.toISOString();
        const end = now.toISOString();

        // Retrieve recent fleets within the last hour
        const recentFleets = await getRecentFleetsWithinTimeframe(start, end) || [];

        // Find fleet for this channel
        let fleet = recentFleets.find(g => String(g.channel_id) === String(session.channelId));

        // Build users array: [{ username, nickname, join_time, leave_time }]
        let usersArray = [];
        if (users && users.length > 0 && typeof users[0] === 'object' && users[0].username) {
            usersArray = users.map(u => ({
                username: u.username,
                nickname: u.nickname || u.username,
                join_time: u.join_time || new Date().toISOString(),
                leave_time: u.leave_time || null,
                pu_shipkills: 0,
                pu_fpskills: 0,
                ac_shipkills: 0,
                ac_fpskills: 0
            }));
        } else if (session.userIds && session.userIds.length > 0) {
            for (const userId of session.userIds) {
                try {
                    const member = await client.users.fetch(userId);
                    usersArray.push({
                        username: member.username,
                        nickname: member.nickname || member.username,
                        id: userId,
                        join_time: new Date().toISOString(),
                        leave_time: null,
                        pu_shipkills: 0,
                        pu_fpskills: 0,
                        ac_shipkills: 0,
                        ac_fpskills: 0,
                        stolen_cargo: 0,
                        stolen_value: 0,
                        damages: 0
                    });
                } catch (e) {
                    usersArray.push({
                        username: "Unknown",
                        nickname: "Unknown",
                        id: userId,
                        join_time: new Date().toISOString(),
                        leave_time: null,
                        pu_shipkills: 0,
                        pu_fpskills: 0,
                        ac_shipkills: 0,
                        ac_fpskills: 0,
                        stolen_cargo: 0,
                        stolen_value: 0,
                        damages: 0
                    });
                }
            }
        }

        if (fleet) {
            // Merge users arrays, updating join/leave times if needed
            const existingUsers = fleet.users || [];
            const mergedUsers = [...existingUsers];

            // Track current usernames in channel
            const currentUsernames = new Set(usersArray.map(u => u.username));

            // Update leave_time for users who left, and set leave_time to now for users still present
            for (let i = 0; i < mergedUsers.length; i++) {
                const user = mergedUsers[i];
                if (currentUsernames.has(user.username)) {
                    // User is still in channel, update leave_time to now
                    mergedUsers[i] = {
                        ...user,
                        leave_time: now.toISOString()
                    };
                } else if (!user.leave_time) {
                    // User has left, set leave_time only if not already set
                    mergedUsers[i] = {
                        ...user,
                        leave_time: now.toISOString()
                    };
                }
            }

            // Add or update users who are present
            for (const newUser of usersArray) {
                const idx = mergedUsers.findIndex(u => u.username === newUser.username);
                if (idx === -1) {
                    mergedUsers.push(newUser);
                } else {
                    // Optionally update join/leave times if needed
                    mergedUsers[idx] = {
                        ...mergedUsers[idx],
                        join_time: mergedUsers[idx].join_time || newUser.join_time
                        // leave_time is already handled above
                    };
                }
            }
                // Update user stats from blackboxes before building updatedFleet
                for (let i = 0; i < mergedUsers.length; i++) {
                    const user = mergedUsers[i];
                    const userId = user.id;
                    const joinTime = user.join_time;
                    const leaveTime = user.leave_time || now.toISOString();
                    if (userId && joinTime) {
                        try {
                            const blackboxes = await getUserBlackBoxesBetweenTimestamps({
                                user_id: userId,
                                start_timestamp: toDbTimestamp(joinTime),
                                end_timestamp: toDbTimestamp(leaveTime)
                            }) || [];
                            let pu_shipkills = 0, pu_fpskills = 0, ac_shipkills = 0, ac_fpskills = 0, damages = 0;
                            for (const box of blackboxes) {
                                if (box.game_mode === "PU") {
                                    if (box.ship_killed === "FPS") pu_fpskills++;
                                    else pu_shipkills++ && (damages += box.value);
                                } else if (box.game_mode === "AC") {
                                    if (box.ship_killed === "FPS") ac_fpskills++;
                                    else ac_shipkills++ && (damages += box.value);
                                }
                            }
                            mergedUsers[i] = {
                                ...user,
                                pu_shipkills,
                                pu_fpskills,
                                ac_shipkills,
                                ac_fpskills,
                                damages
                            };
                        } catch (err) {
                            // If error, keep user unchanged
                        }
                    }
                }

            // Sum all users' stats for fleet totals
            const fleetTotals = mergedUsers.reduce((totals, user) => {
                totals.pu_shipkills += user.pu_shipkills || 0;
                totals.pu_fpskills += user.pu_fpskills || 0;
                totals.ac_shipkills += user.ac_shipkills || 0;
                totals.ac_fpskills += user.ac_fpskills || 0;
                return totals;
            }, { pu_shipkills: 0, pu_fpskills: 0, ac_shipkills: 0, ac_fpskills: 0 });

            const updatedFleet = {
                ...fleet,
                users: mergedUsers,
                timestamp: now.toISOString(),
                pu_shipkills: fleetTotals.pu_shipkills,
                pu_fpskills: fleetTotals.pu_fpskills,
                ac_shipkills: fleetTotals.ac_shipkills,
                ac_fpskills: fleetTotals.ac_fpskills,
                // Do not touch created_at
            };
            await updateRecentFleet(fleet.id, updatedFleet);
        } else {
            // Create new fleet
            const guild = await client.guilds.cache.get(process.env.LIVE_ENVIRONMENT === "true" ? process.env.GUILD_ID : process.env.TEST_GUILD_ID);
            let emojis = [];
            try{
                emojis = Array.from(guild.emojis.cache.values());
            } catch(error){
                console.error("Error fetching emojis:", error);
            }
            const randomIcon = emojis.length > 0 ? emojis[Math.floor(Math.random() * emojis.length)].url : '';
            const patches = await getAllGameVersions();
            const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
            const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
            const randomBigInt = Math.floor(Math.random() * 9e17) + 1e17; // Range: 1e17 to 1e18-1
            const newFleet = {
                id: randomBigInt,
                channel_id: session.channelId,
                channel_name: session.channelName,
                users: usersArray,
                timestamp: now.toISOString(),
                created_at: now.toISOString(),
                pu_shipkills: 0,
                pu_fpskills: 0,
                ac_shipkills: 0,
                ac_fpskills: 0,
                stolen_cargo: 0,
                stolen_value: 0,
                damages: 0,
                patch: latestPatch,
                icon_url: randomIcon
            };
            await createRecentFleet(newFleet);
        }
    } catch (error) {
        console.error("Error in checkRecentFleets:", error);
    }
}

async function manageRecentGangs(client, openai){
    try {
        const now = new Date();
        const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
        const start = threeMinutesAgo.toISOString();
        const end = now.toISOString();
        const recentFleets = await getRecentFleetsWithinTimeframe(start, end) || [];

        for (const fleet of recentFleets) {
            const channelId = fleet.channel_id;
            let channel;
            try {
                channel = await client.channels.fetch(channelId);
            } catch (e) {
                channel = null;
            }

            let presentUserIds = [];
            if (channel && channel.members) {
                presentUserIds = Array.from(channel.members.keys());
            }

            // Ensure anyone not in channel has a leave_time set
            for (let i = 0; i < fleet.users.length; i++) {
                const user = fleet.users[i];
                if (user.id && !presentUserIds.includes(user.id) && !user.leave_time) {
                    fleet.users[i].leave_time = now.toISOString();
                }
            }

            // If less than 3 users in channel (or channel missing), close out the log
            if (!channel || presentUserIds.length < 3) {
                // Make sure every user has a leave_time
                for (let i = 0; i < fleet.users.length; i++) {
                    if (!fleet.users[i].leave_time) {
                        fleet.users[i].leave_time = now.toISOString();
                    }
                }

                // Remove users with less than 10 minutes in channel
                const TEN_MIN_MS = 10 * 60 * 1000;
                const filteredUsers = (fleet.users || []).filter(u => {
                    const join = u.join_time ? new Date(u.join_time) : null;
                    const leave = u.leave_time ? new Date(u.leave_time) : null;
                    if (!join || !leave || isNaN(join.getTime()) || isNaN(leave.getTime())) return false;
                    return (leave.getTime() - join.getTime()) >= TEN_MIN_MS;
                });

                // Recompute fleet totals after filtering
                const totals = filteredUsers.reduce((t, u) => {
                    t.pu_shipkills += u.pu_shipkills || 0;
                    t.pu_fpskills += u.pu_fpskills || 0;
                    t.ac_shipkills += u.ac_shipkills || 0;
                    t.ac_fpskills += u.ac_fpskills || 0;
                    return t;
                }, { pu_shipkills: 0, pu_fpskills: 0, ac_shipkills: 0, ac_fpskills: 0 });

                fleet.users = filteredUsers;
                fleet.pu_shipkills = totals.pu_shipkills;
                fleet.pu_fpskills = totals.pu_fpskills;
                fleet.ac_shipkills = totals.ac_shipkills;
                fleet.ac_fpskills = totals.ac_fpskills;
                fleet.timestamp = now.toISOString();
            }

            await updateRecentFleet(fleet.id, fleet);
        }
    } catch (err) {
        console.error("Error in manageRecentFleets:", err);
    }
}

// Helper to format timestamps for DB
function toDbTimestamp(dateOrString) {
    const d = typeof dateOrString === 'string' ? new Date(dateOrString) : dateOrString;
    return d.toISOString().replace('T', ' ').replace('Z', '+00');
}

module.exports = {
    checkRecentGangs,
    manageRecentGangs
}