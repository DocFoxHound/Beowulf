const notifyNewQueue = require("../common/bot-notify").notifyNewQueue
const notifyOldQueue = require("../common/bot-notify").notifyOldQueue
const notifyRemovalFromQueue = require("../common/bot-notify").notifyRemovalFromQueue
const botNotify = require("../common/bot-notify")
const queueApi = require("../api/queueApi");
const userlistApi = require("../api/userlistApi");
const sendResponse = require("../threads/send-response").sendResponse
const formatResponse = require("../threads/format-response").formatResponse
const lodash = require('lodash');
const userlist = require("../userlist-functions/userlist-controller")
const logHandler = require("../completed-queue-functions/completed-queue-handler").logHandler

const assessmentMap = {
    'raptor_1_solo': `Dogfighting 101`,
    'raptor_1_team': `Teamfighting 101`,
    'raptor_2_solo': `RAPTOR II Solo Assessment`,
    'raptor_2_team': `RAPTOR II Team Assessment`,
    'raptor_3_solo': `RAPTOR III Solo Assessment`,
    'raptor_3_team': `RAPTOR III Team Assessment`,
    'corsair_1_turret': `Turret Assessment`,
    'corsair_1_torpedo': `Torpedo Assessment`,
    'corsair_2_ship_commander': `Ship Commander Assessment`,
    'corsair_2_wing_commander': `Wing Commander Assessment`,
    'corsair_3_fleet_commander': `Fleet Commander Assessment`,
    'raider_1_swabbie': `Swabbie Assessment`,
    'raider_1_linemaster': `Linemaster Assessment`,
    'raider_1_boarder': `Boarder Assessment`,
    'raider_2_powdermonkey': `Powdermonkey Assessment`,
    'raider_2_mate': `Mate Assessment`,
    'raider_3_sailmaster': `Sailmaster Assessment`
};

async function queueController(run, message, openai, client, addToQueue){
    console.log("Add user to Queue: " + addToQueue)
    const author = message.author;
    const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
    const parsedArgs = JSON.parse(toolCall.function.arguments);
    const requestedClass = parsedArgs.queue_class;
    const player = parsedArgs.player_id || null; //if we are removing someone from a queue we need their name

    userData = null;
    if(player){
        userData = await checkQueueForUser(player);
    }else{
        userData = await checkQueueForUser(author.id);
    }
    if(addToQueue === true && userData !== null){
        console.log("Editing User in Queue")
        const addOrRemove = true; //this means to add the user, false means to remove them
        const editQueueSuccess = await editQueue(requestedClass, userData, message, openai, client, addOrRemove, null, true);
        if(editQueueSuccess === true){
            //notify proper channel of queue addition
            return `${author.username} was added to ${requestedClass}`;
        }else{
            return "There was an error adding to the queue"
        }
    }else if (addToQueue === true && userData === null){
        const addQueueSuccess = await addQueue(requestedClass, message);
        if(addQueueSuccess === true){
            return `${author.username} was added to ${requestedClass}`;
        }else{
            return "There was an error adding to the queue"
        }
    }else if(addToQueue === false){
        const playerName = parsedArgs.player_id;
        const completionStatus = parsedArgs.status;
        return removeFromQueue(playerName, requestedClass, completionStatus, message, client, openai);
    }
}

//checks if the user is in a queue already or not
async function checkQueueForUser(userIdOrName){
    //search database by ID, username, and nickname to find this person
    const users = await queueApi.getUsersInQueue();
    user = null;
        for (const element of users) {
            if(element.id === userIdOrName || element.username === userIdOrName || element.nickname === userIdOrName){
                user = element;
            }
        }
    //if the user is in the database, we'll return the user data
    if(user){
        return user;
    //if the user IS NOT in the database, we have to create a new queue entry for them
    }else{
        return null;
    }
}

