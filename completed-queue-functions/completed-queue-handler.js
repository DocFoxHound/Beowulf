const crypto = require('crypto');
const completedQueueHandler = require("../api/completed-queue-api")
const { updateUserClassStatus } = require("../userlist-functions/userlist-controller")
const { getEntryByUserAndClass } = require("../api/completed-queue-api")

function hashString(inputString) {
    const hash = crypto.createHash('sha256'); // Choose the hashing algorithm
    hash.update(inputString);
    return hash.digest('hex'); // Returns the hash in hexadecimal format
}

async function logHandler(userData, messageOrUser, classId, slashCommand){
    console.log("New log entry")
    //check if there's a log for this user and this class
    await removeLog(userData.id, classId);

    newEntry = {
        ticket_id: Date.now(),
        user_id: userData.id,
        user_username: userData.username,
        user_nickname: userData.nickname,
        handler_id: slashCommand ? messageOrUser.id : messageOrUser.author.id,
        handler_username: slashCommand ? messageOrUser.username : messageOrUser.author.username,
        handler_nickname: slashCommand ? messageOrUser.nickname : messageOrUser.author.nickname,
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
}