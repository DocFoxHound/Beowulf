# Environment Configuration

This document enumerates all environment variables referenced in the codebase and groups them by functional domain. Defaults (when present in code) and usage notes are included. Boolean feature flags typically accept 'true'/'false' (case-insensitive) and often default to 'false' when disabled or 'true' when enabled by design.

## Index
- Core Runtime & Discord
- OpenAI / AI Models
- Feature Toggles (LLM, Retrieval, Vector Ingest)
- Market / UEX Data
- Scheduling & Intervals
- Channels (Live vs Test)
- Roles (Prestige, Membership, Moderation)
- Events & Scheduling Channels
- Fleet / Hit Tracking
- Leaderboards & External APIs
- Embeddings / Vector Store
- Moderation & Audit
- User Progression (Deprecated / Legacy)
- HTTP Server
- Misc / Debug

> Live/Test Pattern: Many variables have paired TEST_ variants. When `LIVE_ENVIRONMENT === 'true'` the live variable is used, otherwise the TEST_ version. Keep the sets synchronized.

---
## Core Runtime & Discord
- `LIVE_ENVIRONMENT` ("true" | "false") – Selects live vs test token, channels, roles.
- `CLIENT_TOKEN` / `TEST_CLIENT_TOKEN` – Discord bot tokens.
- `CLIENT_ID` / `TEST_CLIENT_ID` – Application (bot) client ID.
- `GUILD_ID` / `TEST_GUILD_ID` – Primary guild (server) ID.
- `BOT_SINGLE_INSTANCE` (default 'true') – Guard to prevent multiple concurrent bot processes via lock file.
- `BOT_HTTP_PORT` – Port for Express server exposing HTTP endpoints.
- `DISCORD_MESSAGE_MAX` (default 1900) – Max outbound message length safeguard.

## OpenAI / AI Models
- `OPENAI_API_KEY` – API key for OpenAI client.
- `OPENAI_RESPONSES_MODEL` – Primary responses model fallback (handler.js).
- `KNOWLEDGE_AI_MODEL` – Model used for knowledge base queries; falls back to `gpt-4o-mini`.
- `RESPONSES_MODEL` – Model used in `responses-run.js` (default 'gpt-5'—verify availability).
- `EMBEDDING_MODEL` – Embedding model (default 'text-embedding-3-small').
- `BOT_TEMPERATURE`, `BOT_TEMP_MIN`, `BOT_TEMP_MAX` – Response creativity tuning (fallbacks 0.50–0.7).
- `BOT_INSTRUCTIONS` – Persona / additional instruction text for assistant behavior.
- `ON_QUOTA_MESSAGE` – Fallback text when AI quota exhausted.

