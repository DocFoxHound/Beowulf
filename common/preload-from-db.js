const UEX = require("../api/uexApi");
const { getTopCommodityBuySellLocations } = require("./get-top-commodity-buy-sell-locations")
const { getTopTerminalTransactions } = require("./get-top-terminal-transactions")



async function preloadFromDb(){
    console.log("Preloading data from the database...");
    //load it all into memory
    // let jsonData = await fs.readFile("./UEX/cities.json", 'utf8');
    let cities;
    try {
        cities = await UEX.getAllCities();
    } catch (error) {
        console.error(`Error loading cities: ${error}`);
    }
    // cities = JSON.parse(cityData);
    // jsonData = await fs.readFile("./UEX/commodities.json", 'utf8');
    let commodities;
    try {
        commodities = await UEX.getAllCommodities();
    } catch (error) {
        console.error(`Error loading commodities: ${error}`);
    }
    // commodities = JSON.parse(commodityData);
    // jsonData = await fs.readFile("./UEX/outposts.json", 'utf8');
    let outposts;
    try {
        outposts = await UEX.getAllOutposts();
    } catch (error) {
        console.error(`Error loading outposts: ${error}`);
    }
    // outposts = JSON.parse(outpostData);
    // jsonData = await fs.readFile("./UEX/planets.json", 'utf8');
    let planets;
    try {
        planets = await UEX.getAllPlanets();
    } catch (error) {
        console.error(`Error loading planets: ${error}`);
    }
    // planets = JSON.parse(planetData);
    // jsonData = await fs.readFile("./UEX/space_stations.json", 'utf8');
    let spaceStations;
    try {
        spaceStations = await UEX.getAllSpaceStations();
    } catch (error) {
        console.error(`Error loading space stations: ${error}`);
    }
    // spaceStations = JSON.parse(spaceStationData);
    // jsonData = await fs.readFile("./UEX/star_systems.json", 'utf8');
    let starSystems;
    try {
        starSystems = await UEX.getAllStarSystems();
    } catch (error) {
        console.error(`Error loading star systems: ${error}`);
    }
    // starSystems = JSON.parse(starSystemData);
    // jsonData = await fs.readFile("./UEX/terminal_prices.json", 'utf8');
    let terminals;
    try {
        terminals = await UEX.getAllTerminals();
    } catch (error) {
        console.error(`Error loading terminals: ${error}`);
    }
    // terminals = JSON.parse(terminalData);
    let terminalPrices;
    try {
        terminalPrices = await UEX.getAllTerminalPrices();
    } catch (error) {
        console.error(`Error loading terminal prices: ${error}`);
    }
    // terminalPrices = JSON.parse(terminalPriceData);
    // jsonData = await fs.readFile("./UEX/terminals.json", 'utf8');
    

    let topTerminalTransactions;
    try {
        topTerminalTransactions = await getTopTerminalTransactions(terminalPrices);
    } catch (error) {
        console.error(`Error getting top terminal transactions: ${error}`);
    }
    let allTopTransactions, pyroTopTransactions, stantonTopTransactions;
    if (topTerminalTransactions) {
        allTopTransactions = topTerminalTransactions.allTopTransactions;
        pyroTopTransactions = topTerminalTransactions.pyroTopTransactions;
        stantonTopTransactions = topTerminalTransactions.stantonTopTransactions;
    }
    let topCommodityBuySellLocations;
    try {
        topCommodityBuySellLocations = await getTopCommodityBuySellLocations(terminalPrices);
    } catch (error) {
        console.error(`Error getting top commodity buy/sell locations: ${error}`);
    }
    let stantonCommodityBuyList, stantonCommoditySellList, pyroCommodityBuyList, pyroCommoditySellList;
    if (topCommodityBuySellLocations) {
        stantonCommodityBuyList = topCommodityBuySellLocations.stantonCommodityBuyList;
        stantonCommoditySellList = topCommodityBuySellLocations.stantonCommoditySellList;
        pyroCommodityBuyList = topCommodityBuySellLocations.pyroCommodityBuyList;
        pyroCommoditySellList = topCommodityBuySellLocations.pyroCommoditySellList;
    }
    
    console.log("Preloading data from the database completed.");
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