const axios = require('axios');
const { createLeaderboardEntriesBulk, deleteAllLeaderboardEntries } = require('../api/leaderboardSBApi');
const crypto = require('crypto'); // Add this at the top

async function processLeaderboards(client, openai) {
    // Get all leaderboard entries
    const { getAllLeaderboardEntries } = require('../api/leaderboardSBApi');
    const { createLeaderboardLogEntry } = require('../api/leaderboardSBLogApi');

    const leaderboardEntries = await getAllLeaderboardEntries();
    if (!leaderboardEntries || !Array.isArray(leaderboardEntries)) {
        console.error('No leaderboard entries found or invalid format.');
        return;
    }

    // Fetch all Discord users from the client
    let discordUsers = [];
    if (client && client.guilds && client.guilds.cache) {
        for (const guild of client.guilds.cache.values()) {
            // Fetch all members for each guild
            let members;
            try {
                members = await guild.members.fetch();
            } catch (err) {
                console.error('Error fetching members for guild:', guild.id, err);
                continue;
            }
            discordUsers.push(...members.map(m => ({
                user_id: m.user.id,
                nickname: m.nickname || m.user.username
            })));
        }
    }

    // Helper to normalize nicknames: remove spaces, quotes, and text between quotes
    function normalizeNickname(nickname) {
        if (!nickname) return '';
        // Remove text between quotes and the quotes themselves
        let noQuotes = nickname.replace(/"[^"]*"/g, '');
        // Remove all spaces and remaining quotes
        return noQuotes.replace(/\s|"/g, '');
    }

    // Build a map for quick lookup by normalized nickname
    const discordUserMap = new Map();
    for (const user of discordUsers) {
        const normNick = normalizeNickname(user.nickname);
        if (normNick) {
            discordUserMap.set(normNick, user.user_id);
        }
    }

    // For each leaderboard entry, check for normalized nickname match and create log entry if found
    for (const entry of leaderboardEntries) {
        const normEntryNick = normalizeNickname(entry.nickname);
        if (normEntryNick && discordUserMap.has(normEntryNick)) {
            const user_id = discordUserMap.get(normEntryNick);
            // Prepare log entry data
            const logEntry = { ...entry, user_id };
            await createLeaderboardLogEntry(logEntry);
        }
    }
}

module.exports = {
    processLeaderboards
};