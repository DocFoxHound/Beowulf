const { ChannelType, EmbedBuilder } = require("discord.js");
const { deleteHitLog } = require("../api/hitTrackerApi"); // <-- Add this import
const { getHitLogByEntryId } = require("../api/hitTrackerApi"); // <-- Add this import


async function handleHitPostDelete(client, openai, hitTrack) {
    try {
        // Resolve thread ID from multiple possible shapes
        const threadId = (
            hitTrack?.thread_id ||
            hitTrack?.threadId ||
            hitTrack?.hit?.thread_id ||
            hitTrack?.hit?.threadId ||
            null
        );

                if (!threadId) {
                        if ((process.env.DEBUG_HIT_LOGS || '0') === '1') {
                            console.warn('handleHitPostDelete: thread_id absent; skipping embed. Keys:', Object.keys(hitTrack || {}));
                        }
                        return; // Silent skip when no thread id
                }

        // Fetch the thread by its ID
        const thread = await client.channels.fetch(threadId);

        if (!thread || !thread.isThread()) {
            console.error('Thread not found or is not a thread.');
            return;
        }

        // Create the embed with a big red X
        const embed = new EmbedBuilder()
            .setDescription('❌ **This entry was deleted and the thread is now locked.**')
            .setColor(0xFF0000);

        // Skip if already marked deleted
        const alreadyDeleted = thread.name.startsWith('❌') || thread.locked;
        if (!alreadyDeleted) {
            // Post the embed in the thread
            await thread.send({ embeds: [embed] });
            // Lock the thread to prevent further posting
            try { await thread.setLocked(true); } catch {}
            // Prepend "❌ " to the thread title
            try { await thread.setName(`❌ ${thread.name}`); } catch (e) {
                if ((process.env.DEBUG_HIT_LOGS || '0') === '1') console.error('handleHitPostDelete: failed to rename thread:', e?.message || e);
            }
        } else {
            if ((process.env.DEBUG_HIT_LOGS || '0') === '1') {
              console.log('handleHitPostDelete: thread already marked deleted, skipping duplicate embed.');
            }
        }

    } catch (error) {
        console.error('Error handling deleted hit entry:', error);
    }

    // Save/cleanup not required here
}

module.exports = {
    handleHitPostDelete,
}