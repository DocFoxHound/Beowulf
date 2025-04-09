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
            const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
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
            const moderatorRoles = process.env.LIVE_ENVIRONMENT === "true" ? process.env.MODERATOR_ROLES.split(',') : process.env.TEST_MODERATOR_ROLES.split(',');
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

async function queueReminderCheck(openai, client, run) {
    console.log("Checking queue");
    const users = await queueApi.getUsersInQueue();
    const allClasses = await getClasses(); // Fetch all classes dynamically
    const classData = await generateClassData(allClasses); // Organize classes by category
    const usersInQueue = [];

    for (const user of users) {
        const currentTime = new Date();
        const queueEntryTime = new Date(user.createdAt);
        const diffInMilliseconds = currentTime.getTime() - queueEntryTime.getTime();
        const diffInMinutes = Math.floor(diffInMilliseconds / 60000);

        if (diffInMinutes > 720 || run) { // Reminder after 12 hours or if manually triggered
            usersInQueue.push(user);

            if (run === null) { // Only reset their times if this is a scheduled queue check
                const editQueueTimeSuccess = await editQueueTime(user); // Reset the timer
                if (editQueueTimeSuccess) {
                    console.log(`${user.username}'s timestamp updated after reminder published.`);
                } else {
                    console.log(`Error updating ${user.username}'s timestamp after reminder.`);
                }
            }
        }
    }

    const queueByCategory = {};

    // Dynamically group users in queue by class category
    for (const user of usersInQueue) {
        for (const [category, classes] of Object.entries(classData)) {
            if (!queueByCategory[category]) {
                queueByCategory[category] = [];
            }

            const userClasses = classes
                .filter(classObj => user[classObj.name] === true)
                .map(classObj => classObj.alt_name || classObj.name);

            if (userClasses.length > 0) {
                queueByCategory[category].push(`${user.nickname || user.username} is in queue for: ${userClasses.join(', ')}`);
            }
        }
    }

    if (run === null) {
        for (const [category, queue] of Object.entries(queueByCategory)) {
            if (queue.length > 0) {
                const requestedText = queue.join("\n");
                await notifyOldQueue(category.toUpperCase(), requestedText, openai, client);
            }
        }
    } else {
        const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        const parsedArgs = JSON.parse(toolCall.function.arguments);
        const queueType = parsedArgs.queue;

        if (queueType === "ALL") {
            const allQueue = Object.entries(queueByCategory)
                .map(([category, queue]) => `${category.toUpperCase()}:\n${queue.join("\n")}`)
                .join("\n\n");
            return allQueue || "There are no users in the queue.";
        } else if (queueByCategory[queueType.toLowerCase()]) {
            return queueByCategory[queueType.toLowerCase()].join("\n") || `There are no users in the ${queueType} queue.`;
        }
    }
}

