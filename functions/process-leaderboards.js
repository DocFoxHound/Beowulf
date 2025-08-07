const axios = require('axios');
const { createPlayerLeaderboardEntriesBulk, deleteAllPlayerLeaderboardEntries, createOrgLeaderboardEntriesBulk, deleteAllOrgLeaderboardEntries } = require('../api/leaderboardSBApi');
const { getAllGameVersions } = require('../api/gameVersionApi');
const crypto = require('crypto'); // Add this at the top
const { processLeaderboardLogs } = require('./process-leaderboard-logs');

// Helper function to pause execution for ms milliseconds
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}


async function processPlayerLeaderboards(client, openai) {
    // Delete all previous leaderboard data before loading new data
    console.log('Deleting all previous leaderboard entries...');
    await deleteAllPlayerLeaderboardEntries();
    console.log('All previous leaderboard entries deleted.');

    // Get all game versions and find the highest season number
    let season = "49";
    try {
        const gameVersions = await getAllGameVersions();
        if (Array.isArray(gameVersions) && gameVersions.length > 0) {
            season = String(Math.max(...gameVersions.map(gv => Number(gv.season))));
        }
    } catch (err) {
        console.error("Error getting game versions for season:", err);
    }

    const cigSBUrl = `${process.env.API_CIG_LEADERBOARD_SB}`;
    const createdAtSeries = Date.now();
    const referer = "https://robertsspaceindustries.com/en/community/leaderboards/all?mode=SB";
    const mapTitles = [
        "BROKEN-MOON",
        "DYING-STAR",
        "KAREAH",
        "JERICHO-STATION",
        "MINERS-LAMENT"
    ];

    const MAX_BIGINT = 9223372036854775807n;
    function randomBigInt() {
        // 8 bytes = 64 bits
        let rand = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
        // Ensure it's within the signed BIGINT range
        return (rand % MAX_BIGINT) + 1n;
    }

    // Store all players from all maps
    const allPlayers = [];

    for (const mapTitle of mapTitles) {
        try {
            let mapPlayers = [];
            for (let page = 1; page <= 10; page++) {
                console.log(`Fetching leaderboard for map: ${mapTitle}, page: ${page}`);
                const requestBody = {
                    mode: "SB",
                    map: mapTitle,
                    type: "Account",
                    season: season,
                    page: page,
                    pagesize: 100
                };

                try {
                    const response = await axios.post(
                        cigSBUrl,
                        requestBody,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'referer': referer
                            }
                        }
                    );
                    if (response.data && response.data.data && Array.isArray(response.data.data.resultset)) {
                        for (const player of response.data.data.resultset) {
                            const playerWithExtras = { ...player };
                            playerWithExtras.created_at = createdAtSeries;
                            playerWithExtras.id = randomBigInt().toString();
                            playerWithExtras.map = mapTitle;
                            mapPlayers.push(playerWithExtras);
                        }
                    } else {
                        console.error('Unexpected response format:', response.data);
                    }
                } catch (error) {
                    console.error(`Error fetching leaderboard for map ${mapTitle} page ${page}:`, error.response ? error.response.data : error.message);
                }
            }

            // Remove duplicates by displayname
            const uniquePlayersMap = new Map();
            for (const player of mapPlayers) {
                uniquePlayersMap.set(player.displayname, player);
            }
            const uniquePlayers = Array.from(uniquePlayersMap.values());

            // Collect all players across all maps
            allPlayers.push(...uniquePlayers);

            // Chunk into batches of 100 and submit
            const batches = chunkArray(uniquePlayers, 100);
            console.log(`Submitting ${uniquePlayers.length} unique players for map "${mapTitle}" in ${batches.length} batches...`);
            for (let i = 0; i < batches.length; i++) {
                try {
                    console.log(`Submitting batch ${i + 1} of ${batches.length} (map: ${mapTitle}, entries: ${batches[i].length})`);
                    await createPlayerLeaderboardEntriesBulk(batches[i]);
                } catch (error) {
                    console.error(`Error submitting batch ${i + 1} for map ${mapTitle}:`, error.response ? error.response.data : error.message);
                }
            }
        } catch (error) {
            console.error(`Error processing map ${mapTitle}:`, error.response ? error.response.data : error.message);
        }
    }
    // Call process-leaderboard-logs with allPlayers (unaggregated)
    await processLeaderboardLogs(client, openai);
    await processOrgLeaderboards(client, openai, allPlayers);
}


