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
const { checkRecentGatherings } = require("./common/check-recent-gatherings.js");
const { getClasses } = require('./api/classApi.js');
const bodyParser = require('body-parser');
const { handleHitPost } = require('./functions/post-new-hit.js');
const { handleFleetLogPost } = require('./functions/post-new-fleet-log.js');
const { handleFleetCreatePost } = require('./functions/post-new-fleet-create.js');
const { handleScheduleCreate } = require('./functions/create-new-schedule.js');
const { handleScheduleUpdate } = require('./functions/update-schedule.js');
const { updateSchedule } = require('./api/scheduleApi.js');
const { manageEvents } = require('./common/event-management.js');
const { handleFleetCommanderChange } = require('./functions/fleet-commander-change.js');
const { handleFleetMemberChange } = require('./functions/fleet-member-change.js');
const { processLeaderboards } = require('./functions/process-leaderboards.js');

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
  processLeaderboards(client, openai)

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
  // setInterval(() => queueReminderCheck(openai, client, null),
  //   43200000 //every 12 hours
  // );
  // setInterval(() => queueChannelPoster(client),
  //   43200000 //every 12 hours
  // );
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
  setInterval(() => checkRecentGatherings(client, openai),
    3600000 //every 1 hour
  );
  setInterval(() => manageEvents(client, openai),
    300000 // every 5 minutes
  );
  setInterval(() => processLeaderboards(client, openai),
    14400000 //every 4 hours
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
            roles: member.roles.cache.map(role => role.id),
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

        // Get the member's rank and prestige levels
        const memberRoles = newMember.roles.cache.map(role => role.id);
        const userRank = await getUserRank(memberRoles);

        // Fetch prestige roles for level calculation
        const { getPrestiges, getRaptorRank, getCorsairRank, getRaiderRank } = require("./userlist-functions/userlist-controller");
        const prestigeRoles = await require("./api/prestige-roles-api").getPrestiges();
        const raptorLevel = await getRaptorRank(memberRoles, prestigeRoles);
        const corsairLevel = await getCorsairRank(memberRoles, prestigeRoles);
        const raiderLevel = await getRaiderRank(memberRoles, prestigeRoles);

        // Initialize the updatedUser object
        const updatedUser = {
            id: user.id,
            username: newMember.user.username,
            nickname: newMember.nickname,
            rank: userRank,
            roles: memberRoles,
            raptor_level: raptorLevel,
            corsair_level: corsairLevel,
            raider_level: raiderLevel,
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

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    console.log("Button interaction received:", interaction.customId);

    // Only allow in specific event channels
    const allowedChannels = [
        process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_PUBLIC_CHANNEL : process.env.TEST_EVENTS_PUBLIC_CHANNEL,
        process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_CREW_CHANNEL : process.env.TEST_EVENTS_CREW_CHANNEL,
        process.env.LIVE_ENVIRONMENT === "true" ? process.env.EVENTS_MARAUDER_CHANNEL : process.env.TEST_EVENTS_MARAUDER_CHANNEL,
    ];
    if (!allowedChannels.includes(interaction.channelId)) return;
    // Parse customId in the format: type_scheduleId_buttonId_optName (e.g., rsvp_5267609524_11758094_Yes)
    const match = interaction.customId.match(/^([^_]+)_([^_]+)_(.+)$/);
    if (!match) return;

    const type = match[1];
    const scheduleId = match[2];
    const optName = match[3];
    const userId = interaction.user.id;

    // Fetch the schedule
    let schedule;
    try {
        schedule = await require('./api/scheduleApi').getScheduleById(scheduleId);
    } catch (e) {
        await interaction.reply({ content: 'Could not fetch event.', ephemeral: true });
        return;
    }
    if (!schedule) {
        await interaction.reply({ content: 'Event not found.', ephemeral: true });
        return;
    }

    // Call handleScheduleUpdate to update the embed/message and DB
    try {
        await require('./functions/update-schedule.js').handleScheduleUpdate(
            client,
            openai,
            schedule,
            userId,
            optName
        );
        await interaction.reply({ content: `You have RSVP'd as "${optName}".`, ephemeral: true });
    } catch (err) {
        console.error('Failed to update RSVP:', err);
        await interaction.reply({ content: 'Failed to update RSVP.', ephemeral: true });
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

const express = require('express');
const app = express();
app.use(bodyParser.json());
// Expose /hittrack endpoint for API to POST new HitTrack objects
app.post('/hittrack', async (req, res) => {
  try {
    const hitTrack = req.body;
    // You can add validation here if needed
    await handleHitPost(client, openai, hitTrack);

    res.status(200).json({ message: 'HitTrack received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /hittrack:', error);
    res.status(500).json({ error: 'Failed to process HitTrack.' });
  }
});

// Expose /fleetlog endpoint for API to POST new ShipLog objects
app.post('/fleetlog', async (req, res) => {
  try {
    const shipLog = req.body;
    // You can add validation here if needed
    await handleFleetLogPost(client, openai, shipLog);

    res.status(200).json({ message: 'FleetLog received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetlog:', error);
    res.status(500).json({ error: 'Failed to process FleetLog.' });
  }
});

// Expose /fleetcreated endpoint for API to POST new Fleet objects
app.post('/fleetcreated', async (req, res) => {
  try {
    const fleet = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleFleetCreatePost(client, openai, fleet);

    res.status(200).json({ message: 'Fleet creation received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetcreated:', error);
    res.status(500).json({ error: 'Failed to process fleet creation.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/createschedule', async (req, res) => {
  try {
    const schedule = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleScheduleCreate(client, openai, schedule);

    res.status(200).json({ message: 'Schedule creation received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /createschedule:', error);
    res.status(500).json({ error: 'Failed to process schedule creation.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/updateschedule', async (req, res) => {
  try {
    const schedule = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleScheduleUpdate(client, openai, schedule);

    res.status(200).json({ message: 'Schedule update received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /updateschedule:', error);
    res.status(500).json({ error: 'Failed to process schedule update.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/fleetcommanderchange', async (req, res) => {
  try {
    const fleet = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleFleetCommanderChange(client, openai, fleet);

    res.status(200).json({ message: 'Commander update received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetcommanderchange:', error);
    res.status(500).json({ error: 'Failed to process fleet command updates.' });
  }
});

// Expose /createschedule endpoint for API to POST new Fleet objects
app.post('/fleetmemberchange', async (req, res) => {
  try {
    const fleet = req.body;
    // You can add Discord notification logic here if needed, e.g. send to a channel
    await handleFleetMemberChange(client, openai, fleet);

    res.status(200).json({ message: 'Commander update received by Discord bot.' });
  } catch (error) {
    console.error('Error handling /fleetcommanderchange:', error);
    res.status(500).json({ error: 'Failed to process fleet command updates.' });
  }
});

// Start the HTTP server on a configurable port
const PORT = process.env.BOT_HTTP_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Discord bot HTTP server listening on port ${PORT}`);
});