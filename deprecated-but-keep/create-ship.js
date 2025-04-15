// const { SlashCommandBuilder } = require('@discordjs/builders');
// const { getShipsById, getAllShips } = require('../api/uexApi');
// const { createPlayerShip } = require('../api/playerShipApi');


// const command = new SlashCommandBuilder()
//     .setName('create-ship')
//     .setDescription('Creates a named ship you can use to log kills on.')
//     .addStringOption(option => 
//         option.setName('ship')
//             .setDescription('The ship model')
//             .setRequired(true)
//             .setAutocomplete(true)) // Enable autocomplete
//     .addStringOption(option => 
//         option.setName('name')
//             .setDescription('What do you intend to name this ship?')
//             .setRequired(true)
//             .setAutocomplete(false));
    
// module.exports = {
//     data: command,
//     async execute(interaction, client, openai) {
//         // Get the chosen class name from the command options
//         const shipUsed = interaction.options.getString('ship');
//         const shipName = interaction.options.getString('name');
//         const shipModel = await getShipsById(shipUsed);

//         // Call your signup logic from the external file
//         try {
//             //for the main player putting in the entry
//             await createPlayerShip({
//                 id: new Date().getTime(),
//                 uex_ship_id: shipUsed,
//                 user_id: interaction.user.id,
//                 ship_model: shipModel.ship, 
//                 custom_name: shipName,
//                 crew: shipModel.crew,
//                 pad_type: shipModel.pad_type,
//             });
//             await interaction.reply({ content: `PlayerShip log added by ${interaction.user.username} successfully!`, ephemeral: false });
//         } catch (error) {
//             console.error(error);
//             await interaction.reply({ content: 'There was an error adding the PlayerShip.', ephemeral: true });
//         }
//     },
//     async autocomplete(interaction) {
//         const focusedValue = interaction.options.getFocused(); // Get the focused option value
//         const optionName = interaction.options.getFocused(true).name; // Get the name of the focused option
//         const allShips = await getAllShips(); // Fetch all ships
//         if (optionName === 'ship') {
//             // const allShipsSmallerCrew = allShips.filter(ship => ship.crew <= 2); // Filter ships with crew size <= 4
//             const allShipsListed = allShips.map(ship => ship.ship); // Map to ship names
//             // Filter ships based on the focused value
//             const filtered = allShips.filter(object =>
//                 object.ship.toLowerCase().startsWith(focusedValue.toLowerCase())
//             );

//             // Respond with up to 25 suggestions
//             await interaction.respond(
//                 filtered.map(ship => ({ name: ship.ship, value: ship.id })).slice(0, 25)
//             );
//         }
//     }
// };