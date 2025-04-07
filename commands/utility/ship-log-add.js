const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getAllShips } = require('../../api/uexApi');
const { createShipLog } = require('../../api/shipLogApi');
const { getAllGameVersions } = require('../../api/gameVersionApi');
const { getPlayerShipsByUserId, getPlayerShipByEntryId } = require('../../api/playerShipApi');

const command = new SlashCommandBuilder()
    .setName('ship-log-add')
    .setDescription('Add an activity log for a large ship to the Ship Log.')
    .addStringOption(option => 
        option.setName('owner')
            .setDescription('@ the player who owns the ship.')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('commander')
            .setDescription('@ the player who commanded the ship')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('ship-used')
            .setDescription('The ship used or crewed upon.')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('crew')
            .setDescription('@ the players who assisted/crewed this ship. (at minimum, 3 players)')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('victim-orgs')
            .setDescription('The names of the orgs that were engaged, SEPARATED BY A COMMA. Use "unknown" if not known.')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('ship-killed1')
            .setDescription('List a ship that was killed.')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed2')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed3')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed4')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed5')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed6')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed7')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed8')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed9')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    .addStringOption(option => 
        option.setName('ship-killed10')
            .setDescription('List a ship that was killed.')
            .setRequired(false)
            .setAutocomplete(true))
    ;
    
module.exports = {
    data: command,
    async execute(interaction, client, openai) {
        // Get the chosen class name from the command options
        const owner = interaction.options.getString('owner').replace(/\D/g, '');
        const commander = interaction.options.getString('commander').replace(/\D/g, '');
        const shipUsed = interaction.options.getString('ship-used');
        const shipKilled = interaction.options.getString('ship-killed1');
        const victimOrgs = interaction.options.getString('victim-orgs');
        const assistsRaw = interaction.options.getString('crew');

        const shipLogChannel = process.env.LIVE_ENVIRONMENT === "true" ? process.env.SHIP_LOG_CHANNEL : process.env.TEST_SHIP_LOG_CHANNEL;
        const patches = await getAllGameVersions();
        const latestPatchesSorted = patches.sort((a, b) => b.id - a.id);
        const latestPatch = latestPatchesSorted[0].version; // Get the latest patch
        const victimOrgsArray = victimOrgs.split(',').map(name => name.trim()); // Split by comma and trim whitespace
        const assistedPlayers = assistsRaw
            ? assistsRaw.match(/<@!?(\d+)>/g)?.map(id => id.replace(/\D/g, '')) || []
            : [];
        let killList = [];
        try{
            for (let i = 1; i <= 10; i++) {
                const shipKilled = interaction.options.getString(`ship-killed${i}`);
                if (shipKilled) {
                    killList.push(shipKilled); // Add the ship to the killList if it exists
                }
            }
        }catch(error){
            console.error('Error retrieving ship kills:', error);
            await interaction.reply({ content: 'There was an error retrieving the ship kills.', ephemeral: true });
            return;
        }
        const killAmount = killList.length > 0 ? killList.length : 1; // default to 1 to not break spacetime
        const allShips = await getAllShips(); // Fetch all ships
        let totalPrice = 0;
        try{
            for(kill of killList) {
                const shipKilledObject = allShips.find(ship => ship.id === kill);
                totalPrice += shipKilledObject.avg_price;
            }
        }catch(error){
            console.error('Error retrieving ship kills:', error);
            await interaction.reply({ content: 'There was an error retrieving the ship kills.', ephemeral: true });
            return;
        }
        const numberAssisted = assistedPlayers.length > 0 ? assistedPlayers.length : 1;
        const dividedKillAmount = assistedPlayers.length > 0 ? (killAmount / (numberAssisted + 1)) : killAmount;
        const dividiedAvgPrice = assistedPlayers.length > 0 ? (totalPrice / (numberAssisted + 1)) : totalPrice;
        const shipUsedName = await getPlayerShipByEntryId(shipUsed);
        

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
                .setLabel('Cover the following topics: What was the mission? What happened? What was the outcome? Where can you improve?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000);

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
                    owner_id: owner, 
                    ship_used: shipUsed, 
                    commander: commander,
                    value: totalPrice,
                    victim_orgs: victimOrgsArray,
                    patch: latestPatch,
                    crew: assistedPlayers,
                    ships_killed: killList, 
                    divided_value: dividiedAvgPrice,
                    total_kills: killAmount,
                    divided_kills: dividedKillAmount,
                    ship_used_name: shipUsedName.custom_name,
                    description: modalDescription,
                });

                const logChannel = await client.channels.fetch(shipLogChannel).catch(err => {
                    console.error('Could not find the ship-log channel:', err);
                });

                if (logChannel && logChannel.isTextBased()) {
                    const logMessage = `🛳️ **New Ship Log Entry**\n**ID:** ${parentId}\n**Submitted by:** <@${interaction.user.id}>\n**Commander:** <@${commander}>\n**Crew:** ${assistedPlayers.map(id => `<@${id}>`).join(', ')}\n**Ship Used:** ${shipUsedName.custom_name} (the ${shipUsedName.ship_model})\n**Kills:** ${killAmount}\n**Total Value:** $${totalPrice.toLocaleString()}\n**Description:** ${modalDescription}`;
                    await logChannel.send({ content: logMessage });
                }

                await submitted.followUp({ content: `Ship Log (${parentId}) added by ${interaction.user.username} successfully!`, ephemeral: false });
            } catch (error) {
                console.error('Modal submission failed or timed out:', error);
                await interaction.followUp({ content: 'No description was submitted. Canceling ship log.', ephemeral: true });
                return;
            }
            // await interaction.reply({ content: `Ship Log (${parentId}) added by ${interaction.user.username} successfully!`, ephemeral: false });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error adding the Ship log.', ephemeral: true });
        }
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused(); // Get the focused option value
        const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
        const allShips = await getAllShips(); // Fetch all ships
        try{
            if (optionName === 'ship-used') {
                const ownerUser = interaction.options.getString('owner').replace(/\D/g, ''); // Get the owner user
                const allPlayerShips = await getPlayerShipsByUserId(ownerUser);
                const allShipsSmallerCrew = allPlayerShips.filter(ship => ship.crew >= 3); // Filter ships with crew size <= 2
                const allShipsListed = allShipsSmallerCrew.map(ship => ({
                    name: `${ship.custom_name} (${ship.ship_model})`, // Include both custom_name and model in the name
                    value: ship.id // Use custom_name as the value
                }));
    
                // Filter ships based on the focused value
                const filtered = allShipsListed.filter(ship =>
                    ship.name.toLowerCase().includes(focusedValue.toLowerCase())
                );
    
                // Respond with up to 25 suggestions
                await interaction.respond(filtered.slice(0, 25));
            } else if (optionName.includes('ship-killed')) {
                const allShipsListed = allShips.map(ship => ({
                    name: `${ship.ship}`, // Include both ship name and model in the name
                    value: ship.id // Use ship name as the value
                }));
    
                // Filter ships based on the focused value
                const filtered = allShipsListed.filter(ship =>
                    ship.name.toLowerCase().includes(focusedValue.toLowerCase())
                );
    
                // Respond with up to 25 suggestions
                await interaction.respond(filtered.slice(0, 25));
            }
        }catch(error){
            console.error('Error retrieving ships:', error);
            await interaction.reply({ content: 'There was an error retrieving a ship. Make sure that you have created a ship of 3+ crew before trying to add a ship log.', ephemeral: true });
            return;
        }
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}