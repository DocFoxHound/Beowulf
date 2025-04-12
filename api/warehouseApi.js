const axios = require('axios');
const logger = require('../logger');

async function createWarehouse(WarehouseData) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse`;
    try {
        const response = await axios.post(apiUrl, WarehouseData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;  // Return the created Warehouse data
    } catch (error) {
        console.error('Error creating Warehouse:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getAllWarehouses() {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/`;
    try {
        const response = await axios.get(apiUrl);
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching all Warehouses:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getWarehousesByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/user`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: user_id
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user Warehouses by Player ID:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getWarehouseByEntryId(id) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/entry`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                id: id
            }
        });
        // Ensure the function returns a single object
        const data = response.data;
        if (Array.isArray(data)) {
            return data[0] || null; // Return the first object or null if the array is empty
        }
        return data; // Return the object directly if it's not an array
    } catch (error) {
        console.error('Error fetching Warehouse by entry ID:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getWarehousesByCommodity(commodity_name) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/commodity`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                commodity_name: commodity_name
            }
        });
        // Ensure the function returns a single object
        const data = response.data;
        // if (Array.isArray(data)) {
        //     return data[0] || null; // Return the first object or null if the array is empty
        // }
        return data; // Return the object directly if it's not an array
    } catch (error) {
        console.error('Error fetching Warehouse by commodity:', error.response ? error.response.data : error.message);
        return null; // Return null if there's an error
    }
}

async function getWarehousesByPatch(patch) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/patch`;
    console.log("Patch: ", patch)
    try {
        const response = await axios.get(apiUrl, {
            params: {
                patch: patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user Warehouses by Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getWarehousesByUserAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/userandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user Warehouses by Owner ID and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getWarehousesByUserAndCommodity(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/userandcommodity`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                commodity_name: coupling.commodity_name
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user Warehouses by Owner ID and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

async function getWarehousesByCommodityAndPatch(coupling) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/commodityandpatch`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                user_id: coupling.user_id,
                patch: coupling.patch
            }
        });
        return response.data;  // This will be the return value of the function
    } catch (error) {
        console.error('Error fetching user Warehouses by Owner ID and Patch:', error.response ? error.response.data : error.message);
        return null;  // Return null if there's an error
    }
}

//this isn't setup for editing yet, but is just a copy of editUser
async function editWarehouse(WarehouseId, updatedWarehouseData) {
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/${WarehouseId}`; // Assuming this is the correct endpoint
    try {
        const response = await axios.put(apiUrl, updatedWarehouseData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating Warehouse: ', error.response ? error.response.data : error.message);
        return false;
    }
}

async function deleteWarehouse(id) {
    console.log("Deleting Warehouse")
    const apiUrl = `${process.env.SERVER_URL}/api/warehouse/${id}`; 
    try {
        const response = await axios.delete(apiUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error deleting Warehouse: ', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    createWarehouse,
    getAllWarehouses,
    editWarehouse,
    deleteWarehouse,
    getWarehousesByPatch,
    getWarehousesByUserAndPatch,
    getWarehouseByEntryId,
    getWarehousesByUserId,
    getWarehousesByCommodity,
    getWarehousesByCommodityAndPatch,
    getWarehousesByUserAndCommodity
};
