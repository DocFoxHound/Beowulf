// Quick inspection tool to verify cache data for commodities/items and specific locations
// Usage: node chatgpt/market-inspect.js [pattern]

const { maybeLoadOnce, refreshFromDb, getCache, whereItemAvailable } = require('./data-cache');

function fmt(n) { const x = Number(n); return isFinite(x) ? Math.round(x).toLocaleString() : String(n); }

async function ensure() {
  await maybeLoadOnce();
  try { await refreshFromDb(); } catch {}
}

function findLike(arr, field, pat) {
  const p = String(pat || '').toLowerCase();
  return (arr || []).filter(r => String(r[field] || '').toLowerCase().includes(p));
}

async function main() {
  const pattern = process.argv.slice(2).join(' ') || 'stor';
  await ensure();
  const d = getCache();

  console.log(`\n=== Searching for pattern: "${pattern}" ===`);
  const itemsBt = findLike(d.itemsByTerminal, 'item_name', pattern);
  const commsBt = findLike(d.commoditiesByTerminal, 'commodity_name', pattern);
  const termPrices = findLike(d.terminalPrices, 'commodity_name', pattern);

  console.log(`itemsByTerminal matches: ${itemsBt.length}`);
  for (const r of itemsBt.slice(0, 10)) {
    console.log(` - ${r.item_name} @ terminal ${r.terminal_name} buy=${fmt(r.price_buy)} sell=${fmt(r.price_sell)}`);
  }
  console.log(`commoditiesByTerminal matches: ${commsBt.length}`);
  for (const r of commsBt.slice(0, 10)) {
    console.log(` - ${r.commodity_name} @ terminal ${r.terminal_name} buy=${fmt(r.price_buy)} sell=${fmt(r.price_sell)}`);
  }
  console.log(`terminalPrices matches: ${termPrices.length}`);
  for (const r of termPrices.slice(0, 10)) {
    console.log(` - ${r.commodity_name} @ ${r.space_station_name || r.outpost_name || r.city_name || r.planet_name} buyAvg=${fmt(r.price_buy_avg)} sellAvg=${fmt(r.price_sell_avg)}`);
  }

  // Verify the reported Stanton locations and top commodities by buy price
  const stantonLocs = [
    'Everus Harbor', // Hurston
    'Pyro Gateway',
    'Baijini Point', // ArcCorp
    'Port Tressler', // MicroTech
    'Seraphim Station', // Crusader
  ];
  console.log('\n=== Top buy by location in Stanton (by price_buy_avg) ===');
  for (const loc of stantonLocs) {
    const rows = (d.terminalPrices || []).filter(r => String(r.star_system_name).toLowerCase() === 'stanton' &&
      [r.space_station_name, r.outpost_name, r.city_name, r.planet_name].some(x => String(x || '').toLowerCase().includes(String(loc).toLowerCase())));
    const nonZero = rows.filter(r => isFinite(Number(r.price_buy_avg)) && Number(r.price_buy_avg) > 0);
    nonZero.sort((a,b)=>Number(b.price_buy_avg)-Number(a.price_buy_avg));
    const top = nonZero.slice(0, 3);
    if (!top.length) {
      console.log(` - ${loc}: no buy data`);
      continue;
    }
    console.log(` - ${loc}:`);
    for (const r of top) {
      console.log(`   * ${r.commodity_name}: ${fmt(r.price_buy_avg)} aUEC`);
    }
  }

  // If Stor*All-like item exists, show where sell is possible per whereItemAvailable
  const suspect = ['stor*all', 'self-storage', 'storage container'];
  for (const s of suspect) {
    const rows = whereItemAvailable(s) || [];
    if (!rows.length) continue;
    console.log(`\n=== Availability for "${s}" via whereItemAvailable ===`);
    const buys = rows.filter(r => Number(r.buy) > 0);
    const sells = rows.filter(r => Number(r.sell) > 0);
    console.log(` rows=${rows.length} buys=${buys.length} sells=${sells.length}`);
    for (const r of rows.slice(0, 10)) {
      console.log(` - ${r.item} @ ${r.location}: buy=${fmt(r.buy)} sell=${fmt(r.sell)} (${r.star_system_name || ''})`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
