const { ChannelType, EmbedBuilder } = require("discord.js");
const { getFleetById } = require("../api/userFleetApi"); // <-- Add this import
const { editHitLog } = require("../api/hitTrackerApi"); // <-- Add this import

async function handleHitPost(client, openai, hitTrack) {
    const channelId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.HITTRACK_CHANNEL_ID
        : process.env.TEST_HITTRACK_CHANNEL_ID;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildForum) {
        throw new Error("Channel not found or is not a forum channel.");
    }

    // Build assist mentions
    let assistMentions = "None";
    if (Array.isArray(hitTrack.assists) && hitTrack.assists.length > 0) {
        assistMentions = hitTrack.assists.map(id => `<@${id}>`).join(", ");
    }

    // Fetch fleet names from fleet_ids
    let fleetNames = [];
    if (Array.isArray(hitTrack.fleet_ids) && hitTrack.fleet_ids.length > 0) {
        // Fetch all fleet names in parallel
        const fleetResults = await Promise.all(
            hitTrack.fleet_ids.map(async (id) => {
                const fleet = await getFleetById(id);
                return fleet && fleet.name ? fleet.name : null;
            })
        );
        fleetNames = fleetResults.filter(name => !!name);
    }

    // Create the embed
    const embed = new EmbedBuilder()
        .setTitle(`${hitTrack.nickname || hitTrack.username}: ${hitTrack.title}`)
        .setDescription(hitTrack.story)
        .addFields(
            { name: "User", value: `${hitTrack.nickname || hitTrack.username}`, inline: true },
            { name: "Type of Piracy", value: hitTrack.type_of_piracy, inline: true },
            { name: "Total Value", value: `${hitTrack.total_value}`, inline: true },
            { name: "Total Cut Value", value: `${hitTrack.total_cut_value}`, inline: true },
            { name: "Total SCU", value: `${hitTrack.total_scu}`, inline: true },
            { name: "Air or Ground", value: hitTrack.air_or_ground, inline: true },
            { name: "Patch", value: hitTrack.patch || "N/A", inline: true },
            { name: "Assists", value: assistMentions, inline: true },
            { name: "Fleet Activity", value: hitTrack.fleet_activity ? "Yes" : "No", inline: true },
            { name: "Fleet Names", value: fleetNames.length > 0 ? fleetNames.join(", ") : "None", inline: true }, // <-- updated
            { name: "Victims", value: (hitTrack.victims || []).join(", ") || "None", inline: true },
            { name: "Video Link", value: hitTrack.video_link || "N/A", inline: false },
            { name: "Additional Media", value: (hitTrack.additional_media_links || []).join(", ") || "None", inline: false },
            { name: "Timestamp", value: hitTrack.timestamp || "N/A", inline: false }
        )
        .setColor(0x0099ff);

    // Create a new post (thread) in the forum channel with the embed
    const thread = await channel.threads.create({
        name: hitTrack.title,
        message: {
            embeds: [embed],
        },
        reason: "New hitTrack entry",
    });

    // Post the video link as a separate message if it exists
    if (hitTrack.video_link) {
        await thread.send(hitTrack.video_link);
    }

    // Post each additional media link as a separate message in the thread
    if (Array.isArray(hitTrack.additional_media_links) && hitTrack.additional_media_links.length > 0) {
        for (const mediaLink of hitTrack.additional_media_links) {
            await thread.send(mediaLink);
        }
    }

    //save the thread ID to the hitTrack object
    hitTrack.thread_id = thread.id;
    await editHitLog(hitTrack.id, hitTrack);
}

module.exports = {
    handleHitPost,
}