async function queueReminderCheck(openai, client, run, message){
    console.log("Checking queue")
    const users = await queueApi.getUsersInQueue();
    usersInQueue = [];
    raptorQueue = [];
    corsairQueue = [];
    raiderQueue = [];
    for (const element of users) {
        currentTime = new Date() //2025-02-28T18:02:30.759Z
        queueEntryTime = new Date(element.createdAt) //2025-02-28T14:39:55.166Z
        const diffInMilliseconds = currentTime.getTime() - queueEntryTime.getTime();
        const diffInMinutes = Math.floor(diffInMilliseconds / 60000);
        if (diffInMinutes > 720 || run){ //reminder of people in queue 720 = 12hours, or run if someone asked for the queue (run is only non-null if someone asks)
            usersInQueue.push(element);
            requestedText = "queue-reminder"
            if(run === null){ //only reset their times if this is a scheduled queue check
                const addOrRemove = true; //true means to add the user, false means to remove them
                const editQueueSuccess = await editQueue(requestedText, element, element, openai, client, addOrRemove, null, true); //this resets the timer so that the bot isnt't just blasting the help channels about the same person over and over again
                if(editQueueSuccess === true){     
                    console.log(`${element.username}'s timestamp updated after reminder published.`)
                }else{
                    console.log(`Error updating ${element.username}'s timestamp after reminder.`)
                }
            }
        }
    };
    for (const element of usersInQueue){
        eachRaptorQueueing = [];
        eachCorsairQueueing = [];
        eachRaiderQueueing = [];
        Object.keys(assessmentMap).forEach(key => {
            if (element[key]) {
                if (key.includes('raptor')) {
                    eachRaptorQueueing.push(assessmentMap[key]);
                } else if (key.includes('corsair')) {
                    eachCorsairQueueing.push(assessmentMap[key]);
                } else if (key.includes('raider')) {
                    eachRaiderQueueing.push(assessmentMap[key])
                }
            }
        });
        if(eachRaptorQueueing.length > 0){
            raptorQueue.push(`${element.nickname || element.username} is in queue for: ${eachRaptorQueueing}`)
        }
        if(eachCorsairQueueing.length > 0){
            corsairQueue.push(`${element.nickname || element.username} is in queue for: ${eachCorsairQueueing}`)
        }
        if(eachRaiderQueueing.length > 0){
            raiderQueue.push(`${element.nickname || element.username} is in queue for: ${eachRaiderQueueing}`)
        }
    }
    if(run === null){
        if(raptorQueue.length > 0){
            const requestedText = raptorQueue.join("\n");
            await notifyOldQueue("RAPTOR", requestedText, openai, client);
        }
        if(corsairQueue.length > 0){
            const requestedText = corsairQueue.join("\n")
            await notifyOldQueue("CORSAIR", requestedText, openai, client);
        }
        if(raiderQueue.length > 0){
            const requestedText = raiderQueue.join("\n")
            await notifyOldQueue("RAIDER", requestedText, openai, client);
        }
    }else{ //handle if this is a function call (someone asks the bot for the queue)
        const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        const parsedArgs = JSON.parse(toolCall.function.arguments);
        const queueType = parsedArgs.queue;
        if(queueType === "RAPTOR" && raptorQueue.length > 0){
            raptorQueue.unshift("The following individuals are in the RAPTOR queue:")
            const requestedText = raptorQueue.join("\n");
            return requestedText;
        }else if(queueType === "RAPTOR" && raptorQueue.length === 0){
            return "There are no users in the RAPTOR queue."
        }
        
        if(queueType === "CORSAIR" && corsairQueue.length > 0){
            corsairQueue.unshift("The following individuals are in the CORSAIR queue:")
            const requestedText = corsairQueue.join("\n");
            return requestedText;
        }else if (queueType === "CORSAIR" && corsairQueue.length === 0){
            return "There are no users in the CORSAIR queue."
        }
        
        if(queueType === "RAIDER" && raiderQueue.length > 0){
            raiderQueue.unshift("The following individuals are in the RAIDER queue:")
            const requestedText = raiderQueue.join("\n");
            return requestedText;
        }else if (queueType === "RAIDER" && raiderQueue.length === 0){
            return "There are no users in the RAIDER queue."
        }
        
        if(queueType === "ALL"){
            allQueue = [];
            raptorQueue.unshift("The following is the RAPTOR queue:")
            corsairQueue.unshift("The following is the CORSAIR queue:")
            raiderQueue.unshift("The following is the RAIDER queue:")
            allQueue.push(raptorQueue);
            allQueue.push(corsairQueue);
            allQueue.push(raiderQueue);
            const requestedText = allQueue.join("\n");
            return requestedText;
        }
    }
    
}

