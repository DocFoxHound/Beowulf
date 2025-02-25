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

module.exports = {
    piracy_advice_location
};