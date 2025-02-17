async function executeFunction(run, message, jsonData) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  switch (toolCall.function.name) {
    case "piracy_advice_location":
      console.log(`Function: ${toolCall.function.name}`)
      return piracy_advice_location(run, jsonData);
    // Example of additional cases
    case "sell_commodity":
      return transact_commodity_location(run, jsonData);
    case "sell_item":
      return transact_commodity_location(run, jsonData);
    case "where_to_sell":
      return transact_commodity_location(run, jsonData);
    case "buy_commodity":
      return transact_commodity_location(run, jsonData);
    case "buy_item":
      return transact_commodity_location(run, jsonData);
    case "where_to_buy":
      return transact_commodity_location(run, jsonData);
    case "yet_another_function_name":
      return yet_another_function_name(run, jsonData);
  }
}

async function piracy_advice_location(run, jsonData){
  try{
    const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
    let starSystemSearched = toolCall.function.arguments;
    //if the user specifies stanton
    const resultArray = [];
    if(starSystemSearched.toString().toLowerCase().includes("stanton")){
      console.log("Stanton");
      resultArray.push(`*## List the top locations for transaction activity in the Stanton system:`)
      for(const terminal of jsonData.stantonTopTransactions){
        resultArray.push(`**LOCATION NAME**: ${terminal.location_direct}, **AT LOCATION**: ${terminal.location_parent}, **TOTAL TRANSACTIONS:** ${terminal.totalTransactions}, **TOTAL PURCHASES:** ${terminal.totalBuys}, **TOTAL SALES:** ${terminal.totalSells}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1] ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2] ? terminal.commodities[2].commodity_name : null}`);
      }
    //if the user specifies pyro
    }else if(starSystemSearched.toString().toLowerCase().includes("pyro")){
      console.log("Pyro")
      resultArray.push(`*## List the top locations for transaction activity in the Stanton system:`)
      for(const terminal of jsonData.pyroTopTransactions){
        resultArray.push(`**LOCATION NAME**: ${terminal.location_direct}, **AT LOCATION**: ${terminal.location_parent}, **TOTAL TRANSACTIONS:** ${terminal.totalTransactions}, **TOTAL PURCHASES:** ${terminal.totalBuys}, **TOTAL SALES:** ${terminal.totalSells}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1] ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2] ? terminal.commodities[2].commodity_name : null}`);
      }
    //if the user doesn't specify location or things are just unrecognized
    }else{
      for(const terminal of jsonData.allTopTransactions){
        resultArray.push(`**LOCATION NAME**: ${terminal.location_direct}, **AT LOCATION**: ${terminal.location_parent}, **TOTAL TRANSACTIONS:** ${terminal.totalTransactions}, **TOTAL PURCHASES:** ${terminal.totalBuys}, **TOTAL SALES:** ${terminal.totalSells}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1] ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2] ? terminal.commodities[2].commodity_name : null}`);
      }
    }
  let message = resultArray.join("\n");
  return message;
  }catch(error){
    console.error(`Error parsing data: ${error}`)
  }
}

async function transact_commodity_location(run, jsonData){
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
        commodityTerminalArray = jsonData.stantonCommodityBuyList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
        commodityTerminalArray[0].terminals.forEach(terminal => {
          resultArray.push(`**LOCATION NAME:** ${terminal.location_direct}, **AT/ON:** ${terminal.location_parent},  **BUYS FOR:** ${terminal.price_buy_avg}, **DEMAND:** ${(terminal.scu_buy_avg > 0) ? terminal.scu_buy_avg : 'unknown'}scu per purchase.`);
        });
      }else{
        console.log("Buy");
        commodityTerminalArray = jsonData.stantonCommoditySellList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
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
        commodityTerminalArray = jsonData.pyroCommodityBuyList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
        commodityTerminalArray[0].terminals.forEach(terminal => {
          resultArray.push(`**LOCATION NAME:** ${terminal.location_direct}, **AT/ON:** ${terminal.location_parent},  **BUYS FOR:** ${terminal.price_buy_avg}, **DEMAND:** ${(terminal.scu_buy_avg > 0) ? terminal.scu_buy_avg : 'unknown'}scu per purchase.`);
        });
      }else{
        console.log("Buy");
        commodityTerminalArray = jsonData.pyroCommoditySellList.filter(commodity => commodity.commodity_name.toLowerCase() === commoditySearched.toLowerCase());
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
  executeFunction,
  // piracy_advice_location,
  // transact_commodity_location
};
