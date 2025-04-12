
async function transact_commodity_location(run, preloadedDbTables){
    try{
      // stantonCommodityBuyList, //terminals buying this commodity from player
      // stantonCommoditySellList, //terminals selling this commodity to the player
      // pyroCommodityBuyList, //terminals buying this commodity from player
      // pyroCommoditySellList //terminals selling this commodity to the player
  
      const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
      const parsedArgs = JSON.parse(toolCall.function.arguments);
      const commoditySearched = parsedArgs.commodity;
      const systemSearched = parsedArgs.system;
      const buyOrSell = parsedArgs.buy_or_sell.toLowerCase(); //buy: player is looking to buy from terminal. sell: player is looking to sell goods to a terminal
      
      //if the user specifies stanton
      const resultArray = [];
      if(systemSearched.toString().toLowerCase().includes("stanton")){
        console.log("Stanton");
        resultArray.push(`*## List the following ${buyOrSell.toUpperCase()} locations for ${commoditySearched.toUpperCase()} in the Stanton system, and be sure to mention their supply or demand levels:`)
        //map the array to a new array of just the terminals
        let commodityTerminalArray;
        if(buyOrSell === "sell"){
          console.log("Sell");
          commodityTerminalArray = preloadedDbTables.stantonCommodityBuyList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
          commodityTerminalArray[0].terminals.forEach(terminal => {
            resultArray.push(`**LOCATION NAME:** ${terminal.location_direct}, **AT/ON:** ${terminal.location_parent},  **BUYS FOR:** ${terminal.price_buy_avg}, **DEMAND:** ${(terminal.scu_buy_avg > 0) ? terminal.scu_buy_avg : 'unknown'}scu per purchase.`);
          });
        }else{
          console.log("Buy");
          commodityTerminalArray = preloadedDbTables.stantonCommoditySellList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
          commodityTerminalArray[0].terminals.forEach(terminal => {
            resultArray.push(`**LOCATION NAME:** ${terminal.location_direct}, **AT/ON:** ${terminal.location_parent},  **SELLS FOR:** ${terminal.price_sell_avg}, **SUPPLY:** ${(terminal.scu_sell_avg > 0) ? terminal.scu_sell_avg : 'unknown'}scu per sale.`);
          });
        }
      }else if (systemSearched.toString().toLowerCase().includes("pyro")){
        console.log("Pyro");
        resultArray.push(`*## List the following ${buyOrSell.toUpperCase()} locations for ${commoditySearched.toUpperCase()} in the Pyro system, and be sure to mention their supply or demand levels:`)
        //map the array to a new array of just the terminals
        let commodityTerminalArray;
        if(buyOrSell === "sell"){
          console.log("Sell");
          commodityTerminalArray = preloadedDbTables.pyroCommodityBuyList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
          commodityTerminalArray[0].terminals.forEach(terminal => {
            resultArray.push(`**LOCATION NAME:** ${terminal.location_direct}, **AT/ON:** ${terminal.location_parent},  **BUYS FOR:** ${terminal.price_buy_avg}, **DEMAND:** ${(terminal.scu_buy_avg > 0) ? terminal.scu_buy_avg : 'unknown'}scu per purchase.`);
          });
        }else{
          console.log("Buy");
          commodityTerminalArray = preloadedDbTables.pyroCommoditySellList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
          commodityTerminalArray[0].terminals.forEach(terminal => {
            resultArray.push(`**LOCATION NAME:** ${terminal.location_direct}, **AT/ON:** ${terminal.location_parent},  **SELLS FOR:** ${terminal.price_sell_avg}, **SUPPLY:** ${(terminal.scu_sell_avg > 0) ? terminal.scu_sell_avg : 'unknown'}scu per sale.`);
          });
        }
      }
    let message = resultArray.join("\n");
    return message;
    }catch(error){
      console.error(`Error parsing data: ${error}`)
    }
}

module.exports = {
    transact_commodity_location
};