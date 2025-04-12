const { SlashCommandBuilder } = require('discord.js');
// const { signupToClassQueue, getAvailableClasses } = require('../classQueue');
const { getUserById} = require('../../api/queueApi.js');
const userlistApi = require('../../api/userlistApi.js');
const { getClasses} = require('../../api/classApi.js');
const { queueControllerForSlashCommands } = require('../../queue-functions/queue-controller');
const logger = require('../../logger');

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
      await interaction.reply({ content: await queueControllerForSlashCommands(className, interaction.user, handlerUser,  openai, client, addOrRemove, classStatus, selfOrOther, interaction), ephemeral: true});
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error signing you up for the class.', ephemeral: true });
    }
  },
  async autocomplete(interaction) {
    try {
        const focusedValue = interaction.options.getFocused(); // Get the user's current input
        const userQueueData = await getUserById(interaction.user.id); // Fetch the user's queue data
        const availableClasses = await getAvailableClasses(interaction.user); // Get available classes for the user

        // Filter classes based on the user's input
        const filtered = availableClasses.filter(classObj =>
            classObj.name.toLowerCase().includes(focusedValue.toLowerCase())
        );

        // Respond with up to 25 suggestions
        await interaction.respond(
            filtered.map(classObj => {
                // Check if the userQueueData exists and if the user is already in the queue for this class
                const inQueue = userQueueData && userQueueData[classObj.name] === true;
                return {
                    name: `${classObj.name}${inQueue ? ' (In Queue)' : ''}`, // Append " - In Queue" if true
                    value: classObj.name
                };
            }).slice(0, 25)
        );
    } catch (error) {
        console.error('Error in autocomplete function:', error);
        await interaction.respond([]);
    }
  }
};

async function getAvailableClasses(user) {
    const allClasses = await getClasses(); // Fetch all classes from the database
    const userDbObject = await userlistApi.getUserById(user.id); // Fetch the user's data
    const classData = await generateClassData(allClasses); // Organize classes by category
    sortClassesAlphabetically(classData); // Sort classes alphabetically by name

    const availableClasses = [];

    // Iterate through each category (prestige) in classData
    for (const prestige in classData) {
        const classes = classData[prestige];

        for (const classObj of classes) {
            // Check if the class is already completed
            if (userDbObject[classObj.name] === true) {
                continue; // Skip completed classes
            }

            if (classObj.level === 1) {
                // Include level 1 classes that are not completed
                availableClasses.push(classObj);
            } else if (classObj.level > 1) {
                // Check prerequisites for level 2 and above
                const prerequisitesMet = classObj.prerequisites.every(prerequisiteName =>
                    userDbObject[prerequisiteName] === true
                );

                if (prerequisitesMet) {
                    availableClasses.push(classObj);
                }
            }
        }
    }

    return availableClasses;
}

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
              level: log.level,
              students: []
          });
      }
      return classData;
  }catch(error){
      console.error('Error generating leaderboard data:', error);
      return null;  // Return null if there's an error
  }
}

async function generateQueueData(userDbObject, classData) {
  try{
      for(let prestige in classData){
          let classes = classData[prestige];
          for(let classObj of classes){
              if(userDbObject[classObj.name] === true){
                  classObj.completed = true;
              }
          }
      }
  }catch(error){
      console.error('Error generating queue data:', error);
      return null;  // Return null if there's an error
  }
}

function sortClassesAlphabetically(classData) {
  for (const prestige in classData) {
      classData[prestige].sort((a, b) => a.name.localeCompare(b.name));
  }
}