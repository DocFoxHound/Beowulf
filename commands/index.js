const knowledgeDocIngest = require('./knowledge-doc-ingest');
const entityUpload = require('./entity-upload');
const playerItemUpload = require('./player-item-upload');
const componentItemUpload = require('./component-item-upload');
const shipListUpload = require('./ship-list-upload');

const slashCommands = [knowledgeDocIngest, entityUpload, playerItemUpload, componentItemUpload, shipListUpload].filter(Boolean);

function getSlashCommandData() {
  return slashCommands
    .map((cmd) => {
      if (!cmd) return null;
      if (typeof cmd.data?.toJSON === 'function') return cmd.data.toJSON();
      if (cmd.data) return cmd.data;
      if (cmd.definition) return cmd.definition;
      return null;
    })
    .filter(Boolean);
}

function findCommand(name) {
  if (!name) return null;
  return slashCommands.find((cmd) => {
    if (!cmd) return false;
    if (cmd.name && cmd.name === name) return true;
    const dataName = typeof cmd.data?.name === 'string' ? cmd.data.name : cmd.data?.name?.toString();
    return dataName === name;
  }) || null;
}

async function handleSlashCommand(interaction, context = {}) {
  if (!interaction?.isChatInputCommand?.()) return false;
  const command = findCommand(interaction.commandName);
  if (!command?.execute) return false;
  await command.execute(interaction, context);
  return true;
}

module.exports = {
  slashCommands,
  getSlashCommandData,
  handleSlashCommand,
};
