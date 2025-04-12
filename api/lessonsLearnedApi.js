const axios = require('axios');

async function createLessonLearned(lessonLearned) {
    const apiUrl = `${process.env.SERVER_URL}/api/lessonslearned`;
    try {
        const response = await axios.post(apiUrl, lessonLearned, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created LessonLearned data
    } catch (error) {
        console.error('Error creating LessonLearned:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAllLessonsLearned() {
    const apiUrl = `${process.env.SERVER_URL}/api/lessonslearned/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all LessonLearneds:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function deleteLessonLearned(id) {
    console.log("Deleting LessonLearned")
    const apiUrl = `${process.env.SERVER_URL}/api/lessonslearned/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting LessonLearned: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createLessonLearned,
    getAllLessonsLearned,
    deleteLessonLearned
};
