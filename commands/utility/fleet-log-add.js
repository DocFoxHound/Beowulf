const { SlashCommandBuilder } = require('@discordjs/builders');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { createShipLog } = require('../../api/shipLogApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getPlayerShipsByUserId, getPlayerShipByEntryId } = require('../../api/playerShipApi');


const command = new SlashCommandBuilder()
    .setName('fleet-log-add')
    .setDescription('For Commanders to add an entry to the Fleet Log.')
    .addStringOption(option => 
        option.setName('sub-commanders')
            .setDescription('@ the players who sub-commanded under you.')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('crew')
            .setDescription('@ the players who assisted in the operation. (at minimum, 3 players)')
            .setRequired(true));
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the chosen class name from the command options
        const subcommanders = interaction.options.getString('sub-commanders');
        const assistsRaw = interaction.options.getString('crew');
        
        const shipLogChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.SHIP_LOG_CHANNEL : process.env.TEST_SHIP_LOG_CHANNEL;
        const patches = await getAllGameVersions();
        const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
        const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
        const subcommanderPlayers = subcommanders
            ? subcommanders.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
            : [];
        const assistedPlayers = assistsRaw
            ? assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
            : [];
        

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
                    subcommanders: subcommanderPlayers,
                    patch: latestPatch,
                    crew: assistedPlayers,
                    created_at: new Date().toISOString(),
                    notes: modalDescription,
                });

                const logChannel = await client.channels.fetch(shipLogChannel).catch(err => {
                    console.error('Could not find the ship-log channel:', err);
                });

                if (logChannel && logChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: `New Fleet Log Entry`, iconURL: 'https://i.imgur.com/QHdkPrB.png' })
                        .setThumbnail('https://i.imgur.com/UoZsrrM.png')
                        .setTitle(`Fleet Log (${parentId})`)
                        .setImage('https://i.imgur.com/PUdhTOd.png')
                        .setDescription(`A new fleet log entry has been submitted.`)
                        .addFields(
                            { name: 'ID', value: `${parentId}`, inline: true },
                            { name: 'Commander', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Sub-Commanders', value: subcommanderPlayers.map(id => `<@${id}>`).join(', ') || 'None', inline: false },
                            { name: 'Crew', value: assistedPlayers.map(id => `<@${id}>`).join(', ') || 'None', inline: false },
                            { name: 'Description', value: modalDescription || 'No description provided.', inline: false }
                        )
                        .setColor('#ff0000')
                        .setTimestamp()
                        .setFooter({ text: 'Fleet Log System' });

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