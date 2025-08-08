const { ChannelType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { updateFleet } = require("../api/userFleetApi"); // <-- Import updateFleet

async function handleFleetCreatePost(client, openai, userFleet) {
    try {
        const channelId = process.env.LIVE_ENVIRONMENT === "true"
            ? process.env.FLEETLOG_CHANNEL_ID
            : process.env.TEST_FLEETLOG_CHANNEL_ID;
        
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildForum) {
            throw new Error("Channel not found or is not a forum channel.");
        }

        // Create a new role for the fleet
        const guild = channel.guild;
        let role;
        try {
            role = await guild.roles.create({
                name: `Fleet ${userFleet.name}`,
                color: 0x57F287,
                reason: `Role for fleet ${userFleet.name}`,
                mentionable: true,
            });
            // Save the role ID to the fleet object (and persist as needed)
            userFleet.discord_role = role.id;
            // If you want to persist this to your DB, do it here:
            if (typeof userFleet.save === "function") {
                await userFleet.save();
            }
            // Also update in backend via API
            if (userFleet.id) {
                await updateFleet(userFleet.id, { 
                    discord_role: role.id,
                    action: "create_role",
                 });
            }
        } catch (err) {
            console.error("Failed to create fleet role:", err);
        }

        // Try to fetch the user object for the commander_id
        let commanderDisplay = "Unknown";
        if (userFleet.commander_id) {
            try {
                const user = await client.users.fetch(userFleet.commander_id);
                commanderDisplay = user.username
            } catch (err) {
                commanderDisplay = userFleet.commander_id;
            }
        }

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(userFleet.name)
            .addFields(
                { name: "Commander:", value: commanderDisplay, inline: false },
                { name: "Corsair Rank", value: userFleet.commander_corsair_rank != null ? String(userFleet.commander_corsair_rank) : "N/A", inline: true },
                { name: "Allowed Total Members", value: userFleet.allowed_total_members != null ? String(userFleet.allowed_total_members) : "N/A", inline: true },
                { name: "Primary Mission", value: userFleet.primary_mission || "N/A", inline: false },
                { name: "Secondary Mission", value: userFleet.secondary_mission || "N/A", inline: false },
            )
            .setColor(0x00cc99)
            .setFooter({ text: "View all fleets: https://www.ironpoint.org/fleets" }); // <-- Add this line

        // Set avatar as thumbnail if provided
        if (userFleet.avatar) {
            embed.setThumbnail(userFleet.avatar);
        }

        // Create a new post (thread) in the forum channel with the embed
        const thread = await channel.threads.create({
            name: "NEW FLEET: " + (userFleet.name || "Unnamed Fleet"),
            message: {
                embeds: [embed],
            },
            reason: "New fleet",
        });

        // Post the video link as a separate message if it exists
        if (userFleet.video_link) {
            await thread.send(userFleet.video_link);
        }

        // Post each additional media link as a separate message in the thread
        if (Array.isArray(userFleet.media_links) && userFleet.media_links.length > 0) {
            for (const mediaLink of userFleet.media_links) {
                await thread.send(mediaLink);
            }
        }
    } catch (error) {
        console.error("Error in handleFleetCreatePost:", error);
    }
}

module.exports = {
    handleFleetCreatePost,
};