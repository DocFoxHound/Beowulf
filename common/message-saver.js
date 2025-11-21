const { createChatMessage } = require("../api/chatMessagesApi");

const MAX_JOINED_ATTACHMENTS = 5;

function flattenEmbeds(embeds = []) {
    if (!Array.isArray(embeds) || embeds.length === 0) return [];
    return embeds.map((embed) => {
        if (!embed) return "";
        const title = embed.title || "";
        const description = embed.description || "";
        const fields = Array.isArray(embed.fields)
            ? embed.fields.map((field) => `${field.name}: ${field.value}`).join("\n")
            : "";
        const footer = embed.footer?.text || "";
        const author = embed.author?.name || "";
        return [title, description, fields, footer, author].filter(Boolean).join("\n");
    }).filter(Boolean);
}

function flattenAttachments(attachments) {
    if (!attachments || attachments.size === 0) return [];
    const limited = Array.from(attachments.values()).slice(0, MAX_JOINED_ATTACHMENTS);
    return limited.map((attachment) => attachment.url || attachment.name).filter(Boolean);
}

function buildContentFromMessage(message) {
    const parts = [];
    if (message?.content) parts.push(message.content);
    parts.push(...flattenEmbeds(message?.embeds));
    parts.push(...flattenAttachments(message?.attachments));
    return parts.join("\n").trim();
}

async function saveMessage(message) {
    try {
        if (!message) return null;
        const guildId = message.guildId || message.guild?.id;
        const channelId = message.channelId;
        const userId = message.author?.id;
        if (!guildId || !channelId || !userId) return null;

        const content = buildContentFromMessage(message);
        if (!content) return null;

        const payload = {
            guild_id: guildId,
            channel_id: channelId,
            user_id: userId,
            content,
            timestamp: message.createdAt ? message.createdAt.toISOString() : new Date().toISOString(),
        };

        const saved = await createChatMessage(payload);
        if (!saved) {
            console.error('Failed to save message');
            return payload;
        }
        return saved;
    } catch (error) {
        console.error('Failed to save message:', error);
        return null;
    }
}

module.exports = {
    saveMessage
};