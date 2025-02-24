const axios = require('axios');

// async function getUserByIdTest(){
//     const apiUrl = 'http://localhost:3000/api/users/664023164350627843';
//     axios.get(apiUrl)
//     .then(response => {
//         nickname = response.data.nickname
//         console.log('User data:', nickname);
//         // console.log('User data:', response.data);
//     })
//     .catch(error => {
//         console.error('Error fetching data:', error.message);
//     });
// }

async function createUserInQueueCorsair(userId, userName) {
    const apiUrl = `${process.env.SERVER_URL}/api/users/`; //TODO
    const newUser = {
        id: userId,
        date: new Date(),
        username: userName
    };
    try {
        const response = await axios.post(apiUrl, newUser, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('User placed in Queue - CORSAIR: ', response.data);
    } catch (error) {
        console.error('Error placing user in Queue - CORSAIR: ', error.response ? error.response.data : error.message);
    }
}

async function getUsersInQueueCorsair() {
    const apiUrl = `${process.env.SERVER_URL}/api/users/by-corsair-level?level=${encodeURIComponent(level)}`; //TODO

    axios.get(apiUrl)
        .then(response => {
            console.log('Users in Corsair Queue: ' + response.data);
        })
        .catch(error => {
            console.error('Error fetching users:', error.response ? error.response.data : error.message);
        });
}

module.exports = {
    createUserInQueueCorsair,
    getUsersInQueueCorsair
};
