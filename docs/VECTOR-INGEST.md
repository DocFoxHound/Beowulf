# Vector Ingestion & Retrieval

This document explains how conversational, operational, and statistical data become embeddings in the OpenAI vector store and how they are retained for analytics or future retrieval features (live GPT responses have been removed).

## Goals
- Persist salient org knowledge (chat summaries, hits, player stats) for retrieval-augmented assistance.
- Balance freshness with cost via scheduled batch ingest + optional live streaming.
- Provide tunable controls (env flags) for enabling/disabling each source.

## Sources & Triggers
| Source | Module | Trigger | Flag |
|--------|--------|---------|------|
| Historical Chat Logs | `vector-handling/chat-ingest.js` | Optional startup batch | `KNOWLEDGE_INGEST_ENABLE` + `CHAT_VECTOR_INGEST_ON_START` |
| Live Messages | `index.js` (messageCreate -> ingestChatMessage) | Per qualifying message | `KNOWLEDGE_INGEST_ENABLE` + `CHAT_VECTOR_INGEST_LIVE` |
| Daily Chat Summaries | `vector-handling/extra-ingest.js` | 6h interval | `CHAT_SUMMARY_ENABLE` |
| Hit Logs | `vector-handling/extra-ingest.js` | 6h interval | `HIT_INGEST_ENABLE` |
| Player Stats Snapshots | `vector-handling/extra-ingest.js` | 1h interval | `PLAYER_STATS_INGEST_ENABLE` |

## Environment Variables
- `EMBEDDING_MODEL` – Embedding model name (default `text-embedding-3-small`).
- `INGEST_CONCURRENCY` – Parallel ingestion threads (default 2, range 1–8).
- `INGEST_MAX` – Cap on items processed in batch (0 = all).
- `CHAT_VECTOR_MAX` – Retention limit for chat embeddings (default 2000).
- Feature toggles listed above.

## Mermaid: Ingestion Pipeline
```mermaid
graph TD
  M[Discord Messages] -->|live| LiveIngest[ingestChatMessage]
  Hist[Historical Chat] --> BatchIngest[ingestChatBatch]
  Daily[Daily Summaries Job] --> SummIngest[ingestDailyChatSummaries]
  Hits[Hit Logs] --> HitIngest[ingestHitLogs]
  Stats[Player Stats] --> StatsIngest[ingestPlayerStats]
  LiveIngest --> Queue{Concurrency Control}
  BatchIngest --> Queue
  SummIngest --> Queue
  HitIngest --> Queue
  StatsIngest --> Queue
  Queue --> EmbedCalls[OpenAI Embeddings]
  EmbedCalls --> VectorStore[Vector Store]
```

## Embedding Workflow (Pseudo)
```js
for (const item of items) {
  const input = serialize(item); // Minimally structured text
  const embedding = await openai.embeddings.create({ model, input });
  // Append metadata (channel, user, timestamp) to file chunk or record
  addToVector(embedding, metadata);
}
```

## Current Usage
- Embeddings are still generated and pruned so downstream analytics or future retrieval consumers can reuse the data without re-ingesting history.
- No live Discord replies read from the vector store; `handleBotConversation` and related GPT features were removed.
- If you add a new consumer (e.g., reporting dashboards), read directly from the vector store using the metadata filters established during ingestion (source, channel, timestamp).

## Ranking & Filtering
- Similarity (cosine) handled by OpenAI vector store.
- Future improvement: Hybrid scoring (vector similarity + recency weight + source priority).
- Deduplication: Basic; identical content unlikely due to message IDs.

## Pruning & Retention
- Chat pruning uses `CHAT_VECTOR_MAX` threshold: oldest vectors removed when exceeded.
- Planned: Age-based pruning (e.g., keep last N days) using `DAYS_OLD` variable (currently commented in code).
- Consider implementing semantic compaction: merge low-signal messages into summaries.

## Error Handling
| Failure | Current Behavior | Recommended Enhancement |
|---------|------------------|-------------------------|
| Embedding quota exceeded | Log error, skip item | Backoff & retry queue with jitter |
| Network/API transient | One attempt | Add limited retry (2–3 attempts) |
| Vector deletion errors | Rare (internal) | Maintain audit log of pruned IDs |

## Performance Considerations
- Concurrency >4 may increase rate limit risk; tune based on usage patterns.
- Batch startup ingest ideal during low-traffic periods.
- Live ingest is fire-and-forget (`Promise.resolve(...).catch()`), minimizing user-facing latency.

## Security & Privacy
- Do not ingest privileged channels unless necessary; restrict `CHANNELS` and test sets accordingly.
- Avoid embedding messages containing sensitive personal data; add a future content filter.

## Suggested Improvements
1. Introduce local vector cache (e.g., disk-based FAISS) for resilience on OpenAI outages.
2. Add semantic categorization: tag embeddings by domain (market, fleet, social) to allow scoped retrieval.
3. Implement query-time re-ranking using MMR (Maximal Marginal Relevance) if/when a retrieval consumer returns.
4. Provide an admin command or HTTP endpoint to list ingestion stats (counts per source, last run times).
5. Export minimal retrieval trace via logs to help future consumers debug similarity searches.

## Admin & Debugging
- Enable `DEBUG_RETRIEVAL` to log ingestion diagnostics (retained for parity even though live retrieval is disabled).
- Manual re-ingest cycles can be triggered by invoking the relevant functions directly (see `vector-handling/extra-ingest.js`).

## Mermaid: Retrieval Decision
The previous real-time retrieval decision tree has been removed along with the chatgpt handler. Reintroduce it only if you build another consumer that queries the vector store before responding in Discord.

## Glossary
- Embedding: Numeric vector representation of text for similarity search.
- Vector Store: Managed collection of embeddings with metadata for retrieval.
- Ingest: Process of encoding raw domain data into embeddings.
- Retrieval Augmentation: Adding relevant context documents to an LLM prompt.