## Feature Toggles (LLM, Retrieval, Vector Ingest)
- `HIT_LLM_EXTRACT` (default 'true') – Use LLM for hit extraction.
- `TOOL_AGENT_ENABLED` (default 'true') – Enables tool agent in handler.
- `LEGACY_INTENT_ROUTER` (default 'false') – Forces legacy intent routing logic.
- `AUTO_ROUTER_ENABLED` (default 'true') – Enables auto intent resolution fallback.
- `BANTER_USE_LLM` (default 'true') – Enables LLM for banter messages.
- `KNOWLEDGE_RETRIEVAL` (default 'true') – Enables retrieval augmentation.
- `KNOWLEDGE_PREFER_VECTOR` (default 'true') – Prefers vector store over other sources.
- `CHATGPT_KNOWLEDGE_LOOKUP` / `CHATGPT_KNOWLEDGE_LIMIT` – Legacy `/api/knowledge` search toggle + per-query row cap.
- `CHATGPT_KNOWLEDGE_DOC_LOOKUP` / `CHATGPT_KNOWLEDGE_DOC_LIMIT` – Enables `knowledge_docs` (doc-ingest) retrieval and caps surfaced chunks per request.
- `CHATGPT_KNOWLEDGE_DOC_MIN_SCORE` – Semantic similarity cutoff (0–1) for doc vector hits.
- `CHATGPT_KNOWLEDGE_DOC_SCAN_LIMIT` / `CHATGPT_KNOWLEDGE_DOC_SCAN_PAGE` – Keyword fallback scanner caps (set scan limit to 0 to disable lexical fallback when vectors are missing).
- `CHATGPT_ENTITY_TOP_K` – Number of top entity catalog matches surfaced per request (drives prompt → intent → entity flow).
- `CHATGPT_ENTITY_INDEX_REFRESH_MS` – Rebuild cadence for the entity catalog (defaults to 30 minutes).
- `CHATGPT_ENTITY_DOC_LIMIT` – Knowledge documents sampled into the entity catalog (controls doc-topic entity breadth).
- `CHATGPT_ENTITY_REBUILD_DEBOUNCE_MS` – Delay (ms) before auto-rebuilding the catalog after a UEX cache refresh; prevents thrash when multiple datasets update.
- `CHATGPT_ENTITY_DB_LIMIT` – Max game-entity rows fetched per rebuild.
- `CHATGPT_ENTITY_INCLUDE_CACHE_FALLBACK` (default 'true') – When true, append legacy UEX catalog entries if the DB is empty.
- `USER_OPINION_USE_LLM` (default 'true') – Generates opinion responses via LLM.
- `KNOWLEDGE_INGEST_ENABLE` – Master flag controlling ingestion pipelines (chat/hits/stats).
- `CHAT_VECTOR_INGEST_ON_START` – Batch ingest historical chat logs at startup.
- `CHAT_VECTOR_INGEST_LIVE` – Live per-message vector ingestion.
- `SAVE_MESSAGES` – Persist raw Discord messages for retrieval scoring.
- `CHAT_SUMMARY_ENABLE` – Enable daily chat summary embedding ingestion.
- `HIT_INGEST_ENABLE` – Enable hit logs embedding ingestion.
- `PLAYER_STATS_INGEST_ENABLE` – Enable player stats embedding ingestion.
- `CHAT_VECTOR_MAX` – Max retained vector messages (default 2000) for pruning.
- `INGEST_MAX` – Maximum messages to ingest in batch (0 = all).
- `INGEST_CONCURRENCY` – Parallel embedding jobs (default 2, clamped 1–8).

## Market / UEX Data
- `UEX_FRESH_LOAD_ON_START` – If 'true', forces full UEX data refresh on boot.
- (Various API route vars used in `api/*` and deprecated modules):
  - `SERVER_URL`, `API_SCI_API_ROUTES`, `API_CLASS`, etc. – Base URLs and route segments for backend/UEX bridging.
- `API_GAME_ENTITIES_ROUTES` – REST path (default `/api/game-entities`) used by the entity catalog model/API wrapper.
- `DEBUG_MARKET_FALLBACK` – Logs fallback errors in market answerer.

## Game Entities Catalog
- `GAME_ENTITIES_EXISTING_LIMIT` (default 20000) – Cap when preloading current rows before upserts.
- `GAME_ENTITIES_COMMODITY_LIMIT`, `GAME_ENTITIES_ITEM_LIMIT`, `GAME_ENTITIES_SHIP_LIMIT`, `GAME_ENTITIES_LOCATION_LIMIT` – Optional limits for `npm run sync:entities` dataset sizes.
- `ENTITY_UPLOAD_MAX_FILE_BYTES` (default 2 MB) – Slash command upload guard.
- `ENTITY_UPLOAD_MAX_ROWS` (default 500) – Max CSV rows processed per upload.
- `ENTITY_UPLOAD_ROLE_IDS` / `TEST_ENTITY_UPLOAD_ROLE_IDS` – Override which roles can use `/entity-upload` (falls back to doc-ingest roles if unset).
- `API_GAME_ENTITIES_ROUTES` – REST route for catalog CRUD (see above).

## Scheduling & Intervals (implicit via code comments)
Intervals are hardcoded; toggles exist via feature flags above. Documented in SCHEDULES-JOBS.md.

## Channels (Live vs Test)
- `CHANNELS` / `TEST_CHANNELS` – Comma-separated allowed parent channels.
- `HITTRACK_CHANNEL_ID` / `TEST_HITTRACK_CHANNEL_ID` – Hit tracker forum inclusion.
- `FLEETLOG_CHANNEL_ID` / `TEST_FLEETLOG_CHANNEL_ID` – Fleet log posting.
- `FLEET_COMMANDERS_CHANNEL` / `TEST_FLEET_COMMANDERS_CHANNEL` – Commander change notifications.
- `EVENTS_PUBLIC_CHANNEL`, `EVENTS_PROSPECT_CHANNEL`, `EVENTS_CREW_CHANNEL`, `EVENTS_MARAUDER_CHANNEL` and TEST_ variants – Event RSVP embeds.
- `AUDIT_CHANNEL` / `TEST_AUDIT_CHANNEL` – Moderator audit logs.
- `SHIP_LOG_CHANNEL` / `TEST_SHIP_LOG_CHANNEL` (deprecated fleet-log-add.js).

