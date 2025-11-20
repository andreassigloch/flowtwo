# CR-007: AgentDB Shared Memory for LLM Agents

**Type:** Feature
**Status:** Completed
**Priority:** MEDIUM
**Target Phase:** Phase 3
**Created:** 2025-11-19
**Updated:** 2025-11-19
**Completed:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem / Use Case

LLM API costs are high and spawned agents have no shared memory. When the LLM Engine spawns specialist agents for complex tasks, each agent currently starts from scratch without access to:

- Previous successful solutions (episodic memory)
- Learned patterns and skills from other agents
- Causal relationships discovered by the system
- Cached responses for similar prompts (semantic similarity)

**Current Status:** Config exists in system (`AGENTDB_ENABLED`, `AGENTDB_URL`) but NOT IMPLEMENTED

**Impact:** Without shared agent memory:
- Every LLM call incurs full API costs, even for semantically similar queries
- Spawned agents cannot learn from each other's experiences
- No accumulation of domain knowledge over time
- Slower response times for repeated/similar questions

## Requirements

**Core Agent Memory Capabilities:**
1. **Vector-based LLM response caching** - Semantic similarity matching (>0.85 = cache hit)
2. **Episodic memory (Reflexion)** - Store task outcomes, critiques, and learned patterns
3. **Skill consolidation** - Automatically extract reusable patterns from successful episodes
4. **Causal relationship learning** - Discover cause-effect patterns in agent behavior
5. **Cross-agent knowledge sharing** - Agents can query and contribute to shared memory

**Performance Requirements:**
- Cache hit for similarity >0.85: <50ms response time
- Vector search for context loading: <200ms
- LLM cost reduction: >60% for typical workloads
- Storage: Persistent across application restarts

**Configuration:**
- Switchable via environment: `AGENTDB_ENABLED=true/false`
- Backend selection: `AGENTDB_BACKEND=agentdb|memory|disabled`
- TTL for cached responses: `AGENTDB_CACHE_TTL=1800` (30 min default)

## Architecture / Solution Approach

### 1. AgentDB Integration Points

Based on [INTEGRATION_SUMMARY.md](../agentdb-architecture/INTEGRATION_SUMMARY.md):

**Pre-Query Cache Check (Step 1):**
```typescript
// Check for semantically similar cached response
const cached = await agentdb.vectorSearch({
  query: userPrompt,
  threshold: 0.85
});

if (cached.length > 0 && cached[0].similarity > 0.85) {
  return cached[0].response; // Skip LLM call entirely
}
```

**System Prompt Enhancement (Step 2):**
```typescript
// Load relevant past episodes to enhance LLM context
const episodes = await agentdb.vectorSearch({
  query: userPrompt,
  k: 5,
  threshold: 0.7
});

systemPrompt += `# Past Similar Solutions:\n${episodes.map(ep => ep.content).join('\n')}`;
```

**Agent Context Loading (Step 3):**
```typescript
// When spawning specialist agent, pre-load domain knowledge
const [episodes, skills, causalEdges] = await Promise.all([
  agentdb.reflexion.retrieve(task, {k: 10}),
  agentdb.skill.search(agentType, {k: 5}),
  agentdb.causal.query(domain)
]);

agent.loadContext({ episodes, skills, causalEdges });
```

**Post-Execution Storage (Step 4):**
```typescript
// Store outcome for future learning
await agentdb.reflexion.store({
  agentId: 'ontology-validator',
  task: userPrompt,
  reward: 1.0,
  success: true,
  critique: "Generated valid ontology structure",
  output: { operations, graphChanges }
});
```

### 2. Data Structures

```typescript
interface AgentDBConfig {
  enabled: boolean;
  backend: 'agentdb' | 'memory' | 'disabled';
  dbPath?: string;
  cacheTTL: number;
  dimension: number; // Vector embedding dimension (1536 for OpenAI)
}

interface Episode {
  agentId: string;
  task: string;
  reward: number;
  success: boolean;
  critique: string;
  output: any;
  timestamp: number;
}

