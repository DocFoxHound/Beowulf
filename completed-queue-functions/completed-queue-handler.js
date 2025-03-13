const crypto = require('crypto');
const completedQueueHandler = require("../api/completed-queue-api")
const { updateUserClassStatus } = require("../userlist-functions/userlist-controller")

function hashString(inputString) {
    const hash = crypto.createHash('sha256'); // Choose the hashing algorithm
    hash.update(inputString);
    return hash.digest('hex'); // Returns the hash in hexadecimal format
}

async function logHandler(userData, messageOrUser, requestedClass, slashCommand){
    console.log("New log entry")
    newEntry = {
        ticket_id: Date.now(),
        user_id: userData.id,
        user_username: userData.username,
        user_nickname: userData.nickname,
        handler_id: slashCommand ? messageOrUser.id : messageOrUser.author.id,
        handler_username: slashCommand ? messageOrUser.username : messageOrUser.author.username,
        handler_nickname: slashCommand ? messageOrUser.nickname : messageOrUser.author.nickname,
        createdAt: new Date(),
        ticket_name: requestedClass,
    }
    await completedQueueHandler.createEntry(newEntry);
}

module.exports = {
    logHandler,
}