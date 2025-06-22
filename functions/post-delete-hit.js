const { ChannelType, EmbedBuilder } = require("discord.js");
const { getFleetById } = require("../api/userFleetApi"); // <-- Add this import
const { deleteHitLog } = require("../api/hitTrackerApi"); // <-- Add this import
const { getHitLogByEntryId } = require("../api/hitTrackerApi"); // <-- Add this import


async function handleHitPostDelete(client, openai, hitTrackId) {
    console.log("Handling hit post deletion for:", hitTrackId);
    try {
        const hitTrack = await getHitLogByEntryId(hitTrackId);
        // Fetch the thread by its ID
        const thread = await client.channels.fetch(hitTrack.thread_id);

        if (!thread || !thread.isThread()) {
            console.error('Thread not found or is not a thread.');
            return;
        }

        // Create the embed with a big red X
        const embed = new EmbedBuilder()
            .setDescription('❌ **This entry was deleted and the thread is now locked.**')
            .setColor(0xFF0000);

        // Post the embed in the thread
        await thread.send({ embeds: [embed] });

        // Lock the thread to prevent further posting
        await thread.setLocked(true);

        // Prepend "❌ " to the thread title
        await thread.setName(`❌ ${thread.name}`);

        console.log(`Thread ${hitTrack.thread_id} locked and status posted.`);
    } catch (error) {
        console.error('Error handling deleted hit entry:', error);
    }

    //save the thread ID to the hitTrack object
    await deleteHitLog(hitTrackId);
}

module.exports = {
    handleHitPostDelete,
}