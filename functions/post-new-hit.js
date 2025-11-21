const { ChannelType, EmbedBuilder } = require("discord.js");
const { getFleetById } = require("../api/userFleetApi"); // <-- Add this import
const { editHitLog } = require("../api/hitTrackerApi"); // <-- Add this import
const { upsertHitInCache, removeHitFromCache } = require("../common/hit-cache.js");

// Simple in-memory de-duplication to prevent double posting the same hit
const _postedHitCache = new Map(); // key -> timestamp
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getHitDedupKey(hitTrack) {
    const idLike = hitTrack?.id || hitTrack?.hit_id || hitTrack?.db_id || hitTrack?.uuid;
    if (idLike) return `id:${String(idLike)}`;
    const user = hitTrack?.user_id || hitTrack?.username || hitTrack?.nickname || '';
    const title = hitTrack?.title || '';
    const ts = hitTrack?.timestamp || hitTrack?.created_at || '';
    return `fallback:${String(user)}|${String(title)}|${String(ts)}`;
}

function isDuplicateHit(hitTrack) {
    try {
        // If thread already exists, don't post again
        if (hitTrack && (hitTrack.thread_id || hitTrack.threadId)) return true;
        const key = getHitDedupKey(hitTrack);
        const now = Date.now();
        // Clean old entries opportunistically
        for (const [k, t] of _postedHitCache) {
            if (now - t > DEDUP_TTL_MS) _postedHitCache.delete(k);
        }
        const ts = _postedHitCache.get(key);
        if (ts && (now - ts) < DEDUP_TTL_MS) return true;
        // Mark as seen (pending) to avoid race double-posts
        _postedHitCache.set(key, now);
        return false;
    } catch {
        return false;
    }
}

// Ensure embed field values are always strings and within Discord limits
function toEmbedValue(value, fallback = "N/A", limit = 1024) {
    try {
        if (value === null || value === undefined) return fallback;
        let str;
        if (typeof value === "string") {
            str = value;
        } else if (typeof value === "number" || typeof value === "boolean") {
            str = String(value);
        } else if (Array.isArray(value) || typeof value === "object") {
            // Compact JSON for arrays/objects
            str = JSON.stringify(value);
        } else {
            str = String(value);
        }
        if (str.length === 0) return fallback;
        // Discord embed field value max length is 1024
        if (str.length > limit) {
            return str.slice(0, limit - 12) + "... (truncated)";
        }
        return str;
    } catch {
        return fallback;
    }
}

