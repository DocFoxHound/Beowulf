const piracyAdviceLocation = require("./piracy-advice-location");
const transactCommodityLocation = require("./transact-commodity-location");


async function executeFunction(run, message, jsonData) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  switch (toolCall.function.name) {
    case "piracy_advice_location":
      console.log(`Function: ${toolCall.function.name}`)
      return piracyAdviceLocation.piracy_advice_location(run, jsonData);
    // Example of additional cases
    case "sell_commodity":
      return transactCommodityLocation.transact_commodity_location(run, jsonData);
    case "sell_item":
      return transactCommodityLocation.transact_commodity_location(run, jsonData);
    case "where_to_sell":
      return transactCommodityLocation.transact_commodity_location(run, jsonData);
    case "buy_commodity":
      return transactCommodityLocation.transact_commodity_location(run, jsonData);
    case "buy_item":
      return transactCommodityLocation.transact_commodity_location(run, jsonData);
    case "where_to_buy":
      return transactCommodityLocation.transact_commodity_location(run, jsonData);
    case "yet_another_function_name":
      return yet_another_function_name(run, jsonData);
  }
}

module.exports = {
    executeFunction
};