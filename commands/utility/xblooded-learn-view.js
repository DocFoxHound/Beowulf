const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { getAllLessonsLearned } = require('../../api/lessonsLearnedApi.js');
const logger = require('../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xblooded-learn-view')
        .setDescription('Displays all of the lessons that the bot has learned over time.'),
    
    /**
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        const member = interaction.member;
        const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
        const hasPermission = member.roles.cache.some(role => moderatorRoles.includes(role.id));
        if (!hasPermission) {
            return interaction.reply({ 
                content: `${interaction.user.username}, you do not have permission to use this command.`,
                ephemeral: false 
            });
        }

        try {
            const lessons = await getAllLessonsLearned();

            if (!lessons || lessons.length === 0) {
                return interaction.reply({ 
                    content: "No lessons have been learned yet.", 
                    ephemeral: true 
                });
            }

            const embeds = [];
            const itemsPerPage = 5; // Number of lessons per page

            for (let i = 0; i < lessons.length; i += itemsPerPage) {
                const currentLessons = lessons.slice(i, i + itemsPerPage);
                const embed = new EmbedBuilder()
                    .setTitle('Lessons Learned')
                    .setColor('#ff0000')
                    .setDescription('Here are the lessons the bot has learned:')
                    .setFooter({ text: `Page ${Math.ceil(i / itemsPerPage) + 1} of ${Math.ceil(lessons.length / itemsPerPage)}` });

                currentLessons.forEach(lesson => {
                    embed.addFields({
                        name: `Lesson ID: ${lesson.id}`,
                        value: `**Username:** ${lesson.username}\n**Lesson:** ${lesson.lesson}`
                    });
                });

                embeds.push(embed);
            }

            let currentPage = 0;

            const message = await interaction.reply({ 
                embeds: [embeds[currentPage]], 
                fetchReply: true 
            });

            if (embeds.length > 1) {
                await message.react('⬅️');
                await message.react('➡️');

                const filter = (reaction, user) => {
                    return ['⬅️', '➡️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
                };

                const collector = message.createReactionCollector({ filter, time: 60000 });

                collector.on('collect', (reaction) => {
                    if (reaction.emoji.name === '➡️') {
                        if (currentPage < embeds.length - 1) {
                            currentPage++;
                            message.edit({ embeds: [embeds[currentPage]] });
                        }
                    } else if (reaction.emoji.name === '⬅️') {
                        if (currentPage > 0) {
                            currentPage--;
                            message.edit({ embeds: [embeds[currentPage]] });
                        }
                    }
                    reaction.users.remove(interaction.user.id);
                });

                collector.on('end', () => {
                    message.reactions.removeAll().catch(console.error);
                });
            }
        } catch (error) {
            console.error('Error fetching lessons from the bot:', error);
            await interaction.reply('An error occurred while fetching lessons from the bot.');
        }
    }
};