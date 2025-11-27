# CR-019: AgentDB Episodic Memory (Reflexion)

**Type:** Feature
**Status:** Completed ✅
**Priority:** LOW
**Target Phase:** Phase 4 (Enhancement)
**Created:** 2025-11-20
**Completed:** 2025-11-27
**Author:** andreas@siglochconsulting

**Parent CR:** CR-007 (AgentDB Shared Memory)
**Follow-up CR:** CR-026 (AgentDB Self-Learning with Ontology Rules)

## Problem / Use Case

CR-007 implemented semantic caching (vector similarity) which is working perfectly. However, **episodic memory** (Reflexion) was not functional due to missing database table schema.

**Original Error (RESOLVED):**
```
⚠️ AgentDB cache store failed: Error: no such table: episodes
```

**What Was Implemented:**
- ✅ Episodes table with full schema
- ✅ Episode embeddings table for vector similarity
- ✅ storeEpisode() API
- ✅ retrieveEpisodes() API with similarity search
- ✅ ReflexionMemory integration

**Current State:**
- ✅ **Semantic caching works** - Cache hits return instantly, cost savings working
- ✅ **Episodic storage works** - Episodes persisted to SQLite
- ✅ **Episode retrieval works** - Similar past tasks retrievable
- ⏳ **Self-learning pending** - Reward evaluation not yet automated (see CR-026)

## Requirements

**Episodic Memory (Reflexion Pattern):**
1. Store task execution outcomes (success/failure, reward, critique)
2. Retrieve relevant past episodes when starting new tasks
3. Enable agents to learn from experience over time
4. Support cross-agent learning (one agent learns from another's episodes)

**Database Schema:**
```sql
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  task TEXT NOT NULL,
  task_embedding BLOB,  -- Vector embedding of task
  reward REAL NOT NULL,
  success BOOLEAN NOT NULL,
  critique TEXT,
  output TEXT,          -- JSON serialized
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_episodes_agent ON episodes(agent_id);
CREATE INDEX idx_episodes_timestamp ON episodes(timestamp);
```

**API Requirements:**
- `storeEpisode(episode)` - Store task outcome
- `retrieveEpisodes(agentId, task?, k)` - Get similar past episodes
- `getAgentHistory(agentId, limit)` - Get recent agent activity
- `pruneOldEpisodes(olderThan)` - Cleanup old episodes

## Architecture / Solution Approach

### 1. Database Initialization

**Option A: Persistent SQLite (Recommended)**
```typescript
// Use actual SQLite file instead of WASM in-memory
import Database from 'better-sqlite3';

const db = new Database('/tmp/graphengine-agentdb.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    task TEXT NOT NULL,
    task_embedding BLOB,
    reward REAL NOT NULL,
    success BOOLEAN NOT NULL,
    critique TEXT,
    output TEXT,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episodes_agent ON episodes(agent_id);
  CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
`);
```

**Option B: WASM SQLite with Schema Init**
```typescript
// Initialize schema after createDatabase()
const db = await createDatabase(dbPath);
await db.exec(`
  CREATE TABLE IF NOT EXISTS episodes (...);
`);
```

### 2. Integration Points

**After LLM Response (llm-engine.ts:315):**
```typescript
await agentdb.storeEpisode(
  'llm-engine',
  request.message,
  parsed.operations !== null, // Success
  { operations: parsed.operations, textResponse: parsed.textResponse },
  'LLM request processed successfully'
);
```

**Before Spawning Agent:**
```typescript
// Load relevant past episodes for context
const episodes = await agentdb.retrieveEpisodes('ontology-validator', task, 5);
agent.loadContext(episodes);
```

### 3. Data Structure

```typescript
interface Episode {
  id: string;
  agentId: string;
  sessionId?: string;
  task: string;
  taskEmbedding?: number[];
  reward: number;          // 0.0 to 1.0
  success: boolean;
  critique: string;
  output: any;             // Serialized result
  timestamp: number;
}
```

## Implementation Plan

### Phase 1: Database Schema (2-3 hours)
1. Choose persistence approach (better-sqlite3 recommended)
2. Create schema initialization in `agentdb-backend.ts`
3. Add migration logic for existing deployments
4. Test database creation and persistence

### Phase 2: Episode Storage (2-3 hours)
1. Implement `storeEpisode()` with table creation check
2. Add embedding generation for task
3. Test episode insertion and retrieval
4. Add error handling for storage failures

### Phase 3: Episode Retrieval (3-4 hours)
1. Implement vector similarity search for episodes
2. Add filtering by agent ID, success/failure
3. Implement time-based retrieval (recent episodes)
4. Add episode retrieval to agent context loading

### Phase 4: Testing & Validation (2-3 hours)
1. Unit tests for episode storage/retrieval
2. Integration tests with real LLM flow
3. Test cross-agent learning scenario
4. Performance testing (1000+ episodes)

## Acceptance Criteria

- [x] Episodes table created automatically on init
- [x] `storeEpisode()` persists to database
- [x] `retrieveEpisodes()` returns similar past tasks
- [x] Vector similarity search works for episodes
- [x] Episodes persist across application restarts
- [x] No errors in STDOUT log for episode storage
- [ ] Unit tests cover storage/retrieval (80% coverage) → Deferred
- [ ] Integration test validates end-to-end flow → Deferred

## Dependencies

- CR-007 (AgentDB caching) - Already implemented
- Database library: better-sqlite3 or existing WASM SQLite
- Embedding service (already implemented)
- LLM Engine (already integrated)

## Estimated Effort

- Database Schema: 2-3 hours
- Episode Storage: 2-3 hours
- Episode Retrieval: 3-4 hours
- Testing & Validation: 2-3 hours
- **Total: 9-13 hours (1-2 days)**

## Benefits

**Learning from Experience:**
- Agents avoid repeating past mistakes
- Successful patterns reinforced
- Faster task completion over time

**Cross-Agent Intelligence:**
- Specialized agents share knowledge
- System-wide learning accumulation
- Emergent behavior from shared memory

**Debugging & Analysis:**
- Task history for troubleshooting
- Performance metrics per agent
- Success rate tracking

## References

- CR-007: AgentDB Shared Memory (parent)
- Reflexion Paper: https://arxiv.org/abs/2303.11366
- AgentDB Episodes API: https://github.com/QuantGeekDev/agentdb

## Notes

- **Priority: LOW** - Semantic caching is more valuable and already working
- Episodes are supplementary - not required for core functionality
- Consider privacy: episodes store task history across sessions
- Implement pruning to avoid unbounded growth
- May need user consent for episodic learning in production
