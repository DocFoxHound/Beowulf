const { channel } = require("node:diagnostics_channel");
const { getMessages } = require("../api/messageApi");
const { deleteMessagesByCount } = require("../api/messageApi");
const fs = require("node:fs");
const { Readable } = require('stream');
const { getAllLessonsLearned } = require("../api/lessonsLearnedApi");

async function loadChatlogs(client, openai){
  let chatLog = null;
  let lessonsLearned = null;
  let channelLogs = [];
  try{
    chatLog = await getMessages();
    lessonsLearned = await getAllLessonsLearned();
  }catch(error){
    console.log(`Error getting lessons learned: ${error}`);
    return;
  }


  // # blood-chat, marauder-chat, raptor-lounge, raider-council, corsair-cove, wright-bar, help-me-fly, crew-plus-chat, general-chat, loadout-talk, bot-commands, star-citizen, other-games, off-topic, rig-talk, pet-parlor, salt-mining, memes, sc-feeds, media-team, misc-media, announcements
  //prepare the message
  for (const message of chatLog) {
    try{
      const channelName = message.message.metadata.channel; // Get the channel name
      const messageJson = message.message; // Get the message JSON
      // const messageTimestamp = new Date(message.id).getTime();

      // // Skip messages older than one minute
      // if (messageTimestamp < oneMinuteAgo) {
      //   continue;
      // }

      //if this is a bot command, ignore it
      if(channelName === "bot-commands"){
        continue;
      }

      const category = channelName.includes("raptor-lounge") ? "PVP Training and Theory" :
        channelName.includes("raider-council") ? "Pirate Planning and Practices" :
        channelName.includes("corsair-cove") ? "Large Fleet Tactics and Strategy" :
        channelName.includes("wright-bar") ? "Logistics and Game Theory Discussion" :
        channelName.includes("help-me-fly") ? "PVP and Training Chat" :
        channelName.includes("loadout-talk") ? "PVP and Ship Loadout Chat" :
        channelName.includes("bot-commands") ? "bot-commands" :
        channelName.includes("sc-feeds") ? "Star Citizen News and Updates" :
        channelName.includes("announcements") ? "IronPoint Announcements" :
        "General Discussion"

      // Initialize the array for the channel if it doesn't exist
      if (!channelLogs[channelName]) {
          channelLogs[channelName] = {
            header: {
              channel_name: channelName,
              channel_category: category
            },
            chat_log: []
          };
      }
      // Add the message content to the appropriate channel array
      channelLogs[channelName].chat_log.push(messageJson);
    }catch(error){
      console.log(`Error processing message: ${error}`);
    }
  }

  //compile lessons learned
  for(const lesson of lessonsLearned){
    try{
      const channelName = "common-knowledge"; // Get the channel name
      const messageJson = {id: lesson.id, lesson: lesson.lesson}; // Get the message JSON

      if(!channelLogs[channelName]){
        channelLogs[channelName] = {
          header: {
            channel_name: channelName,
            channel_category: "Common Knowledge"
          },
          lessons: []
        };
      }
      // Add the message content to the appropriate channel array
      channelLogs[channelName].lessons.push(messageJson);
    }catch(error){
      console.log(`Error processing lesson learned: ${error}`);
    }
  }
  
  //some constants for this next process part
  const oneMinuteAgo = Date.now() - 70000;
  const list = await openai.files.list();
  const vectorFiles = await openai.beta.vectorStores.files.list(process.env.VECTOR_STORE);

  //upload the message
  for (const channel in channelLogs) {
    let chatLogArray = null;
    let lastItem = null;
    let lastTime = null;

    if(channel === "common-knowledge"){
      // console.log(channelLogs[channel].lessons)
      lessonArray = channelLogs[channel].lessons;
      const length = lessonArray.length;
      lastItem = lessonArray[length - 1];
      lastTime = lastItem.id;
    }else{
      chatLogArray = channelLogs[channel].chat_log;
      lastItem = chatLogArray[chatLogArray.length - 1];
      lastTime = new Date(lastItem.metadata.date).getTime()
    }

    // Skip messages older than one minute
    if(lastTime < oneMinuteAgo){
      continue;
    }

    //delete the previous files
    const files = list.data;
    const oldFile = await files.find(
      (f) =>
        f.filename === (channel === "common-knowledge" ? `${channel}.json` :`chatlog_${channel}.json`)
    );
    const oldVectorFile = await vectorFiles.data.find(
      (f) =>
        f.filename === (channel === "common-knowledge" ? `${channel}.json` :`chatlog_${channel}.json`)
    );
    //then delete from vector store
    try {
      await openai.beta.vectorStores.files.del(process.env.VECTOR_STORE, oldVectorFile.id);
    } catch (error) {
      console.error(`Error removing file from vector store:`, error.message);
    }
    //delete from file storage
    try{
      await openai.files.del(oldFile.id);
    }catch(error){
      console.log(`Error deleting file from storage: ${error.message}`);
    }
    

    //create and upload the new file
    try{
      const filePath = channel === "common-knowledge" ? `./chatlogs/${channel}.json` : `./chatlogs/chatlog_${channel}.json`;
      const fileContent = await JSON.stringify(channelLogs[channel], null, 2);
      // Save to a temp .json file
      fs.writeFileSync(filePath, fileContent);

      // Upload to OpenAI
      const file = await openai.files.create({
        purpose: 'assistants',
        file: fs.createReadStream(filePath)
      });

      // Add to vector store (assumes you have the vectorStoreId already)
      await openai.beta.vectorStores.files.create(process.env.VECTOR_STORE, {
        file_id: file.id
      });

      // Clean up the local file
      await fs.unlinkSync(filePath);
    }catch(error){
      console.log(`Error uploading chat log for ${channel}: ${error}`);
    }
  }
  console.log("Completed chatLog upload.")
}

