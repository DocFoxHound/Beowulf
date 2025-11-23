# **Beowulf AI System Architecture**
### _Intelligent Discord Assistant with Memory, Tools, and External Data Integration_

---

## **Overview**

This document describes the full architecture for the **Beowulf AI System**—an intelligent, personality-driven Discord assistant capable of:

- Deep short-term & long-term memory  
- Tool calling for accurate, real-time external data  
- Context-aware banter using historical chat context  
- GPT-powered reasoning and persona-driven dialogue  
- Clean modular orchestration in Node.js + TypeScript  
- PGVector-backed semantic retrieval for high-quality memory recall  

This architecture is structured for incremental development and GPT-powered code generation.

---

# **System Summary**

The Beowulf assistant consists of **seven core subsystems**:

1. **Orchestrator** – central AI interaction router  
2. **Intent Classifier** – identifies user intent  
3. **Entity Resolver** – canonical lookup across all Star Citizen entities  
4. **Context Builder** – assembles all data needed for GPT  
5. **Tools System** – external data functions (market, stats, org info)  
6. **Persona Responder** – GPT response generator with tool-calling  
7. **Memory Writer** – stores new long-term memories with embeddings  

These subsystems work together to create a smart, personality-rich assistant.

---

# **1. File & Folder Structure**

```
/src
  /commands
  /config
  /context
    builder.ts
    index.ts
  /events
    messageCreate.ts
    interactionCreate.ts
  /intent
    classifier.ts
  /memory
    writer.ts
    models.ts
  /orchestrator
    index.ts
  /persona
    responder.ts
  /tools
    index.ts
    /functions
      market.ts
      stats.ts
      org.ts
  /data
    cache.ts
    /refreshers
  /db
    /migrations
    client.ts
  app.ts
```

### **Folder Purpose Summary**

| Folder | Purpose |
|--------|---------|
| `/orchestrator` | Core AI routing pipeline |
| `/intent` | Intent detection using GPT |
| `/context` | Builds short-term + long-term memory + data context |
| `/persona` | GPT persona logic + final response generation |
| `/tools` | Tool-calling functions for external data |
| `/memory` | Long-term memory writer & models |
| `/events` | Discord.js event listeners |
| `/commands` | Slash command definitions |
| `/data` | Cached game data & refreshers |
| `/db` | Postgres client + migrations |
| `app.ts` | Project entrypoint |

### **Beowulf Runtime Mapping**

The live Node.js implementation in this repository mirrors the architecture by exposing the following directories under `chatgpt/`:

- `chatgpt/orchestrator` – wires message events from `index.js` into the pipeline.
- `chatgpt/intent` – lightweight classifier that tags banter, price queries, stats lookups, etc.
- `chatgpt/context` – hydrates context exclusively from the global caches outlined in `GLOBAL-CACHES.md` and now expects entity resolution metadata.
- `chatgpt/tools` – helper accessors that read `globalThis.userListCache`, `chatMessagesCache`, `uexCache`, `playerStatsCache`, `leaderboardCache`, and `hitCache`.
- `chatgpt/persona` – persona prompt + OpenAI response handler (currently targeting GPT-5.1 compatible models).
- `chatgpt/memory` – optional writer that reuses the vector-ingest utilities when `KNOWLEDGE_INGEST_ENABLE=true`.

The Discord entrypoint (`index.js`) now routes any mention or reply to Beowulf through `handleChatGptInteraction`, ensuring every subsystem is engaged in-order.

### **Implementation Notes**

- The intent classifier first runs fast keyword heuristics, then confirms the result with a lightweight GPT model (`CHATGPT_INTENT_MODEL`, default `gpt-4o-mini`) that returns a JSON intent payload. The only decision it makes now is "is this Star Citizen/game data, banter, admin, etc."—dataset routing is deferred to the Entity Resolver stage.
- Orchestrator stage timing logs (`[ChatGPT][Perf] ...`) surface how long intent, context, persona, and memory stages take, helping debug any >5s latency.
- Cache readiness helpers automatically hydrate leaderboard, market (UEX), player stats, and hit caches on-demand so context building rarely blocks on cold data.

---

