const vectorHandler = require("./vector-handler.js");
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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
    // apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
    // apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
    // apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
    // apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
    // apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
    // apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals?code=`, title: "terminal_prices", iterate: true}); //this needs to be iterated

    for (const api of apiUrls) {
        if(api.iterate === false){
            await delay(1000); // Wait for 1 second, since we can only do 60 calls in 60 seconds
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
            console.log(totalTerminals)
            //iterate through allTerminals.data and get an api call (only 60 every minute)
            for(const terminal of allTerminals.data){
                const time = new Date();
                console.log(`<${time}> API call`)
                await delay(1000); // Wait for 1 second, since we can only do 60 calls in 60 seconds
                const response = await axios.get(api.url + terminal.code + apiKey);
                const data = response.data;
                individualTerminalData.push(data);
                // console.log(terminal); // Process each item as needed
            }
            const flattenedTerminalData = individualTerminalData.join();
            //save as a JSON file
            const filePath = path.join(`./UEX/${api.title}.json`);
            fs.writeFile(filePath, JSON.stringify(flattenedTerminalData, null, 2), (err) => {
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

module.exports = {
  getCachedUser,
  downloadUEXData
};