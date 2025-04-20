const axios = require('axios');
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
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices_all${apiKey}`, title: "commodities_by_terminal", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/items_prices_all${apiKey}`, title: "items_by_terminal", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices?id_terminal=`, title: "terminal_prices", iterate: true}); //this needs to be iterated
        apiUrls.push({url: `https://api.uexcorp.space/2.0/vehicles_prices${apiKey}`, title: "ships", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/game_versions${apiKey}`, title: "game_version", iterate: false});
    }else if(whichTable === "cities"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
    }else if(whichTable === "commodities"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
    }else if(whichTable === "commodities_by_terminal"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices_all${apiKey}`, title: "commodities_by_terminal", iterate: false});
    }else if(whichTable === "items_by_terminal"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/items_prices_all${apiKey}`, title: "items_by_terminal", iterate: false});
    }else if(whichTable === "outposts"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
    }else if(whichTable === "planets"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
    }else if(whichTable === "space_stations"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
    }else if(whichTable === "star_systems"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
    }else if(whichTable === "ships"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/vehicles_prices${apiKey}`, title: "ships", iterate: false});
    }else if(whichTable === "game_version"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/game_versions${apiKey}`, title: "game_version", iterate: false});
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
        if(api.iterate === false && api.title !== "ships" && api.title !== "vehicles"){
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
        }else if(api.title === "ships"){
            try{
                const ships = await axios.get(api.url);
                const vehicles = await axios.get(`https://api.uexcorp.space/2.0/vehicles${apiKey}`);
                const data = {ships: ships.data, vehicles: vehicles.data};
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
        if(title === "ships"){
            const dataArray = Array.isArray(data) ? data : [data];
            for(const item of dataArray){
                for(const ship of item.ships.data){
                    if(ship.price === 0){
                        continue;
                    }else{
                        const shipClone = structuredClone(ship);
                        const vehicle = structuredClone(item.vehicles.data.find(v => v.id === shipClone.id_vehicle));
                        const shipId = shipClone.id_vehicle;
                        const shipPrice = shipClone.price;
                        const vehicleName = vehicle.name;
                        const pad_type = vehicle.pad_type;
                        const maxCrew = Math.max(...vehicle.crew.split(',').map(Number)) || vehicle.crew;
                        const crewNumber = structuredClone(maxCrew);
                        const newShip = {
                            id: vehicle.id,
                            ship: vehicleName,
                            avg_price: shipPrice,
                            crew: crewNumber || 1,
                            pad_type: vehicle.pad_type,
                        }
                        await UEX.createOrUpdateShips(newShip);
                    }
                }
            }
            console.log("Processing Ships")
            
        }else{
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
                                const summaryCommodity = {
                                    id: d.id,
                                    commodity_name: d.name,
                                    price_buy_avg: d.price_buy,
                                    price_sell_avg: d.price_sell
                                }
                                await UEX.createOrUpdateSummarizedCommodity(summaryCommodity);
                                await UEX.createOrUpdateCommodity(d);
                            }
                            break;
                        case "commodities_by_terminal":
                            console.log("Processing commodities by terminal")
                            for(const d of item.data){
                                let totalBuy = 0;
                                let totalSell = 0;
                                let buyDivide = 0;
                                let sellDivide = 0;
                                for(const e of item.data){
                                    if(d.id === e.id && e.price_buy !== 0){
                                        totalBuy +=  e.price_buy;
                                        buyDivide++;
                                    }
                                    if(d.id === e.id && e.price_sell !== 0){
                                        totalSell += e.price_sell;
                                        sellDivide++;
                                    }
                                }
                                const avgBuy = totalBuy / buyDivide;
                                const avgSell = totalSell / sellDivide;
                                const terminalCommodity = {
                                    id: d.id,
                                    id_commodity: d.id_commodity,
                                    price_buy: d.price_buy,
                                    price_buy_avg: d.price_buy_avg,
                                    price_sell: d.price_sell,
                                    price_sell_avg: d.price_sell_avg,
                                    scu_buy: d.scu_buy,
                                    scu_buy_avg: d.scu_buy_avg,
                                    scu_sell_stock: d.scu_sell_stock,
                                    scu_sell_stock_avg: d.scu_sell_stock_avg,
                                    scu_sell: d.scu_sell,
                                    scu_sell_avg: d.scu_sell_avg,
                                    status_buy: d.status_buy,
                                    status_sell: d.status_sell,
                                    commodity_name: d.commodity_name,
                                    terminal_name: d.terminal_name,
                                    id_terminal: d.id_terminal
                                }
                                const summaryCommodity = {
                                    id: d.id_commodity,
                                    commodity_name: d.commodity_name,
                                    price_buy_avg: avgBuy || 0,
                                    price_sell_avg: avgSell || 0
                                }
                                await UEX.createOrUpdateTerminalCommodity(terminalCommodity);
                                await UEX.createOrUpdateSummarizedCommodity(summaryCommodity);
                            }
                            break;
                        case "items_by_terminal":
                            console.log("Processing items by terminal")
                            for(const d of item.data){
                                let totalBuy = 0;
                                let totalSell = 0;
                                let buyDivide = 0;
                                let sellDivide = 0;
                                for(const e of item.data){
                                    if(d.id === e.id && e.price_buy !== 0){
                                        totalBuy +=  e.price_buy;
                                        buyDivide++;
                                    }
                                    if(d.id === e.id && e.price_sell !== 0){
                                        totalSell += e.price_sell;
                                        sellDivide++;
                                    }
                                }
                                const avgBuy = totalBuy / buyDivide;
                                const avgSell = totalSell / sellDivide;
                                const terminalItem = {
                                    id: d.id,
                                    id_item: d.id_item,
                                    id_terminal: d.id_terminal,
                                    price_buy: d.price_buy,
                                    price_sell: d.price_sell,
                                    item_name: d.item_name,
                                    terminal_name: d.terminal_name,
                                }
                                const summaryItem = {
                                    id: d.id_item,
                                    commodity_name: d.item_name,
                                    price_buy_avg: avgBuy || 0,
                                    price_sell_avg: avgSell || 0
                                }
                                await UEX.createOrUpdateTerminalItem(terminalItem);
                                await UEX.createOrUpdateSummarizedItem(summaryItem);
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
        }
    }catch(error){
        console.log(`Error in sending UEX data to DB: ${error}`)
        return
    }
}

module.exports = {
    processUEXData
};