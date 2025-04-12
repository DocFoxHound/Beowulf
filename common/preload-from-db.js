const UEX = require("../api/uexApi");
const { getTopCommodityBuySellLocations } = require("./get-top-commodity-buy-sell-locations")
const { getTopTerminalTransactions } = require("./get-top-terminal-transactions")
const logger = require('../logger');


async function preloadFromDb(){
    //load it all into memory
    // let jsonData = await fs.readFile("./UEX/cities.json", 'utf8');
    const cities = await UEX.getAllCities();
    // cities = JSON.parse(cityData);
    // jsonData = await fs.readFile("./UEX/commodities.json", 'utf8');
    const commodities = await UEX.getAllCommodities();
    // commodities = JSON.parse(commodityData);
    // jsonData = await fs.readFile("./UEX/outposts.json", 'utf8');
    const outposts = await UEX.getAllOutposts();
    // outposts = JSON.parse(outpostData);
    // jsonData = await fs.readFile("./UEX/planets.json", 'utf8');
    const planets = await UEX.getAllPlanets();
    // planets = JSON.parse(planetData);
    // jsonData = await fs.readFile("./UEX/space_stations.json", 'utf8');
    const spaceStations = await UEX.getAllSpaceStations();
    // spaceStations = JSON.parse(spaceStationData);
    // jsonData = await fs.readFile("./UEX/star_systems.json", 'utf8');
    const starSystems = await UEX.getAllStarSystems();
    // starSystems = JSON.parse(starSystemData);
    // jsonData = await fs.readFile("./UEX/terminal_prices.json", 'utf8');
    const terminals = await UEX.getAllTerminals();
    // terminals = JSON.parse(terminalData);
    const terminalPrices = await UEX.getAllTerminalPrices();
    // terminalPrices = JSON.parse(terminalPriceData);
    // jsonData = await fs.readFile("./UEX/terminals.json", 'utf8');
    

    const topTerminalTransactions = await getTopTerminalTransactions(terminalPrices);
    const allTopTransactions = topTerminalTransactions.allTopTransactions;
    const pyroTopTransactions = topTerminalTransactions.pyroTopTransactions;
    const stantonTopTransactions = topTerminalTransactions.stantonTopTransactions;
    const topCommodityBuySellLocations = await getTopCommodityBuySellLocations(terminalPrices);
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
    preloadFromDb
};