const { ChannelType, EmbedBuilder } = require("discord.js");

async function handleFleetCommanderChange(client, openai, userFleet) {
    const channelId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.FLEET_COMMANDERS_CHANNEL
        : process.env.TEST_FLEET_COMMANDERS_CHANNEL;

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
            // Add the fleet role to the commander
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(commanderId);
                if (member && userFleet.discord_role) {
                    await member.roles.add(userFleet.discord_role);
                }
            } catch (err) {
                console.error('Error adding fleet role to commander:', err);
            }
            await channel.permissionOverwrites.edit(commanderId, {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: true,
                EmbedLinks: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                UseExternalStickers: true,
                MentionEveryone: true,
                UseApplicationCommands: true,
            });
            await channel.send({ embeds: [embed] });
        } else if (action === "remove") {
            // Add the fleet role to the commander
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(commanderId);
                if (member && userFleet.discord_role) {
                    await member.roles.remove(userFleet.discord_role);
                }
            } catch (err) {
                console.error('Error adding fleet role to commander:', err);
            }
            await channel.permissionOverwrites.delete(commanderId);
            await channel.send({ embeds: [embed] });
        } else if (action === "close") {
            // Remove permissions for the commander (or changed_user_id if provided)
            if (changedUserId) {
                await channel.permissionOverwrites.delete(changedUserId);
            } else if (commanderId) {
                await channel.permissionOverwrites.delete(commanderId);
            }

            // Remove the fleet role from the commander
            try {
                const guild = channel.guild;
                if (commanderId && userFleet.discord_role) {
                    const commanderMember = await guild.members.fetch(commanderId);
                    if (commanderMember) {
                        await commanderMember.roles.remove(userFleet.discord_role);
                    }
                }
                // Remove the fleet role from all members in userFleet.members_ids
                if (Array.isArray(userFleet.members_ids) && userFleet.discord_role) {
                    for (const memberId of userFleet.members_ids) {
                        try {
                            const member = await guild.members.fetch(memberId);
                            if (member) {
                                await member.roles.remove(userFleet.discord_role);
                            }
                        } catch (err) {
                            console.error(`Error removing fleet role from member ${memberId}:`, err);
                        }
                    }
                }
            } catch (err) {
                console.error('Error removing fleet role(s) on close:', err);
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