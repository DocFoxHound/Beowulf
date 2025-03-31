const axios = require('axios');

//--------------------------------------------
//              CITY CONTROLLER               
//--------------------------------------------

async function getAllCities() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/cities/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getCityById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/cities/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateCity(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/cities`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`City does not exist, creating: ${data.id}`);
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return;
        } else {
            console.error('Error creating or updating city: ', error.response ? error.response.data : error.message);
            return;
        }
    }
}

//--------------------------------------------
//           COMMODITY CONTROLLER             
//--------------------------------------------

async function getAllCommodities() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/commodities/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getCommodityById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/commodities/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/commodities`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating entity: ', error.response ? error.response.data : error.message);
        }
    }
}

//--------------------------------------------
//           OUTPOST CONTROLLER               
//--------------------------------------------

async function getAllOutposts() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/outposts/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getOutpostById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/outposts/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateOutpost(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/outposts`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating entity: ', error.response ? error.response.data : error.message);
        }
    }
}

//--------------------------------------------
//           PLANET CONTROLLER               
//--------------------------------------------

async function getAllPlanets() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/planets/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getPlanetById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/planets/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdatePlanet(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/planets`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating entity: ', error.response ? error.response.data : error.message);
        }
    }
}

//--------------------------------------------
//         SPACE STATION CONTROLLER           
//--------------------------------------------

async function getAllSpaceStations() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/spacestations/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getSpaceStationsById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/spacestations/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateSpaceStation(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/spacestations`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating entity: ', error.response ? error.response.data : error.message);
        }
    }
}

//--------------------------------------------
//           STAR SYSTEM CONTROLLER           
//--------------------------------------------

async function getAllStarSystems() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/starsystems/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getStarSystemById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/starsystems/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateStarSystem(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/starsystems`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating city: ', error.response ? error.response.data : error.message);
        }
    }
}

//--------------------------------------------
//              SHIPS CONTROLLER           
//--------------------------------------------

async function getAllShips() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/ships/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getShipsById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/ships/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateShips(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/ships`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating entity: ', error.response ? error.response.data : error.message);
        }
    }
}


//--------------------------------------------
//           TERMINAL CONTROLLER              
//--------------------------------------------

async function getAllTerminals() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/terminals/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getTerminalById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/terminals/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateTerminal(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/terminals`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating city: ', error.response ? error.response.data : error.message);
        }
    }
}

//--------------------------------------------
//           TERMINAL PRICES CONTROLLER       
//--------------------------------------------

async function getAllTerminalPrices() {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/terminalprices/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getTerminalPricesById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}/api/uex/terminalprices/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateTerminalPrices(data) {
    const apiUrl = `${process.env.SERVER_URL}/api/uex/terminalprices`;
    try {
        // Check if the city exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing city
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new city if it does not exist
            await axios.post(apiUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error('Error creating or updating city: ', error.response ? error.response.data : error.message);
        }
    }
}

module.exports = {
    getAllCities,
    getCityById,
    createOrUpdateCity,
    getAllCommodities,
    getCommodityById,
    createOrUpdateCommodity,
    getAllOutposts,
    getOutpostById,
    createOrUpdateOutpost,
    getAllPlanets,
    getPlanetById,
    createOrUpdatePlanet,
    getAllSpaceStations,
    getSpaceStationsById,
    createOrUpdateSpaceStation,
    getAllStarSystems,
    getStarSystemById,
    createOrUpdateStarSystem,
    getAllTerminals,
    getTerminalById,
    createOrUpdateTerminal,
    getAllTerminalPrices,
    getTerminalPricesById,
    createOrUpdateTerminalPrices,
    getAllShips,
    getShipsById,
    createOrUpdateShips,
};
