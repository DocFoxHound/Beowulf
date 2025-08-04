const { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { updateSchedule } = require('../api/scheduleApi'); // Make sure this path is correct
const { buildEventEmbed } = require('../common/embeds');
const { getFleetById } = require('../api/userFleetApi');
const crypto = require('crypto'); // Add this at the top if not already imported

async function handleScheduleCreate(client, openai, scheduleObject){
    console.log("Handling schedule creation...");
    // Parse fields from scheduleObject
    const {
        id,
        author_id,
        type,
        attendees = [],
        author_username,
        attendees_usernames = [],
        timestamp,
        title,
        description,
        start_time,
        end_time,
        appearance,
        repeat,
        rsvp_options,
        fleet,
        patch,
        active,
        repeat_end_date,
        repeat_frequency,
        repeat_series,
        event_members,
        discord_channel,
        discord_buttons
    } = scheduleObject;

    const RONIN_ID = process.env.LIVE_ENVIRONMENT === "true" ? process.env.RONIN_ROLE : process.env.TEST_RONIN_ROLE;

    // Determine channel ID
    let channelId = discord_channel;

    // Parse appearance for color and image
    let embedColor = 0x2b2d31; // Default Discord dark gray
    let embedImage = null;
    if (appearance) {
        try {
            const parsedAppearance = typeof appearance === "string" ? JSON.parse(appearance) : appearance;
            if (parsedAppearance.color) {
                // Remove '#' if present and parse as int
                embedColor = parseInt(parsedAppearance.color.replace(/^#/, ""), 16);
            }
            if (parsedAppearance.image) {
                embedImage = parsedAppearance.image;
            }
        } catch (e) {
            // Ignore parse errors, use defaults
        }
    }

    // Parse RSVP options
    let rsvpOptionsArr = [];
    if (rsvp_options) {
        try {
            rsvpOptionsArr = typeof rsvp_options === "string" ? JSON.parse(rsvp_options) : rsvp_options;
        } catch (e) {
            rsvpOptionsArr = [];
        }
    }

    // Organize users by RSVP type
    const rsvpMap = {};
    if (Array.isArray(rsvpOptionsArr)) {
        rsvpOptionsArr.forEach(opt => {
            rsvpMap[opt.name] = [];
        });
    }

    if (Array.isArray(event_members) && event_members.length > 0) {
        event_members.forEach(memberStr => {
            try {
                let memberObj = memberStr;
                if (typeof memberStr === "string") {
                    memberObj = JSON.parse(memberStr);
                    if (typeof memberObj === "string") {
                        memberObj = JSON.parse(memberObj);
                    }
                }
                if (memberObj.user_id && memberObj.name && rsvpMap[memberObj.name] !== undefined) {
                    rsvpMap[memberObj.name].push(`<@${memberObj.user_id}>`);
                }
            } catch (e) {
                // Ignore parse errors
            }
        });
    }

    // Fetch fleet info
    let fleets = [];
    if (Array.isArray(fleet) && fleet.length > 0) {
        fleets = (
            await Promise.all(
                fleet.map(async (fleetId) => {
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

    // Build the embed using the shared function
    const embed = buildEventEmbed({
        title,
        description,
        embedColor,
        embedImage,
        start_time,
        end_time,
        timestamp,
        id,
        rsvpOptionsArr,
        rsvpMap,
        fleets
    });

    // Parse RSVP options and create buttons
    let actionRow = null;
    let rsvpButtonCustomIds = []; // Array to hold button custom IDs for DB

    if (rsvp_options) {
        let options;
        try {
            options = typeof rsvp_options === "string" ? JSON.parse(rsvp_options) : rsvp_options;
            if (Array.isArray(options) && options.length > 0) {
                actionRow = new ActionRowBuilder();
                options.forEach((opt, idx) => {
                    // Format: "uniqueId_optionName"
                    const customId = `rsvp_${id}_${opt.name}`;
                    rsvpButtonCustomIds.push(customId);
                    // Use the customId in the button's customId
                    actionRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`${customId}`)
                            .setLabel(opt.emoji ? `${opt.emoji}` : opt.name)
                            .setStyle(ButtonStyle.Secondary)
                    );
                });
            }
        } catch (e) {
            // Ignore parse errors, no buttons will be added
        }
    }

    // Send the embed to the correct channel with buttons if available
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error("Target channel not found or is not a text channel.");
    }

    let sentMessage;
    if (actionRow) {
        sentMessage = await channel.send({ embeds: [embed], components: [actionRow] });
    } else {
        sentMessage = await channel.send({ embeds: [embed] });
    }

    // Create a thread for discussion (move this up)
    let thread = null;
    try {
        thread = await sentMessage.startThread({
            name: `${title} Discussion`,
            autoArchiveDuration: 1440 // 24 hours
        });
    } catch (err) {
        console.error('Failed to create thread:', err.message);
    }

    // After sending, update the schedule in the database with the Discord message ID, button custom IDs, and thread ID
    if (sentMessage && sentMessage.id && id) {
        try {
            await updateSchedule(id, { 
                active: true,
                discord_post: sentMessage.id,
                discord_buttons: rsvpButtonCustomIds,
                discord_thread: thread ? thread.id : null,
            }, false);
        } catch (err) {
            console.error('Failed to update schedule with discord_post and discord_buttons:', err.message);
        }
    }

    // Post fleet info in the thread
    if (thread && fleets.length > 0 && (type === 'Fleet' || type === 'RoninFleet')) {
        for (const fleet of fleets) {
            // Collect commander and member IDs
            let commanderMention = fleet.commander_id ? `<@${fleet.commander_id}>` : '';
            let memberMentions = (fleet.member_ids || []).filter(id => id !== fleet.commander_id).map(id => `<@${id}>`).join(' ');
            // Build content, commander first
            let content = `# ${fleet.name}\nHas been called to action!\n`;
            if (commanderMention) {
                content += commanderMention + ' ';
            }
            if (memberMentions) {
                content += memberMentions;
            }
            if (fleet.avatar) {
                content += `\n${fleet.avatar}`;
            }
            await thread.send({ content });
        }
    }

    // Post Ronin info to thread
    if (thread && (type === 'RoninFleet' || type === 'Ronin')) {
        const roninPing = RONIN_ID ? `<@&${RONIN_ID}>` : '';
        const roninContent = `${roninPing}\nThe Ronins have been requested to join this event. Please check the details above and respond accordingly.`;
        await thread.send({ content: roninContent });
    }
}

module.exports = {
    handleScheduleCreate,
};