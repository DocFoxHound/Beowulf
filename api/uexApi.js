const axios = require('axios');
const REQ_TIMEOUT = Number(process.env.UEX_API_TIMEOUT_MS || 15000);

//--------------------------------------------
//              CITY CONTROLLER               
//--------------------------------------------

async function getAllCities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/cities/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/cities/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateCity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/cities`;
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

// Create City (POST only)
async function createCity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/cities`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][cities] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL cities (truncate cities table on API)
async function deleteAllCities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/cities`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all cities:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//           COMMODITY CONTROLLER             
//--------------------------------------------

async function getAllCommodities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/commodities/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/commodities/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/commodities`;
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

// Create Commodity (POST only)
async function createCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/commodities`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][commodities] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL commodities
async function deleteAllCommodities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/commodities`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all commodities:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//       COMMODITY BY TERMINAL CONTROLLER             
//--------------------------------------------

async function getAllTerminalCommodities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalcommodities/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getTerminalCommodityById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/terminalcommodities/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateTerminalCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalcommodities`;
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

// Create Terminal Commodity (POST only)
async function createTerminalCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalcommodities`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][terminalcommodities] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL terminal commodities
async function deleteAllTerminalCommodities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalcommodities`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all terminal commodities:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//        COMMODITY SUMMARY CONTROLLER             
//--------------------------------------------

async function getAllSummarizedCommodities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/summarizedcommodities/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getSummarizedCommodityById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/summarizedcommodities/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateSummarizedCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/summarizedcommodities`;
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

// Create Summarized Commodity (POST only)
async function createSummarizedCommodity(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/summarizedcommodities`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][summarizedcommodities] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL summarized commodities
async function deleteAllSummarizedCommodities() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/summarizedcommodities`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all summarized commodities:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//          ITEM BY TERMINAL CONTROLLER             
//--------------------------------------------

async function getAllTerminalItems() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalitems/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getTerminalItemById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/terminalitems/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateTerminalItem(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalitems`;
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

// Create Terminal Item (POST only)
async function createTerminalItem(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalitems`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][terminalitems] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL terminal items
async function deleteAllTerminalItems() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalitems`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all terminal items:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//          ITEM SUMMARY CONTROLLER             
//--------------------------------------------

async function getAllSummarizedItems() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/sumarizeditems/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getSummarizedItemById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/sumarizeditems/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateSummarizedItem(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/sumarizeditems`;
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

// Create Summarized Item (POST only)
async function createSummarizedItem(data) {
    // Note: endpoint uses 'sumarizeditems' spelling per existing routes
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/sumarizeditems`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][sumarizeditems] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL summarized items
async function deleteAllSummarizedItems() {
    // Note: endpoint is intentionally 'sumarizeditems' per existing routes
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/sumarizeditems`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all summarized items:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//           OUTPOST CONTROLLER               
//--------------------------------------------

async function getAllOutposts() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/outposts/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/outposts/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateOutpost(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/outposts`;
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

// Create Outpost (POST only)
async function createOutpost(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/outposts`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][outposts] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL outposts
async function deleteAllOutposts() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/outposts`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all outposts:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//           PLANET CONTROLLER               
//--------------------------------------------

async function getAllPlanets() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/planets/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/planets/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdatePlanet(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/planets`;
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

// Create Planet (POST only)
async function createPlanet(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/planets`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][planets] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL planets
async function deleteAllPlanets() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/planets`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all planets:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//               MOON CONTROLLER               
//--------------------------------------------

async function getAllMoons() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/moons/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getMoonById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/moons/${id}`);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function createOrUpdateMoon(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/moons`;
    try {
        // Check if the entity exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing entity
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new entity if it does not exist
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

// Create Moon (POST only)
async function createMoon(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/moons`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][moons] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL moons
async function deleteAllMoons() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/moons`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all moons:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//         SPACE STATION CONTROLLER           
//--------------------------------------------

async function getAllSpaceStations() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/spacestations/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/spacestations/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateSpaceStation(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/spacestations`;
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

// Create Space Station (POST only)
async function createSpaceStation(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/spacestations`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][spacestations] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL space stations
async function deleteAllSpaceStations() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/spacestations`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all space stations:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//           STAR SYSTEM CONTROLLER           
//--------------------------------------------

async function getAllStarSystems() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/starsystems/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/starsystems/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateStarSystem(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/starsystems`;
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

// Create Star System (POST only)
async function createStarSystem(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/starsystems`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][starsystems] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL star systems
async function deleteAllStarSystems() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/starsystems`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all star systems:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//              SHIPS CONTROLLER           
//--------------------------------------------

async function getAllShips() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/ships/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/ships/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateShips(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/ships`;
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

// Create Ship (POST only)
async function createShips(data) { // keeping plural to match existing naming
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/ships`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][ships] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL ships
async function deleteAllShips() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/ships`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all ships:', error.response ? error.response.data : error.message);
        return false;
    }
}


//--------------------------------------------
//           TERMINAL CONTROLLER              
//--------------------------------------------

async function getAllTerminals() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminals/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/terminals/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateTerminal(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminals`;
    try {
        // Check if the terminal exists
        const existsRes = await axios.get(`${apiUrl}/${data.id}`, { timeout: REQ_TIMEOUT });
        console.log(`[UEX][terminals] exists id=${data?.id} status=${existsRes?.status}`);
        // Update the existing terminal
        const putRes = await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: REQ_TIMEOUT,
        });
        console.log(`[UEX][terminals] updated id=${data?.id} status=${putRes?.status}`);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`[UEX][terminals] not found id=${data?.id} -> creating`);
            try {
                const postRes = await axios.post(apiUrl, data, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: REQ_TIMEOUT,
                });
                console.log(`[UEX][terminals] created id=${data?.id} status=${postRes?.status}`);
            } catch (e) {
                console.error(`[UEX][terminals] create failed id=${data?.id} status=${e?.response?.status} msg=${e?.message}`);
                console.error(`[UEX][terminals] create body:`, safeStringify(e?.response?.data));
                throw e;
            }
        } else {
            console.error('[UEX][terminals] upsert error id=' + data?.id + ' status=' + (error?.response?.status) + ' msg=' + (error?.message));
            if (error?.response?.data) console.error('[UEX][terminals] error body:', safeStringify(error.response.data));
        }
    }
}