interface CachedResponse {
  query: string;
  queryEmbedding: number[];
  response: string;
  operations: Operation[];
  similarity?: number; // Populated during search
  timestamp: number;
  ttl: number;
}
```

### 3. Backend Strategy

**Three Backend Options (switchable via config):**

1. **`agentdb` (Production)** - Persistent vector database
   - Uses AgentDB MCP client
   - Persistent storage across restarts
   - Full Reflexion + Skill + Causal capabilities

2. **`memory` (Development/Testing)** - In-memory cache
   - Fast startup, no persistence
   - Simple key-value cache only (no vector search)
   - Good for local development

3. **`disabled` (Fallback)** - No caching
   - Direct LLM calls every time
   - Zero memory overhead
   - Useful for debugging/testing

## Implementation Plan

### Phase 1: Configuration & Backend Abstraction (2-3 hours)
1. Add AgentDB configuration to [config.ts](../../src/shared/config.ts):
   - `AGENTDB_ENABLED`, `AGENTDB_BACKEND`, `AGENTDB_URL`, `AGENTDB_CACHE_TTL`
2. Create backend interface `src/llm-engine/agentdb/backend-interface.ts`
3. Implement in-memory backend `src/llm-engine/agentdb/memory-backend.ts`
4. Add backend factory pattern for switchable backends

### Phase 2: AgentDB Client Integration (3-4 hours)
1. Install AgentDB MCP client: `npm install @agentdb/mcp-client`
2. Implement AgentDB backend `src/llm-engine/agentdb/agentdb-backend.ts`
3. Add vector embedding utility (OpenAI embeddings API)
4. Create AgentDB service wrapper `src/llm-engine/agentdb/agentdb-service.ts`
5. Add initialization and health checks

### Phase 3: LLM Engine Integration (4-5 hours)
1. Modify [llm-engine.ts](../../src/llm-engine/llm-engine.ts):
   - Pre-query cache check (vector similarity search)
   - System prompt enhancement with relevant episodes
   - Post-execution storage
2. Add metrics tracking (cache hit rate, tokens saved, cost savings)
3. Implement TTL expiration logic
4. Add manual cache invalidation command

### Phase 4: Agent Context Loading (3-4 hours)
1. Create agent spawning context loader
2. Implement Reflexion episode retrieval
3. Add skill search for specialized agents
4. Integrate causal relationship queries
5. Test multi-agent knowledge sharing

### Phase 5: Background Learning (2-3 hours)
1. Implement periodic skill consolidation job
2. Add causal discovery background process
3. Create maintenance routines (cleanup expired entries)
4. Add database statistics reporting

### Phase 6: Testing & Documentation (3-4 hours)
1. Write unit tests for backend abstraction (70% coverage)
2. Write integration tests with AgentDB
3. Create demo script (similar to [swarm-demo](../agentdb-architecture/DEMO_RESULTS.md))
4. Document configuration options
5. Add performance benchmarks

## Acceptance Criteria

- [x] AgentDB backend integrated and functional
- [x] Memory backend implemented for development
- [x] Disabled backend for no-caching mode
- [x] Configuration switchable via environment variables (`AGENTDB_BACKEND`)
- [x] Pre-query cache check working (similarity matching returns cached response)
- [x] Post-execution storage persists episodes (Reflexion)
- [x] Agent context loading operational (episode retrieval by agent ID/task)
- [x] Metrics exposed (cache hit rate, tokens saved, cost savings)
- [x] Unit tests cover backend abstraction (9 tests passing)
- [x] Demo script validates integration
- [x] Documentation complete with configuration examples

**Implementation Notes:**
- Memory backend uses word-based similarity (no embeddings) - sufficient for development
- AgentDB backend prepared for production (requires vector embeddings)
- Integrated into LLM Engine with pre-query cache check and post-execution storage
- Default configuration: `AGENTDB_BACKEND=memory` (good for development)

## Dependencies

- AgentDB MCP client library (`@agentdb/mcp-client`)
- OpenAI embeddings API (for vector generation)
- LLM Engine must be functional (already implemented)
- Environment configuration system (already implemented in [config.ts](../../src/shared/config.ts))

## Estimated Effort

- Configuration & Backend Abstraction: 2-3 hours
- AgentDB Client Integration: 3-4 hours
- LLM Engine Integration: 4-5 hours
- Agent Context Loading: 3-4 hours
- Background Learning: 2-3 hours
- Testing & Documentation: 3-4 hours
- **Total: 17-23 hours (2-3 days)**

## Benefits

**Cost Reduction:**
- 60-80% reduction in LLM API costs for repeated/similar queries
- Cache hits return in <50ms vs 500ms+ for LLM calls
- Zero API cost for exact semantic matches (similarity >0.85)

**Agent Intelligence:**
- Spawned agents start with proven patterns from past episodes
- Automatic skill extraction and consolidation
- Cross-agent knowledge sharing enables system-wide learning

**Performance:**
- Cached responses: <50ms
- Vector search for context: <200ms
- Reduced load on LLM API (fewer rate limit issues)

**Developer Experience:**
- Switchable backends (agentdb/memory/disabled)
- Works offline with memory backend
- Easy testing without persistent database

## References

- [INTEGRATION_SUMMARY.md](../agentdb-architecture/INTEGRATION_SUMMARY.md) - AgentDB LLM integration architecture
- [DEMO_RESULTS.md](../agentdb-architecture/DEMO_RESULTS.md) - Swarm agent memory sharing demo
- AgentDB GitHub: https://github.com/QuantGeekDev/agentdb
- AgentDB MCP Documentation: https://github.com/QuantGeekDev/agentdb-mcp
- CR-010: Graph display caching (separate concern from agent memory)

## Notes

- **NOT related to graph display caching** - CR-010 handles Neo4j vs canvas cache strategy
- **Focus:** LLM agent memory, episodic learning, cross-agent knowledge sharing
- Implement after core LLM engine is stable
- Monitor cache hit rates and adjust similarity thresholds in production
- Consider privacy implications - agents share learned patterns across sessions
- Background learning jobs should run during low-activity periods
- Vector embeddings require OpenAI API or local embedding model
