const axios = require('axios');


// GET all schedules
async function getAllSchedules() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    try {
        const response = await axios.get(`${apiUrl}/`);
        return response.data;
    } catch (error) {
        console.error('Error fetching all schedules:', error.response ? error.response.data : error.message);
        return [];
    }
}

// GET all active schedules
async function getActiveSchedules() {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    try {
        const response = await axios.get(`${apiUrl}/active`);
        return response.data;
    } catch (error) {
        console.error('Error fetching active schedules:', error.response ? error.response.data : error.message);
        return [];
    }
}

// GET weekly schedules (expects startDate and endDate as query params)
async function getWeekSchedules(startDate, endDate) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    if (!startDate || !endDate) {
        throw new Error('Both startDate and endDate are required.');
    }
    try {
        const response = await axios.get(`${apiUrl}/weekly`, {
            params: { startDate, endDate }
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) return [];
        console.error('Error fetching weekly schedules:', error.response ? error.response.data : error.message);
        return [];
    }
}

// GET schedule by ID
async function getScheduleById(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    if (!id) throw new Error('Schedule ID is required.');
    try {
        const response = await axios.get(`${apiUrl}/${id}`);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) return null;
        console.error('Error fetching schedule by ID:', error.response ? error.response.data : error.message);
        return null;
    }
}

// GET schedules by user ID (expects user_id as query param)
async function getSchedulesByUserId(user_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    if (!user_id) throw new Error('user_id is required.');
    try {
        const response = await axios.get(`${apiUrl}/user`, {
            params: { user_id }
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) return [];
        console.error('Error fetching schedules by user ID:', error.response ? error.response.data : error.message);
        return [];
    }
}

// POST create a new schedule (single or array)
async function createSchedule(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    try {
        const response = await axios.post(`${apiUrl}/`, data, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating schedule:', error.response ? error.response.data : error.message);
        return null;
    }
}

// POST create repeated schedules
async function createScheduleRepeatUntil(data) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    try {
        const response = await axios.post(`${apiUrl}/repeat`, data, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating repeated schedules:', error.response ? error.response.data : error.message);
        return null;
    }
}

// PUT update a schedule by ID
async function updateSchedule(id, data, notify) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    if (!id) throw new Error('Schedule ID is required.');
    try {
        // Merge notify into the body as required by the controller
        const body = { ...data, notify };
        const response = await axios.put(`${apiUrl}/${id}`, body, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) return null;
        console.error('Error updating schedule:', error.response ? error.response.data : error.message);
        return null;
    }
}

// DELETE a schedule by ID
async function deleteSchedule(id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    if (!id) throw new Error('Schedule ID is required.');
    try {
        await axios.delete(`${apiUrl}/${id}`, {
            headers: { 'Content-Type': 'application/json' }
        });
        return true;
    } catch (error) {
        if (error.response && error.response.status === 404) return false;
        console.error('Error deleting schedule:', error.response ? error.response.data : error.message);
        return false;
    }
}

// GET the next schedule in a repeat series after the given schedule
async function getNextScheduleByRepeatSeries(schedule_id) {
    const apiUrl = `${process.env.SERVER_URL}${process.env.API_EVENTS}`;
    if (!schedule_id) throw new Error('Schedule ID is required.');
    try {
        const response = await axios.get(`${apiUrl}/repeatseries/${schedule_id}/next`);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) return null;
        console.error('Error fetching next schedule by repeat_series:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    getAllSchedules,
    getActiveSchedules,
    getWeekSchedules,
    getScheduleById,
    getSchedulesByUserId,
    createSchedule,
    createScheduleRepeatUntil,
    updateSchedule,
    deleteSchedule,
    getNextScheduleByRepeatSeries
};
