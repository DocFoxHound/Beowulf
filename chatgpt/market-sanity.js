// Quick manual sanity check for market answerers
// Usage: node chatgpt/market-sanity.js

(async () => {
  const { primeMarketCache, bestBuyLocations, bestSellLocations, spotFor, bestProfitRoutes, bestOverallProfitRoute, mostActiveTerminals, mostMovement } = require('./market-answerer');

  await primeMarketCache({ force: false });

  const samples = [
    () => bestBuyLocations({ name: 'Laranite', top: 3 }),
    () => bestSellLocations({ name: 'Laranite', top: 3, location: 'Stanton', areaType: 'station' }),
    () => spotFor({ name: 'Agricium', top: 4, location: 'Hurston' }),
    () => bestProfitRoutes({ name: 'Medical Supplies', top: 3, location: 'Stanton', areaType: 'outpost' }),
    () => bestOverallProfitRoute({ top: 3, location: 'Pyro' }),
    () => mostActiveTerminals({ top: 5, location: 'Stanton' }),
    () => mostMovement({ scope: 'commodity', top: 5 }),
  ];

  for (const run of samples) {
    try {
      const res = await run();
      console.log('\n---');
      console.log(res.text || res);
    } catch (e) {
      console.error('Sample failed:', e?.message || e);
    }
  }
})();
