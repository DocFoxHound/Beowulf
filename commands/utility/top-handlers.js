const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getEntriesBetweenDates } = require('../../api/completed-queue-api')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-top-handlers')
        .setDescription('See who has handled the most queue entries in the server.')
        .addStringOption(option =>
            option.setName('timeframe')
                .setDescription('This quarter or all time?')
                .setRequired(true)
                .addChoices(
                    { name: 'This Quarter', value: 'this-quarter' },
                    { name: 'Last Quarter', value: 'last-quarter' },
                    { name: 'All time', value: 'all' }
                )),
    
    async execute(interaction, client) {
        try {
            // Fetch user data
            const timeframe = interaction.options.getString('timeframe');
            return interaction.reply({ embeds: [await topHandlers(client, interaction, timeframe)]});
        } catch (error) {
            console.error('Error in progress-tracker command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the progress data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    }
};

async function topHandlers(client, interaction, timeframe){
    try{
        let quarterDescription = '';
        let entries = null;
        let year = null;
        let endDescription = null;

        if(timeframe === 'all'){
            // Fetch all entries
            entries = await getEntriesBetweenDates(new Date(0), new Date());
        }else{
            const date = new Date();
            let startDate;
            let endDate;
            let quarterOneStart = new Date(date.getFullYear(), 0, 1);
            let quarterOneEnd = new Date(date.getFullYear(), 2, 31);
            let quarterTwoStart = new Date(date.getFullYear(), 3, 1);
            let quarterTwoEnd = new Date(date.getFullYear(), 5, 30);
            let quarterThreeStart = new Date(date.getFullYear(), 6, 1);
            let quarterThreeEnd = new Date(date.getFullYear(), 8, 30);
            let quarterFourStart = new Date(date.getFullYear(), 9, 1);
            let quarterFourEnd = new Date(date.getFullYear(), 11, 31);
            const now = new Date();
            const currentYear = now.getFullYear();
            year = currentYear;
            if(timeframe === "this-quarter"){
                if(date >= quarterOneStart && date <= quarterOneEnd){
                    quarterDescription = "Quarter 1";
                    startDate = new Date(`${year}-01-01`);
                    endDate = new Date(`${year}-03-31`);
                    endDescription = `${year}-03-31`;
                }else if(date >= quarterTwoStart && date <= quarterTwoEnd){
                    quarterDescription = "Quarter 2";
                    startDate = new Date(`${year}-04-01`);
                    endDate = new Date(`${year}-06-30`);
                    endDescription = `${year}-06-30`;
                }else if(date >= quarterThreeStart && date <= quarterThreeEnd){
                    quarterDescription = "Quarter 3";
                    startDate = new Date(`${year}-07-01`);
                    endDate = new Date(`${year}-09-30`);
                    endDescription = `${year}-09-30`;
                }else if(date >= quarterFourStart && date <= quarterFourEnd){
                    quarterDescription = "Quarter 4";
                    startDate = new Date(`${year}-10-01`);
                    endDate = new Date(`${year}-12-31`);
                    endDescription = `${year}-12-31`;
                }else{
                    return 'Invalid date range';
                }
                entries = await getEntriesBetweenDates(startDate, endDate);
            }else if(timeframe === "last-quarter"){
                if(date >= quarterOneStart && date <= quarterOneEnd){
                    year = year-1;
                    quarterDescription = "Quarter 4";
                    startDate = new Date(`${year}-10-01`);
                    endDate = new Date(`${year}-12-31`);
                    endDescription = `${year}-12-31`;
                }else if(date >= quarterTwoStart && date <= quarterTwoEnd){
                    quarterDescription = "Quarter 1";
                    startDate = new Date(`${year}-01-011`);
                    endDate = new Date(`${year}-03-31`);
                    endDescription = `${year}-03-31`;
                }else if(date >= quarterThreeStart && date <= quarterThreeEnd){
                    quarterDescription = "Quarter 2";
                    startDate = new Date(`${year}-04-01`);
                    endDate = new Date(`${year}-06-30`);
                    endDescription = `${year}-06-30`;
                }else if(date >= quarterFourStart && date <= quarterFourEnd){
                    quarterDescription = "Quarter 3";
                    startDate = new Date(`${year}-07-01`);
                    endDate = new Date(`${year}-09-30`);
                    endDescription = `${year}-09-30`;
                }else{
                    return 'Invalid date range';
                }
                entries = await getEntriesBetweenDates(startDate, endDate);
            }
        }

        if(entries !== null && entries.length > 0){
            // Group entries by handler_id and count total entries for each handler
            const handlerCounts = entries.reduce((acc, entry) => {
                acc[entry.handler_id] = (acc[entry.handler_id] || 0) + 1;
                return acc;
            }, {});

            // Convert the handlerCounts object to an array of [handler_id, count] pairs
            const sortedHandlers = Object.entries(handlerCounts).sort((a, b) => b[1] - a[1]);

            // Format the sorted handlers for the embed
            // const handlerList = sortedHandlers.map(([handler_id, count]) => `• **<@${handler_id}>**: ${count} entries`)

            // Fetch usernames for each handler_id
            const handlerList = await Promise.all(sortedHandlers.map(async ([handler_id, count]) => {
                const user = await client.users.fetch(handler_id);
                return `• **${user.username}**: ${count} entries`;
            }));

            const guildIconUrl = interaction.guild.iconURL({
                dynamic: true,  // true -> animated icon if available
                size: 512      // specify size e.g. 128, 256, 512, 1024, 2048
            });

            const embed = new EmbedBuilder()
                .setAuthor({ name: `Top Handlers`, iconURL: 'https://i.imgur.com/26NGG4H.png' })
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setTitle(`${quarterDescription ? quarterDescription : "All time"}, ${year ? year : ""} \nEnding: ${endDescription ? endDescription : "Today"}`)
                .setImage('https://i.imgur.com/fTVYbwu.png')
                .setColor('#ff0000')
                .setTimestamp()
                .addFields(
                    { 
                        name: `__Top Handlers__`, 
                        value: handlerList.join('\n'),
                        inline: false 
                    }
                )
                .setFooter({ text: 'Contact an administrator if you believe there are any errors.' });
            return embed;
        }else{
            const guildIconUrl = interaction.guild.iconURL({
                dynamic: true,  // true -> animated icon if available
                size: 512      // specify size e.g. 128, 256, 512, 1024, 2048
            });

            const embed = new EmbedBuilder()
                .setAuthor({ name: `Top Handlers`, iconURL: 'https://i.imgur.com/26NGG4H.png' })
                .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                .setTitle(`${quarterDescription ? quarterDescription : "All time"}, ${year ? year : ""} \nEnding: ${endDescription ? endDescription : "Today"}`)
                .setImage('https://i.imgur.com/fTVYbwu.png')
                .setColor('#ff0000')
                .setThumbnail(guildIconUrl)
                .setTimestamp()
                .addFields(
                    { 
                        name: `__Top Handlers__`, 
                        value: "There were no entries in this timeframe.",
                        inline: false 
                    }
                )
                .setFooter({ text: 'Contact an administrator if you believe there are any errors.' });
            return embed;
        }
        
    }catch(error){
        console.error(error);
    }   
}