const axios = require('axios');
const UEX = require('../api/uexApi');

let marketplaceArray = []; // Declare marketplaceArray outside the function to persist data

async function processUEXData(whichTable){
    console.log(`Updating UEX ${whichTable} Items`)
    let apiUrls = [];
    let apiCallCounter = 0;
    let allTerminals;
    let totalTerminals = 0;
    const DEBUG = (process.env.UEX_DEBUG_LOG || 'false').toLowerCase() === 'true';
    const apiKey = `?api_key=${encodeURIComponent(process.env.UEX_CORP_API_TOKEN)}`
    if(whichTable === "all"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/marketplace_listings${apiKey}}`, title: "marketplace", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices_all${apiKey}`, title: "commodities_by_terminal", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/items_prices_all${apiKey}`, title: "items_by_terminal", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices?id_terminal=`, title: "terminal_prices", iterate: true}); //this needs to be iterated
        apiUrls.push({url: `https://api.uexcorp.space/2.0/vehicles_prices${apiKey}`, title: "ships", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/game_versions${apiKey}`, title: "game_version", iterate: false});
    }else if(whichTable === "cities"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
    }else if(whichTable === "commodities"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/marketplace_listings${apiKey}}`, title: "marketplace", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
    }else if(whichTable === "commodities_by_terminal"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/marketplace_listings${apiKey}`, title: "marketplace", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices_all${apiKey}`, title: "commodities_by_terminal", iterate: false});
    }else if(whichTable === "items_by_terminal"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/marketplace_listings${apiKey}`, title: "marketplace", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/items_prices_all${apiKey}`, title: "items_by_terminal", iterate: false});
    }else if(whichTable === "outposts"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
    }else if(whichTable === "planets"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
    }else if(whichTable === "space_stations"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
    }else if(whichTable === "star_systems"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
    }else if(whichTable === "ships"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/vehicles_prices${apiKey}`, title: "ships", iterate: false});
    }else if(whichTable === "game_version"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/game_versions${apiKey}`, title: "game_version", iterate: false});
    }else if(whichTable === "terminals"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
    }else if(whichTable === "terminal_prices"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/marketplace_listings${apiKey}`, title: "marketplace", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities${apiKey}`, title: "commodities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/terminals${apiKey}`, title: "terminals", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/commodities_prices?id_terminal=`, title: "terminal_prices", iterate: true});
    }else if(whichTable === "other_tables"){
        apiUrls.push({url: `https://api.uexcorp.space/2.0/cities${apiKey}`, title: "cities", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/outposts${apiKey}`, title: "outposts", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/planets`, title: "planets", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/space_stations${apiKey}`, title: "space_stations", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/star_systems${apiKey}`, title: "star_systems", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.space/2.0/moons${apiKey}`, title: "moons", iterate: false});
        apiUrls.push({url: `https://api.uexcorp.uk/2.0/refineries_yields${apiKey}`, title: "refineries_yields", iterate: false}); 
    }
    // Defer deletions: we'll clear tables right before inserting the freshly fetched data for each category

    for (const api of apiUrls) {
        if(api.iterate === false && api.title !== "ships" && api.title !== "vehicles"){
            await delay(2000); // Wait for 2 seconds to abide rate limits
            try {
                const response = await axios.get(api.url, {
                    headers: {
                        Authorization: `Bearer ${process.env.UEX_CORP_API_TOKEN}`
                    }
                });
                const data = response.data;
                if (DEBUG) {
                    const count = Array.isArray(data?.data) ? data.data.length : (Array.isArray(data) ? data.length : 'n/a');
                    console.log(`[UEX][fetch] ${api.title} GET ok url=${api.url} status=${response.status} count=${count}`);
                }
                if (api.title === "terminals") {
                    allTerminals = data || UEX.getAllTerminals();
                    if (DEBUG) {
                        const tcount = Array.isArray(allTerminals?.data) ? allTerminals.data.length : 'n/a';
                        console.log(`[UEX][fetch] terminals list captured count=${tcount}`);
                    }
                }
                // Clear only the specific tables for this category right before loading
                await clearTablesForTitle(api.title);
                await sendToDb(api.title, data);
            } catch (error) {
                const status = error?.response?.status;
                const body = safeStringify(error?.response?.data);
                console.error(`[UEX][fetch][error] title=${api.title} url=${api.url} status=${status} msg=${error?.message}`);
                if (DEBUG) console.error(`[UEX][fetch][error][body]`, body);
            }
        }else if(api.title === "ships"){
            try{
                const ships = await axios.get(api.url);
                const vehicles = await axios.get(`https://api.uexcorp.space/2.0/vehicles${apiKey}`);
                const data = {ships: ships.data, vehicles: vehicles.data};
                if (DEBUG) {
                    const scount = Array.isArray(ships?.data?.data) ? ships.data.data.length : 'n/a';
                    const vcount = Array.isArray(vehicles?.data?.data) ? vehicles.data.data.length : 'n/a';
                    console.log(`[UEX][fetch] ships ok status=${ships.status} vehicles ok status=${vehicles.status} ships=${scount} vehicles=${vcount}`);
                }
                await clearTablesForTitle(api.title);
                await sendToDb(api.title, data);
            }catch(error){
                const status = error?.response?.status;
                const body = safeStringify(error?.response?.data);
                console.error(`[UEX][fetch][error] title=${api.title} url=${api.url} status=${status} msg=${error?.message}`)
                if (DEBUG) console.error(`[UEX][fetch][error][body]`, body);
            }
            


            
        }else if (api.title === "terminal_prices"){
            totalTerminals = allTerminals.data.length;
            let individualTerminalData = [];
            const totalCount = allTerminals.data.length;
            let processed = 0;
            let successCount = 0;
            let failCount = 0;
            console.log(`[UEX][terminal_prices] starting per-terminal fetch: total=${totalCount}`);
            // Iterate through allTerminals.data and get an API call (only 60 every minute)
            for(const terminal of allTerminals.data){
                totalTerminals--;
                const time = new Date();
                await delay(1050); // Wait for ~1 second, since we can only do 60 calls in 60 seconds
                try {
                    const url = `${api.url}${terminal.id}${apiKey}`;
                    const response = await axios.get(url);
                    const data = response.data;
                    if (DEBUG) {
                        const count = Array.isArray(data?.data) ? data.data.length : 'n/a';
                        console.log(`[UEX][fetch] terminal_prices GET ok terminal=${terminal.id} status=${response.status} count=${count}`);
                    }
                    individualTerminalData.push(data);
                    successCount++;
                } catch (error) {
                    const status = error?.response?.status;
                    const body = safeStringify(error?.response?.data);
                    console.error(`[UEX][fetch][error] title=terminal_prices terminal=${terminal?.id} status=${status} msg=${error?.message}`);
                    if (DEBUG) console.error(`[UEX][fetch][error][body]`, body);
                    failCount++;
                }
                processed++;
                if (processed % 20 === 0 || processed === totalCount) {
                    console.log(`[UEX][terminal_prices] progress: ${processed}/${totalCount} done, ${totalCount - processed} left (ok=${successCount}, fail=${failCount})`);
                }
            }
            console.log(`[UEX][terminal_prices] completed: ok=${successCount}, fail=${failCount}`);
            await clearTablesForTitle(api.title);
            await sendToDb(api.title, individualTerminalData);  
        }
    }
    console.log(`Finished processUEXData`)
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendToDb(title, data) {
    try {
        const dataArray = Array.isArray(data) ? data : [data];
        for (const item of dataArray) {
            if (item.data && Array.isArray(item.data)) {
                switch (title) {
                    case "cities":
                        for (const d of item.data) {
                            await UEX.createCity(d);
                        }
                        break;
                    case "moons":
                        for (const d of item.data) {
                            await UEX.createMoon(d);
                        }
                        break;
                    case "marketplace":
                        marketplaceArray = item.data; // Populate marketplaceArray
                        break;
                    case "commodities":
                        // console.log("Marketplace Array:", marketplaceArray); // Verify marketplaceArray is populated
                        for (const d of item.data) {
                            const summaryCommodity = {
                                id: d.id,
                                commodity_name: d.name,
                                price_buy_avg: d.price_buy,
                                price_sell_avg: d.price_sell,
                            };
                            if (d.price_buy === 0 && d.price_sell === 0) {
                                let sumItems = 0;
                                let sumPrice = 0;
                                let averageSoFar = 0;
                                let averageLow = 0;
                                let averageHigh = 0;
                                marketplaceArray.forEach((item) => {
                                    if (item.title.toLowerCase().includes(d.name.toLowerCase()) || item.description.toLowerCase().includes(d.name.toLowerCase())) {
                                        averageSoFar = sumPrice / sumItems;
                                        averageLow = 0.1 * averageSoFar;
                                        averageHigh = 5 * averageSoFar;
                                        if(sumItems === 0){
                                            sumItems++;
                                            sumPrice += item.price;
                                        }
                                        if (item.price > averageLow && item.price < averageHigh) {
                                            sumItems++;
                                            sumPrice += item.price;
                                        }
                                    }
                                });

                                const avgPrice = sumPrice / sumItems;
                                summaryCommodity.price_buy_avg = avgPrice;
                                summaryCommodity.price_sell_avg = avgPrice;
                            }
                            await UEX.createSummarizedCommodity(summaryCommodity);
                            await UEX.createCommodity(d);
                        }
                        break;
                    case "commodities_by_terminal":
                        for (const d of item.data) {
                            let totalBuy = 0;
                            let totalSell = 0;
                            let buyDivide = 0;
                            let sellDivide = 0;
                            for (const e of item.data) {
                                if (d.id === e.id && e.price_buy !== 0) {
                                    totalBuy += e.price_buy;
                                    buyDivide++;
                                }
                                if (d.id === e.id && e.price_sell !== 0) {
                                    totalSell += e.price_sell;
                                    sellDivide++;
                                }
                            }
                            let avgBuy = totalBuy / buyDivide;
                            let avgSell = totalSell / sellDivide;

                            if (d.price_buy === 0 && d.price_sell === 0) {
                                sumItems = 0;
                                sumPrice = 0;
                                for (const e of marketplaceArray) {
                                    if (e.title.toLowerCase().includes(d.name.toLowerCase())) {
                                        sumItems++;
                                        sumPrice += e.price;
                                    }
                                }
                                const avgPrice = sumPrice / sumItems;
                                avgBuy = avgPrice;
                                avgSell = avgPrice;
                            }
                            const terminalCommodity = {
                                id: d.id,
                                id_commodity: d.id_commodity,
                                price_buy: d.price_buy,
                                price_buy_avg: d.price_buy_avg,
                                price_sell: d.price_sell,
                                price_sell_avg: d.price_sell_avg,
                                scu_buy: d.scu_buy,
                                scu_buy_avg: d.scu_buy_avg,
                                scu_sell_stock: d.scu_sell_stock,
                                scu_sell_stock_avg: d.scu_sell_stock_avg,
                                scu_sell: d.scu_sell,
                                scu_sell_avg: d.scu_sell_avg,
                                status_buy: d.status_buy,
                                status_sell: d.status_sell,
                                commodity_name: d.commodity_name,
                                terminal_name: d.terminal_name,
                                id_terminal: d.id_terminal
                            };
                            const summaryCommodity = {
                                id: d.id_commodity,
                                commodity_name: d.commodity_name,
                                price_buy_avg: avgBuy || 0,
                                price_sell_avg: avgSell || 0
                            };
                            await UEX.createTerminalCommodity(terminalCommodity);
                            await UEX.createSummarizedCommodity(summaryCommodity);
                        }
                        break;
                    case "items_by_terminal":
                        for (const d of item.data) {
                            let totalBuy = 0;
                            let totalSell = 0;
                            let buyDivide = 0;
                            let sellDivide = 0;
                            for (const e of item.data) {
                                if (d.id === e.id && e.price_buy !== 0) {
                                    totalBuy += e.price_buy;
                                    buyDivide++;
                                }
                                if (d.id === e.id && e.price_sell !== 0) {
                                    totalSell += e.price_sell;
                                    sellDivide++;
                                }
                            }
                            let avgBuy = totalBuy / buyDivide;
                            let avgSell = totalSell / sellDivide;

                            if (d.price_buy === 0 && d.price_sell === 0) {
                                sumItems = 0;
                                sumPrice = 0;
                                for (const e of marketplaceArray) {
                                    if (e.title.toLowerCase().includes(d.name.toLowerCase())) {
                                        sumItems++;
                                        sumPrice += e.price;
                                    }
                                }
                                const avgPrice = sumPrice / sumItems;
                                avgBuy = avgPrice;
                                avgSell = avgPrice;
                            }

                            const terminalItem = {
                                id: d.id,
                                id_item: d.id_item,
                                id_terminal: d.id_terminal,
                                price_buy: d.price_buy,
                                price_sell: d.price_sell,
                                item_name: d.item_name,
                                terminal_name: d.terminal_name,
                            };
                            const summaryItem = {
                                id: d.id_item,
                                commodity_name: d.item_name,
                                price_buy_avg: avgBuy || 0,
                                price_sell_avg: avgSell || 0
                            };
                            await UEX.createTerminalItem(terminalItem);
                            await UEX.createSummarizedItem(summaryItem);
                        }
                        break;
                    case "outposts":
                        for (const d of item.data) {
                            await UEX.createOutpost(d);
                        }
                        break;
                    case "planets":
                        for (const d of item.data) {
                            await UEX.createPlanet(d);
                        }
                        break;
                    case "space_stations":
                        for (const d of item.data) {
                            await UEX.createSpaceStation(d);
                        }
                        break;
                    case "star_systems":
                        for (const d of item.data) {
                            await UEX.createStarSystem(d);
                        }
                        break;
                    case "terminals":
                        for (const d of item.data) {
                            try {
                                await UEX.createTerminal(d);
                            } catch (e) {
                                const status = e?.response?.status;
                                const body = safeStringify(e?.response?.data);
                                console.error(`[UEX][db][error] terminals upsert failed id=${d?.id} name=${d?.name} status=${status} msg=${e?.message}`);
                                console.error(`[UEX][db][error][payload]`, safeStringify(d));
                                console.error(`[UEX][db][error][body]`, body);
                            }
                        }
                        break;
                    case "terminal_prices":
                        for (const d of item.data) {
                            try {
                                await UEX.createTerminalPrices(d);
                            } catch (e) {
                                const status = e?.response?.status;
                                const body = safeStringify(e?.response?.data);
                                console.error(`[UEX][db][error] terminal_prices upsert failed terminal=${d?.id_terminal} id=${d?.id} status=${status} msg=${e?.message}`);
                                console.error(`[UEX][db][error][payload]`, safeStringify(d));
                                console.error(`[UEX][db][error][body]`, body);
                            }
                        }
                        break;
                    case "refineries_yields":
                        for (const d of item.data) {
                            await UEX.createRefineryYield(d);
                        }
                        break;
                }
            }
        }
    } catch (error) {
        const status = error?.response?.status;
        const body = safeStringify(error?.response?.data);
        console.error(`[UEX][db][error] sendToDb fatal title=${title} status=${status} msg=${error?.message}`);
        console.error(`[UEX][db][error][body]`, body);
        return;
    }
}

module.exports = {
    processUEXData
};

// Clear tables for a single category label right before loading that category
async function clearTablesForTitle(label){
    try{
        switch(label){
            case 'terminal_prices':
                await UEX.deleteAllTerminalPrices();
                break;
            case 'commodities_by_terminal':
                await UEX.deleteAllTerminalCommodities();
                await UEX.deleteAllSummarizedCommodities();
                break;
            case 'items_by_terminal':
                await UEX.deleteAllTerminalItems();
                await UEX.deleteAllSummarizedItems();
                break;
            case 'commodities':
                await UEX.deleteAllCommodities();
                await UEX.deleteAllSummarizedCommodities();
                break;
            case 'terminals':
                await UEX.deleteAllTerminals();
                break;
            case 'cities':
                await UEX.deleteAllCities();
                break;
            case 'outposts':
                await UEX.deleteAllOutposts();
                break;
            case 'planets':
                await UEX.deleteAllPlanets();
                break;
            case 'space_stations':
                await UEX.deleteAllSpaceStations();
                break;
            case 'star_systems':
                await UEX.deleteAllStarSystems();
                break;
            case 'moons':
                await UEX.deleteAllMoons();
                break;
            case 'refineries_yields':
                await UEX.deleteAllRefineryYields();
                break;
            case 'ships':
                await UEX.deleteAllShips();
                break;
            default:
                // marketplace, game_version, or any non-persisted
                break;
        }
        console.log(`[UEX] Cleared data for: ${label}`);
    }catch(e){
        console.error(`[UEX] Failed to delete for ${label}:`, e?.response?.data || e?.message || e);
    }
}

// Helper: clear tables for each category included in this run BEFORE inserting new data
async function clearTablesForPlannedRun(titles){
    try{
        const titleSet = new Set(titles);
        // Wipe in a sensible order (children/summaries first), only if that category is part of the run
        const runDelete = async (label, fns) => {
            if (!titleSet.has(label)) return;
            const farr = Array.isArray(fns) ? fns : [fns];
            for (const fn of farr) {
                if (typeof fn !== 'function') continue;
                try { await fn(); } catch (e) { console.error(`[UEX] Failed to delete for ${label}:`, e?.response?.data || e?.message || e); }
            }
            console.log(`[UEX] Cleared data for: ${label}`);
        };

        await runDelete('terminal_prices', UEX.deleteAllTerminalPrices);
        await runDelete('commodities_by_terminal', [UEX.deleteAllTerminalCommodities, UEX.deleteAllSummarizedCommodities]);
        await runDelete('items_by_terminal', [UEX.deleteAllTerminalItems, UEX.deleteAllSummarizedItems]);
        await runDelete('commodities', [UEX.deleteAllCommodities, UEX.deleteAllSummarizedCommodities]);
        await runDelete('terminals', UEX.deleteAllTerminals);
        await runDelete('cities', UEX.deleteAllCities);
        await runDelete('outposts', UEX.deleteAllOutposts);
        await runDelete('planets', UEX.deleteAllPlanets);
        await runDelete('space_stations', UEX.deleteAllSpaceStations);
        await runDelete('star_systems', UEX.deleteAllStarSystems);
        await runDelete('moons', UEX.deleteAllMoons);
        await runDelete('refineries_yields', UEX.deleteAllRefineryYields);
        await runDelete('ships', UEX.deleteAllShips);
        // Skip marketplace/game_version as they aren't persisted here
    }catch(e){
        console.error('[UEX] Failed to clear tables for planned run:', e?.message || e);
    }
}

// Safe stringify utility for logging
function safeStringify(obj) {
    try {
        if (obj === undefined) return 'undefined';
        return JSON.stringify(obj).slice(0, 5000);
    } catch {
        try { return String(obj); } catch { return '[unserializable]'; }
    }
}