# **2. Database Schema (Postgres + pgvector)**

The database uses **pgvector** for embeddings.  
Below are the required tables.

---

## **2.1 `memories`**

Stores long-term memory entries: events, jokes, preferences, lore, etc.

| Field | Type |
|-------|------|
| id | UUID PK |
| user_id | TEXT (nullable) |
| guild_id | TEXT |
| channel_id | TEXT (nullable) |
| type | TEXT (`episodic`, `inside_joke`, `profile`, `lore`) |
| content | TEXT |
| tags | TEXT[] |
| importance | INT |
| vector | vector(1536) |
| created_at | TIMESTAMPTZ |
| updated_at | TIMESTAMPTZ |
| last_used_at | TIMESTAMPTZ |

---

## **2.2 `user_profiles`**

Stores persistent attributes about each player/user.

| Field | Type |
|-------|------|
| user_id | TEXT PK |
| nickname | TEXT |
| tease_level | INT |
| style_preferences | JSONB |
| stats_json | JSONB |
| created_at | TIMESTAMPTZ |
| updated_at | TIMESTAMPTZ |

`stats_json` now carries rich persona details generated by the memory curator. Expected keys:

- `persona_details.profession`: One-line descriptor (`"Pirate logistician"`).
- `persona_details.known_for`: Array of memorable traits/achievements.
- `persona_details.favorite_topics`: Array of conversation hooks.
- `persona_details.notable_quotes`: Short quotes we can reference in banter.
- `persona_details.achievements`, `persona_details.notable_traits`, `persona_details.catchphrase`, `persona_details.relationship_notes`, `persona_details.personality_summary`.
- `persona_details.traits`: Object with 0–10 sliders for `openness`, `conscientiousness`, `extraversion`, `agreeableness`, `neuroticism`, `confidence`, `courage`, `integrity`, `resilience`, `humor` (slowly refined from prior data).
- `last_persona_update`: ISO timestamp of the most recent GPT adjustment.

Feel free to add additional biography-style keys under `persona_details` so long as they serialize to JSON.

---

## **2.3 `chat_messages`**

Short-term memory representing recent conversation.

| Field | Type |
|-------|------|
| id | UUID PK |
| guild_id | TEXT |
| channel_id | TEXT |
| user_id | TEXT |
| content | TEXT |
| timestamp | TIMESTAMPTZ |

---

## **2.4 `knowledge_docs`**

Long-form documentation for RAG-style knowledge (guides, rules, trading hints).

| Field | Type |
|-------|------|
| id | UUID PK |
| title | TEXT |
| text | TEXT |
| tags | TEXT[] |
| vector | vector(1536) |
| version | TEXT |
| created_at | TIMESTAMPTZ |

---

## **2.5 `game_entities`**

Canonical index of every Star Citizen noun we care about.

| Field | Type |
|-------|------|
| id | UUID PK |
| name | TEXT |
| aliases | TEXT[] |
| type | TEXT (`ship`, `component`, `weapon`, `location`, `manufacturer`, etc.) |
| subcategory | TEXT (optional specialization like `quantum_drive`, `cooler`, `fighter`) |
| short_description | TEXT |
| tags | TEXT[] |
| metadata | JSONB (arbitrary glue to map into downstream datasets) |
| vector | vector(1536) |
| created_at | TIMESTAMPTZ |
| updated_at | TIMESTAMPTZ |

Populate this table via the automated UEX sync (`npm run sync:entities`) plus manual uploads. The sync script pulls commodities, items, ships, terminals, and all major location datasets (cities, outposts, moons, planets, stations, star systems) from the UEX endpoints and upserts them into `game_entities`, so each successive run simply updates changed rows instead of creating duplicates.

At runtime the orchestrator reads the table through `GameEntitiesModel` (backed by `api/gameEntitiesApi.js`). Set `SERVER_URL` and `API_GAME_ENTITIES_ROUTES` so the bot can reach your REST gateway. If the table is still empty, the catalog automatically falls back to the legacy UEX-derived nouns while you finish seeding (`CHATGPT_ENTITY_INCLUDE_CACHE_FALLBACK=true`). Manual curation is available via the `/entity-upload` slash command (CSV or JSON) described in `docs/GAME-ENTITIES.md` alongside curl examples.