// Create Terminal (POST only)
async function createTerminal(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminals`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][terminals] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

function safeStringify(obj){ try{return JSON.stringify(obj).slice(0,5000);}catch{ try{return String(obj);}catch{return '[unserializable]';} } }

// Delete ALL terminals
async function deleteAllTerminals() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminals`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all terminals:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//           TERMINAL PRICES CONTROLLER       
//--------------------------------------------

async function getAllTerminalPrices() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalprices/`;
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
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/terminalprices/${id}`);
        return response.data;  // This now properly returns the response data to the caller
    } catch (error) {
        return null;  // Return null or throw an error, depending on how you want to handle errors
    }
}

async function createOrUpdateTerminalPrices(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalprices`;
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

// Create Terminal Prices (POST only)
async function createTerminalPrices(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalprices`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][terminalprices] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL terminal prices
async function deleteAllTerminalPrices() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/terminalprices`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all terminal prices:', error.response ? error.response.data : error.message);
        return false;
    }
}

//--------------------------------------------
//          REFINERY YIELDS CONTROLLER        
//--------------------------------------------

async function getAllRefineryYields() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/refineryyields/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error('Error fetching entity:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getRefineryYieldById(id){
    const apiUrl = process.env.SERVER_URL;
    try {
        const response = await axios.get(`${apiUrl}${process.env.API_EXP_GER}/refineryyields/${id}`);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function createOrUpdateRefineryYield(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/refineryyields`;
    try {
        // Check if the entity exists
        await axios.get(`${apiUrl}/${data.id}`);
        // Update the existing entity
        await axios.put(`${apiUrl}/${data.id}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Create a new entity if it does not exist
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

// Create Refinery Yield (POST only)
async function createRefineryYield(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/refineryyields`;
    try {
        await axios.post(apiUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQ_TIMEOUT,
        });
        return true;
    } catch (error) {
        console.error('[UEX][refineryyields] create failed:', error?.response?.data || error?.message);
        return false;
    }
}

// Delete ALL refinery yields
async function deleteAllRefineryYields() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EXP_GER}/refineryyields`;
    try {
        await axios.delete(apiUrl);
        return true;
    } catch (error) {
        console.error('Error deleting all refinery yields:', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    getAllCities,
    getCityById,
    createOrUpdateCity,
    createCity,
    deleteAllCities,
    getAllCommodities,
    getCommodityById,
    createOrUpdateCommodity,
    createCommodity,
    deleteAllCommodities,
    getAllOutposts,
    getOutpostById,
    createOrUpdateOutpost,
    createOutpost,
    deleteAllOutposts,
    getAllPlanets,
    getPlanetById,
    createOrUpdatePlanet,
    createPlanet,
    deleteAllPlanets,
    getAllSpaceStations,
    getSpaceStationsById,
    createOrUpdateSpaceStation,
    createSpaceStation,
    deleteAllSpaceStations,
    getAllStarSystems,
    getStarSystemById,
    createOrUpdateStarSystem,
    createStarSystem,
    deleteAllStarSystems,
    getAllTerminals,
    getTerminalById,
    createOrUpdateTerminal,
    createTerminal,
    deleteAllTerminals,
    getAllTerminalPrices,
    getTerminalPricesById,
    createOrUpdateTerminalPrices,
    createTerminalPrices,
    deleteAllTerminalPrices,
    getAllShips,
    getShipsById,
    createOrUpdateShips,
    createShips,
    deleteAllShips,
    getAllTerminalCommodities,
    getTerminalCommodityById,
    createOrUpdateTerminalCommodity,
    createTerminalCommodity,
    deleteAllTerminalCommodities,
    getAllSummarizedCommodities,
    getSummarizedCommodityById,
    createOrUpdateSummarizedCommodity,
    createSummarizedCommodity,
    deleteAllSummarizedCommodities,
    getAllTerminalItems,
    getTerminalItemById,
    createOrUpdateTerminalItem,
    createTerminalItem,
    deleteAllTerminalItems,
    getAllSummarizedItems,
    getSummarizedItemById,
    createOrUpdateSummarizedItem,
    createSummarizedItem,
    deleteAllSummarizedItems,
    // Moons
    getAllMoons,
    getMoonById,
    createOrUpdateMoon,
    createMoon,
    deleteAllMoons,
    // Refinery Yields
    getAllRefineryYields,
    getRefineryYieldById,
    createOrUpdateRefineryYield,
    createRefineryYield,
    deleteAllRefineryYields,
};
