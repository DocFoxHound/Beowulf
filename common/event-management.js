const fs = require("node:fs");
const { updateSchedule, getNextScheduleByRepeatSeries, getActiveSchedules } = require('../api/scheduleApi');
const { handleScheduleCreate } = require('../functions/create-new-schedule');

async function manageEvents(client, openai) {

    // Get only active schedules from the API
    const schedules = await getActiveSchedules();

    // No need to filter, all are active
    const activeSchedules = schedules;
    const inactiveSchedules = []; // Not used, but kept for compatibility

    // Process expired active schedules
    const now = new Date(Date.now() - 60 * 60 * 1000); // now plus one hour
    for (const schedule of activeSchedules) {
        let expired = false;
        if (schedule.start_time) {
            expired = new Date(schedule.start_time) < now;
            console.log(`Checking schedule ${schedule.id} - expired: ${expired}`);
        }

        if (expired) {
            // Delete Discord thread if exists
            if (schedule.discord_thread) {
                try {
                    const thread = await client.channels.fetch(schedule.discord_thread);
                    if (thread) await thread.delete('Event expired');
                } catch (err) {
                    console.error(`Failed to delete thread ${schedule.discord_thread}:`, err.message);
                }
            }
            // Delete Discord post if exists
            if (schedule.discord_post) {
                try {
                    if (schedule.discord_channel) {
                        const channel = await client.channels.fetch(schedule.discord_channel);
                        if (channel) {
                            const message = await channel.messages.fetch(schedule.discord_post);
                            if (message) await message.delete('Event expired');
                        }
                    }
                } catch (err) {
                    console.error(`Failed to delete post ${schedule.discord_post}:`, err.message);
                }
            }
            // Mark schedule as inactive and update in DB
            try {
                schedule.active = false;
                await updateSchedule(schedule.id, schedule, false);

                // If this schedule is part of a repeat series, activate the next one
                if (schedule.repeat_series) {
                    // Use API to get the next schedule in the series
                    const nextSchedule = await getNextScheduleByRepeatSeries(schedule.id);
                    if (nextSchedule) {
                        // Create the event in Discord
                        await handleScheduleCreate(client, openai, nextSchedule);
                    }
                }
            } catch (err) {
                console.error(`Failed to update schedule ${schedule.id}:`, err.message);
            }
        // Give notice for upcoming event and ping attendees
        } else if (
            schedule.start_time &&
            !schedule.first_notice &&
            Array.isArray(schedule.attendees) &&
            schedule.attendees.length > 0
        ) {
            const startTime = new Date(schedule.start_time);
            const nowTime = new Date();
            const diffMinutes = (startTime - nowTime) / (1000 * 60);

            if (diffMinutes <= 30 && diffMinutes > 20) {
                // Send notification to all attendees
                if (schedule.discord_channel) {
                    try {
                        const thread = await client.channels.fetch(schedule.discord_thread);
                        if (thread) {
                            const mentions = schedule.attendees.map(id => `<@${id}>`).join(' ');
                            await thread.send(
                                `# ${schedule.title} \n...is starting in 30 minutes! \n${mentions}`
                            );
                        }
                    } catch (err) {
                        console.error(`Failed to send first notice for schedule ${schedule.id}:`, err.message);
                    }
                }
                // Update first_notice in DB
                try {
                    schedule.first_notice = true;
                    await updateSchedule(schedule.id, schedule, false);
                } catch (err) {
                    console.error(`Failed to update first_notice for schedule ${schedule.id}:`, err.message);
                }
            }
        } else if (
            schedule.start_time &&
            schedule.first_notice &&
            !schedule.second_notice &&
            Array.isArray(schedule.attendees) &&
            schedule.attendees.length > 0
        ) {
            const startTime = new Date(schedule.start_time);
            const nowTime = new Date();
            const diffMinutes = (startTime - nowTime) / (1000 * 60);

            if (diffMinutes <= 5 && diffMinutes > 0) {
                // Send notification to all attendees
                if (schedule.discord_channel) {
                    try {
                        const thread = await client.channels.fetch(schedule.discord_thread);
                        if (thread) {
                            const mentions = schedule.attendees.map(id => `<@${id}>`).join(' ');
                            await thread.send(
                                `# ${schedule.title} \n...is starting! \n${mentions}`
                            );
                        }
                    } catch (err) {
                        console.error(`Failed to send second notice for schedule ${schedule.id}:`, err.message);
                    }
                }
                // Update first_notice in DB
                try {
                    schedule.second_notice = true;
                    await updateSchedule(schedule.id, schedule, false);
                } catch (err) {
                    console.error(`Failed to update second_notice for schedule ${schedule.id}:`, err.message);
                }
            }
        }
    }

    // Return grouped schedules if needed
    return { activeSchedules, inactiveSchedules };
}

module.exports = {
    manageEvents
};