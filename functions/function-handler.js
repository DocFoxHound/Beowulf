const piracyAdviceLocation = require("./piracy-advice-location");
const transactCommodityLocation = require("./transact-commodity-location");
const queueReminderCheck = require("../queue-functions/queue-controller").queueReminderCheck;
const queueController = require("../queue-functions/queue-controller").queueController;
// const queueCheck = require("../queue-functions/queue-check")
const botNotify = require("../common/bot-notify")


async function executeFunction(run, message, jsonData, openai, client) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  console.log(toolCall.function.name)
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
    case "add_player_to_queue":
      return queueController(run, message, openai, client, true); //true = add user
    case "notify_queue_entry":
      return botNotify.notifyNewQueueThreadResponse(run);
    case "get_users_in_queue":
      return queueReminderCheck(openai, client, run, message);
    case "remove_player_from_queue":
      return queueController(run, message, openai, client, false); //false = remove user
  }
}

module.exports = {
    executeFunction
};