async function trimChatLogs(){
  console.log("Trimming chat logs.")
  const chatLog = await getMessages();
  let channelNames = [];
  try{
    for (const message of chatLog) {
      const channelName = message.message.metadata.channel; // Get the channel name
      // Initialize the array for the channel if it doesn't exist
      if (!channelNames[channelName]) {
          channelNames.push(channelName)
      }
    }
    for(const channel of channelNames){
      await deleteMessagesByCount(channel, 1000);
    }
    console.log("Messages trimmed.")
  }catch(error){
    console.log(`Error trimming messages: ${error}`);
  }
  
}


module.exports = {
    loadChatlogs,
    trimChatLogs
}
























// // Require the necessary node classes
// // Require the necessary discord.js classes
// const { ChannelType } = require("discord.js");

// async function refreshChatLogs(channelIdAndName, openai, client) {
//   console.log("Refreshing Chat Logs");
//   const guild = await client.guilds.fetch(process.env.GUILD_ID);
//   const list = await openai.files.list();
//   const files = list.data;
//   const now = new Date();
//   const activeChannels = [];

//   //ignore inactive channels
//   for (const channelInfo of channelIdAndName) {
//     const channelObject = await client.channels.fetch(channelInfo.channelId);

//     if (!channelObject) {
//       console.log(`Channel with ID ${channelInfo.channelId} not found in cache.`);
//       continue;
//     }

//     //if this is a forum channel
//     if ((channelObject.type === ChannelType.GuildForum)) {
//       //if its a forum channel
//       try {
//         const threadFetch = await channelObject.threads.fetchActive(); // Fetch active threads
//         const threads = threadFetch.threads;
//         if (threads.size > 0) {
//           const newestThread = Array.from(threads.values()).sort(
//             (a, b) => b.createdTimestamp - a.createdTimestamp
//           )[0];
//           const messageDate = new Date(newestThread.createdTimestamp);
//           const hoursDiff = (now - messageDate) / 3600000;
//           if (hoursDiff <= 3) {
//             activeChannels.push(channelInfo);
//           }
//         } else {
//           console.error(
//             `No messages found in ${channelInfo.channelName}: ${error}`
//           );
//         }
//       } catch (error) {
//         console.error(
//           `Failed to fetch messages for channel ${channelInfo.channelName}: ${error}`
//         );
//       }
    
//     //if its a text channel
//     } else {
//       try {
//         const lastMessage = await channelObject.messages.fetch({
//           limit: 1,
//         });
//         if (lastMessage.size > 0) {
//           const lastMsg = lastMessage.first();
//           const messageDate = new Date(lastMsg.createdTimestamp);
//           const hoursDiff = (now - messageDate) / 3600000;
//           if (hoursDiff <= 3) {
//             console.log(`Refreshing logs for: ${channelObject.name}`);
//             activeChannels.push(channelInfo);
//           }
//         } else {
//           console.error(
//             `No messages found in ${channelInfo.channelName}: ${error}`
//           );
//         }
//       } catch (error) {
//         console.error(
//           `Failed to fetch messages for channel ${channelInfo.channelName}: ${error}`
//         );
//       }
//     }
//   }

//   //delete the channel chatlogs that need refreshed
//   for (const channel of activeChannels) {
//     try {
//       const file = files.find(
//         (f) =>
//           f.filename === guild.name + "ChatLogs-" + channel.channelName + ".txt"
//       );
//       fileToDeleteId = file.id;
//     } catch (error) {}

//     try {
//       //first, delete it from the vector storage
//       await openai.beta.vectorStores.files.del(
//         process.env.VECTOR_STORE,
//         fileToDeleteId
//       );
//       //then, delete it from the file storage
//       await openai.files.del(fileToDeleteId);
//     } catch (error) {}
//   }

//   //Now get the chat logs and upload them
//   try {
//     await getChatLogs(client, guild, activeChannels, openai);
//   } catch (error) {
//     console.log("Error uploading chatlogs: " + error);
//   }
// }

// async function getChatLogs(client, guild, channelIdAndName, openai) {
//   for (const channel of channelIdAndName) {
//     console.log(`Getting logs for: ${channel.channelName}`)
//     let messageArray = [`Chat Logs of ${guild.name}'s ${channel.channelName} chat channel.`];
//     let lastId = null;
//     let channelObject = await client.channels.fetch(channel.channelId);
//     if (!channelObject) {
//       console.log(`Channel ${channel.channelName} not found`);
//       continue;
//     }
//     try {
//       while (messageArray.length < 500) {
//         const options = {
//           limit: 100,
//         };
//         if (lastId) {
//           options.before = lastId;
//         }
        
