const queue = require("../api/queue");

async function checkQueue(run, author){
    const user = await queue.getUserById(author.id);
    //if the user is in the database, we'll return the user data
    if(user){
        return user;
    //if the user IS NOT in the database, we have to create a new queue entry for them
    }else{
        return null;
    }
}

module.exports = {
    checkQueue
};