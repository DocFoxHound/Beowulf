const crypto = require('crypto');
const completedQueueHandler = require("../api/completed-queue-api")

function hashString(inputString) {
    const hash = crypto.createHash('sha256'); // Choose the hashing algorithm
    hash.update(inputString);
    return hash.digest('hex'); // Returns the hash in hexadecimal format
}

async function logHandler(userData, message, requestedClass){
    newEntry = {
        ticket_id: Date.now(),
        user_id: userData.id,
        user_username: userData.username,
        user_nickname: userData.nickname,
        handler_id: message.author.id,
        handler_username: message.author.username,
        handler_nickname: message.author.nickname,
        createdAt: new Date(),
        ticket_name: requestedClass,
    }
    return await completedQueueHandler.createEntry(newEntry);
}

module.exports = {
    logHandler,
}