async function getTopTerminalTransactions(terminalPrices){
    let reconstructedTerminalUsageList = [];
    for (const packet of terminalPrices) {
        for (const terminal of packet.data) {
            let locationDirect = terminal.outpost_name ? terminal.outpost_name :
                terminal.city_name ? terminal.city_name :
                terminal.space_station_name ? terminal.space_station_name : "";
            let locationHigher = terminal.moon_name ? terminal.moon_name :
                terminal.planet_name ? terminal.planet_name : "";
            let terminalArray = reconstructedTerminalUsageList.find(item => (
                item.location_direct === terminal.outpost_name || 
                item.location_direct === terminal.city_name ||
                item.location_direct === terminal.space_station_name
            ));
            if (terminalArray) {    
                // Assuming totalSells and totalBuys are integers and scu_sell_users_rows, scu_buy_users_rows are also integers.
                terminalArray.totalTransactions += (parseInt(terminal.scu_sell_users_rows) + parseInt(terminal.scu_buy_users_rows)),
                terminalArray.totalSells += parseInt(terminal.scu_sell_users_rows);
                terminalArray.totalBuys += parseInt(terminal.scu_buy_users_rows);
                terminalArray.commodities.push({
                    commodity_name: terminal.commodity_name,
                    commodity_code: terminal.commodity_code,
                    total_transactions: (parseInt(terminal.scu_sell_users_rows) + parseInt(terminal.scu_buy_users_rows)),
                    scu_sell_users_rows: terminal.scu_sell_users_rows,
                    scu_buy_users_rows: terminal.scu_buy_users_rows
                });
            } else {
                // Properly push a new object into the array
                reconstructedTerminalUsageList.push({
                    terminal_code: terminal.terminal_code,
                    terminal_name: terminal.terminal_name,
                    star_system_name: terminal.star_system_name,
                    location_direct: locationDirect,
                    location_parent: locationHigher,
                    totalTransactions: parseInt(terminal.scu_sell_users_rows) + parseInt(terminal.scu_buy_users_rows),
                    totalSells: parseInt(terminal.scu_sell_users_rows),
                    totalBuys: parseInt(terminal.scu_buy_users_rows),
                    commodities: terminal.commodity_name ? [{
                        commodity_name: terminal.commodity_name,
                        commodity_code: terminal.commodity_code,
                        total_transactions: (parseInt(terminal.scu_sell_users_rows) + parseInt(terminal.scu_buy_users_rows)),
                        scu_sell_users_rows: terminal.scu_sell_users_rows,
                        scu_buy_users_rows: terminal.scu_buy_users_rows,
                    }] : [] // Initialize commodities as empty array if no commodity data present
                });
            }
        }
    }

    //split out Stanton and Pyro systems and organize by best buyers and sellers
    let unorganizatedStantonArray = structuredClone(reconstructedTerminalUsageList.filter(terminal => terminal.star_system_name === "Stanton"));
    let stantonTopTransactions = unorganizatedStantonArray.sort((a, b) => b.totalTransactions - a.totalTransactions).slice(0, 10);
    let unorganizedPyroArray = structuredClone(reconstructedTerminalUsageList.filter(terminal => terminal.star_system_name === "Pyro"));
    let pyroTopTransactions = unorganizedPyroArray.sort((a, b) => b.totalTransactions - a.totalTransactions).slice(0, 10);
    let allTopTransactions = structuredClone(reconstructedTerminalUsageList.sort((a, b) => b.totalTransactions - a.totalTransactions).slice(0, 10));

    //sort the commodities in each terminal by the top selling 5
    stantonTopTransactions.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.total_transactions - a.total_transactions);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    pyroTopTransactions.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.total_transactions - a.total_transactions);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    allTopTransactions.forEach(terminal => {
        terminal.commodities.sort((a, b) => b.total_transactions - a.total_transactions);
        terminal.commodities = terminal.commodities.slice(0, 5);
    });
    return {
        stantonTopTransactions,
        pyroTopTransactions,
        allTopTransactions
    }
}

module.exports = {
    getTopTerminalTransactions
};