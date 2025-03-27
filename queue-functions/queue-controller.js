const { notifyNewQueue } = require("../common/bot-notify");
const { notifyOldQueue } = require("../common/bot-notify");
const { notifyRemovalFromQueue } = require("../common/bot-notify");
const botNotify = require("../common/bot-notify");
const queueApi = require("../api/queueApi");
const { deleteUserInQueue } = require("../api/queueApi");
// const userlistApi = require("../api/userlistApi");
const { sendResponse } = require("../threads/send-response");
const { formatResponse } = require("../threads/format-response");
const lodash = require('lodash');
// const userlist = require("../userlist-functions/userlist-controller")
const { logHandlerFunctionCommand } = require("../completed-queue-functions/completed-queue-handler");
const { checkUserListForUserByNameOrId } = require("../userlist-functions/userlist-controller");
const { updateUserClassStatus } = require("../userlist-functions/userlist-controller");
const { editUser } = require("../api/userlistApi");
const { updatedUserListData } = require("../userlist-functions/userlist-controller");
const completedQueueHandler = require("../completed-queue-functions/completed-queue-handler");
const { getClasses } = require("../api/classApi");
const { editOrAddUserInQueue } = require("../api/queueApi");

async function queueControllerForSlashCommands(className, targetUser, handlerUser,  openai, client, addOrRemove, classStatus, selfOrOther, interaction){
    console.log("Queue Controller for Slash Commands")
    try{
        const guild = interaction.guild;
        requestedClass = className;
        targetUsername = targetUser.username; //if null we need to error
        handlerUsername = (classStatus !== "completed" ? null : handlerUser.username) || null;

        if(targetUser === null){
            return "The target user specified was not found.";
        }
        
        if(classStatus === "completed"){
            // Check if the user has the required role
            const member = await guild.members.fetch(interaction.user.id);
            const memberRoles = member.roles.cache;
            const moderatorRoles = process.env.MODERATOR_ROLES.split(',');
            const hasPermission = moderatorRoles.some(role => memberRoles.has(role));
            if (!hasPermission) {
                return "You do not have permission to mark something as complete or not.";
            }
        }

        const response = await addOrEditQueue(requestedClass, targetUsername, handlerUsername, openai, client, addOrRemove, classStatus, selfOrOther);
        return response;
    }catch(error){
        console.log(error);
        return "There was an error adding to the queue"
    }
}

