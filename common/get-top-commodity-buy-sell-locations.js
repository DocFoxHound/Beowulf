async function getTopCommodityBuySellLocations(){
    reconstructedCommodityList = [];
    for (const packet of terminalPrices) {
        for (const terminal of packet.data) {
            let locationDirect = terminal.outpost_name ? terminal.outpost_name :
                terminal.city_name ? terminal.city_name :
                terminal.space_station_name ? terminal.space_station_name : "";
            let locationHigher = terminal.moon_name ? terminal.moon_name :
                terminal.planet_name ? terminal.planet_name : "";
            //check if the terminal's commodity name is already stored in the list
            let foundCommodity = reconstructedCommodityList.find(item => (
                item.commodity_name.toLowerCase() === terminal.commodity_name.toLowerCase()
            ));

            //if the commodity item already exists, and it we'll just add this terminal to it
            if(foundCommodity){
                //add the terminal to this commodity's list
                foundCommodity.terminals.push({
                    star_system_name: terminal.star_system_name,
                    location_direct: locationDirect,
                    location_parent: locationHigher,
                    terminal_name: terminal.terminal_name,
                    terminal_code: terminal.terminal_code,
                    price_buy_avg: terminal.price_buy_avg,
                    price_sell_avg: terminal.price_sell_avg,
                    scu_buy_avg: terminal.scu_buy_avg, //how much can you buy at once
                    scu_sell_avg: terminal.scu_sell_avg
                })
            //if the commodity doesn't already exist, then we'll add it to the list
            }else{
                reconstructedCommodityList.push({
                    commodity_name: terminal.commodity_name,
                    commodity_code: terminal.commodity_code,
                    commodity_slug: terminal.commodity_slug,
                    terminals: [{
                        star_system_name: terminal.star_system_name,
                        location_direct: locationDirect,
                        location_parent: locationHigher,
                        terminal_name: terminal.terminal_name,
                        terminal_code: terminal.terminal_code,
                        price_buy_avg: terminal.price_buy_avg,
                        price_sell_avg: terminal.price_sell_avg,
                        scu_buy_avg: terminal.scu_buy_avg, //how much can you buy at once
                        scu_sell_avg: terminal.scu_sell_avg
                    }]
                })
            }
            //TODO: 
            // 1. build a list of commodities
            // 2. place terminals with only buy/sell transactions on each commodity (with system parent)
        }
    }
    //sort the mega array into system-specific arrays for buy and sell
    let stantonBuyListCopy = structuredClone(reconstructedCommodityList);
    let stantonSellListCopy = structuredClone(reconstructedCommodityList);
    let pyroBuyListCopy = structuredClone(reconstructedCommodityList);
    let pyroSellListCopy = structuredClone(reconstructedCommodityList);

    const stantonCommodityBuyList = stantonBuyListCopy.map(commodity => {
        commodity.terminals = commodity.terminals.filter(terminal => terminal.star_system_name === "Stanton")
        .filter(terminal => terminal.price_buy_avg > 0)
        .sort((a, b) => b.price_buy_avg - a.price_buy_avg);;
        return commodity;
    })
    const stantonCommoditySellList = stantonSellListCopy.map(commodity => {
        commodity.terminals = commodity.terminals.filter(terminal => terminal.star_system_name === "Stanton")
        .filter(terminal => terminal.price_sell_avg > 0)
        .sort((a, b) => b.price_sell_avg - a.price_sell_avg);;
        return commodity;
    })
    const pyroCommodityBuyList = pyroBuyListCopy.map(commodity => {
        commodity.terminals = commodity.terminals.filter(terminal => terminal.star_system_name === "Pyro")
        .filter(terminal => terminal.price_buy_avg > 0)
        .sort((a, b) => b.price_buy_avg - a.price_buy_avg);;
        return commodity;
    })
    const pyroCommoditySellList = pyroSellListCopy.map(commodity => {
        commodity.terminals = commodity.terminals.filter(terminal => terminal.star_system_name === "Pyro")
        .filter(terminal => terminal.price_sell_avg > 0)
        .sort((a, b) => b.price_sell_avg - a.price_sell_avg);;
        return commodity;
    })

    return {
        stantonCommodityBuyList,
        stantonCommoditySellList,
        pyroCommodityBuyList,
        pyroCommoditySellList
    }
}

module.exports = {
    getTopCommodityBuySellLocations
};