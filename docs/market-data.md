# Beowulf market data architecture

This document summarizes how market/world data is loaded, how the in-memory cache is structured, and which datasets are used for different questions. Use it to reason about accuracy and to pick the correct source in code and tools.

## Data sources

The bot can hydrate its cache from three sources, in this order of preference:

1) Disk JSON (optional): `data/*.json`
   - When present, `chatgpt/data-cache.js` reads these arrays into `state.data`.
2) Database (optional): via `db/pool.js` and the API layer under `api/uexApi.js`
   - `data-cache.refreshFromDb()` attempts `SELECT` from tables like `items`, `prices`, `locations`, etc.
   - When DB has no topology (systems/stations/outposts), it falls back to UEX.
3) UEX HTTP models (preferred fallback): `api/models/uex-*.js`
   - `data-cache.refreshFromUex()` uses the models to populate star systems, planets, stations, outposts, cities, terminals, commodities/items by terminal, commodities/items summaries, and terminal prices.

For bulk-populating DB or files, see:
- `common/process-uex-data.js` (sends to DB using `uexApi`)
- `common/download-UEX-Data.js` (downloads raw JSON to `./UEX/`)

## Cache shape (state.data)

Loaded in `chatgpt/data-cache.js`:

- systems: [{ id, name, code, live, default, visible, factions, jurisdiction }]
- planets: [{ id, name, code, system, id_star_system, live, default, visible, factions, jurisdiction }]
- stations: [{ id, name, system, planet, orbit, id_star_system, id_planet, id_city, features: [] }]
- outposts: [{ id, name, system, planet, id_star_system, id_planet, features: [] }]
- cities: [{ id, name, system, planet, id_star_system, id_planet }]
- terminals: [{ id, name, system, planet, id_star_system, id_planet, id_space_station, id_outpost, id_city, ...flags }]
- commoditiesByTerminal: [{ id, id_commodity, id_terminal, commodity_name, terminal_name, price_buy, price_sell, status_buy, status_sell, ...avg/scu }]
- itemsByTerminal: [{ id, id_item, id_terminal, item_name, terminal_name, price_buy, price_sell }]
- commoditiesSummary: [{ id, commodity_name, price_buy_avg, price_sell_avg }]
- itemsSummary: [{ id, commodity_name, price_buy_avg, price_sell_avg }]
- terminalPrices: [{ id_terminal, terminal_name, star_system_name, planet_name, space_station_name, outpost_name, city_name, commodity_name, price_buy_avg, price_sell_avg, price_buy_users_rows, price_sell_users_rows, ... }]
- items, prices, locations, moons, transactions (optional legacy fields)

Relations and indexes are built in `buildRelations()`:
- `terminalsById`, `systemsById`, `planetsById`, `stationsById`, `outpostsById`, `citiesById`
- Children per system/planet (for fast traversal)
- `terminalRefs[id_terminal] = { commodities: [...], items: [...], prices: [...] }`

## Key selection utilities

- `findItem(name)`: resolves a name to a commodity/item using `items`, `itemsSummary`, and `commoditiesSummary`.
- `whereItemAvailable(name)`: canonical per-terminal availability rows for a name. Priority:
  1. Explicit `prices` rows (if any)
  2. Synthesize from `commoditiesByTerminal` and `itemsByTerminal` and enrich with geo fields from `terminalsById`.
- `listByType(type)`: systems/planets/moons/stations/outposts.
- `summarizeMovement(scope, location)`: aggregates `transactions` when present.

## Market answerers (deterministic)

Located in `chatgpt/market-answerer.js` and used by `chatgpt/tool-agent.js`:

- `bestBuyLocations({ name, location?, areaType?, top? })`
  - Uses `whereItemAvailable(name)`; sorts by lowest buy price; ignores non-positive prices.
- `bestSellLocations({ name, location?, areaType?, top? })`
  - Uses `whereItemAvailable(name)`; sorts by highest sell price; ignores non-positive prices.
- `spotFor({ name, location?, areaType?, top? })`
  - Returns per-terminal buy/sell snapshots.
- `bestProfitRoutes({ name, location?, areaType?, top? })`
  - Picks buy/sell terminals with positive margin.
- `bestOverallProfitRoute({ location?, top? })`
  - Scans all commodity/item names from commodity/item terminal lists and summaries.
- `mostActiveTerminals({ location?, top? })`
  - Ranks terminals by user report counts from `terminalPrices`.
- `summarizeMarket({ name, ... })`
  - Combined buy/sell/routes summary for a single item.
- Diagnostic: `topBuysByLocations({ locations, system?, top? })` (added helper)
  - Uses `terminalPrices` to list top-buy commodities by location.

Auxiliary list computation:
- `common/get-top-commodity-buy-sell-locations.js` builds system-specific lists (buy/sell) purely from `terminalPrices`.

## Choosing the right dataset (rules of thumb)

- Questions about specific item/commodity price at terminals:
  - Use `whereItemAvailable(name)` (combines `commoditiesByTerminal` + `itemsByTerminal`; falls back to `prices` when present).
- Questions about “what is popular to buy/sell at LOCATION/within SYSTEM”: 
  - Use `terminalPrices` (commodity-focused, with user report counts) filtered to the location/system, sorted by `price_buy_avg` or `price_sell_avg`.
  - Avoid `itemsByTerminal` here—store items (e.g., containers) are often buy-only and not part of commodity trading.
- Questions about overall popularity/activity of terminals:
  - Use `terminalPrices` and the `_users_rows` counters.
- Questions about averages without location context:
  - Use `commoditiesSummary` and `itemsSummary` for baseline buy/sell averages.
- Cross-system route questions:
  - Use `whereItemAvailable(name)` filtered by `star_system_name` to construct buy/sell pairs across systems.

## Common pitfalls and guardrails

- Store items (“ItemsByTerminal”, e.g., storage containers) frequently have no resale terminals (sell=0). Do not infer trade routes or “popular trading items” from `itemsByTerminal` unless the question explicitly targets store items.
- Prefer `terminalPrices` for popularity/summary questions at a place; it’s commodity-based and includes signal strength (user counts).
- `whereItemAvailable` returns rows for both commodities and items. When answering sell-location questions, it already filters out non-positive sell prices.

## Minimal examples

- Best buy locations for Laranite near Hurston (stations only):
  - `bestBuyLocations({ name: 'Laranite', location: 'Hurston', areaType: 'station', top: 5 })`
- What are we buying at Everus Harbor / Baijini / Port Tressler?
  - `topBuysByLocations({ locations: ['Everus Harbor','Baijini Point','Port Tressler'], system: 'Stanton', top: 3 })`
- Most active terminals (Stanton):
  - `mostActiveTerminals({ location: 'Stanton', top: 10 })`

## Environment & troubleshooting

- If you see `Invalid URL` during inspection, ensure `SERVER_URL` and `API_EXP_GER` (or direct UEX vars) are set so the API models can fetch from your backend.
- Alternatively, place `data/*.json` arrays to seed the cache without DB/API.
- To bulk (re)populate DB from UEX, run `process-uex-data` for the relevant table(s).
