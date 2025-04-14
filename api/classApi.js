const axios = require('axios');

async function createClass(newClass) {
    console.log("Inserting new class into the 'class' table")
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CLASS}/`; 
    try {
        const response = await axios.post(apiUrl, newClass, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error placing user in UserList: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function getClasses() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CLASS}/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching classes in class table:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getClassById(classId){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_CLASS}/${classId}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

//this isn't setup for editing yet, but is just a copy of editUser
async function editClass(classId, updatedUserData) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CLASS}/${classId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedUserData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating user in class table: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteClass(classId) {
    console.log("Deleting class from class table")
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_CLASS}/`; 
    try {
        const response = await axios.delete(apiUrl, classId, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error placing class in class Table: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createClass,
    getClasses,
    getClassById,
    editClass,
    deleteClass
};
