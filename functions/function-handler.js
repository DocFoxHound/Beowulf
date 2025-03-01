const piracyAdviceLocation = require("./piracy-advice-location");
const transactCommodityLocation = require("./transact-commodity-location");
const queueController = require("../queue-functions/queue-controller");


async function executeFunction(run, message, jsonData) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  switch (toolCall.function.name) {
    case "piracy_advice_location":
      return piracyAdviceLocation.piracy_advice_location(run, jsonData);
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
    case "recognize_promotion_ticket_request":
      return queueController.queueController(run, message);
    case "recognize_assessment_ticket_request":
      return queueController.queueController(run, message);
    case "recognize_class_ticket_request":
      return queueController.queueController(run, message);
    case "yet_another_function_name": //example
      return yet_another_function_name(run, jsonData);
  }
}

module.exports = {
    executeFunction
};