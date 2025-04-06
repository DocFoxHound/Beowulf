const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

async function downloadUEXData(){
    console.log("Updating UEX Items")
    let apiUrls = [];
    let apiCallCounter = 0;
    let allTerminals;
    let totalTerminals = 0;
    const apiKey = `?api_key=${encodeURIComponent(process.env.UEX_CORP_API_TOKEN)}`
    apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices_all${apiKey}`, title: "commoditiesbyterminal", iterate: false});
    apiUrls.push({url: `https://api.uexcorp.space/2.0/items_prices_all${apiKey}`, title: "itemsbyterminal", iterate: false});
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
    console.log("Finished updating UEX Items.")
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    downloadUEXData
};