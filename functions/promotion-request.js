const logger = require('../logger');

async function promoteRequest(){
    console.log("Promote Request");
    return "Too busy to promote people, ask one of the Chiefs."
}

module.exports = {
    promoteRequest
}