async function processOrgLeaderboards(client, openai) {
    // Delete all previous leaderboard data before loading new data
    console.log('Deleting all previous organization leaderboard entries...');
    await deleteAllOrgLeaderboardEntries();
    console.log('All previous organization leaderboard entries deleted.');

    // Get all game versions and find the highest season number
    let season = "49";
    try {
        const gameVersions = await getAllGameVersions();
        if (Array.isArray(gameVersions) && gameVersions.length > 0) {
            season = String(Math.max(...gameVersions.map(gv => Number(gv.season))));
        }
        console.log("Season: ", season);
    } catch (err) {
        console.error("Error getting game versions for season:", err);
    }

    const cigSBUrl = `${process.env.API_CIG_LEADERBOARD_SB}`;
    const createdAtSeries = Date.now();
    const referer = "https://robertsspaceindustries.com/en/community/leaderboards/all?mode=SB";
    const mapTitles = [
        "BROKEN-MOON",
        "DYING-STAR",
        "KAREAH",
        "JERICHO-STATION",
        "MINERS-LAMENT"
    ];

    const MAX_BIGINT = 9223372036854775807n;
    function randomBigInt() {
        // 8 bytes = 64 bits
        let rand = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
        // Ensure it's within the signed BIGINT range
        return (rand % MAX_BIGINT) + 1n;
    }

    // Store all players from all maps
    const allOrgs = [];

    for (const mapTitle of mapTitles) {
        try {
            let mapOrgs = [];
            for (let page = 1; page <= 3; page++) {
                console.log(`Fetching leaderboard for map: ${mapTitle}, page: ${page}`);
                const requestBody = {
                    mode: "SB",
                    map: mapTitle,
                    type: "Org",
                    season: season,
                    page: page,
                    pagesize: 100
                };

                try {
                    const response = await axios.post(
                        cigSBUrl,
                        requestBody,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'referer': referer
                            }
                        }
                    );
                    if (response.data && response.data.data && Array.isArray(response.data.data.resultset)) {
                        for (const org of response.data.data.resultset) {
                            const orgsWithExtras = { ...org };
                            orgsWithExtras.created_at = createdAtSeries;
                            orgsWithExtras.id = randomBigInt().toString();
                            orgsWithExtras.map = mapTitle;
                            mapOrgs.push(orgsWithExtras);
                        }
                    } else {
                        console.error('Unexpected response format:', response.data);
                    }
                } catch (error) {
                    console.error(`Error fetching leaderboard for map ${mapTitle} page ${page}:`, error.response ? error.response.data : error.message);
                }
            }

            // Remove duplicates by displayname
            const uniqueOrgsMap = new Map();
            for (const org of mapOrgs) {
                uniqueOrgsMap.set(org.name, org);
            }
            const uniqueOrgs = Array.from(uniqueOrgsMap.values());

            // Collect all organizations across all maps
            allOrgs.push(...uniqueOrgs);

            // Chunk into batches of 100 and submit
            const batches = chunkArray(uniqueOrgs, 100);
            console.log(`Submitting ${uniqueOrgs.length} unique organizations for map "${mapTitle}" in ${batches.length} batches...`);
            for (let i = 0; i < batches.length; i++) {
                try {
                    console.log(`Submitting batch ${i + 1} of ${batches.length} (map: ${mapTitle}, entries: ${batches[i].length})`);
                    await createOrgLeaderboardEntriesBulk(batches[i]);
                } catch (error) {
                    console.error(`Error submitting batch ${i + 1} for map ${mapTitle}:`, error.response ? error.response.data : error.message);
                }
            }
        } catch (error) {
            console.error(`Error processing map ${mapTitle}:`, error.response ? error.response.data : error.message);
        }
    }
    console.log("Completed processing.");
}

module.exports = {
    processPlayerLeaderboards,
    processOrgLeaderboards
};