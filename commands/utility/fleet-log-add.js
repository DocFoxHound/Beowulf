const { SlashCommandBuilder } = require('@discordjs/builders');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { createShipLog } = require('../../api/shipLogApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getPlayerShipsByUserId, getPlayerShipByEntryId } = require('../../api/playerShipApi');
const { getUserById } = require('../../api/userlistApi');

const command = new SlashCommandBuilder()
    .setName('fleet-log-add')
    .setDescription('For Commanders to add an entry to the Fleet Log.')
    .addStringOption(option => 
        option.setName('title')
            .setDescription('The Title of the Operation')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('crew')
            .setDescription('@ ironpoint members, or write names of external participants (separate by comma)')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('air-sub-commanders')
            .setDescription('@ the players who sub-commanded under you.')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('fps-sub-commanders')
            .setDescription('@ the players who sub-commanded under you.')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('link')
            .setDescription('Link to the Operation (put N/A if none)')
            .setRequired(false));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the chosen class name from the command options
        const airsubcommanders = interaction.options.getString('air-sub-commanders');
        const fpssubcommanders = interaction.options.getString('fps-sub-commanders');
        const title = interaction.options.getString('title');
        const link = interaction.options.getString('link');
        const assistsRaw = interaction.options.getString('crew');
        
        const shipLogChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.SHIP_LOG_CHANNEL : process.env.TEST_SHIP_LOG_CHANNEL;
        const patches = await getAllGameVersions();
        const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
        const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
        const discordUserIdsCrew = assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || [];
        const plaintextUsernamesCrew = assistsRaw
            .replace(/<@!?(\d+)>/g, '') // Remove Discord user mentions
            .replace(/\s+/g, ',') // Replace spaces with commas
            .split(',')
            .map(name => name.trim()) // Trim whitespace around each username
            .filter(name => name.length > 0); // Remove empty entries
        let discordUserIdsFpsSubcommanders = [];
        let plaintextUsernamesFpsSubcommanders = [];
        if(fpssubcommanders !== null){
            discordUserIdsFpsSubcommanders = fpssubcommanders.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || [];
            plaintextUsernamesFpsSubcommanders = fpssubcommanders
                .replace(/<@!?(\d+)>/g, '') // Remove Discord user mentions
                .replace(/\s+/g, ',') // Replace spaces with commas
                .split(',')
                .map(name => name.trim()) // Trim whitespace around each username
                .filter(name => name.length > 0); // Remove empty entries
        }
        let discordUserIdsAirSubcommanders = [];
        let plaintextUsernamesAirSubcommanders = [];
        if(airsubcommanders !== null){
            discordUserIdsAirSubcommanders = airsubcommanders.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || [];
            plaintextUsernamesAirSubcommanders = airsubcommanders
                .replace(/<@!?(\d+)>/g, '') // Remove Discord user mentions
                .replace(/\s+/g, ',') // Replace spaces with commas
                .split(',')
                .map(name => name.trim()) // Trim whitespace around each username
                .filter(name => name.length > 0); // Remove empty entries
        }
        

        const assistedPlayers = [...discordUserIdsCrew, ...plaintextUsernamesCrew];
        const airsubcommanderPlayers = [...discordUserIdsAirSubcommanders, ...plaintextUsernamesAirSubcommanders];
        const fpssubcommanderPlayers = [...discordUserIdsFpsSubcommanders, ...plaintextUsernamesFpsSubcommanders];

        // Call your signup logic from the external file
        try {
            const parentId = new Date().getTime()

            // Create modal
            const modal = new ModalBuilder()
                .setCustomId('shipLogDescriptionModal')
                .setTitle('Ship Log Description');

            // Create description input
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Cover: Mission, Outcome, Improvements')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1024);

            // Add input to action row
            const firstActionRow = new ActionRowBuilder().addComponents(descriptionInput);
            modal.addComponents(firstActionRow);

            // Show modal to user
            await interaction.showModal(modal);

            let modalDescription = '';
            try {
                const submitted = await interaction.awaitModalSubmit({
                    time: 5 * 60 * 1000, // 5 minutes
                    filter: i => i.customId === 'shipLogDescriptionModal' && i.user.id === interaction.user.id,
                });

                // Get the value
                modalDescription = submitted.fields.getTextInputValue('description');
                await submitted.deferUpdate(); // Avoids "This interaction failed"

                //for the main player putting in the entry
                await createShipLog({
                    id: parentId,
                    commander: interaction.user.id,
                    air_subcommanders: airsubcommanderPlayers,
                    fps_subcommanders: fpssubcommanderPlayers,
                    patch: latestPatch,
                    crew: assistedPlayers,
                    created_at: new Date().toISOString(),
                    notes: modalDescription,
                    title: title,
                    link: link,
                });

                const logChannel = await client.channels.fetch(shipLogChannel).catch(err => {
                    console.error('Could not find the ship-log channel:', err);
                });

                if (logChannel && logChannel.isTextBased()) {
                    let formattedPlayerList = [];
                    let formattedAirSubcommanderList = [];
                    let formattedFpsSubcommanderList = [];
                    for (const player of assistedPlayers) {
                        // Check if the player is a Discord user ID (numeric string)
                        if (/^\d+$/.test(player)) {
                            // Retrieve the user from the database using the user ID
                            const user = await getUserById(player); // Replace with your database function
                            if (user) {
                                formattedPlayerList.push(`${user.username}`);
                            } else {
                                formattedPlayerList.push(`${player}`); // Fallback if user not found
                            }
                        } else {
                            // If it's not a Discord user ID, treat it as a plaintext username
                            formattedPlayerList.push(`${player}`);
                        }
                    }
                    for(const player of airsubcommanderPlayers) {
                        // Check if the player is a Discord user ID (numeric string)
                        if (/^\d+$/.test(player)) {
                            // Retrieve the user from the database using the user ID
                            const user = await getUserById(player); // Replace with your database function
                            if (user) {
                                formattedAirSubcommanderList.push(`${user.username}`);
                            } else {
                                formattedAirSubcommanderList.push(`${player}`); // Fallback if user not found
                            }
                        } else {
                            // If it's not a Discord user ID, treat it as a plaintext username
                            formattedAirSubcommanderList.push(`${player}`);
                        }
                    }
                    for(const player of fpssubcommanderPlayers) {
                        // Check if the player is a Discord user ID (numeric string)
                        if (/^\d+$/.test(player)) {
                            // Retrieve the user from the database using the user ID
                            const user = await getUserById(player); // Replace with your database function
                            if (user) {
                                formattedFpsSubcommanderList.push(`${user.username}`);
                            } else {
                                formattedFpsSubcommanderList.push(`${player}`); // Fallback if user not found
                            }
                        } else {
                            // If it's not a Discord user ID, treat it as a plaintext username
                            formattedFpsSubcommanderList.push(`${player}`);
                        }
                    }
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: `Fleet Log (${parentId})`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                        .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                        .setTitle(`${title}`)
                        .setImage('https://i.imgur.com/PUdhTOd.png')
                        .setDescription(`${parentId}`)
                        .addFields(
                            { name: 'Commander', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Link', value: link || 'N/A', inline: false },
                            { name: 'Air Sub-Commanders', value: formattedAirSubcommanderList.join(', ') || 'None', inline: false },
                            { name: 'FPS Sub-Commanders', value: formattedFpsSubcommanderList.join(', ') || 'None', inline: false },
                            { name: 'Crew', value: formattedPlayerList.join(', ') || 'None', inline: false },
                            { name: 'Description', value: modalDescription || 'No description provided.', inline: false }
                        )
                        .setColor('#ff0000')
                        .setTimestamp()
                        .setFooter({ text: `Fleet Log System` });

                    await logChannel.send({ embeds: [embed] });
                }

                await submitted.followUp({ content: `Fleet Log (${parentId}) added by ${interaction.user.username} successfully!`, ephemeral: false });
            } catch (error) {
                console.error('Modal submission failed or timed out:', error);
                await interaction.followUp({ content: 'No description was submitted. Canceling fleet log.', ephemeral: true });
                return;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error adding the fleet log.', ephemeral: true });
        }
    }
};