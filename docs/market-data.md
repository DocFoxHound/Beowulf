# Beowulf market data architecture

This document summarizes how market/world data is loaded, how the in-memory cache is structured, and which datasets are used for different questions. Use it to reason about accuracy and to pick the correct source in code and tools.

## Data sources

Market data now lives primarily in PostgreSQL; the legacy in-memory cache under `chatgpt/data-cache.js` has been removed. The refresh order is:

1. **Database (`db/pool.js`)** – canonical source for systems, locations, terminals, commodities, and price tables. Consumers should query via the API layer in `api/uexApi.js` or direct SQL helpers.
2. **UEX HTTP models** – used by `common/process-uex-data.js` to repopulate the DB when data is stale or missing. Tables refreshed sequentially for `terminal_prices`, `items_by_terminal`, and `other_tables`.
3. **Optional JSON seeds (`data/*.json`)** – still supported by `common/download-UEX-Data.js` for offline bulk downloads, but not loaded automatically into memory.

## Database tables of interest

| Table / View | Purpose |
|--------------|---------|
| `uex_star_systems`, `uex_planets`, `uex_space_stations`, `uex_outposts`, `uex_cities` | Location topology used when formatting notifications. |
| `uex_terminals` | Join table connecting commodity/item availability to specific facilities. |
| `uex_commodities_by_terminal`, `uex_items_by_terminal` | Live commodity/item buy/sell rows gathered from UEX. |
| `uex_terminal_prices` | Aggregated popularity metrics (`*_users_rows`) plus average prices per terminal. |
| `uex_commodities_summary`, `uex_items_summary` | System-wide averages for price lookups without geography. |

All tables are written by `common/process-uex-data.js` using helpers under `api/models/`.

## Access patterns

- Use `api/uexApi.js` or direct SQL helpers within `common/process-uex-data.js` to read/write market tables.
- Higher-level utilities (`common/get-top-commodity-buy-sell-locations.js`, `common/get-top-terminal-transactions.js`, etc.) already operate on the DB result sets—no in-memory cache required.
- If you need to compose deterministic advice inside another module, query the tables directly and format results locally. Keep results scoped (system, planet, station) to avoid large payloads.

## Choosing the right dataset

- **Price at a specific terminal:** query `uex_commodities_by_terminal` (or `uex_items_by_terminal`) joined with `uex_terminals` for geo labels.
- **Popular buys/sells in a region:** query `uex_terminal_prices` filtered by `star_system_name` / `terminal_name`, sorted by `price_buy_avg` or `price_sell_avg` and optionally `*_users_rows` for signal strength.
- **System-wide averages:** use `uex_commodities_summary` or `uex_items_summary`.
- **Route planning:** join `uex_commodities_by_terminal` against itself by commodity name to pair best buy vs best sell per system.

## Common pitfalls

- Store items (from `uex_items_by_terminal`) often have sell price `0`. Don’t treat them as trade commodities unless explicitly needed.
- UEX occasionally omits topology metadata; ensure joins allow NULLs for planet/station fields when formatting Discord embeds.
- Refresh jobs run sequentially; if one table fails the sequence stops. Monitor logs for `[UEX] Refresh sequence failed` and rerun when needed.

## Environment & troubleshooting

- Verify `UEX_API_KEY` (if required by your backend) and database credentials before running `process-uex-data`.
- For air-gapped testing, download JSON via `common/download-UEX-Data.js` and import manually using SQL scripts.
- When adding new consumers, prefer parameterized SQL helpers to avoid copying the same joins everywhere.
