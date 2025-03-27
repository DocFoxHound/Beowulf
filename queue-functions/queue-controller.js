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

async function queueController(runOrClassName, messageOrUser, openai, client, addToQueue, commandOrigin, classCompletedOrIncomplete, guild, optionalTarget, optionalHandler){
    console.log("QueueController")
    let author = null;
    let toolCall = null;
    let parsedArgs = null;
    let requestedClass = null;
    let player = null;

    if(commandOrigin === "slash-queue"){ //if this is a slash command
        console.log("slash-queue")
        author = messageOrUser; //it is a user in this case
        parsedArgs = classCompletedOrIncomplete;
        requestedClass = runOrClassName; //it is a class name in this case
        player = author.nickname || author.username; //if we are removing someone from a queue we need their name
    } else if(commandOrigin === "slash-edituser"){
        console.log("slash-edituser")
        author = messageOrUser.author; // player who initiated the command
        parsedArgs = classCompletedOrIncomplete;
        requestedClass = runOrClassName; 
        player = optionalTarget.id; // targeted user
    }else if (commandOrigin === "function-remove"){ 
        console.log("function-remove")
        author = messageOrUser.author;
        toolCall = runOrClassName.required_action.submit_tool_outputs.tool_calls[0];
        parsedArgs = JSON.parse(toolCall.function.arguments);
        requestedClass = parsedArgs.queue_class;
        player = parsedArgs.player_name_or_id || parsedArgs; //if we are removing someone from a queue we need their name
    }else if (commandOrigin === "function-add"){ //if this is an interaction with the bot and the bot has proc'd a function
        console.log("function-add")
        author = messageOrUser.author;
        toolCall = runOrClassName.required_action.submit_tool_outputs.tool_calls[0];
        parsedArgs = JSON.parse(toolCall.function.arguments);
        requestedClass = parsedArgs.queue_class;
        player = author.id; //if we are removing someone from a queue we need their name
    }

    userData = null;
    if(player){
        userData = await checkQueueForUser(player);
    }else{
        userData = await checkQueueForUser(author.id);
    }

    if(addToQueue === true && userData !== null){
        console.log("Editing User in Queue")
        const addOrRemove = true; //this means to add the user, false means to remove them
        const editQueueSuccess = await editQueue(requestedClass, userData, openai, client, addToQueue, true);
        if(editQueueSuccess === true){
            //notify proper channel of queue addition
            return `${author.username} was added to ${requestedClass}`;
        }else{
            return "There was an error adding to the queue"
        }
    }else if (addToQueue === true && userData === null){
        const addQueueSuccess = await addQueue(requestedClass, messageOrUser);
        if(addQueueSuccess === true){
            return `${author.username} was added to ${requestedClass}`;
        }else{
            return "There was an error adding to the queue"
        }
    }else if(addToQueue === false){
        const completionStatus = parsedArgs.status || parsedArgs;
        return removeFromQueue(player /*target user*/, requestedClass, completionStatus, messageOrUser /*handler or originator*/, client, openai, commandOrigin, guild, optionalTarget, optionalHandler);
    }
}

