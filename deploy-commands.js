// // Use this file to deploy or delete bot commands
// //      node deploy-commands.js                                    - deploy all commands in ./commands/ using .env
// //      node deploy-commands.js ENV_NAME                           - deploy all commands using custom not default env
// //      node deploy-commands.js -x ignore.js,test.js               - deploy all commands but ignore ignore.js and test.js commands
// //      node deploy-commands.js -d ID                              - delete a global command with id
// //      Args Usage:
// //          -x <filename>: Ignore a specific file when deploying commands.
// //          -d <command_id>: Delete a command by its ID.

// // Require necessary classes
// const { REST, Routes } = require('discord.js');
// const dotenv = require('dotenv');
// const fs = require('node:fs');
// const path = require('node:path');
// const { Client, Events, GatewayIntentBits } = require('discord.js');
// // const clientId = process.env.CLIENT_ID;
// // const guildId = process.env.GUILD_ID_TEST;
// // const token = process.env.CLIENT_TOKEN;

// // Initialize command files
// const args = process.argv.slice(2);
// let envFile = '.env';
// let ignoreFiles = [];
// let deleteCommandId;
// for (let i = 0; i < args.length; i++) {
//   if (i === 0 && !args[i].startsWith('-')) {
//     envFile = `${args[i]}`;
//   } else if (args[i] === '-x' && args[i + 1]) {
//     ignoreFiles = args[i + 1].split(',');
//     i++;
//   } else if (args[i] === '-d' && args[i + 1]) {
//     deleteCommandId = args[i + 1];
//     i++;
//   }
// }
// dotenv.config({ path: envFile });

// const commands = [];
// // Grab all the command files from the commands directory
// const commandsPath = path.join(__dirname, 'commands');
// const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && !ignoreFiles.includes(file));

// // Get command details
// for (const file of commandFiles) {
//   const command = require(`./commands/utility/${file}`);
//   commands.push(command.data.toJSON());
// }

// // Construct and prepare an instance of the REST module
// const rest = new REST({ version: '10' }).setToken(process.env.CLIENT_TOKEN);

// let clientId;
// const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// // Run once logged in
// client.once(Events.ClientReady, c => {
//   clientId = client.user.id;

//   // Deploy (or delete) commands
//   (async () => {
//     if (deleteCommandId) {
//       try {
//         await rest.delete(Routes.applicationCommand(clientId, deleteCommandId));
//         console.log(`Successfully deleted application command with ID: ${deleteCommandId}`);
//       } catch (error) {
//         console.error(error);
//       }
//     } else {
//       try {
//         console.log(`Started refreshing ${commands.length} application (/) commands.`);
//         const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
//         console.log(`Successfully reloaded ${data.length} application (/) commands.`);
//       } catch (error) {
//         console.error(error);
//       }
//     }
//   })();

//   // Logout
//   client.destroy();
// });
// // Login to client to get client ID
// client.login(process.env.CLIENT_TOKEN);


















// node deploy-commands.js
// use this to deploy commands

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require("dotenv");

// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = ".env";
if (args.length === 1) {
  envFile = `${args[0]}`;
}
dotenv.config({
  path: envFile,
});

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID_TEST;
const token = process.env.CLIENT_TOKEN;

const commands = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();