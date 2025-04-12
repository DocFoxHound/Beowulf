
const getUsers = require('../api/userlistApi').getUsers;
const { getClasses } = require('../api/classApi');
const { getUserById } = require('../api/userlistApi');
const { generateClassData, generateQueueData } = require('../commands/utility/progress-tracker');

async function progressQuery(run, message) {
    try {
        const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
        const parsedArgs = JSON.parse(toolCall.function.arguments);
        const playerType = parsedArgs.user_type;
        const optionalArea = parsedArgs.optional_area || null;
        const otherPlayer = parsedArgs.optional_other_user || null;

        let userData;
        if (playerType === "self") {
            userData = message.author;
        } else {
            const allUsers = await getUsers();
            userData = allUsers.find(user =>
                user.id === otherPlayer || user.username === otherPlayer || user.nickname === otherPlayer
            );
        }

        if (!userData) {
            return "Issue with finding the other user mentioned.";
        }

        // Fetch all classes dynamically
        const allClasses = await getClasses();
        const userDbObject = await getUserById(userData.id);
        const classData = await generateClassData(allClasses); // Organize classes by category
        await generateQueueData(userDbObject, classData); // Populate completion data

        // Helper function to format assessment status
        const formatAssessments = (classes) => {
            return classes
                .map(classObj => `${classObj.completed ? '✅' : '❌'} ${classObj.alt_name || classObj.name}`)
                .join('\n');
        };

        // Calculate completion percentages
        const calculateCompletion = (classes) => {
            const total = classes.length;
            const completed = classes.filter(classObj => classObj.completed).length;
            return Math.round((completed / total) * 100);
        };

        // Calculate overall progress
        let crewEligibleCount = 0;
        let marauderEligibleCount = 0;
        let totalClasses = 0;
        let completedClasses = 0;

        for (const prestige in classData) {
            const classes = classData[prestige];
            totalClasses += classes.length;
            completedClasses += classes.filter(classObj => classObj.completed).length;

            // Check eligibility for crew and marauder
            const levels = classes.reduce((acc, classObj) => {
                acc[classObj.level] = acc[classObj.level] || [];
                acc[classObj.level].push(classObj);
                return acc;
            }, {});

            for (const level in levels) {
                const levelClasses = levels[level];
                const completed = levelClasses.filter(classObj => classObj.completed).length;
                if (completed === levelClasses.length) {
                    if (level === '1') crewEligibleCount++;
                    if (level === '3') marauderEligibleCount++;
                }
            }
        }

        const overallCompletion = Math.round((completedClasses / totalClasses) * 100);
        const crewCompletion = Math.round((crewEligibleCount / 3) * 100);
        const marauderCompletion = Math.round((marauderEligibleCount / 3) * 100);

        // Start building the response
        let response = `${userData.username} has the following progress:\n\n`;

        // Dynamically add progress for each prestige category
        for (const [prestige, classes] of Object.entries(classData)) {
            if (optionalArea === prestige.toLowerCase() || optionalArea === 'overall' || optionalArea === null) {
                const prestigeCompletion = calculateCompletion(classes);
                response += `**${prestige.toUpperCase()}**\n`;
                response += `${formatAssessments(classes)}\n`;
                response += `Completion: ${prestigeCompletion}%\n\n`;
            }
        }

        // Add overall progress if requested
        if (optionalArea === 'overall' || optionalArea === null) {
            response += `**Overall Progress**\n`;
            response += `Crew: ${crewCompletion}%\n`;
            response += `Marauder: ${marauderCompletion}%\n`;
            response += `Overall: ${overallCompletion}%\n`;
        }

        return response;
    } catch (error) {
        console.error('Error in progressQuery:', error);
        return error.message || 'An error occurred while processing the progress query.';
    }
}

module.exports = {
    progressQuery
};