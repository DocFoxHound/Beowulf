const crypto = require('crypto');
const completedQueueHandler = require("../api/completed-queue-api")
const { updateUserClassStatus } = require("../userlist-functions/userlist-controller")
const { getEntryByUserAndClass } = require("../api/completed-queue-api")

function hashString(inputString) {
    const hash = crypto.createHash('sha256'); // Choose the hashing algorithm
    hash.update(inputString);
    return hash.digest('hex'); // Returns the hash in hexadecimal format
}

async function logHandler(targetUser, handlerUser, classId, slashCommand){
    console.log("New log entry")
    //check if there's a log for this user and this class
    await removeLog(targetUser.id, classId);

    newEntry = {
        ticket_id: Date.now(),
        user_id: targetUser.id,
        user_username: targetUser.username,
        user_nickname: targetUser.nickname,
        handler_id: slashCommand ? handlerUser.id : handlerUser.author.id,
        handler_username: slashCommand ? handlerUser.username : handlerUser.author.username,
        handler_nickname: slashCommand ? handlerUser.nickname : handlerUser.author.nickname,
        createdAt: new Date(),
        class_id: classId,
    }
    await completedQueueHandler.createEntry(newEntry);
}

async function logHandlerFunctionCommand(targetUser, handlerUser, classId){
    console.log("New log entry")
    //check if there's a log for this user and this class
    await removeLog(targetUser.id, classId);

    newEntry = {
        ticket_id: Date.now(),
        user_id: targetUser.id,
        user_username: targetUser.username,
        user_nickname: targetUser.nickname || null,
        handler_id: handlerUser.id,
        handler_username: handlerUser.username,
        handler_nickname: handlerUser.nickname || null,
        createdAt: new Date(),
        class_id: classId,
    }
    await completedQueueHandler.createEntry(newEntry);
}

async function removeLog(userId, classId){
    console.log("Remove log entry")
    const entries = await getEntryByUserAndClass(userId, classId)
    if(entries){
        entries.forEach(async entry => {
            await completedQueueHandler.deleteEntry(entry.ticket_id)
        });
    }
}

module.exports = {
    logHandler,
    logHandlerFunctionCommand
}