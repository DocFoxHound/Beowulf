const { ChannelType, EmbedBuilder } = require("discord.js");

async function handleFleetLogPost(client, openai, shipLog) {
    const channelId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.FLEETLOG_CHANNEL_ID
        : process.env.TEST_FLEETLOG_CHANNEL_ID;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildForum) {
        throw new Error("Channel not found or is not a forum channel.");
    }

    // Build crew mentions
    let crewMentions = "None";
    if (Array.isArray(shipLog.crew_ids) && shipLog.crew_ids.length > 0) {
        crewMentions = shipLog.crew_ids.map(id => `<@${id}>`).join(", ");
    }

    // Build air sub mentions
    let airSubMentions = "None";
    if (Array.isArray(shipLog.air_sub_ids) && shipLog.air_sub_ids.length > 0) {
        airSubMentions = shipLog.air_sub_ids.map(id => `<@${id}>`).join(", ");
    }

    // Build fps sub mentions
    let fpsSubMentions = "None";
    if (Array.isArray(shipLog.fps_sub_ids) && shipLog.fps_sub_ids.length > 0) {
        fpsSubMentions = shipLog.fps_sub_ids.map(id => `<@${id}>`).join(", ");
    }

    // Create the embed
    const embed = new EmbedBuilder()
        .setTitle(shipLog.title || "Fleet Log")
        .setDescription(shipLog.notes || "No notes provided.")
        .addFields(
            { name: "Commander", value: `${shipLog.commander_username || shipLog.commander_id || "Unknown"}`, inline: true },
            { name: "Fleet Name", value: shipLog.fleet_name || "N/A", inline: true },
            { name: "Patch", value: shipLog.patch || "N/A", inline: true },
            { name: "Crew", value: (shipLog.crew_usernames || []).join(", ") || "None", inline: false },
            { name: "Crew Mentions", value: crewMentions, inline: false },
            { name: "Air Sub Usernames", value: (shipLog.air_sub_usernames || []).join(", ") || "None", inline: false },
            { name: "Air Sub Mentions", value: airSubMentions, inline: false },
            { name: "FPS Sub Usernames", value: (shipLog.fps_sub_usernames || []).join(", ") || "None", inline: false },
            { name: "FPS Sub Mentions", value: fpsSubMentions, inline: false },
            { name: "Start Time", value: shipLog.start_time ? new Date(shipLog.start_time).toLocaleString() : "N/A", inline: true },
            { name: "End Time", value: shipLog.end_time ? new Date(shipLog.end_time).toLocaleString() : "N/A", inline: true },
            { name: "Total Kills", value: shipLog.total_kills != null ? `${shipLog.total_kills}` : "N/A", inline: true },
            { name: "Value Stolen", value: shipLog.value_stolen != null ? `${shipLog.value_stolen}` : "N/A", inline: true },
            { name: "Total Cargo", value: shipLog.total_cargo != null ? `${shipLog.total_cargo}` : "N/A", inline: true },
            { name: "Damages Value", value: shipLog.damages_value != null ? `${shipLog.damages_value}` : "N/A", inline: true },
            { name: "Associated Hits", value: (shipLog.associated_hits || []).join(", ") || "None", inline: false },
            { name: "Story", value: shipLog.notes || "No notes provided.", inline: false }, 
            { name: "Video Link", value: shipLog.video_link || "N/A", inline: false },
            { name: "Additional Media", value: (shipLog.media_links || []).join(", ") || "None", inline: false },
            { name: "Created At", value: shipLog.created_at || "N/A", inline: false }
        )
        .setColor(0x00cc99);

    // Create a new post (thread) in the forum channel with the embed
    const thread = await channel.threads.create({
        name: shipLog.title || "Fleet Log",
        message: {
            embeds: [embed],
        },
        reason: "New fleet log entry",
    });

    // Post the video link as a separate message if it exists
    if (shipLog.video_link) {
        await thread.send(shipLog.video_link);
    }

    // Post each additional media link as a separate message in the thread
    if (Array.isArray(shipLog.media_links) && shipLog.media_links.length > 0) {
        for (const mediaLink of shipLog.media_links) {
            await thread.send(mediaLink);
        }
    }
}

module.exports = {
    handleFleetLogPost,
};