async function handleHitPost(client, openai, hitTrack) {
    try {
        // De-dup guard: skip if we've already posted this hit recently or it already has a thread
        if (isDuplicateHit(hitTrack)) {
            return;
        }
        const channelId = process.env.LIVE_ENVIRONMENT === "true"
            ? process.env.HITTRACK_CHANNEL_ID
            : process.env.TEST_HITTRACK_CHANNEL_ID;

        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildForum) {
            throw new Error("Channel not found or is not a forum channel.");
        }

        // Build assist mentions and guests
        let assistMentions = "None";
        const assistList = Array.isArray(hitTrack.assists) && hitTrack.assists.length > 0
            ? hitTrack.assists.map(id => `<@${id}>`)
            : [];
        const guestList = Array.isArray(hitTrack.guests) && hitTrack.guests.length > 0
            ? hitTrack.guests
            : [];
        if (assistList.length > 0 || guestList.length > 0) {
            assistMentions = assistList.join(", ");
            if (guestList.length > 0) {
                if (assistMentions.length > 0) assistMentions += ", ";
                assistMentions += guestList.join(", ");
            }
        }

        // Fetch fleet names from fleet_ids
        let fleetNames = [];
        if (Array.isArray(hitTrack.fleet_ids) && hitTrack.fleet_ids.length > 0) {
            // Fetch all fleet names in parallel
            const fleetResults = await Promise.all(
                hitTrack.fleet_ids.map(async (id) => {
                    try {
                        const fleet = await getFleetById(id);
                        return fleet && fleet.name ? fleet.name : null;
                    } catch (err) {
                        console.error(err);
                        return null;
                    }
                })
            );
            fleetNames = fleetResults.filter(name => !!name);
        }

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(`${hitTrack.nickname || hitTrack.username}: ${hitTrack.title}`)
            .setDescription(toEmbedValue(hitTrack.story, ""))
            .addFields(
                { name: "User", value: toEmbedValue(hitTrack.nickname || hitTrack.username), inline: true },
                { name: "Hit ID", value: toEmbedValue(hitTrack.id), inline: true },
                { name: "Type of Piracy", value: toEmbedValue(hitTrack.type_of_piracy), inline: true },
                { name: "Total SCU", value: toEmbedValue(hitTrack.total_scu), inline: true },
                { name: "Total Value", value: toEmbedValue(hitTrack.total_value), inline: true },
                { name: "Total Cut Value", value: toEmbedValue(hitTrack.total_cut_value), inline: true },
                { name: "Assists", value: toEmbedValue(assistMentions, "None"), inline: true },
                { name: "Victims", value: toEmbedValue((hitTrack.victims || []).join(", "), "None"), inline: true },
                { name: "Video Link", value: toEmbedValue(hitTrack.video_link, "N/A", 1024), inline: true },
                { name: "Additional Media", value: toEmbedValue((hitTrack.additional_media_links || []).join(", "), "None"), inline: false },
                { name: "Timestamp", value: toEmbedValue(hitTrack.timestamp), inline: true },
                { name: "Cargo JSON", value: toEmbedValue(hitTrack.cargo), inline: false }
            )
            .setColor(0x0099ff);

        // Create a new post (thread) in the forum channel with the embed
        const thread = await channel.threads.create({
            name: `${hitTrack.nickname || hitTrack.username}: ${hitTrack.title}`,
            message: {
                embeds: [embed],
            },
            reason: "New hitTrack entry",
        });

        // Post the video link as a separate message if it exists
        if (hitTrack.video_link) {
            try {
                await thread.send(hitTrack.video_link);
            } catch (err) {
                console.error(err);
            }
        }

        // Post each additional media link as a separate message in the thread
        if (Array.isArray(hitTrack.additional_media_links) && hitTrack.additional_media_links.length > 0) {
            for (const mediaLink of hitTrack.additional_media_links) {
                try {
                    await thread.send(mediaLink);
                } catch (err) {
                    console.error(err);
                }
            }
        }

        //save the thread ID to the hitTrack object
        hitTrack.thread_id = thread.id;
        try {
            await editHitLog(hitTrack.id, hitTrack);
            try { upsertHitInCache(hitTrack, { source: 'handleHitPost' }); } catch (cacheErr) {
                console.error('[HitCache] Failed to upsert after post:', cacheErr?.message || cacheErr);
            }
        } catch (err) {
            console.error(err);
        }
    } catch (error) {
        console.error(error);
        // On failure, remove the dedup marker so a retry can succeed
        try {
            const key = getHitDedupKey(hitTrack);
            _postedHitCache.delete(key);
        } catch {}
    }
}

module.exports = {
    handleHitPost,
}

// --- Update posting helper: append an updated embed into existing thread ---
function summarizeCargo(cargo) {
    try {
        const arr = Array.isArray(cargo) ? cargo : [];
        if (!arr.length) return 'None';
        return arr.map(c => `${Number(c.scuAmount||0)} SCU ${c.commodity_name || c.name || ''}`.trim()).join(', ');
    } catch { return 'None'; }
}