---

# **3. Orchestration Pipeline**

```
Discord Message
  ↓
Intent Classifier
  ↓
Entity Resolver (catalog lookup)
  ↓
Context Builder
      ↓
Persona Responder (GPT)
  ↳ (Optional Tool Calls)
      ↓
Final Response Sent to Discord
      ↓
Memory Writer
```

---

**Entity Resolver Step:** After the classifier labels the global intent, the orchestrator always queries the canonical `game_entities` index with the user's raw text. This hybrid vector + fuzzy lookup returns best-match ships, components, locations, or other nouns, along with routing metadata. If no result clears the confidence threshold, the pipeline falls back to broad knowledge retrieval and allows the persona responder to explain the ambiguity rather than forcing the user down the wrong dataset lane.

---

# **4. Intent Classifier**

Determines what category a message falls into.

### **Intent Categories**
- `banter`
- `price_query`
- `user_stats`
- `serious_info`
- `help`
- `admin`
- `other`

### **Output Contract**
```ts
{
  intent: string;
  needsTool: boolean;
  confidence: number;
}
```

The classifier no longer tries to guess the exact dataset (ship list vs. component manual). Its only job is to quickly determine whether a message is about Star Citizen game data at all, plus whether tools should be enabled. The downstream Entity Resolver consumes the raw text (and any classifier-provided hints) to run `search_game_entities` and decide which caches or docs to hydrate. This division keeps short prompts such as "What is a Pontes?" from being misrouted before a canonical lookup happens.

---

# **5. Context Builder**

Assembles everything GPT needs to respond correctly.

### **Sources of Context**

1. **Short-term memory**  
2. **Long-term memory (vector search)**  
3. **Knowledge documents**  
4. **External data**

### **Entity Catalog Layer**

- `chatgpt/context/entity-index.js` now hydrates straight from the `game_entities` table (via `GameEntitiesModel`) plus tagged knowledge-doc topics, giving us one canonical source of truth. If the table is empty—or you explicitly allow it—`CHATGPT_ENTITY_INCLUDE_CACHE_FALLBACK` keeps the older UEX-derived nouns in play so nothing regresses while you seed.
- The new `search_game_entities` tool exposes that catalog to GPT. It accepts `{ query: string, top_k?: number }`, performs hybrid vector + fuzzy search, and returns scored matches like `{ name, type, subcategory, id, score }`.
- Orchestrator always runs this lookup after intent classification, so every prompt flows through **prompt → intent → entity detection → dataset retrieval**.
- Entity matches feed back into `context.builder` for two reasons: (1) they teach the persona whether a noun is a ship, component, or location before touching market datasets, and (2) they seed `marketTargets`/`locationTargets` when the user never mentioned "price" but clearly referenced a tradable object.
- Keep `CHATGPT_ENTITY_TOP_K`, `CHATGPT_ENTITY_DB_LIMIT`, `CHATGPT_ENTITY_INDEX_REFRESH_MS`, and `CHATGPT_ENTITY_DOC_LIMIT` tuned so the catalog stays fresh without hammering the DB. When no entity clears the configured confidence, the builder defaults to RAG across all knowledge docs and explicitly tells the persona responder which gaps remain so it can answer honestly.

See `docs/GAME-ENTITIES.md` for the schema, environment variables, and instructions on adding more nouns (manual entries, curl examples, and syncing from UEX caches).

**RAG Blending:** Once entities are resolved, the builder performs a second vector search across `knowledge_docs`, historical chat, and any entity-linked references (loadout guides, market blurbs, component manuals). Each snippet is tagged with `source`, `entity_type`, and `confidence` so GPT can pick the best evidence. Ambiguous lookups intentionally return multiple labeled chunks, allowing the responder to say, for example, "No ship named Pontes exists, but there is a Pontes quantum drive." This keeps answers accurate even when players use incomplete terminology.

### **Output Interface:**
```ts
interface BuiltContext {
  recentChat: ChatMessage[];
  longTermMemories: Memory[];
  knowledgeSnippets: KnowledgeDoc[];
  externalData: any; // includes entity resolution metadata, per-entity datasets, and fallback RAG hits
}
```