async function queueControllerForChat(run, message, openai, client){
    console.log("Queue Controller for Chat Commands")
    try{
        toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        parsedArgs = JSON.parse(toolCall.function.arguments);
        requestedClass = parsedArgs.queue_class;
        selfOrOther = parsedArgs.self_or_other || "self";
        targetUsername = parsedArgs.user_name || null;
        classStatus = (parsedArgs.status === "null" ? null : parsedArgs.status) || null;
        handlerUsername = classStatus !== "completed" ? null : parsedArgs.handler_user_name;
        const addOrRemove = parsedArgs.add_or_remove === "add" ? true : false;
        
        if(classStatus === "completed"){
            // Check if the user has the required role
            const guild = message.guild;
            const member = await guild.members.fetch(message.author.id);
            const memberRoles = member.roles.cache;
            const moderatorRoles = process.env.MODERATOR_ROLES.split(',');
            const hasPermission = moderatorRoles.some(role => memberRoles.has(role));
            if (!hasPermission) {
                return "You do not have permission to mark something as complete or not.";
            }
        }

        if(selfOrOther === "self"){
            const response = await addOrEditQueue(requestedClass, message.author.username, handlerUsername, openai, client, addOrRemove, classStatus, selfOrOther);
            return response;
        }else if(selfOrOther === "other"){
            const response = await addOrEditQueue(requestedClass, targetUsername, handlerUsername, openai, client, addOrRemove, classStatus, selfOrOther);
            return response;
        }

    }catch(error){
        console.log(error);
        return "There was an error adding to the queue"
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

async function queueReminderCheck(openai, client, run){
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
                const editQueueTimeSuccess = await editQueueTime(userData); //this resets the timer so that the bot isnt't just blasting the help channels about the same person over and over again
                if(editQueueTimeSuccess === true){     
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

//case: self request to add to class:
//classStatus should be null, addOrRemove should be true, handlerUsername should be null, targetUsername should be author
async function addOrEditQueue(requestedClass, targetUsername, handlerUsername, openai, client, addOrRemove, classStatus, selfOrOther) {
    try{
        //handling some common user errors before we get into the weeds
        if(requestedClass === "unknown"){
            return "The class requested doesn't match any classes."
        }
        if(selfOrOther === "self" && handlerUsername !== null){
            return "You cannot specify a handler for yourself."
        }
        if(addOrRemove === true && classStatus !== null){
            return "You cannot specify a status for adding to the queue."
        }
        if(addOrRemove === true && handlerUsername !== null){
            return "You cannot specify a handler for adding to the queue."
        }
        if(selfOrOther === "self" && classStatus === "completed"){
            return "You cannot mark a class complete for yourself."
        }
        if(handlerUsername !== null && classStatus === "not_completed"){
            return "You cannot specify a handler for a class that is not completed."
        }

        // Check if the handler exists in the userlist
        let handlerData = await checkUserListForUserByNameOrId(handlerUsername) || null;
        if(!handlerData && classStatus === "completed"){
            return "The name of the person who handled the ticket couldn't be found."
        }

        //get the user objects from the userList and the queue
        const userInList = await checkUserListForUserByNameOrId(targetUsername) || null;
        if (!userInList) {
            return "The user specified couldn't be found.";
        }

        //get the user object from the queue, if it exists
        let inQueue = true;
        const userInQueue = await checkQueueForUser(targetUsername) || null;
        if (!userInQueue) {
            inQueue = false;
        }

         // Fetch the list of available classes
         const classes = await getClasses();

         //Find the class object that matches the requested class
         const classToUpdate = classes.find(c => 
             c.name.toLowerCase() === requestedClass.toLowerCase() || 
             c.alt_name.toLowerCase() === requestedClass.toLowerCase() ||
             c.ai_function_class_names.includes(requestedClass.toLowerCase())
         );
         if(!classToUpdate){
            return "The class mentioned wasn't found anywhere.";
         }

        //check if the user is already signed up for this class
        if(inQueue === true && addOrRemove && userInQueue[classToUpdate.name] === addOrRemove){
            return `User is already signed up for ${classToUpdate.alt_name}`;
        }

        //check if the user has already completed this class
        if(inQueue === false && addOrRemove && userInList[classToUpdate.name] === true){
            return `User has already completed ${classToUpdate.alt_name}`;
        }

        //check if the user needs prerequisites to sign up for this class
        const prereqNeeded = await prerequisiteCheck(classToUpdate, userInList);
        if(addOrRemove && prereqNeeded === true){
            return `${userInList.nickname || userInList.username} needs to complete prerequisites and given granted the correct prestige rank before signing up for ${classToUpdate.alt_name}`;
        }

        //Copy the user from the queue, or make a new user model to add to the queue
        const newUserModel = {
            id: inQueue ? userInQueue.id : userInList.id,
            username: inQueue ? userInQueue.username : userInList.username,
            nickname: inQueue ? userInQueue.nickname : userInList.nickname,
            createdAt: new Date(),
            raptor_1_solo: inQueue ? userInQueue.raptor_1_solo : false,
            raptor_1_team: inQueue ? userInQueue.raptor_1_team : false,
            raptor_2_solo: inQueue ? userInQueue.raptor_2_solo : false,
            raptor_2_team: inQueue ? userInQueue.raptor_2_team : false,
            raptor_3_solo: inQueue ? userInQueue.raptor_3_solo : false,
            raptor_3_team: inQueue ? userInQueue.raptor_3_team : false,
            corsair_1_turret: inQueue ? userInQueue.corsair_1_turret : false,
            corsair_1_torpedo: inQueue ? userInQueue.corsair_1_torpedo : false,
            corsair_2_ship_commander: inQueue ? userInQueue.corsair_2_ship_commander : false,
            corsair_2_wing_commander: inQueue ? userInQueue.corsair_2_wing_commander : false,
            corsair_3_fleet_commander: inQueue ? userInQueue.corsair_3_fleet_commander : false,
            raider_1_swabbie: inQueue ? userInQueue.raider_1_swabbie : false,
            raider_1_linemaster: inQueue ? userInQueue.raider_1_linemaster : false,
            raider_1_boarder: inQueue ? userInQueue.raider_1_boarder : false,
            raider_2_powdermonkey: inQueue ? userInQueue.raider_2_powdermonkey : false,
            raider_2_mate: inQueue ? userInQueue.raider_2_mate : false,
            raider_3_sailmaster: inQueue ? userInQueue.raider_3_sailmaster : false
        };

        //Copy the user from the queue, or make a new user model to add to the queue
        const newUserModelForUserList = {
            id: inQueue ? userInQueue.id : userInList.id,
            username: userInList.username,
            nickname: userInList.nickname,
            corsair_level: userInList.corsair_level,
            raptor_level: userInList.raptor_level,
            raider_level: userInList.raider_level,
            raptor_1_solo: userInList.raptor_1_solo,
            raptor_1_team: userInList.raptor_1_team,
            raptor_2_solo: userInList.raptor_2_solo,
            raptor_2_team: userInList.raptor_2_team,
            raptor_3_solo: userInList.raptor_3_solo,
            raptor_3_team: userInList.raptor_3_team,
            corsair_1_turret: userInList.corsair_1_turret,
            corsair_1_torpedo: userInList.corsair_1_torpedo,
            corsair_2_ship_commander: userInList.corsair_2_ship_commander,
            corsair_2_wing_commander: userInList.corsair_2_wing_commander,
            corsair_3_fleet_commander: userInList.corsair_3_fleet_commander,
            raider_1_swabbie: userInList.raider_1_swabbie,
            raider_1_linemaster: userInList.raider_1_linemaster,
            raider_1_boarder: userInList.raider_1_boarder,
            raider_2_powdermonkey: userInList.raider_2_powdermonkey,
            raider_2_mate: userInList.raider_2_mate,
            raider_3_sailmaster: userInList.raider_3_sailmaster,
            rank: userInList.rank
        };

        //mark the class we're queueing for as true or false, this is for the queue user model
        if (classToUpdate) {
            newUserModel[classToUpdate.name] = addOrRemove;
        }

        //mark the class we're queueing for as true or false, this is for the userList user model
        if (!addOrRemove && classStatus === "completed" && classToUpdate) {
            newUserModelForUserList[classToUpdate.name] = true;
        }

        // if adding to queue
        if(addOrRemove){
            const addOrEditSuccess = await editOrAddUserInQueue(newUserModel.id, newUserModel);
            notifyNewQueue(classToUpdate.prestige_category.toUpperCase(), requestedClass, newUserModel.nickname || newUserModel.username, openai, client);
            if(addOrEditSuccess){
                return `${newUserModel.nickname || newUserModel.username} was successfully added to the queue for ${requestedClass}.`;
            }else{
                return "There was an error adding to the queue"
            }
        }

        // if removing from queue and the class is not completed
        if(!addOrRemove && (classStatus === "not_completed" || classStatus === null)){
            const addOrEditSuccess = await editOrAddUserInQueue(newUserModel.id, newUserModel);
            emptyUserQueueCheck(classes, newUserModel)
            if(addOrEditSuccess){
                return `${newUserModel.nickname || newUserModel.username} was successfully removed from the queue for ${requestedClass} and marked incomplete.`;
            }
        }

        //if removing from queue and the class is completed
        if(!addOrRemove && classStatus === "completed"){
            //remove from queue
            const addOrEditSuccess = await editOrAddUserInQueue(newUserModel.id, newUserModel);
            const successfulEdit = await editUser(newUserModelForUserList.id, newUserModelForUserList);
            emptyUserQueueCheck(classes, newUserModel)
            if(addOrEditSuccess && successfulEdit){
                const logResult = await logHandlerFunctionCommand(newUserModel, handlerData, classToUpdate.id);
                return `${newUserModel.nickname || newUserModel.username} was successfully removed from the queue for ${requestedClass} and marked complete by ${handlerData.username}.`;    
            }
        }
    }catch(error){
        console.log(error);
        return "There was an error adding to the queue"
    }
}

async function emptyUserQueueCheck(classes, userModel){
    // List of fields to check
    const fieldsToCheck = classes.map(classItem => classItem.name);
    // Check if all specified fields are false
    const allFieldsAreFalse = fieldsToCheck.every(field => userModel[field] === false);

    if (allFieldsAreFalse) {
        deleteUserInQueue(userModel.id);
    } else {
        return;
    }
}

async function prerequisiteCheck(classToUpdate, userInList){
    const prerequisites = classToUpdate.prerequisites;
    if(prerequisites){
        for (const prerequisite of prerequisites) {
            if(userInList[prerequisite] === false){
                return true;
            }
        }
    }
    return false;
}

async function editQueueTime(userData){
    console.log("editQueue")
    const currentTime = new Date();
    const fiveMinutesAgo = new Date(currentTime.getTime() - (5 * 60000));
    userData.createdAt = fiveMinutesAgo
    const fieldsToCheck = [
        'raptor_1_solo', 'raptor_1_team', 'raptor_2_solo', 'raptor_2_team',
        'raptor_3_solo', 'raptor_3_team', 'corsair_1_torpedo', 'corsair_1_turret',
        'corsair_2_ship_commander', 'corsair_2_wing_commander', 'corsair_3_fleet_commander'
    ];
    return await queueApi.editUserInQueue(userData.id, userData);
}

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

module.exports = {
    queueReminderCheck,
    checkQueueForUser,
    queueControllerForChat,
    queueControllerForSlashCommands
    // getQueue,
};