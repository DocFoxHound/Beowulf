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
const { createUser } = require('./api/userlistApi.js');
const { getUserById } = require('./api/userlistApi.js');
const { editUser } = require('./api/userlistApi.js');
const { getUserRank } = require('./userlist-functions/userlist-controller.js')
const { getRaptorRankDb } = require('./userlist-functions/userlist-controller.js')
const { getCorsairRankDb } = require('./userlist-functions/userlist-controller.js')
const { getRaiderRankDb } = require('./userlist-functions/userlist-controller.js')
const { refreshUserlist } = require("./common/refresh-userlist.js");
const { saveMessage } = require("./common/message-saver.js");
const { loadChatlogs } = require("./vector-handling/vector-handler.js");
const { trimChatLogs } = require("./vector-handling/vector-handler.js");
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
channelIds = process.env.LIVE_ENVIRONMENT === "true" ? process.env.CHANNELS.split(",") : process.env.TEST_CHANNELS.split(",");
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
  await trimChatLogs();
  await loadChatlogs(client, openai)

  //routine tasks
  setInterval(() => vectorHandler.refreshChatLogs(channelIdAndName, openai, client),
    // 300000 // every 5 minutes
    10800000 //every 3 hours
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
  setInterval(async () => preloadedDbTables = preloadFromDb(), //do NOT await this, it takes forever
    21600000 //every 6 hours
  );
  setInterval(() => queueReminderCheck(openai, client, null),
    43200000 //every 12 hours
  );
  setInterval(() => refreshUserlist(client, openai),
    43201000 //every 12 hours and 1 second
  );
  setInterval(() => loadChatlogs(client, openai),
    60000 // every 1 minutes
    // 10800000 //every 3 hours
  );
  setInterval(() => trimChatLogs(),
    43200000 //every 12 hours
  );
}),

client.on("messageCreate", async (message) => {
  if (!channelIds.includes(message.channelId) || !message.guild || message.system) {
    return;
  }
  saveMessage(message, client);
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

// Event Listener: new member joins the server
client.on(Events.GuildMemberAdd, async member => {
  const user = await getUserById(member.user.id) || null;
  if(!user){
    console.log(`Trouble adding ${member.user.username} to the UserList.`);
    return;
  }
  if(user.id){
    console.log(`User ${member.user.username} is already in the UserList.`);
    return;
  }else{
    const newUser = {
      id: member.user.id,
      username: member.user.username,
      nickname: null,
      corsair_level: 0,
      raptor_level: 0,
      raider_level: 0,
      raptor_1_solo: false,
      raptor_1_team: false,
      raptor_2_solo: false,
      raptor_2_team: false,
      raptor_3_solo: false,
      raptor_3_team: false,
      corsair_1_turret: false,
      corsair_1_torpedo: false,
      corsair_2_ship_commander: false,
      corsair_2_wing_commander: false,
      corsair_3_fleet_commander: false,
      raider_1_swabbie: false,
      raider_1_linemaster: false,
      raider_1_boarder: false,
      raider_2_powdermonkey: false,
      raider_2_mate: false,
      raider_3_sailmaster: false,
      rank: null
    }
  
    const result = await createUser(newUser);
    if (result) {
      console.log(`User ${member.user.username} has been added to the UserList.`);
    } else {
      console.error(`Failed to add user ${member.user.username} to the UserList.`);
    }
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try{
    const oldNick = oldMember.nickname;
    const newNick = newMember.nickname;
    const user = await getUserById(newMember.user.id) || null;
    if(!user){
      console.log("Member update had no user identified, returning")
      return;
    }

    //get the member's rank
    const memberRoles = newMember.roles.cache.map(role => role.id);
    const userRank = await getUserRank(memberRoles);
    const raptorLevel = await getRaptorRankDb(oldMember.id);
    const corsairLevel = await getCorsairRankDb(oldMember.id);
    const raiderLevel = await getRaiderRankDb(oldMember.id);

    const updatedUser = {
      id: oldMember.id,
      username: newMember.username,
      nickname: newMember.nickname,
      corsair_level: corsairLevel,
      raptor_level: raptorLevel,
      raider_level: raiderLevel,
      raptor_1_solo: user.raptor_1_solo,
      raptor_1_team: user.raptor_1_team,
      raptor_2_solo: user.raptor_2_solo,
      raptor_2_team: user.raptor_2_team,
      raptor_3_solo: user.raptor_3_solo,
      raptor_3_team: user.raptor_3_team,
      corsair_1_turret: user.corsair_1_turret,
      corsair_1_torpedo: user.corsair_1_torpedo,
      corsair_2_ship_commander: user.corsair_2_ship_commander,
      corsair_2_wing_commander: user.corsair_2_wing_commander,
      corsair_3_fleet_commander: user.corsair_3_fleet_commander,
      raider_1_swabbie: user.raider_1_swabbie,
      raider_1_linemaster: user.raider_1_linemaster,
      raider_1_boarder: user.raider_1_boarder,
      raider_2_powdermonkey: user.raider_2_powdermonkey,
      raider_2_mate: user.raider_2_mate,
      raider_3_sailmaster: user.raider_3_sailmaster,
      rank: userRank
    }
    await editUser(user.id, updatedUser);
    console.log("User updated successfully");
  }catch(error){
    console.log("Error updating user: ", error);
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