---

# **6. Tools System (Function Calling)**

GPT calls tools for any external data that must be accurate.

### **Tools Provided**
- `search_game_entities(query, top_k?)`
- `get_item_price(item, region?)`
- `get_user_stats(userId)`
- `get_market_trends(item)`
- `get_org_rank(userId)`

`search_game_entities` is callable by both the orchestrator (pre-fetch) and GPT (self-serve). It always runs before any market/user tool to guarantee we know what noun the user referenced. The function returns up to `top_k` scored matches with type/subcategory metadata so orchestrator code can fetch the appropriate dataset (components, ships, docs) and pass a tight context bundle into the persona responder.

---

# **7. Persona Responder**

The GPT module responsible for final response generation.

---

# **8. Memory Writer**

Analyzes conversations and stores new memories with embeddings.

**Batch Worker:** `chatgpt/memory/batch-runner.js` watches cached chat logs per channel. It buffers live messages, flushing either when 10 new entries arrive or when a 3-minute interval elapses (whichever happens first). Batches are forwarded to `chatgpt/memory/batch-processor.js`, which now:
- Ignores any messages authored by Beowulf (so the bot never reinforces its own statements) before building the JSON transcript.
- Calls `CHATGPT_MEMORY_MODEL` (default `gpt-4o-mini`) with a strict JSON schema request that supports six memory types: `episodic`, `inside_joke`, `profile`, `lore`, plus the advice-specific `dogfighting_advice` (ship combat tactics) and `piracy_advice` (routes, snare setups, loot intel).
- Writes approved summaries into the dedicated `memories` table via `chatgpt/memory/memory-store.js`, embedding each entry for vector recall.
- Applies persona tweaks by upserting rows in `user_profiles` (nickname, tease level, style preferences, `persona_details` fields, numeric trait sliders) and updating the runtime cache so the persona responder immediately sees the new profile data.

**Persona Consumption:** `globalThis.userProfilesCache` hydrates from `/api/userprofiles` (`common/user-profiles-cache.js`). `chatgpt/context/builder.js` now prefers this cache when populating `context.userProfile`, ensuring the responder sees any adjustments emitted by the memory curator, including the extended `persona_details` (profession, known_for, favorite_topics, quotes, achievements, relationship notes, catchphrases, personality summary, trait sliders for Openness/Conscientiousness/Extraversion/Agreeableness/Neuroticism plus Confidence, Courage, Integrity, Resilience, Humor).

**Historical Seeding:** Run `npm run preload:memories` to replay the last 1,000 messages per configured channel (chunks of 10). The script (`scripts/preload-memories.js`) refreshes `user_profiles` and feeds each chunk through the same GPT-based memory + persona pipeline so new installations can bootstrap lore quickly.

---

# **9. Discord Integration**

Routes all Discord messages into the Orchestrator.

---

# **10. GPT-5.1 Build Prompts**

Use these prompts to generate each subsystem.

---

# **11. Data Refreshers**

Used for market sync, user stats, API scraping, and cached data.

---

# **12. System Diagram**

```
          ┌────────────────────┐
          │ Discord Message     │
          └───────┬────────────┘
                  │
          ┌───────▼────────────┐
          │ Intent Classifier   │
          └───────┬────────────┘
                  │
            ┌───────▼────────────┐
            │ Entity Resolver     │
            └───────┬────────────┘
              │
          ┌───────▼────────────┐
          │  Context Builder    │
          └───────┬────────────┘
                  │
      ┌───────────▼────────────────┐
      │      Persona Responder     │
      │        (GPT 5.1)           │
      └───────────┬────────────────┘
                  │ tool calls
          ┌───────▼────────────┐
          │   Tools Layer      │
          └───────┬────────────┘
                  │ data
          ┌───────▼────────────┐
          │   External Cache    │
          └───────┬────────────┘
                  │
          ┌───────▼────────────┐
          │  Final Response     │
          └───────┬────────────┘
                  │
          ┌───────▼────────────┐
          │  Memory Writer      │
          └─────────────────────┘
```