async function editQueue(requestedText, userData, message, openai, client, addOrRemove, completedTask, forQueue){
    switch (requestedText){
        case "dogfighting":
            userData.raptor_1_solo = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "dogfighting 101":
            userData.raptor_1_solo = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "teamfighting":
            userData.raptor_1_team = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "teamfighting 101":
            userData.raptor_1_team = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "solo2":
            userData.raptor_2_solo = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "team2":
            userData.raptor_2_team = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;    
        case "solo3":
            userData.raptor_3_solo = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "team3":
            userData.raptor_3_team = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "turret":
            userData.corsair_1_turret = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "torpedo":
            userData.corsair_1_torpedo = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "ship commander":
            userData.corsair_2_ship_commander = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "ship":
            userData.corsair_2_ship_commander = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "wing commander":
            userData.corsair_2_wing_commander = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "wing":
            userData.corsair_2_wing_commander = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "fleet commander":
            userData.corsair_3_fleet_commander = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "fleet":
            userData.corsair_3_fleet_commander = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "swabbie":
            userData.raider_1_swabbie = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "line master":
            userData.raider_1_linemaster = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "boarder":
            userData.raider_1_boarder = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "powder monkey":
            userData.raider_2_powdermonkey = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "mate":
            userData.raider_2_mate = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "sail master":
            userData.raider_3_sailmaster = addOrRemove;
            if(addOrRemove){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "queue-reminder": //this resets the timer so that the bot isnt't just blasting the help channels about the same person over and over again
            const currentTime = new Date();
            const fiveMinutesAgo = new Date(currentTime.getTime() - (5 * 60000));
            userData.createdAt = fiveMinutesAgo
            break;
    }
    if(forQueue === true){ //do this for normal queue editing situations
        return await queueApi.editUserInQueue(userData.id, userData);
    }else if (forQueue === false){ //do this if this is for editing the userList to mark a class as complete
        return await userlistApi.editUser(userData.id, userData);
    }
}

async function addQueue(requestedText, message){
    newUser={
        id: message.author.id,
        username: message.author.username,
        nickname: message.member?.nickname || null,
        createdAt: new Date(),
        raptor_1_solo: false,
        raptor_1_team: false,
        raptor_2_solo: false,
        raptor_2_team: false,
        raptor_3_solo: false,
        raptor_3_team: false,
        corsair_1_turret: false,
        corsair_1_torpedo: false,
        corsair_2_ship_commander: false,
        corsair_2_wing_commander: false,
        corsair_3_fleet_commander: false,
        raider_1_swabbie: false,
        raider_1_linemaster: false,
        raider_1_boarder: false,
        raider_2_powdermonkey: false,
        raider_2_mate: false,
        raider_3_sailmaster: false
    }

    switch (requestedText){
        case "dogfighting":
            newUser.raptor_1_solo = true;
            break;
        case "dogfighting 101":
            newUser.raptor_1_solo = true;
            break;
        case "teamfighting":
            newUser.raptor_1_team = true;
            break;
        case "teamfighting 101":
            newUser.raptor_1_team = true;
            break;
        case "solo2":
            newUser.raptor_2_solo = true;
            break;
        case "team2":
            newUser.raptor_2_team = true;
            break;    
        case "solo3":
            newUser.raptor_3_solo = true;
            break;
        case "team3":
            newUser.raptor_3_team = true;
            break;
        case "turret":
            newUser.corsair_1_turret = true;
            break;
        case "torpedo":
            newUser.corsair_1_torpedo = true;
            break;
        case "ship commander":
            newUser.corsair_2_ship_commander = true;
            break;
        case "ship":
            newUser.corsair_2_ship_commander = true;
            break;
        case "wing commander":
            newUser.corsair_2_wing_commander = true;
            break;
        case "wing":
            newUser.corsair_2_wing_commander = true;
            break;
        case "fleet commander":
            newUser.corsair_3_fleet_commander = true;
            break;
        case "fleet":
            newUser.corsair_3_fleet_commander = true;
            break;
        case "swabbie":
            newUser.raider_1_swabbie = true;
            break;
        case "line master":
            newUser.raider_1_linemaster = true;
            break;
        case "boarder":
            newUser.raider_1_boarder = true;
            break;
        case "powder monkey":
            newUser.raider_2_powdermonkey = true;
            break;
        case "mate":
            newUser.raider_2_mate = true;
            break;
        case "sail master":
            newUser.raider_3_sailmaster = true;
            break;
    }
    return await queueApi.createUserInQueue(newUser);
}

async function removeFromQueue(playerName, requestedClass, completionStatus, message, client, openai){
    console.log(`Remove ${playerName} from ${requestedClass}`)
    //check rank of person doing action
    const userId = message.author.id;
    const guild = await client.guilds.fetch(message.guildId); // Fetch the guild
    const member = await guild.members.fetch(userId); // Fetch the member
    const memberRoles = member.roles.cache.map(role => role.id);
    moderatorRanks = process.env?.MODERATOR_ROLES?.split(",");
    const isModerator = memberRoles.some(element => moderatorRanks.includes(element)); //check if the user has one of the moderator roles

    if(isModerator){
        //get the queue'd users
        const users = await queueApi.getUsersInQueue();
        //get the one user
        userData;
        for (const element of users) {
            if(element.id === playerName || element.username === playerName || element.nickname === playerName){
                userData = element;
            }
        }

        //if we get a match, we perform the required action
        if(userData && requestedClass !== "all"){
            //remove him from that specific queue
            const addOrRemove = false; //false means remove the class
            const completedTask = (completionStatus === "completed");

            const editQueueSuccess = await editQueue(requestedClass, userData, message, openai, client, addOrRemove, completedTask, true);
            //if successful, mark it in the player list
            if(editQueueSuccess && completedTask === true){
                const addForComplete = true;
                userDataForUserList = await userlist.checkUserListForUser(userData); //get the user object from the userlist so we can mark something as complete
                console.log("userDataForUserList")
                console.log(userDataForUserList)
                if(!userDataForUserList){//if the user doesn't exist for some reason, let's make him
                    await userlist.createNewUser(userData);
                    userDataForUserList = await userlist.checkUserListForUser(userData);
                }
                const editQueueSuccess = editQueue(requestedClass, userDataForUserList, message, openai, client, addForComplete, completedTask, false);
                await logHandler(userData, message, requestedClass);
                if(editQueueSuccess && logHandler){
                    return `${userData.nickname || userData.username} was marked as complete for ${requestedClass} and ${message.author.username} completed the ticket.`
                }else{
                    return `${userData.nickname || userData.username} was removed from the ${requestedClass} queue but there was an error in logging the course.`
                }

                //mark player as having this complete
            }else if(editQueueSuccess && completionStatus === "not_completed"){
                return `${userData.nickname || userData.username} was removed from the ${requestedClass} queue.`
            }else{
                return `There was an error editing ${userData.nickname || userData.username}'s ${requestedClass} queue status.`
            }
            //check if the player has no more queue's and then remove if they don't
            
        }else if(userData && requestedClass === "all"){
            //remove the user from the list
        }else{
            return "The user could not be found in the queue. Please us the Username, Nickname, or UserID to search."
        }
        //return a response
    }else{
        return "The user who requested this action does not have sufficient rank to do so."
    }

}

module.exports = {
    queueController,
    queueReminderCheck,
    // getQueue,
};