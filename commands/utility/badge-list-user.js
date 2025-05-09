const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { getBadgesByUserId } = require('../../api/badgeApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('badge-list-user')
        .setDescription('List all badges of a user')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user whose badges to list')
                .setRequired(true)),
    
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');

        try {
            const badges = await getBadgesByUserId(targetUser.id);

            if (!badges || badges.length === 0) {
                await interaction.reply(`${targetUser.username} has no badges.`);
                return;
            }

            // Sort badges by badge_weight in descending order
            badges.sort((a, b) => b.badge_weight - a.badge_weight);
            
            // Calculate total weight
            const totalWeight = badges.reduce((sum, badge) => sum + Number(badge.badge_weight || 0), 0);
            
            // Split badges into chunks of 25
            const chunkSize = 25;
            const badgeChunks = [];
            for (let i = 0; i < badges.length; i += chunkSize) {
                badgeChunks.push(badges.slice(i, i + chunkSize));
            }
            
            // Create an embed for each chunk
            const embeds = badgeChunks.map((chunk, index) => {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: `${targetUser.username}'s IronPoints Badges`, iconURL: 'https://i.imgur.com/JvvqhbV.png' })
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setDescription(`Total Points: ${totalWeight}`)
                    // .setImage('https://i.imgur.com/6wRYEg5.png')
                    .setTitle(` `)
                    .setColor('#ff0000')
                    .setTimestamp()
                    .setFooter({ text: `(Page ${index + 1}/${badgeChunks.length})`});
            
                chunk.forEach(badge => {
                    embed.addFields(
                        { 
                            name: `${badge.badge_name} (Points: ${badge.badge_weight})`, 
                            value: badge.badge_description || 'No description', 
                            inline: false 
                        }
                    );
                });
            
                return embed;
            });
            
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
                        .setDisabled(embeds.length <= 1)
                );
            
            // Send the first embed with navigation buttons
            const message = await interaction.reply({ embeds: [embeds[0]], components: [buttons] });
            
            // Create a collector to handle button interactions
            const collector = message.createMessageComponentCollector({ time: 300000 });
            
            let currentPage = 0;
            collector.on('collect', async interaction => {
                if (interaction.customId === 'previous') {
                    currentPage--;
                } else if (interaction.customId === 'next') {
                    currentPage++;
                }
            
                // Update buttons
                buttons.components[0].setDisabled(currentPage === 0);
                buttons.components[1].setDisabled(currentPage === embeds.length - 1);
            
                await interaction.update({ embeds: [embeds[currentPage]], components: [buttons] });
            });
            
            collector.on('end', async () => {
                buttons.components.forEach(button => button.setDisabled(true));
                await message.edit({ components: [buttons] });
            });
        } catch (error) {
            console.error('Error fetching badges:', error);
            await interaction.reply('An error occurred while fetching the badges. Please try again later.');
        }
    }
};