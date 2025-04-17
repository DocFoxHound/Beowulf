// utils/chartGenerator.js
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');

const width = 600;
const height = 300;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

async function generateSingleLeaderboardChart(data, label = 'Leaderboard') {
    const labels = data.map(([username]) => username);
    const values = data.map(([_, stats]) => stats.total_cut_value || 0);

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                backgroundColor: 'rgba(255, 99, 132, 0.6)'
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { ticks: { color: 'white' } },
                y: { ticks: { color: 'white' } }
            }
        }
    };

    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config);
    const filePath = path.join(__dirname, `chart-${Date.now()}.png`);
    fs.writeFileSync(filePath, imageBuffer);
    return { buffer: imageBuffer, filePath };
}

async function generateLeaderboardChart(data, valuesKey, filename) {
    const labels = data.map(([username]) => username);
    const values = data.map(([_, stats]) => stats[valuesKey] || 0);

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: filename,
                data: values,
                backgroundColor: '#ffffff'
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { ticks: { color: 'white' } },
                y: { ticks: { color: 'white' } }
            }
        }
    };

    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config);
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, imageBuffer);
    return { buffer: imageBuffer, filePath };
}

module.exports = { generateSingleLeaderboardChart, generateLeaderboardChart };