//         //Check and process if its a forum channel or a regular channel
//         if (channelObject.type === ChannelType.GuildForum) {
//           //if this is a forum channel, do this:
//           const now = new Date();
//           const daysOld = now.getTime() - process.env.DAYS_OLD * 86400000;
//           const threadFetch = await channelObject.threads.fetchActive();
//           //filter by parent channel (discord actually has a bug returning all threads from everywhere)
//           //and by how old they are
//           const threads = await threadFetch.threads.filter(
//             (thread) =>
//               thread.parentId === channel.channelId &&
//               now.getTime() - thread.createdTimestamp < daysOld
//           );

//           // This maps out all of the messages and details we need and returns them as a promise, so they're all done asynchronously,
//           // improving speed of this operation a lot. I wont lie, I asked ChatGPT to replace the code previously here and to make it
//           // faster, and I'm not disappointed.
//           const messagesFetchPromises = threads.map(async (thread) => {
//           const messages = await thread.messages.fetch();
//             const messageDetails = messages
//               .map((message) => {
//                 const embedsDetails = message.embeds
//                   .map((embed) => {
//                     const fieldsDetails = embed.fields
//                       .map((field) => `Field: ${field.name}: "${field.value}"`)
//                       .join("\n");
//                     return `Embed: "${
//                       embed.title ?? "No Title"
//                     }": Description: "${
//                       embed.description ?? "No Description"
//                     }"\n${fieldsDetails}`;
//                   })
//                   .join("\n");

//                 const displayName =
//                   message.member?.nickname ?? message.author.username;
//                 return (
//                   embedsDetails ||
//                   `${displayName}: "${message.content}"`
//                 );
//               })
//               .join("\n");
//             lastId = messages.last().id;
//             return `\nThread: ${thread.name}\n${messageDetails}`;
//           });
//           // Await all fetched messages and then handle them
//           try {
//             const allMessages = await Promise.all(messagesFetchPromises);
//             allMessages.forEach((messagesContent) =>
//               messageArray.push(messagesContent)
//             );
//           } catch (error) {
//             console.error("Error fetching messages from threads:", error);
//           }

//         //if this is a text channel
//         } else {
//           //this is a text channel
//           const messages = await channelObject.messages.fetch(options);
//           if (messages.size === 0) {
//             break; // No more messages left to fetch
//           }
//           messages.forEach(async (message) => {
//             if (message.embeds.length > 0) {
//               await message.embeds.forEach((embed, index) => {
//                 let embedLog = `Embed: "${embed.title ?? "No Title"}": Description: "${embed.description ?? "No Description"}"`;
//                 messageArray.push(embedLog);
//                 if (embed.fields) {
//                   embed.fields.forEach((field, fieldIndex) => {
//                     messageArray.push(`Field: ${field.name}: "${field.value}"`);
//                   });
//                 }
//               });
//             } else {
//               const displayName = message.member?.nickname ?? message.author.username;
//               messageArray.push(
//                 `${displayName}: "${message.content}"`
//               );
//             }
//           });
//           lastId = messages.last().id;
//         }
//       }
//     //flatten the array into a string
//     const allMessages = messageArray.join("\n");
//     //send the string off to be turned into a file and uploaded
//     await createAndUploadFile(allMessages, openai, `${guild.name}ChatLogs-${channel.channelName}`);
//     } catch (error) {
//       console.log("Error getting chat logs: " + error);
//     }
//   }
//   console.log("ChatLog Update Complete")
// }

// async function createAndUploadFile(textString, openai, givenName) {
//   const fileName = "./chatlogs/" + givenName + ".txt";
//   await fs.promises.writeFile(fileName, textString, "utf8", function (err) {
//     if (err) {
//       console.log("An error occurred while writing " + fileName + ": ", err);
//     }
//     console.log(fileName + " saved locally");
//   });

//   //upload that file to OpenAI (step 1)
//   uploadedFileId = "";
//   try {
//     const file = await openai.files.create({
//       file: fs.createReadStream(fileName),
//       purpose: "assistants",
//     });
//     uploadedFileId = file.id;
//     console.log("Uploaded " + fileName + " to Storage Files");
//   } catch (error) {
//     console.log(
//       "Error in uploading " + fileName + " to Storage Files: " + error
//     );
//   }

//   //now that its uploaded to openAI, 'upload' it to the VectorStore (step 2)
//   // (as of this writing, there's no way to direct upload to the vector store)
//   try {
//     await openai.beta.vectorStores.files.create(process.env.VECTOR_STORE, {
//       file_id: uploadedFileId,
//     });
//     console.log("Moved " + fileName + " to VectoreStore");
//   } catch (error) {
//     console.log(
//       "Error in moving " + fileName + " to the VectoreStore: " + error
//     );
//   }
// }

// module.exports = {
//   refreshChatLogs,
// };
