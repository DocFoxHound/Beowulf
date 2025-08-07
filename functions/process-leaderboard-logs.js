const axios = require('axios');
const crypto = require('crypto'); // Add this at the top
const { getUsers, editUser } = require('../api/userlistApi');
const { getAllPlayerLeaderboardEntries } = require('../api/leaderboardSBApi');
const { createPlayerLeaderboardLogEntry } = require('../api/leaderboardSBLogApi');

async function processLeaderboardLogs(client, openai) {
    console.log('Fetching all leaderboard entries...');
    const allPlayersLeaderboard = await getAllPlayerLeaderboardEntries();
    const dbUsers = await getUsers();

    // Aggregation logic moved from process-leaderboards.js
    function parseFlightTime(ft) {
        try {
            if (typeof ft === 'number') return ft; // already in seconds
            if (typeof ft === 'string') {
                // Format: H:MM:SS or MM:SS
                const parts = ft.split(':').map(Number);
                if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                }
            }
            if (typeof ft === 'object' && ft !== null) {
                // Handle { hours: 3, minutes: 38, seconds: 4 }
                const h = Number(ft.hours) || 0;
                const m = Number(ft.minutes) || 0;
                const s = Number(ft.seconds) || 0;
                return h * 3600 + m * 60 + s;
            }
            return 0;
        } catch (error) {
            console.error('Error parsing flight time:', error);
            return 0; // Default to 0 if parsing fails
        }
    }

    function formatFlightTime(seconds) {
        try{
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
        }catch(error) {
            console.error('Error formatting flight time:', error);
            return '00:00:00'; // Default to 00:00:00 if formatting fails
        }
    }

    // The third argument is allPlayersLeaderboard
    const playerMap = new Map();
    for (const player of allPlayersLeaderboard) {
        try{
            const key = player.displayname;
            if (!playerMap.has(key)) {
                playerMap.set(key, {
                    displayname: player.displayname,
                    nickname: player.nickname,
                    kills: 0,
                    rank_score: [],
                    score: [],
                    flight_time: [], // Now an array
                    rating: [],
                    rank: [],
                    // Optionally, keep other fields as needed
                });
            }
            const agg = playerMap.get(key);
            if (typeof player.kills === 'number') {
                agg.kills += player.kills;
            }
            if (typeof player.rank_score === 'number') agg.rank_score.push(player.rank_score);
            const scoreVal = Number(player.score);
            if (!isNaN(scoreVal)) {
                agg.score.push(scoreVal);
                // console.log(`player.score for ${player.displayname}:`, player.score, typeof player.score, '->', scoreVal);
            }
            if (player.flight_time !== undefined) {
                // console.log(`Aggregating flight_time for player ${player.displayname}: raw=`, player.flight_time);
                const parsedFlightTime = parseFlightTime(player.flight_time);
                // console.log(`Parsed flight_time for player ${player.displayname}:`, parsedFlightTime);
                agg.flight_time.push(parsedFlightTime);
            }
            if (typeof player.rating === 'number') agg.rating.push(player.rating);
            if (typeof player.rank === 'number') agg.rank.push(player.rank);
        }catch(error) {
            console.error('Error aggregating player data:', error);
        }
    }


    // Helper to normalize nicknames by removing quoted substrings and extra spaces
    function normalizeNickname(nick) {
        try{
            if (!nick) return '';
            // Remove quoted substrings (e.g., "Phalos")
            let norm = nick.replace(/"[^"]*"/g, '');
            // Remove extra spaces
            norm = norm.replace(/\s+/g, ' ').trim();
            return norm;
        }catch(error) {
            console.error('Error normalizing nickname:', error);
            return ''; // Default to empty string if normalization fails
        }
    }

    // For each matched user, create a leaderboard log entry
    for (const agg of playerMap.values()) {
        let matchedUser = null;
        // First, try to match by rsi_handle
        matchedUser = dbUsers.find(u => u.rsi_handle && u.rsi_handle === agg.nickname);
        if (!matchedUser) {
            try{
                // Try to match by normalized nickname for users with null rsi_handle
                const normAggNick = normalizeNickname(agg.nickname);
                matchedUser = dbUsers.find(u => !u.rsi_handle && normalizeNickname(u.nickname) === normAggNick);
            }catch(error) {
                console.error('Error matching user by normalized nickname:', error);
            }
        }
        if (matchedUser) {
            try{
                // Generate random large integer id using timestamp and random 5 digits
                const id = (Date.now() * 100000 + Math.floor(Math.random() * 1e5)).toString();
                // Use current timestamp as bigint (milliseconds since epoch)
                const created_at = Date.now();
                await createPlayerLeaderboardLogEntry({
                    id,
                    user_id: matchedUser.id,
                    rank_score: agg.rank_score.length ? agg.rank_score.reduce((a,b)=>a+b,0)/agg.rank_score.length : 0,
                    nickname: agg.nickname,
                    displayname: agg.displayname,
                    kills: agg.kills,
                    score: agg.score.length ? agg.score.reduce((a,b)=>a+b,0)/agg.score.length : 0,
                    flight_time: agg.flight_time.length ? formatFlightTime(agg.flight_time.reduce((a,b)=>a+b,0)/agg.flight_time.length) : '00:00:00',
                    rating: agg.rating.length ? agg.rating.reduce((a,b)=>a+b,0)/agg.rating.length : 0,
                    rank: agg.rank.length ? Math.round(agg.rank.reduce((a,b)=>a+b,0)/agg.rank.length) : 0,
                    created_at
                });
                // Update the user's rsi_handle and rsi_display_name
                await editUser(matchedUser.id, {
                    rsi_handle: agg.nickname,
                    rsi_display_name: agg.displayname
                });
            }catch(error) {
                console.error(`Error processing leaderboard log entry for user ${matchedUser.id}:`, error.response ? error.response.data : error.message);
            }
        } else {
            // console.log(`No match found for agg.nickname: ${agg.nickname}, agg.displayname: ${agg.displayname}`);
        }
    }
    console.log("Leaderboard Logs updated")
}

module.exports = {
    processLeaderboardLogs
};