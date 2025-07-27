
const { refreshPlayerStatsView, getAllPlayerStats } = require('../api/playerStatsApi.js');
const { getActiveBadgeReusables } = require('../api/badgeReusableApi.js');
const { getAllBadges, createBadge } = require('../api/badgeApi.js');
const { notifyForAward } = require('./bot-notify.js');
const { getUserById } = require('../api/userlistApi.js');

async function automatedAwards(client, openai) {
    console.log('Running automated awards...');
    // Refresh the materialized view
    await refreshPlayerStatsView();
    // Get all player stats
    const rawStats = await getAllPlayerStats();
    if (!rawStats || !Array.isArray(rawStats)) return null;

    // Map to the required schema
    const playerStats = rawStats.map(stat => ({
        user_id: stat.user_id,
        shipackills: stat.shipackills,
        shippukills: stat.shippukills,
        shipkills: stat.shipkills,
        shipacdamages: stat.shipacdamages,
        shippudamages: stat.shippudamages,
        shipdamages: stat.shipdamages,
        fpsackills: stat.fpsackills,
        fpspukills: stat.fpspukills,
        fpskills: stat.fpskills,
        shipsbleaderboardrank: stat.shipsbleaderboardrank,
        piracyscustolen: stat.piracyscustolen,
        piracyvaluestolen: stat.piracyvaluestolen,
        piracyhits: stat.piracyhits,
        piracyhitspublished: stat.piracyhitspublished,
        fleetleads: stat.fleetleads,
        fleetassists: stat.fleetassists,
        fleetparticipated: stat.fleetparticipated,
        fleetkills: stat.fleetkills,
        fleetscu: stat.fleetscu,
        fleetvalue: stat.fleetvalue,
        fleetdamages: stat.fleetdamages,
        corsair: stat.corsair,
        raider: stat.raider,
        raptor: stat.raptor,
        rank_name: stat.rank_name,
        ronin: stat.ronin,
        fleetcommander: stat.fleetcommander
    }));

    // Retrieve all active reusable badges
    const badgeReusables = await getActiveBadgeReusables();
    // badgeReusables is now an array of badge objects with the provided schema

    // Get all badges
    const allBadges = await getAllBadges();
    // Add badge names and qualified badge reusables to each playerStats entry
    playerStats.forEach(player => {
        player.badge_names = allBadges
            ? allBadges.filter(badge => badge.user_id === player.user_id).map(badge => badge.badge_name)
            : [];

        // Check which badgeReusables this player qualifies for, skipping if already has badge by name (exact match)
        player.qualified_badge_reusables = badgeReusables
            ? badgeReusables.filter(badgeReusable => {
                if (!badgeReusable.badge_name) return false;
                // Stricter: check for exact badge name match for this user
                const hasBadge = player.badge_names.some(bn => typeof bn === 'string' && bn.trim() === badgeReusable.badge_name.trim());
                if (hasBadge) return false;
                return qualifiesForBadgeReusable(player, badgeReusable);
            }).map(b => b.badge_reusable_id || b.id || b.name)
            : [];
    });

    // For each player, create badges for newly qualified badgeReusables
    for (const player of playerStats) {
        for (const badgeReusable of badgeReusables || []) {
            if (!badgeReusable.badge_name) continue;
            // Stricter: check for exact badge name match for this user
            const hasBadge = player.badge_names.some(bn => typeof bn === 'string' && bn.trim() === badgeReusable.badge_name.trim());
            if (hasBadge) continue;
            // Only create if player qualifies
            if ((player.qualified_badge_reusables || []).includes(badgeReusable.badge_reusable_id || badgeReusable.id || badgeReusable.name)) {
                console.log(`Creating badge for player ${player.user_id} - ${badgeReusable.badge_name}`);
                // Generate a random 15-digit number for PostgreSQL BIGINT
                const generatedId = Math.floor(Math.random() * 9e14) + 1e14;
                await createBadge({
                    id: generatedId,
                    user_id: player.user_id,
                    badge_name: badgeReusable.badge_name,
                    badge_description: badgeReusable.badge_description || '',
                    badge_weight: badgeReusable.badge_weight || 1,
                    badge_icon: badgeReusable.emoji_name || '',
                    badge_url: badgeReusable.image_url || '',
                });
                // Fetch user and notify for award
                try {
                    const user = await getUserById(player.user_id);
                    const displayName = user && (user.nickname || user.username || player.user_id);
                    await notifyForAward(
                        badgeReusable.badge_name,
                        badgeReusable.badge_description || '',
                        displayName,
                        player.user_id,
                        openai,
                        client
                    );
                } catch (err) {
                    console.error('Error notifying for award:', err);
                }
            }
        }
    }

    return playerStats;
}


// Helper to evaluate a single trigger condition
function evaluateTrigger(player, triggerObj) {
    const { metric, operator, value } = triggerObj;
    const playerValue = player[metric];
    // if(player.user_id === '664023164350627843') {
    //     console.log(`Evaluating ${metric} ${operator} ${value} for player ${player.user_id}: ${playerValue}`);
    // }
    console.log(`Evaluating ${metric} ${operator} ${value} for player ${player.user_id}: ${playerValue}`);

    switch (operator) {
        case '>=':
            return playerValue >= value;
        case '>':
            return playerValue > value;
        case '<=':
            return playerValue <= value;
        case '<':
            return playerValue < value;
        case '==':
            return playerValue == value;
        case '===':
            return playerValue === value;
        case '!=':
            return playerValue != value;
        case '!==':
            return playerValue !== value;
        default:
            return false;
    }
}

// Main function to check if a player qualifies for a badgeReusable
function qualifiesForBadgeReusable(player, badgeReusable) {
    if (!badgeReusable.trigger || !Array.isArray(badgeReusable.trigger) || badgeReusable.trigger.length === 0) {
        return false;
    }
    try {
        // Each entry may be an object or a stringified JSON object
        for (const triggerStr of badgeReusable.trigger) {
            if (!triggerStr) {
                return false;
            }
            let triggerObj;
            if (typeof triggerStr === 'string') {
                try {
                    triggerObj = JSON.parse(triggerStr);
                    // console.log(`Parsed trigger (from string):`, JSON.stringify(triggerObj, null, 2));
                } catch (e) {
                    // If still a string, parse again
                    triggerObj = JSON.parse(JSON.parse(triggerStr));
                    // console.log(`Parsed trigger2 (from double-string):`, JSON.stringify(triggerObj, null, 2));
                }
            } else if (typeof triggerStr === 'object') {
                triggerObj = triggerStr;
                // console.log(`Parsed trigger (already object):`, JSON.stringify(triggerObj, null, 2));
            } else {
                // console.log(`Unknown trigger type for badgeReusable ${badgeReusable.badge_name}:`, typeof triggerStr);
                return false;
            }
            if (!evaluateTrigger(player, triggerObj)) {
                return false;
            }
        }
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = { automatedAwards, qualifiesForBadgeReusable };
