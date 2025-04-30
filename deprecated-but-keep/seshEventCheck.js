// const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
// const dotenv = require("dotenv");

// async function seshEventCheck(message, client) {
//     console.log("Test")
//     try {
//         // Check if the message is from the specific bot
//         if (message.author.id === process.env.SESH_ID) {
//             // Check if the message contains embeds
//             if (message.embeds.length > 0) {
//                 const embed = message.embeds[0]; // Get the first embed
//                 if (embed.description) {
//                     // Parse the text from the embed's description
//                     const embedTitle = embed.title;
//                     const embedText = embed.description;
//                     const embedFooter = embed.footer;
//                     console.log("Parsed Embed Title:", embedTitle);
//                     console.log("Parsed Embed Text:", embedText);
//                     console.log("Parsed Embed Footer:", embedFooter);

//                     // Perform further processing with the parsed text
//                 } else {
//                     console.log("Embed does not contain a description.");
//                 }
//             } else {
//                 console.log("Message does not contain embeds.");
//             }
//         } else {
//             console.log("Message is not from the specified bot.");
//         }
//     } catch (error) {
//         console.error("Error in seshEventCheck:", error);
//     }
// }

// module.exports = {
//     seshEventCheck
// };