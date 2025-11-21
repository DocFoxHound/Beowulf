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

The Beowulf assistant consists of **six core subsystems**:

1. **Orchestrator** – central AI interaction router  
2. **Intent Classifier** – identifies user intent  
3. **Context Builder** – assembles all data needed for GPT  
4. **Tools System** – external data functions (market, stats, org info)  
5. **Persona Responder** – GPT response generator with tool-calling  
6. **Memory Writer** – stores new long-term memories with embeddings  

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
- `chatgpt/context` – hydrates context exclusively from the global caches outlined in `GLOBAL-CACHES.md`.
- `chatgpt/tools` – helper accessors that read `globalThis.userListCache`, `chatMessagesCache`, `uexCache`, `playerStatsCache`, `leaderboardCache`, and `hitCache`.
- `chatgpt/persona` – persona prompt + OpenAI response handler (currently targeting GPT-5.1 compatible models).
- `chatgpt/memory` – optional writer that reuses the vector-ingest utilities when `KNOWLEDGE_INGEST_ENABLE=true`.

The Discord entrypoint (`index.js`) now routes any mention or reply to Beowulf through `handleChatGptInteraction`, ensuring every subsystem is engaged in-order.

### **Implementation Notes**

- The intent classifier first runs fast keyword heuristics, then confirms the result with a lightweight GPT model (`CHATGPT_INTENT_MODEL`, default `gpt-4o-mini`) that returns a JSON intent payload.
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

# **3. Orchestration Pipeline**

```
Discord Message
      ↓
Intent Classifier
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

---

# **5. Context Builder**

Assembles everything GPT needs to respond correctly.

### **Sources of Context**

1. **Short-term memory**  
2. **Long-term memory (vector search)**  
3. **Knowledge documents**  
4. **External data**

### **Output Interface:**
```ts
interface BuiltContext {
  recentChat: ChatMessage[];
  longTermMemories: Memory[];
  knowledgeSnippets: KnowledgeDoc[];
  externalData: any;
}
```

---

# **6. Tools System (Function Calling)**

GPT calls tools for any external data that must be accurate.

### **Tools Provided**
- `get_item_price(item, region?)`
- `get_user_stats(userId)`
- `get_market_trends(item)`
- `get_org_rank(userId)`

---

# **7. Persona Responder**

The GPT module responsible for final response generation.

---

# **8. Memory Writer**

Analyzes conversations and stores new memories with embeddings.

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










