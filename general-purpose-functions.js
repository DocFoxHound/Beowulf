const vectorHandler = require("./vector-handler.js");
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCachedUser(guild, userId, userCache) {
    // Check if the user is already in cache
    if (userCache.has(userId)) {
        return userCache.get(userId);
    }

    // Fetch the user and add to cache if not present
    try {
        const user = await guild.members.fetch(userId);
        if (user) {
            userCache.set(userId, user);
            return user;
        }
    } catch (error) {
        console.error(`Could not fetch user: ${userId}`, error);
    }

    return null; // Return null if user cannot be fetched or does not exist
}

async function downloadUEXData(){
    console.log("Updating Commodities")
    let apiUrls = [];
    let apiCallCounter = 0;
    let allTerminals;
    let totalTerminals = 0;
    const apiKey = `?api_key=${encodeURIComponent(process.env.UEX_CORP_API_TOKEN)}`
    apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices?id_terminal=`, title: "terminal_prices", iterate: true}); //this needs to be iterated

    for (const api of apiUrls) {
        if(api.iterate === false){
            await delay(2000); // Wait for 1 second, since we can only do 60 calls in 60 seconds
            try{
                const response = await axios.get(api.url);
                const data = response.data;
                if(api.title === "terminals"){ //storing this in memory since we need it for iterating through terminal_prices
                    allTerminals = data;
                }
                //save as a JSON file
                const filePath = path.join(`./UEX/${api.title}.json`);
                fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
                    if (err) {
                        console.error('Error writing file:', err);
                        return;
                    }
                console.log(`Data successfully saved to ${filePath}`);
                });    
            }catch(error){
                console.log(`Error in getting UEX data: ${error}`)
            }
            
        }
        else if (api.title === "terminal_prices"){
            totalTerminals = allTerminals.data.length;
            individualTerminalData = [];
            console.log(`${totalTerminals} Terminals found`)
            // Iterate through allTerminals.data and get an API call (only 60 every minute)
            for(const terminal of allTerminals.data){
                totalTerminals--;
                const time = new Date();
                console.log(`${totalTerminals}: API retrieving ${terminal.name}`);
                await delay(1050); // Wait for ~1 second, since we can only do 60 calls in 60 seconds
                const response = await axios.get(`${api.url}${terminal.id}${apiKey}`);
                const data = response.data;
                individualTerminalData.push(data);
                // console.log(terminal); // Optionally log each terminal data
            }
            // Save as a JSON file
            const filePath = path.join(`./UEX/${api.title}.json`);
            fs.writeFile(filePath, JSON.stringify(individualTerminalData, null, 2), (err) => {
                if (err) {
                    console.error('Error writing file:', err);
                    return;
                }
                console.log(`Data successfully saved to ${filePath}`);
            });      
        }
    }
    console.log("Finished updating commodities.")
}

async function preloadFromJsons(){
    //load it all into memory
    let jsonData = await fs.readFile("./UEX/cities.json", 'utf8');
    cities = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/commodities.json", 'utf8');
    commodities = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/outposts.json", 'utf8');
    outposts = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/planets.json", 'utf8');
    planets = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/space_stations.json", 'utf8');
    spaceStations = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/star_systems.json", 'utf8');
    starSystems = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/terminal_prices.json", 'utf8');
    terminalPrices = JSON.parse(jsonData);
    jsonData = await fs.readFile("./UEX/terminals.json", 'utf8');
    terminals = JSON.parse(jsonData);

    //give us a short list of top selling locations
    let reconstructedTerminalUsageList = [];
    // let reconstructedTerminalUsageList = [{terminal_code: "", terminal_name: "", star_system_name: "", totalSells: "", totalBuys: "", commodities: [{commodity_name: "", commodity_code: "", scu_sell_users_rows: "", scu_buy_users_rows: ""}]}];
    for (const packet of terminalPrices) {
        for (const terminal of packet.data) {
            let terminalArray = reconstructedTerminalUsageList.find(item => item.terminal_code === terminal.terminal_code);
            if (terminalArray) {    
                // Assuming totalSells and totalBuys are integers and scu_sell_users_rows, scu_buy_users_rows are also integers.
                terminalArray.totalSells += parseInt(terminal.scu_sell_users_rows);
                terminalArray.totalBuys += parseInt(terminal.scu_buy_users_rows);
                terminalArray.commodities.push({
                    commodity_name: terminal.commodity_name,
                    commodity_code: terminal.commodity_code,
                    scu_sell_users_rows: terminal.scu_sell_users_rows,
                    scu_buy_users_rows: terminal.scu_buy_users_rows
                });

            } else {
                // Properly push a new object into the array
                reconstructedTerminalUsageList.push({
                    terminal_code: terminal.terminal_code,
                    terminal_name: terminal.terminal_name,
                    star_system_name: terminal.star_system_name,
                    totalSells: parseInt(terminal.scu_sell_users_rows),
                    totalBuys: parseInt(terminal.scu_buy_users_rows),
                    commodities: terminal.commodity_name ? [{
                        commodity_name: terminal.commodity_name,
                        commodity_code: terminal.commodity_code,
                        scu_sell_users_rows: terminal.scu_sell_users_rows,
                        scu_buy_users_rows: terminal.scu_buy_users_rows
                    }] : [] // Initialize commodities as empty array if no commodity data present
                });
            }
        }
    }
    //split out Stanton and Pyro systems and organize by best sellers
    let unorganizatedStantonArray = reconstructedTerminalUsageList.filter(terminal => terminal.star_system_name === "Stanton");
    let stantonTopBuyers = unorganizatedStantonArray.sort((a, b) => b.totalBuys - a.totalBuys).slice(0, 10);
    let stantonTopSellers = unorganizatedStantonArray.sort((a, b) => b.totalSells - a.totalSells).slice(0, 10);
    let unorganizedPyroArray = reconstructedTerminalUsageList.filter(terminal => terminal.star_system_name === "Pyro");
    let pyroTopBuyers = unorganizedPyroArray.sort((a, b) => b.totalBuys - a.totalBuys).slice(0, 10);
    let pyroTopSellers = unorganizedPyroArray.sort((a, b) => b.totalSells - a.totalSells).slice(0, 10);
    let allTopBuyers = reconstructedTerminalUsageList.sort((a, b) => b.totalBuys - a.totalBuys).slice(0, 10);
    let allTopSellers = reconstructedTerminalUsageList.sort((a, b) => b.totalSells - a.totalSells).slice(0, 10);

    //sort the commodities in each terminal by the top selling 5
    stantonTopBuyers.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.scu_buy_users_rows - a.scu_buy_users_rows);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    stantonTopSellers.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.scu_sell_users_rows - a.scu_sell_users_rows);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    pyroTopBuyers.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.scu_buy_users_rows - a.scu_buy_users_rows);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    pyroTopSellers.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.scu_sell_users_rows - a.scu_sell_users_rows);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    allTopBuyers.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.scu_buy_users_rows - a.scu_buy_users_rows);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    allTopSellers.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.scu_sell_users_rows - a.scu_sell_users_rows);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });


    // //ARRAY RETURN FORMAT FOR FUTURE REFERENCE:
    // {
    //     terminal_code: 'MICL1',
    //     terminal_name: 'Admin - MIC-L1',
    //     star_system_name: 'Stanton',
    //     totalSells: int,
    //     totalBuys: int,
    //     commodities: [ 
    //         commodity_name: "Agricultural Supplies",
    //         commodity_code: "AGRS",
    //         scu_sell_users_rows: int,
    //         scu_buy_users_rows: int,  
    //     ]
    // },

    return { // Optionally return these objects if needed elsewhere
        cities,
        commodities,
        outposts,
        planets,
        spaceStations,
        starSystems,
        terminalPrices,
        terminals,
        stantonTopBuyers,
        stantonTopSellers,
        pyroTopBuyers,
        pyroTopSellers,
        allTopBuyers,
        allTopSellers
    };
}

module.exports = {
  getCachedUser,
  downloadUEXData,
  preloadFromJsons
};