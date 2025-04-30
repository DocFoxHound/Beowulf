// const { SlashCommandBuilder } = require('discord.js');
// const { queueControllerForSlashCommands } = require('../queue-functions/queue-controller.js');
// const { getUserById } = require("../api/userlistApi.js"); 
// const queueApi = require('../api/queueApi.js');
// const { getClasses } = require('../api/classApi.js');

// // const { getQueueUsers } = require('../../queue-functions/get-queue-users'); // Add this import

// module.exports = {
//     data: new SlashCommandBuilder()
//         .setName('progress-dropout')
//         .setDescription('Edit your queue entry')
//         .addStringOption(option =>
//             option.setName('class')
//                 .setDescription('The class to edit in the queue')
//                 .setRequired(true)
//                 .setAutocomplete(true)),

//     async execute(interaction, openai, client) {
//         try {
//             const targetUser = await getUserById(interaction.user.id)
//             const className = interaction.options.getString('class');
//             const selfOrOther = "self";
//             const addOrRemove = false;
//             const classStatus = "not_completed";
//             const result = await queueControllerForSlashCommands(className, targetUser, null,  openai, client, addOrRemove, classStatus, selfOrOther, interaction);

//             await interaction.reply({
//                 content: result,
//                 ephemeral: false
//             });
//         } catch (error) {
//             console.error('Error in queue-edit command:', error);
//             await interaction.reply({
//                 content: 'An error occurred while processing your request.',
//                 ephemeral: true
//             });
//         }
//     },

//     async autocomplete(interaction) {
//         const focusedOption = interaction.options.getFocused(true); // Get the user's current input
//         try {
//             const listOfClasses = [];
//             const userQueueObject = await queueApi.getUserById(interaction.user.id); // Fetch the user's queue data
//             const allClasses = await getClasses(); // Fetch all classes from the database

//             // Iterate through all classes and check if the user is in the queue for each class
//             for (const classObj of allClasses) {
//                 if (userQueueObject[classObj.name] === true) {
//                     listOfClasses.push({
//                         name: `${classObj.alt_name} (${classObj.name})`, // Display the class name with "In Queue"
//                         value: classObj.name // Use the class name as the value
//                     });
//                 }
//             }

//             // Filter the list based on the user's input
//             const filteredClasses = listOfClasses.filter(classObj =>
//                 classObj.name.toLowerCase().includes(focusedOption.value.toLowerCase())
//             );

//             // Respond with up to 25 suggestions
//             await interaction.respond(filteredClasses.slice(0, 25));
//         } catch (error) {
//             console.error('Error in autocomplete function:', error);
//             await interaction.respond([]);
//         }
//     }
// };