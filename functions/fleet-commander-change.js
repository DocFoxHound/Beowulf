const { ChannelType, EmbedBuilder } = require("discord.js");

async function handleFleetCommanderChange(client, openai, userFleet) {
    const channelId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.FLEET_COMMANDERS_CHANNEL
        : process.env.TEST_FLEET_COMMANDERS_CHANNEL;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const commanderId = userFleet.commander_id;
    const action = userFleet.action;

    if (!commanderId || !action) return;

    try {
        const embed = new EmbedBuilder()
            .setTitle(`Fleet: ${userFleet.name}`)
            .setThumbnail(userFleet.avatar || null)
            .setColor(action === "add" ? 0x57F287 : 0xED4245)
            .setDescription(
                action === "add"
                    ? `<@${commanderId}> has been **added** as a Fleet Commander and now has access to this channel.`
                    : `<@${commanderId}> has been **removed** as a Fleet Commander and no longer has access to this channel.`
            );

        if (action === "add") {
            // Grant all required permissions
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
            // Remove the commander's permissions
            await channel.permissionOverwrites.delete(commanderId);
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Error updating fleet commander permissions:', err);
    }
}

module.exports = {
    handleFleetCommanderChange,
};