## Roles (Prestige, Membership, Moderation)
Prestige Ladder (RAPTOR, CORSAIR, RAIDER levels 1–5):
- `RAPTOR_1_ROLE` ... `RAPTOR_5_ROLE` (+ TEST variants)
- `CORSAIR_1_ROLE` ... `CORSAIR_5_ROLE` (+ TEST variants)
- `RAIDER_1_ROLE` ... `RAIDER_5_ROLE` (+ TEST variants)
Membership / Status:
- `PROSPECT_ROLE` / `TEST_PROSPECT_ROLE`
- `FRIENDLY_ROLE` / `TEST_FRIENDLY_ROLE`
- `VERIFIED_ROLE` / `TEST_VERIFIED_ROLE`
- `NEW_USER_ROLE` / `TEST_NEW_USER_ROLE`
- `RONIN_ROLE` / `TEST_RONIN_ROLE` – Role gating schedule creation / displays.
- `FLEET_COMMANDER_ROLE` / `TEST_FLEET_COMMANDER_ROLE`
Command / Permissions Sets:
- `MODERATOR_ROLES`, `TEST_MODERATOR_ROLES` – Comma-separated list for moderator commands.
- `ADMIN_ROLES`, `TEST_ADMIN_ROLES` – Comma-separated list for admin-level commands.
- (Deprecated) `PROGRESSION_MOD_ROLES`, `TEST_PROGRESSION_MOD_ROLES` (commented code).

## Events & Scheduling
- Uses roles above plus event channels. (Future: consider `EVENTS_*` TTL or calendar integration.)

## Fleet / Hit Tracking
- `HITTRACK_CHANNEL_ID` / `TEST_HITTRACK_CHANNEL_ID` – Forum for hit threads.
- `DEBUG_HIT_LOGS` – Verbose logging for hit lifecycle (value '1').

## Leaderboards & External APIs
- `API_CIG_LEADERBOARD_SB` – Base URL for CIG leaderboard (used twice in process-leaderboards.js).

## Embeddings / Vector Store
- `VECTOR_STORE` – Target OpenAI vector store ID for chat/hit/player stats files.
- `DAYS_OLD` (commented) – Intended retention window for pruning older vectors.

## Moderation & Audit
- `AUDIT_CHANNEL` / `TEST_AUDIT_CHANNEL` – Receives removal / moderation action embeds.
- Various moderator/admin role lists (see Roles section).

## User Progression (Deprecated / Legacy)
Commented sections reference: `QUEUE_CHANNEL`, `SESH_ID`, progression moderator roles, etc. Keep for historical context but do not rely on them for new features.

## HTTP Server
- `BOT_HTTP_PORT` – Port for Express; ensure firewall/security rules only expose necessary endpoints.

## Misc / Debug
- `DEBUG_RETRIEVAL` – Debug retrieval pipeline output.
- `DEBUG_MARKET_FALLBACK` – Market fallback error logs.
- `DEBUG_HIT_LOGS` – Hit tracker detailed logs.

## Management & Best Practices
1. Place all secrets (tokens, API keys) only in `.env` not committed; use example template.
2. Keep live and test role/channel lists synchronized when adding new features.
3. For boolean flags, prefer explicit 'true'/'false'; avoid numeric equivalents except where code expects '1'.
4. When introducing a new feature flag, provide a default fallback (e.g., `(process.env.FEATURE_X || 'false').toLowerCase() === 'true'`).
5. Consider centralizing env parsing with a validation module (future improvement) to surface misconfiguration early.

## Pending Classification (Verify usage before documenting fully)
- `ORG_API_KEY` (surfaced in key-create.js DM) – Organization API key distributed to users; ensure secure rotation policy.

## Suggested Next Step
Create `.env.example` reflecting this list with placeholder values and brief inline comments.
