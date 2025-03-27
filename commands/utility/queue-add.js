const { SlashCommandBuilder } = require('discord.js');
// const { signupToClassQueue, getAvailableClasses } = require('../classQueue');
const { queueControllerForSlashCommands } = require('../../queue-functions/queue-controller');
const getAvailableClasses = require("../../queue-functions/get-available-classes").getAvailableClasses

const command = new SlashCommandBuilder()
  .setName('queue-signup')
  .setDescription('Sign up for a class or assessment.')
  .addStringOption(option =>
    option.setName('class')
      .setDescription('Choose a class or assessment to sign up for.')
      .setRequired(true)
      .setAutocomplete(true) // Enable dynamic autocomplete
  );

module.exports = {
  data: command,
  async execute(interaction, client, openai) {
    // Get the chosen class name from the command options
    const className = interaction.options.getString('class');
    const handlerUser = null;
    const addOrRemove = true;
    const classStatus = null;
    const selfOrOther = null;
    // Call your signup logic from the external file
    try {
      // await queueController(interaction.user.id, className);
      await interaction.reply(await queueControllerForSlashCommands(className, interaction.user, handlerUser,  openai, client, addOrRemove, classStatus, selfOrOther, interaction));
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error signing you up for the class.', ephemeral: true });
    }
  },
  async autocomplete(interaction) {
    // Get the user's current input so far
    const focusedValue = interaction.options.getFocused();
    // Get the classes that the user hasn’t taken yet
    const availableClasses = await getAvailableClasses(interaction.user, "available");
    // Filter based on the current input
    const filtered = availableClasses.filter(c =>
      c.toLowerCase().startsWith(focusedValue.toLowerCase())
    );
    // Discord allows up to 25 suggestions
    await interaction.respond(
      filtered.map(c => ({ name: c, value: c })).slice(0, 25)
    );
  }
};