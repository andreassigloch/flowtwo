# CR-007: AgentDB Persistent Caching

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 3
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

LLM API costs are high and response times can be slow for repeated queries. According to [implan.md:214-232](../implan.md#L214-L232) and requirements.md FR-10.2, the system should implement persistent caching to:

- Reduce LLM API costs for repeated/similar queries
- Improve response times for cached interactions
- Enable offline capability for previously cached content
- Store canvas state history per chat session
- Cache ontology snapshots per workspace

**Current Status:** Config exists in system but NOT IMPLEMENTED

**Impact:** Without caching, every LLM interaction incurs API costs and latency, even for identical queries. Users experience slower response times and higher operational costs.

## Requirements

**From requirements.md FR-10.2:**
- Cache LLM responses by (prompt hash + canvas hash)
- Cache canvas state history per chat session
- Cache ontology snapshots per workspace
- Cache derivation rules
- Configurable TTL (default: 30 min for responses, persistent for history)
- Cache invalidation on canvas state changes

## Proposed Solution

### 1. AgentDB Integration
**Library:** AgentDB MCP client (https://github.com/QuantGeekDev/agentdb)

```typescript
interface CacheKey {
  promptHash: string;
  canvasHash: string;
  ontologyVersion: string;
}

interface CachedLLMResponse {
  key: CacheKey;
  response: string;
  operations: Operation[];
  timestamp: number;
  ttl: number; // milliseconds
}
```

### 2. Cache Strategy

**LLM Response Caching:**
- Hash prompt + canvas state → cache key
- Check cache before LLM call
- Store response after LLM call
- TTL: 30 minutes (configurable)
- Invalidate on canvas mutations

**Canvas State History:**
- Store per chat session
- Never expire (persistent)
- Enable undo/redo functionality
- Support session replay

**Ontology Snapshots:**
- Store per workspace
- Update on schema changes
- Enable version rollback
- Persistent storage

### 3. Cache Invalidation Rules

**Invalidate LLM cache when:**
- Canvas state changes (node/edge added/removed/modified)
- Ontology schema updated
- Derivation rules modified
- TTL expires

**Never invalidate:**
- Canvas state history
- Ontology snapshots (versioned)
- Audit logs

## Implementation Plan

### Phase 1: AgentDB Setup (2-3 hours)
1. Install AgentDB MCP client
2. Configure connection in `src/config/cache-config.ts`
3. Create cache client wrapper in `src/cache/agentdb-client.ts`
4. Add environment configuration for cache settings

### Phase 2: LLM Response Caching (4-5 hours)
1. Implement hash functions for prompts and canvas state
2. Add cache check in `src/llm-engine/llm-engine.ts`
3. Store responses in AgentDB after LLM calls
4. Implement TTL expiration logic
5. Add cache hit/miss metrics

### Phase 3: Canvas State History (3-4 hours)
1. Create `src/cache/canvas-history.ts`
2. Store canvas snapshots on every mutation
3. Associate history with chat session ID
4. Implement history retrieval API
5. Add undo/redo support

### Phase 4: Ontology Snapshot Caching (2-3 hours)
1. Create `src/cache/ontology-cache.ts`
2. Store ontology snapshots on schema changes
3. Version snapshots for rollback capability
4. Implement workspace-level isolation

### Phase 5: Cache Invalidation (2-3 hours)
1. Implement invalidation triggers
2. Add canvas state change listeners
3. Handle ontology update events
4. Create cache cleanup routines
5. Add manual cache clear command

### Phase 6: Testing & Monitoring (3-4 hours)
1. Write unit tests for cache logic
2. Write integration tests with AgentDB
3. Add cache performance metrics
4. Test cache hit rate optimization
5. Document cache configuration options

## Acceptance Criteria

- [ ] AgentDB client integrated and functional
- [ ] LLM responses cached by (prompt hash + canvas hash)
- [ ] Cache hit rate >60% for typical user sessions
- [ ] Canvas state history persists across restarts
- [ ] Ontology snapshots stored per workspace
- [ ] TTL configuration works (default 30 min)
- [ ] Cache invalidation triggers on canvas mutations
- [ ] Cache metrics exposed (hit rate, size, evictions)
- [ ] Unit tests cover cache logic (70% coverage)
- [ ] Integration tests validate AgentDB interaction

## Dependencies

- AgentDB MCP client library
- LLM Engine must be functional (already implemented)
- Canvas state management (already implemented)
- Ontology schema definition (already implemented)

## Estimated Effort

- AgentDB Setup: 2-3 hours
- LLM Response Caching: 4-5 hours
- Canvas State History: 3-4 hours
- Ontology Snapshot Caching: 2-3 hours
- Cache Invalidation: 2-3 hours
- Testing & Monitoring: 3-4 hours
- **Total: 16-22 hours (2-3 days)**

## Benefits

**Cost Reduction:**
- Reduce LLM API costs by 60-80% for cached queries
- Lower Neo4j query load for repeated canvas access

**Performance:**
- Cached responses: <50ms vs 500ms+ for LLM calls
- Faster canvas loading from history
- Offline capability for cached content

**User Experience:**
- Instant responses for repeated questions
- Reliable undo/redo functionality
- Session replay capability

## References

- [implan.md:214-232](../implan.md#L214-L232) - Phase 3 AgentDB Caching section
- requirements.md FR-10.2 - Caching requirements
- AgentDB documentation: https://github.com/QuantGeekDev/agentdb

## Notes

- Implement after auto-derivation (CR-005) and validation (CR-006)
- Monitor cache hit rates in production
- Consider distributed caching for multi-instance deployments
- AgentDB MCP provides persistent storage without managing separate database
- Cache invalidation is critical - prefer aggressive invalidation over stale data