async function queueControllerForSlashCommands(className, targetUser, handlerUser,  openai, client, addOrRemove, classStatus, selfOrOther, interaction){
    try{
        const guild = interaction.guild;
        requestedClass = className;
        targetUsername = targetUser.username; //if null we need to error
        handlerUsername = classStatus !== "completed" ? null : handlerUser.username;

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
                const editQueueSuccess = await editQueue(requestedText, element, openai, client, addOrRemove, true); //this resets the timer so that the bot isnt't just blasting the help channels about the same person over and over again
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

async function editQueue(requestedText, userData, openai, client, addOrRemove, forQueue){
    console.log("editQueue")
    switch (requestedText.toLowerCase()){
        case "raptor_1_solo":
            userData.raptor_1_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "dogfighting":
            userData.raptor_1_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "dogfighting 101":
            userData.raptor_1_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor_1_team":
            userData.raptor_1_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "teamfighting":
            userData.raptor_1_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "teamfighting 101":
            userData.raptor_1_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor_2_solo":
            userData.raptor_2_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;    
        case "solo2":
            userData.raptor_2_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor ii solo assessment":
            userData.raptor_2_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor_2_team":
            userData.raptor_2_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break; 
        case "team2":
            userData.raptor_2_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;    
        case "raptor ii team assessment":
            userData.raptor_2_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;   
        case "raptor_3_solo":
            userData.raptor_3_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "solo3":
            userData.raptor_3_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor iii solo assessment":
            userData.raptor_3_solo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor_3_team":
            userData.raptor_3_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "team3":
            userData.raptor_3_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raptor iii team assessment":
            userData.raptor_3_team = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAPTOR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "corsair_1_turret":
            userData.corsair_1_turret = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "turret":
            userData.corsair_1_turret = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "turret assessment":
            userData.corsair_1_turret = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "corsair_1_torpedo":
            userData.corsair_1_torpedo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "torpedo":
            userData.corsair_1_torpedo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "torpedo assessment":
            userData.corsair_1_torpedo = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "corsair_2_ship_commander":
            userData.corsair_2_ship_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "ship commander":
            userData.corsair_2_ship_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "ship":
            userData.corsair_2_ship_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "ship commander assessment":
            userData.corsair_2_ship_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "corsair_2_wing_commander":
            userData.corsair_2_wing_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "wing commander":
            userData.corsair_2_wing_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "wing commander assessment":
            userData.corsair_2_wing_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "wing":
            userData.corsair_2_wing_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "corsair_3_fleet_commander":
            userData.corsair_3_fleet_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "fleet commander":
            userData.corsair_3_fleet_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "fleet":
            userData.corsair_3_fleet_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "fleet commander assessment":
            userData.corsair_3_fleet_commander = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("CORSAIR", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raider_1_swabbie":
            userData.raider_1_swabbie = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "swabbie":
            userData.raider_1_swabbie = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "swabbie assessment":
            userData.raider_1_swabbie = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raider_1_linemaster":
            userData.raider_1_linemaster = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "line master":
            userData.raider_1_linemaster = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "line master assessment":
            userData.raider_1_linemaster = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raider_1_boarder":
            userData.raider_1_boarder = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "boarder":
            userData.raider_1_boarder = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "boarding assessment":
            userData.raider_1_boarder = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raider_2_powdermonkey":
            userData.raider_2_powdermonkey = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "powder monkey":
            userData.raider_2_powdermonkey = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "powder monkey assessment":
            userData.raider_2_powdermonkey = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raider_2_mate":
            userData.raider_2_mate = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "mate":
            userData.raider_2_mate = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "mate assessment":
            userData.raider_2_mate = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "raider_3_sailmaster":
            userData.raider_3_sailmaster = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "sail master":
            userData.raider_3_sailmaster = addOrRemove;
            if(addOrRemove === true){
                notifyNewQueue("RAIDER", requestedText, userData.nickname || userData.username, openai, client);
            }
            break;
        case "sail master assessment":
            userData.raider_3_sailmaster = addOrRemove;
            if(addOrRemove === true){
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
        // List of fields to check
        const fieldsToCheck = [
            'raptor_1_solo', 'raptor_1_team', 'raptor_2_solo', 'raptor_2_team',
            'raptor_3_solo', 'raptor_3_team', 'corsair_1_torpedo', 'corsair_1_turret',
            'corsair_2_ship_commander', 'corsair_2_wing_commander', 'corsair_3_fleet_commander'
        ];
        // Check if all specified fields are false
        const allFieldsAreFalse = fieldsToCheck.every(field => userData[field] === false);

        if (allFieldsAreFalse) {
            return await queueApi.deleteUserInQueue(userData.id);
        } else {
            return await queueApi.editUserInQueue(userData.id, userData);
        }
    }else if (forQueue === false){ //do this if this is for editing the userList to mark a class as complete
        // return await userlistApi.editUser(userData.id, userData); 
        return await updateUserClassStatus(userData, requestedText, true);
    }
}

async function addQueue(requestedText, message){
    console.log("Add Queue")
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

async function removeFromQueue(targetUser /*targetUser*/, requestedClass, completionStatus, messageOrUser /*handler or originator*/, client, openai, slashCommand, guildObject, optionalTarget, optionalHandler){
    console.log(`Remove ${targetUser} from ${requestedClass}`)
    try{
        const classes = await getClasses()
        const classId = classes.find(c => 
            c.name === requestedClass || 
            c.alt_name === requestedClass || 
            (Array.isArray(c.ai_function_class_names) && c.ai_function_class_names.includes(requestedClass))
        ).id;
        //check rank of person doing action
        const userId = slashCommand ? messageOrUser.id : messageOrUser.author.id;
        const guild = slashCommand ? guildObject : messageOrUser.guild; // Fetch the guild
        // const guild = await client.guilds.fetch(process.env.GUILD_ID_TEST); // Fetch the guild
        const member = await guild.members.fetch(userId); // Fetch the member
        const memberRoles = member.roles.cache.map(role => role.id);
        const moderatorRanks = process.env?.MODERATOR_ROLES?.split(",");
        const isModerator = memberRoles.some(element => moderatorRanks.includes(element)); //check if the user has one of the moderator roles
        if(isModerator){
            //get the queue'd users
            const users = await queueApi.getUsersInQueue();
            //get the one user
            let targetUserData; //not handler, but the target user to be logged
            for (const element of users) {
                if (element.id === targetUser || element.username?.toLowerCase() === targetUser.toLowerCase() || element.nickname?.toLowerCase() === targetUser.toLowerCase()) {
                    targetUserData = element;
                }
            }

            //if we get a match, we perform the required action
            if(targetUserData && requestedClass !== "all"){
                console.log(`Remove ${targetUserData.username} specific queue: `, requestedClass)
                const editQueueSuccess = await editQueue(requestedClass, targetUserData, openai, client, false, true); //flase = remove from queue
                //if successful, mark it in the player list
                if(editQueueSuccess && completionStatus === "completed"){
                    userDataForUserList = await userlist.checkUserListForUser(targetUserData); //get the user object from the userlist so we can mark something as complete
                    if(userDataForUserList === null){//if the user doesn't exist for some reason, let's make him
                        console.log("User isn't on UserList")
                        await userlist.createNewUser(targetUserData, client, messageOrUser.guildId);
                        userDataForUserList = await userlist.checkUserListForUser(targetUserData);
                    }
                    //edit the userList user for completion, log it in the logHandler
                    const editUserListStatusSuccess = await updateUserClassStatus(userDataForUserList, requestedClass, true);
                    await logHandler(optionalTarget ? optionalTarget : targetUserData, optionalHandler ? optionalHandler : messageOrUser, classId, slashCommand); //messageOrUser is handler

                    //if both are successful, return a success message
                    if(editQueueSuccess && logHandler && editUserListStatusSuccess){
                        return `${targetUserData.nickname || targetUserData.username} was marked as complete for ${requestedClass} and ${slashCommand ? messageOrUser.username : messageOrUser.author.username} completed the ticket.`
                    }else{
                        return `${targetUserData.nickname || targetUserData.username} was removed from the ${requestedClass} queue but there was an error in logging the course.`
                    }

                    //mark player as having this complete
                }else if(editQueueSuccess && completionStatus === "not_completed"){
                    return `${targetUserData.nickname || targetUserData.username} was removed from the ${requestedClass} queue.`
                }else{
                    return `There was an error editing ${targetUserData.nickname || targetUserData.username}'s ${requestedClass} queue status.`
                }
                //check if the player has no more queue's and then remove if they don't
                
            }else if(targetUserData && requestedClass === "all"){
                console.log(`Remove ${targetUserData.id} from all queues.`)
                const deleteSuccess = await queueApi.deleteUserInQueue(targetUserData.id);
                if(deleteSuccess === true){
                    return true;
                }else{
                    return false;
                }
            }else{
                console.log("Error occurred while removing player from queue.");
                return "The user could not be found in the queue. Please us the Username, Nickname, or UserID to search."
            }
            //return a response
        }else{
            console.log("The user who requested this action does not have sufficient rank to do so.")
            return "The user who requested this action does not have sufficient rank to do so."
        }
    }catch(error){
        console.log("Error in removeFromQueue: ", error)
    }
    
}

module.exports = {
    queueReminderCheck,
    checkQueueForUser,
    queueControllerForChat,
    queueControllerForSlashCommands
    // getQueue,
};