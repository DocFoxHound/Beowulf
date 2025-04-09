const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkUserListForUser } = require('../../userlist-functions/userlist-controller.js');
const { progressBar } = require('../../common/progress-bar.js');
const progressEmbed = require('../../common/embeds.js').progressEmbed;
const { getClasses } = require('../../api/classApi.js');
const { getUserById } = require('../../api/userlistApi.js');
const userlistController = require('../../userlist-functions/userlist-controller.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('progress-tracker')
        .setDescription('View your promotion progress across RAPTOR, CORSAIR, and RAIDER assessments')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to check progress for')
                .setRequired(true)
            ),
    
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('target');
            const allClasses = await getClasses();
            const userDbObject = await getUserById(targetUser.id);
            let classData = await generateClassData(allClasses); // Generate class data
            sortClassesAlphabetically(classData); // Sort classes alphabetically by name
            await generateQueueData(userDbObject, classData);
            const userObject = await getUserById(targetUser.id);

            if (!userObject) {
                return interaction.reply({
                    content: 'The specified user is not registered in our database. Please contact an administrator for assistance.',
                    ephemeral: true
                });
            }

            //get the levels of eligibility
            const eligibilityByPrestige = await getEligibility(classData);
            
            let crewEligible = false;
            let marauderEligible = false;
            let crewEligibleCount = 0;
            let marauderEligibleCount = 0;
            let totalClasses = 0;
            let completedClasses = 0;
            
            //get crew and marauder eligibility
            for(const prestige in eligibilityByPrestige) {
                const classes = eligibilityByPrestige[prestige].levelClasses;
                if(classes['1'].eligible === true){
                    marauderEligibleCount = 1;
                    crewEligibleCount++;
                    if(crewEligibleCount === 3){
                        crewEligible = true;
                    }
                }
                if(classes['2'].eligible === true){
                    if(crewEligibleCount < 3){
                        marauderEligibleCount = 2;
                    }
                }
                if(classes['3'].eligible === true){
                    marauderEligibleCount = 3;
                    marauderEligible = true;
                }
            }
            //how many classes are there in total
            for(const classObj in allClasses){
                totalClasses++;
            }
            //how many classes were completed in total
            for(const prestige in classData){
                const classes = classData[prestige];
                for(const classObj in classes){
                    if(classes[classObj].completed === true){
                        completedClasses++;
                    }
                }
            }

            //calculate overall completion
            const overallCompletion = Math.round((completedClasses / totalClasses) * 100);
            const crewCompletion = Math.round((crewEligibleCount / 3) * 100);
            const marauderCompletion = Math.round((marauderEligibleCount / 3) * 100);
            const overallProgressBar = await progressBar(overallCompletion, 100, 40, '■', '□');
            const crewProgressBar = await progressBar(crewEligibleCount, 3, 40, '■', '□');
            const marauderProgressBar = await progressBar(marauderEligibleCount, 3, 40, '■', '□');

            // Create embed
            const embed1 = new EmbedBuilder()
                .setAuthor({ name: `Promotion Progress for ${targetUser.username}`, iconURL: 'https://i.imgur.com/26NGG4H.png' })
                .setDescription(`\`\`\`Overall Completion: ${overallCompletion}% ${overallProgressBar}\nCrew Progress: ${crewCompletion}% (TIER 1 in each prestige)\n${crewProgressBar}\nMarauder Progress: ${marauderCompletion}%  (TIER 3 in one)\n${marauderProgressBar}\`\`\`\n`)
                .setColor('#ff0000')
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'Contact an administrator if you believe there are any errors in your progress tracking.' });

            // Dynamically add fields for each prestige category and its classes
            for (const [prestige, classes] of Object.entries(classData)) {
                const classDetails = classes
                    .map(classObj => `${classObj.completed ? '✅' : '❌'} ${classObj.alt_name} (Level ${classObj.level})`)
                    .join('\n');

                embed1.addFields({
                    name: `__${prestige.toUpperCase()} Classes__`,
                    value: classDetails || 'No classes available.',
                    inline: false
                });
            }

            // Create the second embed (Promotion Instructions)
            const embed2 = new EmbedBuilder()
                .setAuthor({ name: `Promotion Instructions`, iconURL: 'https://i.imgur.com/26NGG4H.png' })
                .setTitle('What is CREW and MARAUDER?')
                .setThumbnail(`https://i.imgur.com/26NGG4H.png`)
                .addFields({
                    name: `**__CREW Promotion__**`,
                    value: `\`\`\`Gaining CREW in IronPoint means that you have a good understanding of how to fight, steal, and be part of the team. You've shown that you're dedicated to IronPoint and combat, that you want to learn, and that you're a value-added member to the IronPoint crew.\n- Earn TIER 1 in each Prestige group.\`\`\`\n`,
                    inline: false
                })
                .addFields({
                    name: `**__MARAUDER Promotion__**`,
                    value: `\`\`\`Gaining MARAUDER in IronPoint means that you are an expert in your field and that you've demonstrated tenacity and competitive qualities. You are a developing expert in your field, and are driven to demonstrate your potential to the world.\n- Earn TIER 3 in one Prestige.\n- Earn TIER 1 in other Prestiges.\`\`\`\n`,
                    inline: false
                })
                .setColor('#ff0000')
                .setTimestamp()
                .setFooter({ text: 'Contact an administrator if you have any questions about promotions.' });

            // Dynamically create embeds for each category in classData
            const categoryEmbeds = [];

            for (const [category, classes] of Object.entries(classData)) {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: `${category.toUpperCase()} Class Information`, iconURL: 'https://i.imgur.com/26NGG4H.png' })
                    .setThumbnail(`${classes[0].thumbnail_url}`)
                    .setColor('#ff0000')
                    .setTimestamp()
                    .setFooter({ text: 'Contact an administrator if you have any questions about classes.' });

                // Add fields for each class in the category
                classes.forEach(classItem => {
                    embed.addFields({
                        name: classItem.alt_name,
                        value: classItem.description || 'No description available.',
                        inline: false
                    });
                });

                categoryEmbeds.push(embed);
            }

            // Create buttons for navigation
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                );

            // Send the first embed with navigation buttons
            const message = await interaction.reply({ embeds: [embed1], components: [buttons], fetchReply: true });

            // Create a collector to handle button interactions
            const collector = message.createMessageComponentCollector({ time: 60000 });

            let currentPage = 0;
            const embeds = [embed1, embed2, ...categoryEmbeds];

            collector.on('collect', async i => {
                if (i.customId === 'previous') {
                    currentPage--;
                } else if (i.customId === 'next') {
                    currentPage++;
                }

                // Update buttons
                buttons.components[0].setDisabled(currentPage === 0);
                buttons.components[1].setDisabled(currentPage === embeds.length - 1);

                await i.update({ embeds: [embeds[currentPage]], components: [buttons] });
            });   
        } catch (error) {
            console.error('Error in progress-tracker2 command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the progress data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    }
};

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

async function getEligibility(classData) {
    let prestigeEligibility = {};
    try {
        for (const prestige in classData) {
            const classes = classData[prestige];

            // Group classes by level
            const classesByLevel = {};
            for (const classObj of classes) {
                if (!classesByLevel[classObj.level]) {
                    classesByLevel[classObj.level] = [];
                }
                classesByLevel[classObj.level].push(classObj);
            }

            // Check eligibility per level
            prestigeEligibility[prestige] = { levelClasses: {} };
            for (const level in classesByLevel) {
                const levelClasses = classesByLevel[level];
                const completed = levelClasses.filter(cls => cls.completed === true).length;

                prestigeEligibility[prestige].levelClasses[level] = {
                    eligible: completed === levelClasses.length
                };
            }
        }

        return prestigeEligibility;
    } catch (error) {
        console.error('Error getting completed classes:', error);
        return null;
    }
}

function sortClassesAlphabetically(classData) {
    for (const prestige in classData) {
        classData[prestige].sort((a, b) => a.name.localeCompare(b.name));
    }
}