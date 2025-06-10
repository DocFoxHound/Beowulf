const axios = require('axios');
const { createLeaderboardEntriesBulk, deleteAllLeaderboardEntries } = require('../api/leaderboardSBApi');
const crypto = require('crypto'); // Add this at the top

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

async function processLeaderboards(client, openai) {
    // Delete all previous leaderboard data before loading new data
    console.log('Deleting all previous leaderboard entries...');
    await deleteAllLeaderboardEntries();
    console.log('All previous leaderboard entries deleted.');

    const cigSBUrl = `${process.env.API_CIG_LEADERBOARD_SB}`;
    const createdAtSeries = Date.now()
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

    // Store unique players for each map
    const mapPlayersByMap = {};

    for (const mapTitle of mapTitles) {
        try {
            let mapPlayers = [];
            for (let page = 1; page <= 10; page++) {
                console.log(`Fetching leaderboard for map: ${mapTitle}, page: ${page}`);
                const requestBody = {
                    mode: "SB",
                    map: mapTitle,
                    type: "Account",
                    season: "48",
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

            // Save for later use
            mapPlayersByMap[mapTitle] = uniquePlayers;

            // Chunk into batches of 100 and submit
            const batches = chunkArray(uniquePlayers, 100);
            console.log(`Submitting ${uniquePlayers.length} unique players for map "${mapTitle}" in ${batches.length} batches...`);
            for (let i = 0; i < batches.length; i++) {
                try {
                    console.log(`Submitting batch ${i + 1} of ${batches.length} (map: ${mapTitle}, entries: ${batches[i].length})`);
                    await createLeaderboardEntriesBulk(batches[i]);
                } catch (error) {
                    console.error(`Error submitting batch ${i + 1} for map ${mapTitle}:`, error.response ? error.response.data : error.message);
                }
            }
        } catch (error) {
            console.error(`Error processing map ${mapTitle}:`, error.response ? error.response.data : error.message);
        }
    }
}

module.exports = {
    processLeaderboards
};