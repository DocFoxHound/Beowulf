const commonProcesses = require("../common/get-cached-user")
const logger = require('../logger');

function formatMessage(message, mentionRegex, userCache) {
    try{
        const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
            const user = commonProcesses.getCachedUser(message.guild, userId, userCache);
            const displayName = user ? `@${user.displayName}` : "@unknown-user";
            return displayName;
        });
        return message.member?.nickname 
            ? `${message.member.nickname} : ${readableMessage}` : message.author?.username 
            ? `${message.author.username} : ${readableMessage}` : `unknown-user: ${readableMessage}`;
        }catch(error){
        console.error(`Error formatting the message: ${error}`)
    }
}

module.exports = {
    formatMessage,
}