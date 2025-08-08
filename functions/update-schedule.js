const { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { updateSchedule, getScheduleById } = require('../api/scheduleApi');
const { buildEventEmbed } = require('../common/embeds'); // <-- Import the shared embed builder
const { getFleetById } = require('../api/userFleetApi');
const crypto = require('crypto');

async function handleScheduleUpdate(client, openai, scheduleObject, userId, optName) {
    try {
        let channelId = scheduleObject.discord_channel;

        // Parse appearance for color and image
        let embedColor = 0x2b2d31;
        let embedImage = null;
        if (scheduleObject.appearance) {
            try {
                const parsedAppearance = typeof scheduleObject.appearance === "string"
                    ? JSON.parse(scheduleObject.appearance)
                    : scheduleObject.appearance;
                if (parsedAppearance.color) {
                    embedColor = parseInt(parsedAppearance.color.replace(/^#/, ""), 16);
                }
                if (parsedAppearance.image) {
                    embedImage = parsedAppearance.image;
                }
            } catch (e) { /* ignore */ }
        }

        // Parse RSVP options
        let rsvpOptionsArr = [];
        if (scheduleObject.rsvp_options) {
            try {
                rsvpOptionsArr = typeof scheduleObject.rsvp_options === "string"
                    ? JSON.parse(scheduleObject.rsvp_options)
                    : scheduleObject.rsvp_options;
            } catch (e) {
                rsvpOptionsArr = [];
            }
        }

        // --- Retrieve and update RSVP state ---
        let latestSchedule;
        try {
            latestSchedule = await getScheduleById(scheduleObject.id);
        } catch (e) {
            console.error('Failed to fetch schedule for attendee check:', e.message);
            throw e;
        }
        if (!latestSchedule) throw new Error('Schedule not found for attendee check.');

        let updatedAttendees = Array.isArray(latestSchedule.attendees) ? [...latestSchedule.attendees] : [];
        let updatedEventMembers = Array.isArray(latestSchedule.event_members) ? [...latestSchedule.event_members] : [];
        let memberObj = { user_id: userId, name: optName };
        let memberStr = JSON.stringify(memberObj);

        if (updatedAttendees.map(String).includes(String(userId))) {
            updatedEventMembers = updatedEventMembers.map(m => {
                try {
                    let parsed = typeof m === "string" ? JSON.parse(m) : m;
                    if (typeof parsed === "string") parsed = JSON.parse(parsed);
                    if (parsed.user_id === userId) parsed.name = optName;
                    return JSON.stringify(parsed);
                } catch { return m; }
            });
        } else {
            updatedAttendees.push(userId);
            updatedEventMembers = updatedEventMembers.filter(m => {
                try {
                    let parsed = typeof m === "string" ? JSON.parse(m) : m;
                    if (typeof parsed === "string") parsed = JSON.parse(parsed);
                    return parsed.user_id !== userId;
                } catch { return true; }
            });
            updatedEventMembers.push(memberStr);
        }

        // --- Build RSVP map (user mentions under each option) ---
        const rsvpMap = {};
        if (Array.isArray(rsvpOptionsArr)) {
            rsvpOptionsArr.forEach(opt => {
                rsvpMap[opt.name] = [];
            });
        }
        if (Array.isArray(updatedEventMembers) && updatedEventMembers.length > 0) {
            updatedEventMembers.forEach(memberStr => {
                try {
                    let memberObj = memberStr;
                    if (typeof memberStr === "string") {
                        memberObj = JSON.parse(memberStr);
                        if (typeof memberObj === "string") memberObj = JSON.parse(memberObj);
                    }
                    if (memberObj.user_id && memberObj.name && rsvpMap[memberObj.name] !== undefined) {
                        rsvpMap[memberObj.name].push(`<@${memberObj.user_id}>`);
                    }
                } catch (e) { /* ignore */ }
            });
        }

        // Fetch fleet info
        let fleets = [];
        if (Array.isArray(scheduleObject.fleet) && scheduleObject.fleet.length > 0) {
            fleets = (
                await Promise.all(
                    scheduleObject.fleet.map(async (fleetId) => {
                        const fleetData = await getFleetById(fleetId);
                        if (Array.isArray(fleetData)) {
                            // Map each fleet object in the array
                            return fleetData.map(fleetObj => ({
                                name: fleetObj.name,
                                avatar: fleetObj.avatar,
                                member_ids: fleetObj.members_ids || []
                            }));
                        } else if (fleetData) {
                            // Single fleet object
                            return [{
                                name: fleetData.name,
                                avatar: fleetData.avatar,
                                member_ids: fleetData.members_ids || []
                            }];
                        }
                        return [];
                    })
                )
            ).flat();
            fleets = fleets.filter(Boolean);
        }

        // --- Build the embed using the shared function ---
        const embed = buildEventEmbed({
            title: scheduleObject.title,
            description: scheduleObject.description,
            embedColor,
            embedImage,
            start_time: scheduleObject.start_time,
            end_time: scheduleObject.end_time,
            timestamp: scheduleObject.timestamp,
            id: scheduleObject.id,
            rsvpOptionsArr,
            rsvpMap,
            fleets,
        });

        // --- Build RSVP buttons and action row exactly as in create-new-schedule.js ---
        let actionRow = null;
        let rsvpButtonCustomIds = [];
        if (Array.isArray(rsvpOptionsArr) && rsvpOptionsArr.length > 0) {
            actionRow = new ActionRowBuilder();
            rsvpOptionsArr.forEach((opt, idx) => {
                const customId = `rsvp_${scheduleObject.id}_${opt.name}`;
                rsvpButtonCustomIds.push(customId);
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(customId)
                        .setLabel(opt.emoji ? `${opt.emoji}` : opt.name)
                        .setStyle(ButtonStyle.Secondary)
                );
            });
        }
        // --- Edit the existing message using scheduleObject.discord_post ---
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
            throw new Error("Target channel not found or is not a text channel.");
        }

        const messageId = scheduleObject.discord_post?.toString();
        if (!messageId) throw new Error("No discord_post (message ID) provided for update.");

        try {
            const message = await channel.messages.fetch(messageId);
            if (actionRow) {
                await message.edit({ embeds: [embed], components: [actionRow] });
            } else {
                await message.edit({ embeds: [embed], components: [] });
            }
            await updateSchedule(scheduleObject.id, {
                active: true,
                discord_buttons: rsvpButtonCustomIds,
                attendees: updatedAttendees,
                event_members: updatedEventMembers,
            }, false);
        } catch (err) {
            console.error('Failed to update Discord message or DB:', err.message);
            throw err;
        }
    } catch (error) {
        console.error('Error in handleScheduleUpdate:', error);
    }
}

module.exports = {
    handleScheduleUpdate,
};