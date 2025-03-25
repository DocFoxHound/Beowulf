const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkUserListForUser } = require('../../userlist-functions/userlist-controller.js');
const { progressBar } = require('../../common/progress-bar.js');
const progressEmbed = require('../../common/embeds.js').progressEmbed;
const { getClasses } = require('../../api/classApi.js');
const userlistController = require('../../userlist-functions/userlist-controller.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('progress-tracker')
        .setDescription('View your promotion progress across RAPTOR, CORSAIR, and RAIDER assessments')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The user to check progress for')
                .setRequired(true)
            ),
    
    async execute(interaction) {
        try {
            // Fetch user data
            const targetUser = interaction.options.getUser('target');
            const userData = await checkUserListForUser(targetUser);
            
            if (!userData) {
                return interaction.reply({
                    content: 'The specified user is not registered in our database. Please contact an administrator for assistance.',
                    ephemeral: true
                });
            }

            // Extract boolean fields for each assessment type
            const raptorFields = {
                'RAPTOR 1 Solo': userData.raptor_1_solo || false,
                'RAPTOR 1 Team': userData.raptor_1_team || false,
                'RAPTOR 2 Solo': userData.raptor_2_solo || false,
                'RAPTOR 2 Team': userData.raptor_2_team || false,
                'RAPTOR 3 Solo': userData.raptor_3_solo || false,
                'RAPTOR 3 Team': userData.raptor_3_team || false
            };
            
            const corsairFields = {
                'CORSAIR 1 Turret': userData.corsair_1_turret || false,
                'CORSAIR 1 Torpedo': userData.corsair_1_torpedo || false,
                'CORSAIR 2 Ship Commander': userData.corsair_2_ship_commander || false,
                'CORSAIR 2 Wing Commander': userData.corsair_2_wing_commander || false,
                'CORSAIR 3 Fleet Commander': userData.corsair_3_fleet_commander || false
            };
            
            const raiderFields = {
                'RAIDER 1 Swabbie': userData.raider_1_swabbie || false,
                'RAIDER 1 Linemaster': userData.raider_1_linemaster || false,
                'RAIDER 1 Boarder': userData.raider_1_boarder || false,
                'RAIDER 2 Powdermonkey': userData.raider_2_powdermonkey || false,
                'RAIDER 2 Mate': userData.raider_2_mate || false,
                'RAIDER 3 Sailmaster': userData.raider_3_sailmaster || false
            };
        
            //calculate tier eligibility
            let raptorEligibility = 0;
            let corsairEligibility = 0;
            let raiderEligibility = 0;
            if(userData.raptor_1_solo === true && userData.raptor_1_team === true){
                raptorEligibility++;
            }
            if(userData.raptor_2_solo === true && userData.raptor_2_team === true){
                raptorEligibility++;
            }
            if(userData.raptor_3_solo === true && userData.raptor_3_team === true){
                raptorEligibility++;
            }
            if(userData.corsair_1_torpedo === true && userData.corsair_1_turret === true){
                corsairEligibility++;
            }
            if(userData.corsair_2_ship_commander === true && userData.corsair_2_wing_commander === true){
                corsairEligibility++;
            }
            if(userData.corsair_3_fleet_commander === true){
                corsairEligibility++;
            }
            if(userData.raider_1_boarder === true && userData.raider_1_linemaster === true && userData.raider_1_swabbie === true){
                raiderEligibility++;
            }
            if(userData.raider_2_mate === true && userData.raider_2_powdermonkey === true){
                raiderEligibility++;
            }
            if(userData.raider_3_sailmaster === true){
                raiderEligibility++;
            }
            
            // Helper function to format assessment status
            const formatAssessments = (assessments) => {
                return Object.entries(assessments)
                    .map(([name, completed]) => `${completed ? '✅' : '❌'} ${name}`)
                    .join('\n');
            };
            
            // Calculate completion percentages
            const calculateCompletion = (assessments) => {
                const total = Object.keys(assessments).length;
                const completed = Object.values(assessments).filter(Boolean).length;
                return Math.round((completed / total) * 100);
            };
            
            const raptorLevel = await userlistController.getRaptorRankDb(targetUser.id);
            const corsairLevel = await userlistController.getCorsairRankDb(targetUser.id);
            const raiderLevel = await userlistController.getRaiderRankDb(targetUser.id);
            const crewCompletion = Math.min(100, Math.round(((raptorLevel + corsairLevel + raiderLevel) / 3) * 100));
            const marauderCompletion = Math.max(
                Math.round((raptorLevel / 3) * 100),
                Math.round((corsairLevel / 3) * 100),
                Math.round((raiderLevel / 3) * 100)
            );
            const raptorCompletion = calculateCompletion(raptorFields);
            const corsairCompletion = calculateCompletion(corsairFields);
            const raiderCompletion = calculateCompletion(raiderFields);
            const overallCompletion = Math.round(
                (raptorCompletion + corsairCompletion + raiderCompletion) / 3
            );
        
            const totalProgressBar = await progressBar(overallCompletion, 100, 40, '■', '□');
            const crewProgressBar = await progressBar(crewCompletion, 100, 30, '𝅛', '𝅚');
            const marauderProgressBar = await progressBar(marauderCompletion, 100, 30, '𝅛', '𝅚');
        
            // Create embed
            const embed1 = new EmbedBuilder()
                .setTitle(`Promotion Progress for ${targetUser.username}`)
                .setDescription(`**Overall Completion: __${overallCompletion}%__** ${totalProgressBar}
                    \n**Crew Progress: __${crewCompletion}%__** (earn 3 total prestige levels)
                    ${crewProgressBar}
                    \n**Marauder Progress: __${marauderCompletion}%__**  (TIER 3 in at least one Prestige)
                    ${marauderProgressBar}\n
                    `)
                .setColor('#ff0000')
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp()
                .addFields(
                    { 
                        name: `__RAPTOR Assessments (${raptorCompletion}%)__`, 
                        value: `Prestige Eligibility: **TIER ${raptorEligibility}**` + `\n` + formatAssessments(raptorFields), 
                        inline: false 
                    },
                    { 
                        name: `__CORSAIR Assessments (${corsairCompletion}%)__`, 
                        value: `Prestige Eligibility: **TIER ${corsairEligibility}**` + `\n` + formatAssessments(corsairFields), 
                        inline: false 
                    },
                    { 
                        name: `__RAIDER Assessments (${raiderCompletion}%)__`, 
                        value: `Prestige Eligibility: **TIER ${raiderEligibility}**` + `\n` + formatAssessments(raiderFields), 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Contact an administrator if you believe there are any errors in your progress tracking.' });

            // Create the second embed (Promotion Instructions)
            const embed2 = new EmbedBuilder()
                .setTitle('Promotion Instructions')
                .setDescription(`**How to Promote to Crew:**
                    \nGaining CREW in IronPoint means that you have some general understanding of how to fend for yourself, and how to be part of the team. You've shown that you're dedicated and that you want to learn, and that you're a value-added member to the IronPoint crew.
                    \n1. Earn 3 total prestige levels.
                    \n**-----------------------------------**
                    \n\n**How to Promote to Marauder:**
                    \nGaining MARAUDER in IronPoint means that you are an expert in your field and that you've demonstrated tenacity and leadership qualities.
                    \n1. Achieve TIER 3 in at least one Prestige.
                    \n2. Have at least TIER 1 in the other Prestiges.
                    \n3. Pass the MARAUDER CHALLENGE for your specific Prestige.
                    `)
                .setColor('#ff0000')
                .setTimestamp()
                .setFooter({ text: 'Contact an administrator if you have any questions about promotions.' });

            // Fetch classes and create the third, fourth, and fifth embeds (Class Information)
            const classes = await getClasses();
            const raptorClasses = classes.filter(classItem => classItem.prestige_category === 'raptor');
            const corsairClasses = classes.filter(classItem => classItem.prestige_category === 'corsair');
            const raiderClasses = classes.filter(classItem => classItem.prestige_category === 'raider');

            const embed3 = new EmbedBuilder()
                .setTitle('RAPTOR Class Information')
                .setColor('#ff0000')
                .setTimestamp()
                .setFooter({ text: 'Contact an administrator if you have any questions about classes.' });

            raptorClasses.forEach(classItem => {
                embed3.addFields(
                    { 
                        name: classItem.alt_name, 
                        value: classItem.description, 
                        inline: false 
                    }
                );
            });

            const embed4 = new EmbedBuilder()
                .setTitle('CORSAIR Class Information')
                .setColor('#ff0000')
                .setTimestamp()
                .setFooter({ text: 'Contact an administrator if you have any questions about classes.' });

            corsairClasses.forEach(classItem => {
                embed4.addFields(
                    { 
                        name: classItem.alt_name, 
                        value: classItem.description, 
                        inline: false 
                    }
                );
            });

            const embed5 = new EmbedBuilder()
                .setTitle('RAIDER Class Information')
                .setColor('#ff0000')
                .setTimestamp()
                .setFooter({ text: 'Contact an administrator if you have any questions about classes.' });

            raiderClasses.forEach(classItem => {
                embed5.addFields(
                    { 
                        name: classItem.alt_name, 
                        value: classItem.description, 
                        inline: false 
                    }
                );
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
                );

            // Send the first embed with navigation buttons
            const message = await interaction.reply({ embeds: [embed1], components: [buttons], fetchReply: true });

            // Create a collector to handle button interactions
            const collector = message.createMessageComponentCollector({ time: 60000 });

            let currentPage = 0;
            const embeds = [embed1, embed2, embed3, embed4, embed5];

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

            // collector.on('end', async () => {
            //     buttons.components.forEach(button => button.setDisabled(true));
            //     await message.edit({ components: [buttons] });
            // });            
        } catch (error) {
            console.error('Error in progress-tracker command:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the progress data. Please try again later or contact an administrator.',
                ephemeral: true
            });
        }
    }
};