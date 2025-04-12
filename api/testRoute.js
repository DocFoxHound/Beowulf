const axios = require('axios');

async function getUserByIdTest(userId){
    const apiUrl = process.env.SERVER_URL;
    axios.get(`${apiUrl}/api/users/${userId}`)
    //http://localhost:3000
    .then(response => {
        nickname = response.data.nickname
        console.log('User data:', nickname);
        // console.log('User data:', response.data);
    })
    .catch(error => {
        console.error('Error fetching data:', error.message);
    });
}

async function createUserTest(newUser) {
    const apiUrl = process.env.SERVER_URL; 
    try {
        const response = await axios.post(apiUrl, newUser, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('User created:', response.data);
    } catch (error) {
        console.error('Error creating user:', error.response ? error.response.data : error.message);
    }
}

async function getUsersByCorsairLevel() {
    level = 1;
    const apiUrl = `http://localhost:3000/api/users/by-corsair-level?level=${encodeURIComponent(level)}`;

    axios.get(apiUrl)
        .then(response => {
            console.log('Users with Corsair Level ' + level + ':', response.data);
        })
        .catch(error => {
            console.error('Error fetching users:', error.response ? error.response.data : error.message);
        });
}

module.exports = {
    getUserByIdTest,
    createUserTest,
    getUsersByCorsairLevel
};
