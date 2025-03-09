const { SlashCommandBuilder } = require('discord.js');

const userInfoCommand = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Get information about a user')
  .addUserOption(option => 
    option.setName('target')
      .setDescription('The user to get information about')
      .setRequired(true)
  );

// Export this command to use in your command handler or registration process
module.exports = {
  data: userInfoCommand,
  async execute(interaction) {
    const user = interaction.options.getUser('target');
    // Format the reply message with user info.
    const replyMessage = `**Username:** ${user.username}\n**ID:** ${user.id}\n**Tag:** ${user.tag}`;
    await interaction.reply(replyMessage);
  },
};