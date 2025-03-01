const queue = require("../api/queue");
const editQueue = require("./edit-queue");


async function queueCheck(){
    console.log("Checking queue")
    const users = await queue.getUsersInQueue();
    usersNeedingHelp = [];
    usersNeedingHelpReminder = [];
    users.forEach(async element => {
        currentTime = new Date() //2025-02-28T18:02:30.759Z
        queueEntryTime = new Date(element.createdAt) //2025-02-28T14:39:55.166Z
        const diffInMilliseconds = currentTime.getTime() - queueEntryTime.getTime();
        const diffInMinutes = Math.floor(diffInMilliseconds / 60000);

        if(diffInMinutes <= 1){
            usersNeedingHelp.push(element);
        }else if (diffInMinutes > 720){
            usersNeedingHelpReminder.push(element);
            requestedText = "queue-reminder"
            const editQueueSuccess = await editQueue.editQueue(requestedText, element, element); //this resets the timer so that the bot isnt't just blasting the help channels about the same person over and over again
            if(editQueueSuccess === true){
                
                console.log("User's timestamp updated after reminder published.")
            }else{
                console.log("Error updating user's timestamp after reminder.")
            }
        }
    });
}

module.exports = {
    queueCheck,
}