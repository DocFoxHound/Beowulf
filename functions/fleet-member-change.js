const { ChannelType, EmbedBuilder } = require("discord.js");

async function handleFleetMemberChange(client, openai, userFleet) {
    const channelId = process.env.LIVE_ENVIRONMENT === "true"
        ? process.env.FLEET_COMMANDERS_CHANNEL
        : process.env.TEST_FLEET_COMMANDERS_CHANNEL;

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const action = userFleet.action;
    const changedUserId = userFleet.changed_user_id;

    if (!action || !changedUserId) return;

    try {
        // Add the fleet role to the member if they joined
        if (action === "add_member" && userFleet.discord_role) {
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(changedUserId);
                if (member) {
                    await member.roles.add(userFleet.discord_role);
                }
            } catch (err) {
                console.error('Error adding fleet role to member:', err);
            }
        }
        // Remove the fleet role to the member if they joined
        if (action === "remove_member" && userFleet.discord_role) {
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(changedUserId);
                if (member) {
                    await member.roles.remove(userFleet.discord_role);
                }
            } catch (err) {
                console.error('Error removing fleet role to member:', err);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`Fleet: ${userFleet.name}`)
            .setThumbnail(userFleet.avatar || null)
            .setColor(action === "add_member" ? 0x57F287 : 0xED4245)
            .setDescription(
                action === "add_member"
                    ? `<@${changedUserId}> has **joined** the fleet **${userFleet.name}**.`
                    : `<@${changedUserId}> has **left** or been **removed** from the fleet **${userFleet.name}**.`
            );
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Error updating fleet member:', err);
    }
}

module.exports = {
    handleFleetMemberChange,
};