async function executeFunction(run, message, jsonData) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  switch (toolCall.function.name) {
    case "piracy_advice_location":
      console.log(`Function: ${toolCall.function.name}`)
      return piracy_advice_location(run, jsonData);
    // Example of additional cases
    case "piracy_advice_commodity":
      return piracy_advice_location(run, jsonData);
    
    case "yet_another_function_name":
      return yet_another_function_name(run, jsonData);
  }
}

async function piracy_advice_location(run, jsonData){
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  let starSystemSearched = toolCall.function.arguments;
  //if the user specifies stanton
  const resultArray = [];
  if(starSystemSearched.toString().toLowerCase().includes("stanton")){
    console.log("Stanton")
    for(const terminal of jsonData.stantonTopBuyers){
      resultArray.push(`**TOP PURCHASE LOCATIONS**: ${terminal.terminal_name}, **PURCHASES:** ${terminal.totalBuys}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1].commodity_name ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2].commodity_name ? terminal.commodities[2].commodity_name : null}`);
    }
    for(const terminal of jsonData.stantonTopSellers){
      resultArray.push(`**TOP SELLING LOCATIONS**: ${terminal.terminal_name}, **SALES:** ${terminal.totalBuys}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1].commodity_name ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2].commodity_name ? terminal.commodities[2].commodity_name : null}`);
    }
  //if the user specifies pyro
  }else if(starSystemSearched.toString().toLowerCase().includes("pyro")){
    console.log("Pyro")
    for(const terminal of jsonData.pyroTopBuyers){
      resultArray.push(`**TOP PURCHASE LOCATIONS**: ${terminal.terminal_name}, **PURCHASES:** ${terminal.totalBuys}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1].commodity_name ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2].commodity_name ? terminal.commodities[2].commodity_name : null}`);
    }
    for(const terminal of jsonData.pyroTopSellers){
      resultArray.push(`**TOP SELLING LOCATIONS**: ${terminal.terminal_name}, **SALES:** ${terminal.totalBuys}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1].commodity_name ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2].commodity_name ? terminal.commodities[2].commodity_name : null}`);
    }
  //if the user doesn't specify location or things are just unrecognized
  }else{
    for(const terminal of jsonData.allTopBuyers){
      resultArray.push(`**TOP PURCHASE LOCATIONS**: ${terminal.terminal_name}, **PURCHASES:** ${terminal.totalBuys}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1].commodity_name ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2].commodity_name ? terminal.commodities[2].commodity_name : null}`);
    }
    for(const terminal of jsonData.allTopSellers){
      resultArray.push(`**TOP SELLING LOCATIONS**: ${terminal.terminal_name}, **SALES:** ${terminal.totalBuys}, **COMMODITIES:** ${terminal.commodities[0].commodity_name}, ${terminal.commodities[1].commodity_name ? terminal.commodities[1].commodity_name : null}, ${terminal.commodities[2].commodity_name ? terminal.commodities[2].commodity_name : null}`);
    }
  }
  let message = resultArray.join("\n");
  return message;
}

module.exports = {
  executeFunction,
  piracy_advice_location
};
