# Game Entities Catalog

The `game_entities` table is the canonical noun index that powers `search_game_entities`. It stores every Star Citizen ship, component, location, manufacturer, slang term, or lore reference Beowulf should recognize before deciding which dataset to load.

## Schema recap

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | Primary key (defaults to `gen_random_uuid()`). |
| `name` | `text` | Required display name ("Pontes Quantum Drive"). |
| `aliases` | `text[]` | Optional nicknames/abbreviations ("Pontes", "Pontes QD"). |
| `type` | `text` | High-level classification (`ship`, `component`, `location`, `commodity`, `doc_topic`, etc.). |
| `subcategory` | `text` | Optional specialization (`quantum_drive`, `laser_repeater`). |
| `short_description` | `text` | 1-2 sentence summary placed directly into the GPT context. |
| `tags` | `text[]` | Arbitrary labels used for filtering and token overlap. |
| `source` | `text` | Where the record came from (`manual`, `uex-sync`, `lore`). |
| `dataset_hint` | `text` | Helps the context builder decide which cache to hydrate (e.g. `commodities`, `items`, `locations`). |
| `metadata` | `jsonb` | Free-form details (size, manufacturer, system, etc.) forwarded to the persona responder. |
| `vector` | `vector(1536)` | Optional embedding for server-side similarity search. |
| `created_at` / `updated_at` | `timestamptz` | Managed by triggers.

## Runtime data sources

1. **Primary:** Beowulf now loads the catalog via `GameEntitiesModel.list()` on every rebuild. All entries in the table are cached in-memory for fast scoring.
2. **Automated sync:** Run `npm run sync:entities` (see `scripts/sync-game-entities.js`) to pull commodities, items, ships, terminals, cities, outposts, moons, planets, stations, and star systems from the UEX APIs **plus** the curated `items_fps`, `items_components`, and `ship_list` tables. The sync uses name+type keys to upsert, so repeated runs simply refresh metadata.
3. **Fallback:** If the table is empty (or you set `CHATGPT_ENTITY_INCLUDE_CACHE_FALLBACK=true`), the old UEX-derived catalog is appended so you never lose coverage while seeding the table.
4. **Docs:** Knowledge document titles/tags are still ingested as lightweight entities so GPT can match broader topics.

## Adding or updating entries

You can manage the table through the HTTP service that already fronts the other pgvector tables. Point `SERVER_URL` at your API host and set `API_GAME_ENTITIES_ROUTES` (defaults to `/api/game-entities`). Then either:

### 1. Sync straight from UEX

```
npm run sync:entities
```

The script logs how many entities were created vs. updated and can be scheduled (cron/pm2) to keep the catalog aligned with your cache refresh cadence.

### 2. Use the model directly in Node

```js
const { GameEntitiesModel } = require('../api/models/game-entities');

(async () => {
  const result = await GameEntitiesModel.create({
    name: 'Pontes Quantum Drive',
    type: 'component',
    subcategory: 'quantum_drive',
    short_description: 'Size 2 civilian quantum drive known for quick spool times.',
    aliases: ['Pontes', 'Pontes QD'],
    tags: ['quantum', 'drive', 'component'],
    dataset_hint: 'items',
    metadata: { manufacturer: 'Aegis', grade: 'A', size: 2 },
  });
  console.log(result);
})();
```

### 3. Call the API directly

```bash
curl -X POST "$SERVER_URL/api/game-entities" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Centurion",
    "type": "ship",
    "subcategory": "aa_platform",
    "aliases": ["Centurion AA"],
    "tags": ["CNOU", "anti-air"],
    "short_description": "Crusader Industries point-defense platform mounted on a Cyclone hull.",
    "metadata": {"manufacturer": "Crusader", "hardpoints": 4}
  }'
```

### 4. Upload via Discord

Use the `/entity-upload` slash command (same roles/permissions as `/knowledge-doc-ingest`) with a CSV or JSON attachment. Required columns/fields are `name` and `type`. Optional fields include `subcategory`, `short_description`, `aliases`, `tags`, `dataset_hint`, `source`, and `metadata` (either JSON or additional columns). The command reports how many rows were created vs. updated, and it relies on the same name+type dedupe rules as the sync script.

`/player-item-upload`, `/component-item-upload`, and `/ship-list-upload` all mirror their respective tables (`items_fps`, `items_components`, `ship_list`) into `game_entities` automatically (dry runs skip writes). No extra action is needed after uploading CSVs — the entity index refreshes immediately while avoiding duplicate rows.

## Troubleshooting

- **Catalog feels stale:** lower `CHATGPT_ENTITY_INDEX_REFRESH_MS` to rebuild more often or call `invalidateEntityIndex()` after seeding new rows.
- **No DB entries yet:** leave fallback enabled so UEX data continues to work until the table is populated.
- **Need embeddings:** store them in the `vector` column via your ingestion pipeline; `GameEntitiesModel` preserves them but the Node-side search still uses token scoring until a dedicated vector endpoint is available.
