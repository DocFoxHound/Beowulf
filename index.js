// Require the necessary discord.js classes
const { Client, GatewayIntentBits } = require("discord.js");
// Initialize dotenv
const dotenv = require("dotenv");
// Require openai
const { OpenAI } = require("openai");
// Require global functions
const vectorHandler = require("./vector-handler.js");
const threadHandler = require("./thread-handler");
const generalPurpose = require("./general-purpose-functions.js")

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

//used for finding user mentions, later on in the program
const mentionRegex = /<@!?(\d+)>/g;

// Set channels
channelIds = process.env?.CHANNELS?.split(",");
channelIdAndName = [];

//array of threads (one made per user)
threadArray = [{userId: "", threadId: "", isActive: Boolean}];

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

//run the vector checker to see if we need to update the vector store for the bot's background knowledge

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
  generalPurpose.routineFunctions(userCache, channelIdAndName, openai, client);
});

client.on("messageCreate", async (message) => {
  // Check for conditions to ignore the message early
  if (!channelIds.includes(message.channelId) || !message.guild || message.system) {
    return;
  }

  // Check if the bot is mentioned or if the message is a reply to the bot
  if (message.mentions.users.has(client.user.id)) {
    message.channel.sendTyping();  // Send typing indicator once we know we need to process
    const thread = await threadHandler.findExistingThread(message.author.id, threadArray, openai);
    try { //TODO: work on adding message to thread
      await threadHandler.addUserMessageToThreadAndRun(message, thread, openai, client, threadArray);
      // await threadHandler.runThread(message, thread, openai, client);
    } catch (error) {
      console.error("Failed to process thread:", error);
      message.channel.send("ERROR.");
    }
  } else {
    // Handle all other messages
    if(message.author.id !== client.user.id){ //if this is the bot replying to someone
      try{
        const thread = await threadHandler.findExistingThread(message.author.id, threadArray, openai);
        await threadHandler.addUserMessageToThread(message, thread, openai, threadArray);
      }catch(error){
        console.log(`Error adding a message to a thread2: ${error}`);
      }
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

//TODO
//see active users, see user roles
