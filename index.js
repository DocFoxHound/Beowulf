const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const fs = require('node:fs');
const path = require('node:path');
const vectorHandler = require("./vector-handling/vector-handler.js");
// const threadHandler = require("./thread-handler");
const { preloadFromDb } = require("./common/preload-from-db.js");
const downloadUEXData = require("./common/download-UEX-Data.js")
const queueReminderCheck = require("./queue-functions/queue-controller.js").queueReminderCheck
const retryMessageAdd = require("./threads/retry-message-add.js")
const sendResponse = require("./threads/send-response.js")
const formatResponse = require("./threads/format-response.js")
const handleRequiresAction = require("./threads/handle-requires-action.js")
const runThread = require("./threads/run-thread.js")
const formatMessage = require("./threads/format-message.js")
const addMessageToThread = require("./threads/add-message-to-thread.js")
const deployCommands = require("./deploy-commands.js")
const { processUEXData } = require("./common/process-uex-data.js")
const { handleMessage } = require('./threads/thread-handler.js');
// const checkQueue = require("./queue-functions/queue-check.js")

// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = ".env";
if (args.length === 1) {
  envFile = `${args[0]}`;
}
dotenv.config({
  path: envFile,
});

// Setup OpenAI
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// Create a new discord client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

client.commands = new Collection();

//collect all of the commands
// const foldersPath = 'commands';
const foldersPath = path.join(__dirname, '/commands/');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Set channels
channelIds = process.env?.CHANNELS?.split(",");
channelIdAndName = [];

//json things to hold in memory
let preloadedDbTables;

//array of threads (one made per user)
// threadArray = [{channelId: "", threadId: "", isActive: Boolean, isRetrying: Boolean}];

//list of messages we need to add, queued
const messageAddQueue = [];

//array of stored messages to be processed
messageArray = [];

//used to store cache'd users, periodically refreshed
userCache = new Map();

//populate the messageArray as an array of messages grouped by the ChannelId as a key
channelIds.forEach((channel) => {
  messageArray.push({
    channelId: channel,
    conversation: [],
  });
});

// Retrieve the bot assistant (read: personality)
myAssistant = openai.beta.assistants;
async function retrieveAssistant() {
  myAssistant = await openai.beta.assistants.retrieve(
    process.env.ASSISTANT_KEY
  );
}

//---------------------------------------------------------------------------------//

//retrieve the chatGPT assistant
retrieveAssistant();

//Event Listener: login
client.on("ready", async () => {
  //fetch channels on a promise, reducing startup time
  const channelFetchPromises = channelIds.map(id => client.channels.fetch(id).catch(e => console.error(`Failed to fetch channel: ${id}`, e)));
  const channels = await Promise.all(channelFetchPromises);
  //preload some channelIDs and Names
  channelIdAndName = channels.map(channel => ({
    channelName: channel?.name,
    channelId: channel?.id
  })).filter(channel => channel.channelId);
  console.log(`Logged in as ${client.user.tag}!`);

  //start off with a fresh reload of the online files
  // await vectorHandler.refreshChatLogs(channelIdAndName, openai, client)
  // await vectorHandler.refreshUserList(openai, client)
  // processUEXData("all"); //do NOT await this, it takes forever
  preloadedDbTables = await preloadFromDb();

  //routine tasks
  setInterval(() => vectorHandler.refreshChatLogs(channelIdAndName, openai, client),
    // 300000 // every 5 minutes
    10800000 //every 3 hours
  );
  setInterval(() => vectorHandler.refreshUserList(openai, client),
    43200000 //every 12 hours
  );
  // setInterval(() => userCache.clear(),
  //   21600000 // Clear cache every 6 hours, avoids excessive memory bloat
  // );
  setInterval(() => processUEXData("terminal_prices"), //do NOT await this, it takes forever
    86400000 //every 24 hours
  );
  setInterval(() => processUEXData("other_tables"), //do NOT await this, it takes forever
    674800000 //every 7 days
  );
  setInterval(async () => preloadedDbTables = await preloadFromDb(), //do NOT await this, it takes forever
    21600000 //every 6 hours
  );
  setInterval(() => queueReminderCheck(openai, client, null, null),
    43200000 //every 12 hours
  );
}),

client.on("messageCreate", async (message) => {
  if (!channelIds.includes(message.channelId) || !message.guild || message.system) {
    return;
  }
  handleMessage(message, openai, client, preloadedDbTables);

});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
  
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction, client, openai);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		}
	}
});

client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isChatInputCommand()) {
		// command handling
	} else if (interaction.isAutocomplete()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.autocomplete(interaction, client, openai);
		} catch (error) {
			console.error(error);
		}
	}
});

// Error handling to prevent crashes
client.on("error", (e) => {
  console.error("Discord client error!", e);
});

// Attempt to auto-reconnect on disconnection
client.on("disconnect", () => {
  console.log("Disconnected! Trying to reconnect...");
  client.login(process.env.CLIENT_TOKEN);
});

//logs the bot in
client.login(process.env.CLIENT_TOKEN);
