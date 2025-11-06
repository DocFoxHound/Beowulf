// Simple CLI test for combinedProfitSuggestion
// Usage:
//   node chatgpt/test-profit-suggestion.js "quantanium"
//   node chatgpt/test-profit-suggestion.js "quantanium" "Stanton"
//   node chatgpt/test-profit-suggestion.js "quantanium" "Stanton" 320   # include quantity (SCU)

const { combinedProfitSuggestion, primeMarketCache } = require('./market-answerer');

async function main() {
  const name = process.argv[2] || 'quantanium';
  const system = process.argv[3] || null;
  const quantity = process.argv[4] ? Number(process.argv[4]) : null;
  try {
    await primeMarketCache({ force: false });
  const ans = await combinedProfitSuggestion({ name, system, quantity });
    console.log(ans.text);
  } catch (e) {
    console.error('Profit suggestion test failed:', e?.message || e);
    process.exitCode = 1;
  }
}

main();