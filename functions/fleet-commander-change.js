const { ChannelType, EmbedBuilder } = require("discord.js");

async function handleFleetCommanderChange(client, openai, userFleet) {
    const channelId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.FLEET_COMMANDERS_CHANNEL
        : process.env.TEST_FLEET_COMMANDERS_CHANNEL;

    const fleetCommanderId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.FLEET_COMMANDER_ROLE
        : process.env.TEST_FLEET_COMMANDER_ROLE;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const commanderId = userFleet.commander_id;
    const action = userFleet.action;
    const changedUserId = userFleet.changed_user_id;

    if (!action) return;

    try {
        let embed;
        if (action === "add" || action === "remove") {
            embed = new EmbedBuilder()
                .setTitle(`Fleet: ${userFleet.name}`)
                .setThumbnail(userFleet.avatar || null)
                .setColor(action === "add" ? 0x57F287 : 0xED4245)
                .setDescription(
                    action === "add"
                        ? `<@${commanderId}> has been **added** as a Fleet Commander for **${userFleet.name}** and now has access to this channel.`
                        : `<@${commanderId}> has been **removed** as a Fleet Commander for **${userFleet.name}** and no longer has access to this channel.`
                );
        } else if (action === "close") {
            embed = new EmbedBuilder()
                .setTitle(`Fleet Closed: ${userFleet.name}`)
                .setThumbnail(userFleet.avatar || null)
                .setColor(0xED4245)
                .setDescription(
                    `Fleet **${userFleet.name}** has been **closed**. All commander permissions have been revoked.`
                );
        }

        if (action === "add") {
            // Add the fleetCommanderId role to the commander
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(commanderId);
                if (member && fleetCommanderId) {
                    await member.roles.add(fleetCommanderId);
                }
            } catch (err) {
                console.error('Error adding fleetCommanderId role to commander:', err);
            }
            await channel.send({ embeds: [embed] });
        } else if (action === "remove") {
            // Remove the fleetCommanderId role from the commander
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(commanderId);
                if (member && fleetCommanderId) {
                    await member.roles.remove(fleetCommanderId);
                }
            } catch (err) {
                console.error('Error removing fleetCommanderId role from commander:', err);
            }
            await channel.send({ embeds: [embed] });
        } else if (action === "close") {
            // Remove the fleetCommanderId role from the commander (and optionally changedUserId)
            try {
                const guild = channel.guild;
                if (commanderId && fleetCommanderId) {
                    const commanderMember = await guild.members.fetch(commanderId);
                    if (commanderMember) {
                        await commanderMember.roles.remove(fleetCommanderId);
                    }
                }
                if (changedUserId && fleetCommanderId) {
                    const changedMember = await guild.members.fetch(changedUserId);
                    if (changedMember) {
                        await changedMember.roles.remove(fleetCommanderId);
                    }
                }
            } catch (err) {
                console.error('Error removing fleetCommanderId role(s) on close:', err);
            }
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Error updating fleet commander permissions:', err);
    }
}

module.exports = {
    handleFleetCommanderChange,
};