const fs = require('fs').promises;
getTopCommodityBuySellLocations = require("./get-top-commodity-buy-sell-locations")
getTopTerminalTransactions = require("./get-top-terminal-transactions")

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

    const topTerminalTransactions = await getTopTerminalTransactions.getTopTerminalTransactions(terminalPrices);
    const allTopTransactions = topTerminalTransactions.allTopTransactions;
    const pyroTopTransactions = topTerminalTransactions.pyroTopTransactions;
    const stantonTopTransactions = topTerminalTransactions.stantonTopTransactions;
    const topCommodityBuySellLocations = await getTopCommodityBuySellLocations.getTopCommodityBuySellLocations(terminalPrices);
    const stantonCommodityBuyList = topCommodityBuySellLocations.stantonCommodityBuyList;
    const stantonCommoditySellList = topCommodityBuySellLocations.stantonCommoditySellList;
    const pyroCommodityBuyList = topCommodityBuySellLocations.pyroCommodityBuyList;
    const pyroCommoditySellList = topCommodityBuySellLocations.pyroCommoditySellList;
    
    return { // Optionally return these objects if needed elsewhere
        cities,
        commodities,
        outposts,
        planets,
        spaceStations,
        starSystems,
        terminalPrices,
        terminals,
        stantonTopTransactions,
        pyroTopTransactions,
        allTopTransactions,
        stantonCommodityBuyList,
        stantonCommoditySellList,
        pyroCommodityBuyList,
        pyroCommoditySellList
    };
}

module.exports = {
    preloadFromJsons
};