async function handleHitPostUpdate(client, hitBefore, hitAfter) {
    try {
        const threadId = hitAfter?.thread_id || hitAfter?.threadId || hitBefore?.thread_id || hitBefore?.threadId;
        if (!threadId) return;
        const channel = await client.channels.fetch(threadId).catch(() => null);
        if (!channel) return;

        const changed = [];
        const addChange = (label, fromVal, toVal, opts = {}) => {
            const f = toEmbedValue(fromVal, '—', opts.limit || 512);
            const t = toEmbedValue(toVal, '—', opts.limit || 512);
            if (f !== t) changed.push({ name: label, value: `Before: ${f}\nAfter: ${t}`, inline: false });
        };

        addChange('Title', hitBefore?.title, hitAfter?.title, { limit: 256 });
        addChange('Type', hitBefore?.air_or_ground, hitAfter?.air_or_ground);
        addChange('Total Value', hitBefore?.total_value, hitAfter?.total_value);
        addChange('Value Per Share', hitBefore?.total_cut_value, hitAfter?.total_cut_value);
        addChange('Total SCU', hitBefore?.total_scu, hitAfter?.total_scu);
        addChange('SCU Per Share', hitBefore?.total_cut_scu, hitAfter?.total_cut_scu);
        addChange('Patch', hitBefore?.patch, hitAfter?.patch);
        addChange('Assists', (hitBefore?.assists||[]).map(id=>`<@${id}>`).join(', ')||'None', (hitAfter?.assists||[]).map(id=>`<@${id}>`).join(', ')||'None');
        addChange('Victims', (hitBefore?.victims||[]).join(', ')||'None', (hitAfter?.victims||[]).join(', ')||'None');
        addChange('Cargo', summarizeCargo(hitBefore?.cargo), summarizeCargo(hitAfter?.cargo), { limit: 1024 });
        addChange('Video Link', hitBefore?.video_link || 'None', hitAfter?.video_link || 'None');
        if (toEmbedValue(hitBefore?.story, '').slice(0, 64) !== toEmbedValue(hitAfter?.story, '').slice(0, 64)) {
            changed.push({ name: 'Story', value: 'Story was updated.', inline: false });
        }

        const header = new EmbedBuilder()
            .setTitle(`Hit updated by ${hitAfter?.nickname || hitAfter?.username || 'Unknown'}`)
            .setDescription(toEmbedValue(hitAfter?.title || '', ''))
            .setColor(0x00cc99)
            .addFields(changed.length ? changed : [{ name: 'No visible changes', value: 'No fields changed.', inline: false }]);

        await channel.send({ embeds: [header] });
        try { upsertHitInCache(hitAfter, { source: 'handleHitPostUpdate' }); } catch (cacheErr) {
            console.error('[HitCache] Failed to upsert after update:', cacheErr?.message || cacheErr);
        }
    } catch (e) {
        console.error('handleHitPostUpdate error:', e?.message || e);
    }
}

module.exports.handleHitPostUpdate = handleHitPostUpdate;

// --- Deletion helper: append a deletion embed into existing thread ---
async function handleHitPostDelete(client, hit) {
    try {
        const threadId = hit?.thread_id || hit?.threadId;
        if (!threadId) return; // Nothing to post into
        const channel = await client.channels.fetch(threadId).catch(() => null);
        if (!channel) return;
        // Determine deleter: prefer explicit deleted_by fields injected at call-site
        const deleterDisplay = (() => {
            const nick = hit?.deleted_by_nickname || hit?.deleter_nickname;
            const user = hit?.deleted_by_username || hit?.deleter_username;
            const raw = hit?.deleted_by || hit?.deleter_id || null;
            if (nick) return nick;
            if (user) return user;
            if (raw) return String(raw);
            return hit?.nickname || hit?.username || 'Unknown'; // fallback to original author
        })();
        const embed = new EmbedBuilder()
            .setTitle(`Hit deleted by ${deleterDisplay}`)
            .setDescription('This hit has been removed from the database. The thread is preserved for historical context and discussion.')
            .addFields(
                { name: 'Hit ID', value: toEmbedValue(hit?.id), inline: true },
                { name: 'Type', value: toEmbedValue(hit?.air_or_ground || hit?.type_of_piracy), inline: true },
                { name: 'Total Value (aUEC)', value: toEmbedValue(hit?.total_value), inline: true },
                { name: 'Total SCU', value: toEmbedValue(hit?.total_scu), inline: true },
                { name: 'Assists', value: toEmbedValue(Array.isArray(hit?.assists) && hit.assists.length ? hit.assists.map(id=>`<@${id}>`).join(', ') : 'None'), inline: true },
                { name: 'Original Timestamp', value: toEmbedValue(hit?.timestamp || hit?.created_at), inline: true },
            )
            .setColor(0xcc0000);

        await channel.send({ embeds: [embed] });
        try { removeHitFromCache(hit?.id, { source: 'handleHitPostDelete' }); } catch (cacheErr) {
            console.error('[HitCache] Failed to remove after delete:', cacheErr?.message || cacheErr);
        }
    } catch (e) {
        console.error('handleHitPostDelete error:', e?.message || e);
    }
}

module.exports.handleHitPostDelete = handleHitPostDelete;