const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getClasses} = require('../../api/classApi.js');
const { getUsersInQueue} = require('../../api/queueApi.js');


module.exports = {
    data: new SlashCommandBuilder()
    
        .setName('queue-status')
        .setDescription('View who is waiting in queue for a class or an assessment.'),
                    
    async execute(interaction) {
        try {
            const allClasses = await getClasses();
            const allUsers = await getUsersInQueue();
            let classData = await generateClassData(allClasses);
            await generateQueueData(allUsers, classData);
            const embeds = generatedEmbed(classData);

            if (embeds.length === 1) {
                // Only one page — no need for buttons
                return interaction.reply({ embeds: [embeds[0]], ephemeral: false });
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
            let currentPage = 0;
            const message = await interaction.reply({ embeds: [embeds[currentPage]], components: [buttons], fetchReply: true });

            // Create a collector to handle button interactions
            const collector = message.createMessageComponentCollector({ time: 60000 });

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

            collector.on('end', async () => {
                buttons.components.forEach(button => button.setDisabled(true));
                await message.edit({ components: [buttons] });
            });
            // return interaction.reply({ embeds: [await queueEmbed(interaction)]});
        } catch (error) {
            console.error('Error in Queue-Status command:', error);
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
                students: []
            });
        }
        return classData;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

async function generateQueueData(allUsers, classData) {
    try{
        for(const prestige in classData){
            const classes = classData[prestige];
            for(const classObj of classes){
                for(const user of allUsers){
                    if(user[classObj.name] === true){
                        classObj.students.push({
                            id: user.id,
                            username: user.username,
                            nickname: user.nickname,
                            createdAt: user.createdAt
                        });
                    }
                }
            }
        }
    }catch(error){
        console.error('Error generating queue data:', error);
        return null;  // Return null if there's an error
    }
}

function generatedEmbed(classData){
    try{    
        const embeds = {};
        for(const prestige in classData){
            const classes = classData[prestige];
            classes.sort((a, b) => a.name.localeCompare(b.name));
            // console.log(classes[0])

            if (!embeds[prestige]) {
                embeds[prestige] = [];
            }
            const classEmbed = new EmbedBuilder()
                .setThumbnail(`${classes[0].thumbnail_url}`)
                // .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setAuthor({ name: `Players in Queue`, iconURL: 'https://i.imgur.com/adzj39a.png' })
                .setTitle(`${prestige.toString().toUpperCase()}`)
                .setImage('https://i.imgur.com/1t53Jsc.png')
                .setDescription(`\`\`\`\nThe below are individuals presently waiting in Queue for either a class or an assessment.\`\`\`\n`)
                .setColor('#ff0000');
            for(const classObj of classes){
                let studentsList = classObj.students.map(s =>
                    `• ${s.nickname || s.username}`
                ).join('\n');
                
                if (!studentsList) {
                    studentsList = 'No one is currently in queue for this class.';
                }
                
                classEmbed.addFields({
                    name: `__${classObj.alt_name || classObj.name}__`,
                    value: studentsList,
                    inline: false
                });
            }
            embeds[prestige].push(classEmbed);
        }
        return Object.values(embeds).flat();
    }catch(error){
        console.error('Error creating leaderboard embeds:', error);
        return null;  // Return null if there's an error
    }
}