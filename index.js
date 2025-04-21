const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const fs = require('node:fs');
const path = require('node:path');
// const threadHandler = require("./thread-handler");
const { preloadFromDb } = require("./common/preload-from-db.js");
const queueReminderCheck = require("./queue-functions/queue-controller.js").queueReminderCheck
const { processUEXData } = require("./common/process-uex-data.js")
const { handleMessage } = require('./threads/thread-handler.js');
const { createUser } = require('./api/userlistApi.js');
const { getUserById } = require('./api/userlistApi.js');
const { editUser } = require('./api/userlistApi.js');
const { getUserRank } = require('./userlist-functions/userlist-controller.js')
const { refreshUserlist } = require("./common/refresh-userlist.js");
const { saveMessage } = require("./common/message-saver.js");
const { loadChatlogs } = require("./vector-handling/vector-handler.js");
const { trimChatLogs } = require("./vector-handling/vector-handler.js");
const { getClasses } = require('./api/classApi.js');
const { queueChannelPoster } = require("./queue-functions/queue-controller.js")

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
  // processUEXData("commodities"); //do NOT await this, it takes forever
  // await trimChatLogs();
  // await loadChatlogs(client, openai)
  // console.log(client.guilds.fetch(process.env.TEST_GUILD_ID))
  // refreshUserlist(client, openai)
  preloadedDbTables = await preloadFromDb();

  // setInterval(() => userCache.clear(),
  //   21600000 // Clear cache every 6 hours, avoids excessive memory bloat
  // );
  setInterval(() => processUEXData("terminal_prices"), 
    86400000 //every 24 hours
  );
  setInterval(() => processUEXData("items_by_terminal"), 
    87480000 //every 24.3 hours
  );
  setInterval(() => processUEXData("other_tables"),
    674800000 //every 7 days
  );
  setInterval(async () => preloadedDbTables = preloadFromDb(),
    21600000 //every 6 hours
  );
  setInterval(() => queueReminderCheck(openai, client, null),
    43200000 //every 12 hours
  );
  setInterval(() => queueChannelPoster(client),
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
client.on('guildMemberAdd', async member => {
    try {
        const allClasses = await getClasses(); // Fetch all classes dynamically
        const classData = await generateClassData(allClasses); // Organize classes by category

        // Check if the user already exists in the database
        const user = await getUserById(member.user.id) || null;
        if (user) {
            console.log(`User ${member.user.username} is already in the UserList.`);
            return;
        }

        // Initialize the newUser object
        const newUser = {
            id: member.user.id,
            username: member.user.username,
            nickname: null,
            rank: null,
        };

        // Dynamically populate fields for each class category
        for (const [category, classes] of Object.entries(classData)) {
            for (const classObj of classes) {
                // Add a field for each class in the category
                newUser[classObj.name] = false; // Default to false (not completed)
            }
        }

        // Add the new user to the database
        const result = await createUser(newUser);
        if (result) {
            console.log(`User ${member.user.username} has been added to the UserList.`);
        } else {
            console.error(`Failed to add user ${member.user.username} to the UserList.`);
        }
    } catch (error) {
        console.error('Error adding new user:', error);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        const allClasses = await getClasses(); // Fetch all classes dynamically
        const classData = await generateClassData(allClasses); // Organize classes by category

        // Fetch the user's existing data
        const user = await getUserById(newMember.user.id) || null;
        if (!user) {
            console.log("Member update had no user identified, returning");
            return;
        }

        // Get the member's rank
        const memberRoles = newMember.roles.cache.map(role => role.id);
        const userRank = await getUserRank(memberRoles);

        // Initialize the updatedUser object
        const updatedUser = {
            id: user.id,
            username: newMember.user.username,
            nickname: newMember.nickname,
            rank: userRank,
        };

        // Dynamically populate fields for each class category
        for (const [category, classes] of Object.entries(classData)) {
            for (const classObj of classes) {
                // Add a field for each class in the category
                updatedUser[classObj.name] = user[classObj.name] || false; // Retain the user's existing completion status
            }
        }

        // Update the user's data in the database
        await editUser(user.id, updatedUser);
        console.log("User updated successfully");
    } catch (error) {
        console.error("Error updating user:", error);
    }
});

// Error handling to prevent crashes
client.on("error", (e) => {
  console.error("Discord client error!", e);
});

// Attempt to auto-reconnect on disconnection
client.on("disconnect", () => {
  console.log("Disconnected! Trying to reconnect...");
  client.login(process.env.LIVE_ENVIRONMENT === "true" ? process.env.CLIENT_TOKEN : process.env.TEST_CLIENT_TOKEN);
});

//logs the bot in
client.login(process.env.LIVE_ENVIRONMENT === "true" ? process.env.CLIENT_TOKEN : process.env.TEST_CLIENT_TOKEN);

async function generateClassData(allClasses) {
  const classData = {};
  try {
      for (const log of allClasses) {
          if (!classData[log.prestige_category]) {
              classData[log.prestige_category] = [];
          }

          classData[log.prestige_category].push({
              id: log.id,
              name: log.name,
              alt_name: log.alt_name,
              description: log.description,
              ai_function_class_names: log.ai_function_class_names,
              prerequisites: log.prerequisites,
              thumbnail_url: log.thumbnail_url,
              completed: false,
              value: 0,
              level: log.level
          });
      }
      return classData;
  }catch(error){
      console.error('Error generating leaderboard data:', error);
      return null;  // Return null if there's an error
  }
}