// Quick manual test for 'best sell' fallback logic without full Discord runtime.
// Run with:
//   node chatgpt/test-sell-fallback.js "quantanium"
//   node chatgpt/test-sell-fallback.js "quantanium" "Stanton"  # system-scoped

const { bestSellLocations, bestSellLocationsInSystem, primeMarketCache } = require('./market-answerer');

async function main() {
  const name = process.argv[2] || 'quantanium';
  const system = process.argv[3] || null;
  try {
    await primeMarketCache({ force: false });
    const ans = system
      ? await bestSellLocationsInSystem({ name, system, top: 5 })
      : await bestSellLocations({ name, top: 5 });
    console.log(ans.text);
  } catch (e) {
    console.error('Test failed:', e?.message || e);
    process.exitCode = 1;
  }
}

main();
