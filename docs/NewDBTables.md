Below are four new tables that need matching controllers, routes, and models along with rigging them up in the .env and server.js files. These are the postgresql scripts used to generate the tables:

-- Enable the pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
--  Table: memories
--  Purpose: Long-term memory storage for AI assistants
-- ============================================================

CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiers
    user_id     TEXT NULL,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NULL,

    -- Memory classification
    type        TEXT NOT NULL CHECK (type IN ('episodic', 'inside_joke', 'profile', 'lore')),

    -- Memory content + metadata
    content     TEXT NOT NULL,
    tags        TEXT[] DEFAULT '{}',
    importance  INT NOT NULL DEFAULT 0,

    -- Vector embedding (1536 dimensions)
    vector      vector(1536),

    -- Timestamps
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ
);

-- ============================================================
--  Trigger: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_memories_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_memories_timestamp
BEFORE UPDATE ON memories
FOR EACH ROW
EXECUTE FUNCTION update_memories_timestamp();

-- ============================================================
--  Helpful Indexes
-- ============================================================

-- Search tags quickly
CREATE INDEX IF NOT EXISTS idx_memories_tags
    ON memories USING GIN (tags);

-- Filter by user/guild/channel
CREATE INDEX IF NOT EXISTS idx_memories_user
    ON memories (user_id);

CREATE INDEX IF NOT EXISTS idx_memories_guild
    ON memories (guild_id);

CREATE INDEX IF NOT EXISTS idx_memories_channel
    ON memories (channel_id);

-- Vector similarity search
-- Use IVFFlat for large datasets (requires ANALYZE after insert)
CREATE INDEX IF NOT EXISTS idx_memories_vector
    ON memories USING ivfflat (vector vector_l2_ops)
    WITH (lists = 100);



-- ============================================================
--  Table: user_profiles
--  Purpose: Persistent attributes for each player/user
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id          TEXT PRIMARY KEY,      -- Discord user ID

    nickname         TEXT,
    tease_level      INT DEFAULT 0,

    style_preferences JSONB DEFAULT '{}'::jsonb,
    stats_json        JSONB DEFAULT '{}'::jsonb,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  Trigger: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_user_profiles_timestamp
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profiles_timestamp();

-- ============================================================
--  Helpful Indexes
-- ============================================================

-- For JSON attribute lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_style_prefs_gin
    ON user_profiles USING GIN (style_preferences);

CREATE INDEX IF NOT EXISTS idx_user_profiles_stats_json_gin
    ON user_profiles USING GIN (stats_json);




-- ============================================================
--  Table: chat_messages
--  Purpose: Short-term memory of recent conversation
-- ============================================================

-- gen_random_uuid() lives in pgcrypto on many setups
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    guild_id   TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,

    content    TEXT NOT NULL,

    -- When the message occurred (Discord timestamp or server time)
    timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  Helpful Indexes
-- ============================================================

-- Common query pattern: recent messages per channel
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_time
    ON chat_messages (guild_id, channel_id, timestamp DESC);

-- Filter by user within a guild
CREATE INDEX IF NOT EXISTS idx_chat_messages_user
    ON chat_messages (guild_id, user_id, timestamp DESC);




-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
--  Table: knowledge_docs
--  Purpose: Long-form RAG documentation
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_docs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title       TEXT NOT NULL,
    text        TEXT NOT NULL,
    tags        TEXT[] DEFAULT '{}',

    -- 1536-dimensional embedding vector (OpenAI standard)
    vector      vector(1536),

    version     TEXT NOT NULL DEFAULT '1.0',

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  Helpful Indexes
-- ============================================================

-- Fast tag-based filtering (GIN array index)
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tags
    ON knowledge_docs USING GIN (tags);

-- Vector similarity search for semantic retrieval
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_vector
    ON knowledge_docs USING ivfflat (vector vector_l2_ops)
    WITH (lists = 100);

-- Fast title lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_title
    ON knowledge_docs (title);

---

## Runtime wiring

All four tables now have matching HTTP clients under `api/` and model abstractions under `api/models/` so the Discord bot can talk to the new services without additional boilerplate.

| Table | HTTP client | Model | ENV route |
|-------|-------------|-------|-----------|
| `memories` | `api/memoriesApi.js` | `api/models/memories.js` | `API_MEMORIES_ROUTES` |
| `user_profiles` | `api/userProfilesApi.js` | `api/models/user-profiles.js` | `API_USER_PROFILES_ROUTES` |
| `chat_messages` | `api/chatMessagesApi.js` | `api/models/chat-messages.js` | `API_CHAT_MESSAGES_ROUTES` |
| `knowledge_docs` | `api/knowledgeDocsApi.js` | `api/models/knowledge-docs.js` | `API_KNOWLEDGE_DOCS_ROUTES` |

Each API module exposes the common CRUD helpers (`list*`, `get*`, `create*`, `update*`, `patch*`, `delete*`) plus specialty helpers where needed (for example vector/embedding operations on `memories` and `knowledge_docs`, or pruning helpers for `chat_messages`).

The models sanitize input (string truncation, tag limits, embedding dimensionality, etc.) before delegating to the HTTP clients, so higher-level callers can simply `const { MemoriesModel } = require('api/models');` and call `MemoriesModel.create()` / `MemoriesModel.vectorSearch()` without repeating validation logic.
