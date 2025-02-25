const axios = require('axios');

const apiUrl = process.env.SERVER_URL;

async function getUserByIdTest(){
    axios.get(`${apiUrl}/api/users/664023164350627843`)
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
    const apiUrl = 'http://localhost:3000/api/users/'; 
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
