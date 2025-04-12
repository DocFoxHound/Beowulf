const { createMessage } = require("../api/messageApi");
const logger = require('../logger');

async function saveMessage(message, client) {
    try {
        // Extract text content from the message
        let messageContent = message.content;

        // Check if the message contains embeds
        if (message.embeds.length > 0) {
            const embedTexts = message.embeds.map(embed => {
                // Extract text from various embed fields
                const title = embed.title || "";
                const description = embed.description || "";
                const fields = embed.fields.map(field => `${field.name}: ${field.value}`).join("\n");
                const footer = embed.footer?.text || "";
                const author = embed.author?.name || "";

                // Combine all text into a single string
                return [title, description, fields, footer, author].filter(Boolean).join("\n");
            });

            // Append embed text to the message content
            messageContent += "\n" + embedTexts.join("\n");
        }

        // Prepare the chunk to save
        const chunk = { 
            role: client.user.username === message.author.username ? "assistant" : "user",
            content: `@${message.author.nickname || message.author.username}: '${messageContent}'`,
            metadata: {
                channel: `${message.channel.name}`,
                user: `${message.author.nickname || message.author.username}`,
                date: `${new Date().toISOString()}`,
                string_to_reference_user_in_response: `<@${message.author.id}>`,
            }
        };

        const model = { id: message.id, message: chunk, channel_name: message.channel.name };
        const success = await createMessage(model);
        if (!success) {
            console.error('Failed to save message');
        }
    } catch (error) {
        console.error('Failed to save message:', error);
    }
}

module.exports = {
    saveMessage
};