//case: self request to add to class:
//classStatus should be null, addOrRemove should be true, handlerUsername should be null, targetUsername should be author
async function addOrEditQueue(requestedClass, targetUsername, handlerUsername, openai, client, addOrRemove, classStatus, selfOrOther) {
    try {
        // Validate input
        if (requestedClass === "unknown") {
            return "The class requested doesn't match any classes.";
        }
        if (selfOrOther === "self" && handlerUsername !== null) {
            return "You cannot specify a handler for yourself.";
        }
        if (addOrRemove === true && classStatus !== null) {
            return "You cannot specify a status for adding to the queue.";
        }
        if (addOrRemove === true && handlerUsername !== null) {
            return "You cannot specify a handler for adding to the queue.";
        }
        if (selfOrOther === "self" && classStatus === "completed") {
            return "You cannot mark a class complete for yourself.";
        }
        if (handlerUsername !== null && classStatus === "not_completed") {
            return "You cannot specify a handler for a class that is not completed.";
        }

        // Fetch handler data if required
        let handlerData = null;
        if (classStatus === "completed") {
            handlerData = await checkUserListForUserByNameOrId(handlerUsername);
            if (!handlerData) {
                return "The name of the person who handled the ticket couldn't be found.";
            }
        }

        // Fetch user data
        const userInList = await checkUserListForUserByNameOrId(targetUsername);
        if (!userInList) {
            return "The user specified couldn't be found.";
        }

        const userInQueue = await checkQueueForUser(targetUsername);
        const inQueue = !!userInQueue;

        // Fetch class data dynamically
        const allClasses = await getClasses();
        const classData = await generateClassData(allClasses);

        // Find the requested class
        const classToUpdate = allClasses.find(c =>
            c.name.toLowerCase() === requestedClass.toLowerCase() ||
            c.alt_name.toLowerCase() === requestedClass.toLowerCase() ||
            c.ai_function_class_names.includes(requestedClass.toLowerCase())
        );
        if (!classToUpdate) {
            return "The class mentioned wasn't found anywhere.";
        }

        // Check if the user is already signed up for this class
        if (inQueue && addOrRemove && userInQueue[classToUpdate.name] === addOrRemove) {
            return `User is already signed up for ${classToUpdate.alt_name}`;
        }

        // Check if the user has already completed this class
        if (!inQueue && addOrRemove && userInList[classToUpdate.name] === true) {
            return `User has already completed ${classToUpdate.alt_name}`;
        }

        // Check prerequisites for the class
        const prereqNeeded = await prerequisiteCheck(classToUpdate, userInList);
        if (addOrRemove && prereqNeeded) {
            return `${userInList.nickname || userInList.username} needs to complete prerequisites before signing up for ${classToUpdate.alt_name}`;
        }

        // Create or update the user model for the queue
        const newUserModel = {
            id: inQueue ? userInQueue.id : userInList.id,
            username: inQueue ? userInQueue.username : userInList.username,
            nickname: inQueue ? userInQueue.nickname : userInList.nickname,
            createdAt: new Date()
        };

        // Dynamically add class fields to the user model
        for (const [category, classes] of Object.entries(classData)) {
            for (const classObj of classes) {
                newUserModel[classObj.name] = inQueue ? userInQueue[classObj.name] || false : false;
            }
        }

        // Mark the requested class as true or false
        if (classToUpdate) {
            newUserModel[classToUpdate.name] = addOrRemove;
        }

        // Create or update the user model for the user list
        const newUserModelForUserList = {
            id: userInList.id,
            username: userInList.username,
            nickname: userInList.nickname,
            rank: userInList.rank
        };

        // Dynamically add class fields to the user list model
        for (const [category, classes] of Object.entries(classData)) {
            for (const classObj of classes) {
                newUserModelForUserList[classObj.name] = userInList[classObj.name] || false;
            }
        }

        // Mark the requested class as completed if applicable
        if (!addOrRemove && classStatus === "completed" && classToUpdate) {
            newUserModelForUserList[classToUpdate.name] = true;
        }

        // Handle queue addition
        if (addOrRemove) {
            const addOrEditSuccess = await editOrAddUserInQueue(newUserModel.id, newUserModel);
            if (addOrEditSuccess) {
                notifyNewQueue(classToUpdate.prestige_category.toUpperCase(), requestedClass, newUserModel.nickname || newUserModel.username, openai, client);
                return `${newUserModel.nickname || newUserModel.username} was successfully added to the queue for ${requestedClass}.`;
            } else {
                return "There was an error adding to the queue.";
            }
        }

        // Handle queue removal and marking as incomplete
        if (!addOrRemove && (classStatus === "not_completed" || classStatus === null)) {
            const addOrEditSuccess = await editOrAddUserInQueue(newUserModel.id, newUserModel);
            emptyUserQueueCheck(allClasses, newUserModel);
            if (addOrEditSuccess) {
                return `${newUserModel.nickname || newUserModel.username} was successfully removed from the queue for ${requestedClass} and marked incomplete.`;
            }
        }

        // Handle queue removal and marking as completed
        if (!addOrRemove && classStatus === "completed") {
            const addOrEditSuccess = await editOrAddUserInQueue(newUserModel.id, newUserModel);
            const successfulEdit = await editUser(newUserModelForUserList.id, newUserModelForUserList);
            emptyUserQueueCheck(allClasses, newUserModel);
            if (addOrEditSuccess && successfulEdit) {
                const logResult = await logHandlerFunctionCommand(newUserModel, handlerData, classToUpdate.id);
                return `${newUserModel.nickname || newUserModel.username} was successfully removed from the queue for ${requestedClass} and marked complete by ${handlerData.username}.`;
            }
        }
    } catch (error) {
        console.error(error);
        return "There was an error adding to the queue.";
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

async function editQueueTime(userData) {
    console.log("editQueue");
    const allClasses = await getClasses(); // Fetch all classes dynamically
    const classData = await generateClassData(allClasses); // Organize classes by category

    const currentTime = new Date();
    const fiveMinutesAgo = new Date(currentTime.getTime() - (5 * 60000));
    userData.createdAt = fiveMinutesAgo;

    // Dynamically check all class fields
    const fieldsToCheck = Object.values(classData).flat().map(classObj => classObj.name);
    const allFieldsAreFalse = fieldsToCheck.every(field => userData[field] === false);

    if (allFieldsAreFalse) {
        await deleteUserInQueue(userData.id);
    } else {
        return await queueApi.editUserInQueue(userData.id, userData);
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

async function generateClassData(allClasses) {
    const classData = {};
    try {
        for (const log of allClasses) {
            if (!classData[log.prestige_category]) {
                classData[log.prestige_category] = [];
            }
  
            classData[log.prestige_category].push({
                id: log.id,
                name: log.name,
                alt_name: log.alt_name,
                description: log.description,
                ai_function_class_names: log.ai_function_class_names,
                prerequisites: log.prerequisites,
                thumbnail_url: log.thumbnail_url,
                level: log.level,
                students: []
            });
        }
        return classData;
    }catch(error){
        console.error('Error generating leaderboard data:', error);
        return null;  // Return null if there's an error
    }
}

module.exports = {
    queueReminderCheck,
    checkQueueForUser,
    queueControllerForChat,
    queueControllerForSlashCommands
    // getQueue,
};