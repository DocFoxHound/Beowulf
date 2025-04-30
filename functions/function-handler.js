const piracyAdviceLocation = require("./piracy-advice-location");
const transactCommodityLocation = require("./transact-commodity-location");
const queueReminderCheck = require("../queue-functions/queue-controller").queueReminderCheck;
const { queueControllerForChat } = require("../queue-functions/queue-controller");
const progressQuery = require("../deprecated-but-keep/progress-query").progressQuery;
const handlerQuery = require("./handler-query").handlerQuery;
const badgeQuery = require("./badge-query").badgeQuery;
const { promoteRequest } = require("./promotion-request");
// const queueCheck = require("../queue-functions/queue-check")
const botNotify = require("../common/bot-notify")



async function executeFunction(run, message, preloadedDbTables, openai, client) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
  switch (toolCall.function.name) {
    case "piracy_advice_location":
      return piracyAdviceLocation.piracy_advice_location(run, preloadedDbTables);
    case "sell_commodity":
      return transactCommodityLocation.transact_commodity_location(run, preloadedDbTables);
    case "sell_item":
      return transactCommodityLocation.transact_commodity_location(run, preloadedDbTables);
    case "where_to_sell":
      return transactCommodityLocation.transact_commodity_location(run, preloadedDbTables);
    case "buy_commodity":
      return transactCommodityLocation.transact_commodity_location(run, preloadedDbTables);
    case "buy_item":
      return transactCommodityLocation.transact_commodity_location(run, preloadedDbTables);
    case "where_to_buy":
      return transactCommodityLocation.transact_commodity_location(run, preloadedDbTables);
    // case "add_or_remove_queue_entry":
    //   return await queueControllerForChat(run, message, openai, client);
    // case "notify_queue_entry":
    //   return botNotify.notifyNewQueueThreadResponse(run);
    // case "get_users_in_queue":
    //   return await queueReminderCheck(openai, client, run); //we need to change this to the embed function instead
    // case "remove_player_from_queue":
    //   return queueController(run, message, openai, client, false, "function-remove"); //false = remove user
    // case "progress":
    //   return await progressQuery(run, message);
    // case "top_ticket_handlers":
    //   return await handlerQuery(run, client);
    case "recognize_badges_request":
      return await badgeQuery(run, message);
    case "recognize_promotion_request":
      return await promoteRequest();
  }
}

module.exports = {
    executeFunction
};