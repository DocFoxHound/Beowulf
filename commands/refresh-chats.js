// Requre the necessary discord.js classes
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const vectorHandler = require("./vector-handler.js");

module.exports = {
    data: new SlashCommandBuilder()
        // Command details
        .setName('refresh_chatlogs')
        .setDescription('Refresh the Chat Logs.'),
        // .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        // .setDMPermission(false),
    async execute(interaction, state) {
        // Commands to execute
        state.isPaused = false;
        await vectorHandler.refreshChatLogs(channelIdAndName, openai, client)
    },
};
