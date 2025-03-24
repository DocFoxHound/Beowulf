const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const UEX = require('../api/uexApi');

async function processUEXData(whichTable){
    console.log(`Updating UEX ${whichTable} Items`)
    let apiUrls = [];
    let apiCallCounter = 0;
    let allTerminals;
    let totalTerminals = 0;
    const apiKey = `?api_key=${encodeURIComponent(process.env.UEX_CORP_API_TOKEN)}`
    if(whichTable === "all"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices?id_terminal=`, title: "terminal_prices", iterate: true}); //this needs to be iterated
    }else if(whichTable === "cities"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
    }else if(whichTable === "commodities"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
    }else if(whichTable === "outposts"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
    }else if(whichTable === "planets"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
    }else if(whichTable === "space_stations"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
    }else if(whichTable === "star_systems"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
    }else if(whichTable === "terminals"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
    }else if(whichTable === "terminal_prices"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices?id_terminal=`, title: "terminal_prices", iterate: true});
    }else if(whichTable === "other_tables"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
    }
    

    for (const api of apiUrls) {
        if(api.iterate === false){
            await delay(2000); // Wait for 1 second, since we can only do 60 calls in 60 seconds
            try{
                const response = await axios.get(api.url);
                const data = response.data;
                if(api.title === "terminals"){ //storing this in memory since we need it for iterating through terminal_prices
                    allTerminals = data || UEX.getAllTerminals();
                }
                await sendToDb(api.title, data);
            }catch(error){
                console.log(`Error in getting UEX data: ${error}`)
            }
        }else if (api.title === "terminal_prices"){
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
            await sendToDb(api.title, individualTerminalData);  
        }
    }
    console.log("Finished updating UEX items.")
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendToDb(title, data){
    try{
        const dataArray = Array.isArray(data) ? data : [data];
        for (const item of dataArray) {
            if (item.data && Array.isArray(item.data)) {
                switch (title){
                    case "cities":
                        console.log("Processing cities")
                        for(const d of item.data){
                            await UEX.createOrUpdateCity(d);
                        }
                        break;
                    case "commodities":
                        console.log("Processing commodities")
                        for(const d of item.data){
                            await UEX.createOrUpdateCommodity(d);
                        }
                        break;
                    case "outposts":
                        console.log("Processing outposts")
                        for(const d of item.data){
                            await UEX.createOrUpdateOutpost(d);
                        }
                        break;
                    case "planets":
                        console.log("Processing planets")
                        for(const d of item.data){
                            await UEX.createOrUpdatePlanet(d);
                        }
                        break;
                    case "space_stations":
                        console.log("Processing space stations")
                        for(const d of item.data){
                            await UEX.createOrUpdateSpaceStation(d);
                        }
                        break;
                    case "star_systems":
                        console.log("Processing star systems")
                        for(const d of item.data){
                            await UEX.createOrUpdateStarSystem(d);
                        }
                        break;
                    case "terminals":
                        console.log("Processing terminals")
                        for(const d of item.data){
                            await UEX.createOrUpdateTerminal(d);
                        }
                        break;
                    case "terminal_prices":
                        console.log("Processing terminal prices")
                        for(const d of item.data){
                            await UEX.createOrUpdateTerminalPrices(d);
                        }
                        break;
                }
            }
        }
    }catch(error){
        console.log(`Error in sending UEX data to DB: ${error}`)
        return
    }
}

module.exports = {
    processUEXData
};