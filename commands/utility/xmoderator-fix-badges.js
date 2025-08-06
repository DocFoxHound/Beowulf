
const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getAllBadges, editBadge } = require('../../api/badgeApi');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('xmoderator-fix-badges')
        .setDescription('Fix user badges.'),

    async execute(interaction) {
        let changedCount = 0;
        // Fetch all badges
        const badges = await getAllBadges();
        if (!badges) {
            await interaction.reply('Failed to fetch badges.');
            return;
        }

        // Get emoji cache from the guild
        const emojiCache = interaction.guild.emojis.cache;

        // Mapping of badge names to their series_id and series_position
        const badgeSeriesMap = {
            // Series: 11111111
            'Sardine': { series_id: '11111111', series_position: 1 },
            'Yellowtail': { series_id: '11111111', series_position: 2 },
            'Barracuda': { series_id: '11111111', series_position: 3 },
            'Marlin': { series_id: '11111111', series_position: 4 },
            'Kraken': { series_id: '11111111', series_position: 5 },
            // Series: 11112222
            'Sparrow': { series_id: '11112222', series_position: 1 },
            'Bluejay': { series_id: '11112222', series_position: 2 },
            'Crow': { series_id: '11112222', series_position: 3 },
            'Raven': { series_id: '11112222', series_position: 4 },
            'Hawk': { series_id: '11112222', series_position: 5 },
            // Series: 11113333
            'Initiation Badge': { series_id: '11113333', series_position: 1 },
            'Brawler Badge': { series_id: '11113333', series_position: 2 },
            'Competitor Badge': { series_id: '11113333', series_position: 3 },
            'Dogfighter': { series_id: '11113333', series_position: 4 },
            // Series: 11114444 (first set)
            'Hooligan Badge': { series_id: '11114444', series_position: 1 },
            'Troublesome': { series_id: '11114444', series_position: 2 },
            'Menace': { series_id: '11114444', series_position: 3 },
            'Terrorist': { series_id: '11114444', series_position: 4 },
            // Series: 11114444 (second set)
            'Duck Hunter': { series_id: '11114444', series_position: 1 },
            'Cyber Terror': { series_id: '11114444', series_position: 2 },
            'Ocelot': { series_id: '11114444', series_position: 3 },
            'Megalomania': { series_id: '11114444', series_position: 4 },
            // Series: 11115555
            'Lieutenant': { series_id: '11115555', series_position: 1 },
            'Bridge Officer': { series_id: '11115555', series_position: 2 },
            'Fleet Captain Badge': { series_id: '11115555', series_position: 3 },
            // Series: 11116666
            'Fleet Support Badge': { series_id: '11116666', series_position: 1 },
            'Deck Hand': { series_id: '11116666', series_position: 2 },
            'Expert Crewman': { series_id: '11116666', series_position: 3 },
            'Master Chief': { series_id: '11116666', series_position: 4 },
            // Series: 11117777
            'Fleet Staff Badge': { series_id: '11117777', series_position: 1 },
            'Fleet Commander Badge': { series_id: '11117777', series_position: 2 },
            'Overlord': { series_id: '11117777', series_position: 3 },
            'Rear Admiral': { series_id: '11117777', series_position: 4 },
            // Series: 11118888
            'Forward Deployed': { series_id: '11118888', series_position: 1 },
            'Tactical Master': { series_id: '11118888', series_position: 2 },
            'Strategist': { series_id: '11118888', series_position: 3 },
        };

        for (const badge of badges) {
            // Extract emoji code from badge_name (e.g., <...:IronPoint:...> I AM KING)
            const match = badge.badge_name && badge.badge_name.match(/<:([a-zA-Z0-9_]+):(\d+)>/);
            let badge_icon = null;
            let badge_url = null;
            let cleaned_badge_name = badge.badge_name;
            if (match) {
                // Set badge_icon to :EmojiName:
                badge_icon = `:${match[1]}:`;

                // Find emoji in guild by name
                const emoji = emojiCache.find(e => e.name === match[1]);
                if (emoji) {
                    badge_url = emoji.url;
                }

                // Remove the emoji and the following space from badge_name
                cleaned_badge_name = badge.badge_name.replace(/^<:[a-zA-Z0-9_]+:\d+>\s*/, '');
            }

            // Look up series info
            const seriesInfo = badgeSeriesMap[cleaned_badge_name] || {};

            // Prepare updated badge data
            const updatedBadgeData = {
                ...badge,
                badge_icon: badge_icon || badge.badge_icon,
                badge_url: badge_url || badge.badge_url,
                badge_name: cleaned_badge_name,
                series_id: seriesInfo.series_id || badge.series_id,
                series_position: seriesInfo.series_position || badge.series_position
            };

            // Only update if something changed
            if (
                updatedBadgeData.badge_icon !== badge.badge_icon ||
                updatedBadgeData.badge_url !== badge.badge_url ||
                updatedBadgeData.badge_name !== badge.badge_name ||
                updatedBadgeData.series_id !== badge.series_id ||
                updatedBadgeData.series_position !== badge.series_position
            ) {
                const success = await editBadge(badge.id, updatedBadgeData);
                if (success) changedCount++;
            }
        }

        await interaction.reply(`Fixed badges for ${changedCount} user(s).`);
    }
};