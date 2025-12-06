const { getAllVoiceSessionsLastHour } = require("../api/voiceChannelSessionsApi.js");
const { createRecentFleet, updateRecentFleet, getRecentFleetsWithinTimeframe } = require("../api/recentFleetsApi.js");
const { getAllGameVersions } = require("../api/gameVersionApi.js");
const {
    getPlayerLeaderboardCache,
    findPlayerLeaderboardEntry,
    hydrateLeaderboardsFromDb
} = require("./leaderboard-cache.js");

async function checkRecentGangs(client, openai, session, users) {
    try {
        // Get current time and one hour ago
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        // Format as ISO string for API
        const start = oneHourAgo.toISOString();
        const end = now.toISOString();

        // Retrieve recent fleets within the last hour
        let recentFleets = [];
        try {
            recentFleets = await getRecentFleetsWithinTimeframe(start, end) || [];
        } catch (err) {
            console.error("checkRecentGangs: getRecentFleetsWithinTimeframe failed", { start, end, error: err?.message || err });
            recentFleets = [];
        }

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
                ac_fpskills: 0,
                stolen_cargo: 0,
                stolen_value: 0,
                damages: 0
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
                    console.error("checkRecentGangs: failed to fetch user", { userId, error: e?.message || e });
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
            const mergedUsersWithStats = await annotateUsersWithLeaderboardStats(mergedUsers);

            // Sum all users' stats for fleet totals
            const fleetTotals = mergedUsersWithStats.reduce((totals, user) => {
                totals.pu_shipkills += user.pu_shipkills || 0;
                totals.pu_fpskills += user.pu_fpskills || 0;
                totals.ac_shipkills += user.ac_shipkills || 0;
                totals.ac_fpskills += user.ac_fpskills || 0;
                totals.damages += user.damages || 0;
                return totals;
            }, { pu_shipkills: 0, pu_fpskills: 0, ac_shipkills: 0, ac_fpskills: 0, damages: 0 });

            const updatedFleet = {
                ...fleet,
                users: mergedUsersWithStats,
                timestamp: now.toISOString(),
                pu_shipkills: fleetTotals.pu_shipkills,
                pu_fpskills: fleetTotals.pu_fpskills,
                ac_shipkills: fleetTotals.ac_shipkills,
                ac_fpskills: fleetTotals.ac_fpskills,
                damages: fleetTotals.damages,
                // Do not touch created_at
            };
            try {
                await updateRecentFleet(fleet.id, updatedFleet);
            } catch (err) {
                console.error("checkRecentGangs: updateRecentFleet failed", { fleetId: fleet.id, error: err?.message || err });
            }
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
            let latestPatch = 'unknown';
            try {
                const patches = await getAllGameVersions();
                const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
                latestPatch = latestPatchesSorted[0]?.version || 'unknown'; // Get the latest patch
            } catch (err) {
                console.error("checkRecentGangs: getAllGameVersions failed", err?.message || err);
            }
            const randomBigInt = Math.floor(Math.random() * 9e17) + 1e17; // Range: 1e17 to 1e18-1
            const annotatedUsers = await annotateUsersWithLeaderboardStats(usersArray);
            const newFleet = {
                id: randomBigInt,
                channel_id: session.channelId,
                channel_name: session.channelName,
                users: annotatedUsers,
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
            try {
                await createRecentFleet(newFleet);
            } catch (err) {
                console.error("checkRecentGangs: createRecentFleet failed", { newFleetId: newFleet.id, error: err?.message || err });
            }
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
        let recentFleets = [];
        try {
            recentFleets = await getRecentFleetsWithinTimeframe(start, end) || [];
        } catch (err) {
            console.error("manageRecentGangs: getRecentFleetsWithinTimeframe failed", { start, end, error: err?.message || err });
            recentFleets = [];
        }

        for (const fleet of recentFleets) {
            const channelId = fleet.channel_id;
            let channel;
            try {
                channel = await client.channels.fetch(channelId);
            } catch (e) {
                console.error("manageRecentGangs: failed to fetch channel", { channelId, error: e?.message || e });
                channel = null;
            }

            // If the channel exists and its name has changed, sync it to the fleet log
            if (channel && channel.name && fleet.channel_name !== channel.name) {
                fleet.channel_name = channel.name;
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
                    t.damages += u.damages || 0;
                    return t;
                }, { pu_shipkills: 0, pu_fpskills: 0, ac_shipkills: 0, ac_fpskills: 0, damages: 0 });

                fleet.users = filteredUsers;
                fleet.pu_shipkills = totals.pu_shipkills;
                fleet.pu_fpskills = totals.pu_fpskills;
                fleet.ac_shipkills = totals.ac_shipkills;
                fleet.ac_fpskills = totals.ac_fpskills;
                fleet.damages = totals.damages;
                fleet.timestamp = now.toISOString();
            }

            try {
                await updateRecentFleet(fleet.id, fleet);
            } catch (err) {
                console.error("manageRecentGangs: updateRecentFleet failed", { fleetId: fleet.id, error: err?.message || err });
            }
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

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function calculateKd(kills, deaths) {
    if (!Number.isFinite(kills) || !Number.isFinite(deaths)) {
        return null;
    }
    const divisor = deaths <= 0 ? 1 : deaths;
    return Math.round((kills / divisor) * 100) / 100;
}

function buildLeaderboardStats(entry) {
    if (!entry) return null;
    const kills = toNumber(entry.kills ?? entry.total_kills);
    const deaths = toNumber(entry.deaths ?? entry.total_deaths);
    return {
        source: 'squadron_battle',
        rank: entry.rank ?? entry.position ?? null,
        score: toNumber(entry.score ?? entry.rank_score),
        rating: toNumber(entry.rating),
        kills,
        deaths,
        kd: calculateKd(kills, deaths),
        wins: toNumber(entry.victories ?? entry.wins),
        losses: toNumber(entry.losses),
        ship: entry.primary_ship || entry.favorite_ship || entry.ship || null,
        map: entry.map || null,
        season: entry.season || null,
        updated_at: entry.updated_at || entry.created_at || null,
    };
}

async function annotateUsersWithLeaderboardStats(users = []) {
    if (!Array.isArray(users) || users.length === 0) {
        return users;
    }
    let players = getPlayerLeaderboardCache();
    if (!Array.isArray(players) || players.length === 0) {
        try {
            await hydrateLeaderboardsFromDb();
            players = getPlayerLeaderboardCache();
        } catch (error) {
            console.error("checkRecentGangs: failed to hydrate leaderboard cache", error?.message || error);
            return users;
        }
    }
    if (!Array.isArray(players) || players.length === 0) {
        return users;
    }

    return users.map((user) => {
        const leaderboardEntry = findPlayerLeaderboardEntry({
            userId: user?.id,
            handles: [user?.username, user?.nickname],
        });
        if (!leaderboardEntry) {
            return {
                ...user,
                leaderboard_stats: null,
            };
        }
        return {
            ...user,
            leaderboard_stats: buildLeaderboardStats(leaderboardEntry),
        };
    });
}

module.exports = {
    checkRecentGangs,
    manageRecentGangs
}