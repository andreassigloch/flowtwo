# CR-010: Implement Cache Strategy Logic

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 1 (remaining work)
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

Canvas state loading currently lacks optimization logic to decide when to use cache, apply diffs, or fetch from Neo4j. According to [implan.md:100-104](../implan.md#L100-L104), the system needs intelligent cache strategy logic to:

- Decide: use cache vs apply diff vs fetch from Neo4j
- Load from Neo4j on session start
- Apply configurable cache invalidation
- Optimize data loading performance

**Current Status:** NOT IMPLEMENTED (marked as remaining Phase 1 work)

**Impact:** Without cache strategy logic, the system either always fetches from Neo4j (slow) or relies on stale cache (inconsistent). Users experience suboptimal performance and potential data inconsistencies.

## Requirements

**From implan.md Phase 1 remaining tasks:**
- Implement decision logic: cache vs diff vs Neo4j fetch
- Load from Neo4j on session start (fresh state)
- Configurable cache invalidation policies
- Optimize for minimal Neo4j queries

**Performance Requirements:**
- Canvas load time <500ms for cached state
- Diff application <200ms for incremental updates
- Neo4j fetch <2s for full graph (<500 nodes)

## Proposed Solution

### 1. Cache Strategy Decision Tree

```typescript
interface CacheStrategy {
  shouldUseCache(sessionId: string, lastModified: number): boolean;
  shouldApplyDiff(cacheAge: number, diffSize: number): boolean;
  shouldFetchFromNeo4j(reason: InvalidationReason): boolean;
}

enum InvalidationReason {
  SESSION_START,
  CACHE_EXPIRED,
  EXTERNAL_CHANGE,
  MANUAL_REFRESH,
  CACHE_MISS
}
```

**Decision Logic:**

1. **Session Start:**
   - Always fetch from Neo4j (ensure fresh state)
   - Cache result for future use

2. **Within Session:**
   - Cache age <5 min + no external changes → Use cache
   - Cache age 5-30 min + small diff available → Apply diff
   - Cache age >30 min OR large diff → Fetch from Neo4j

3. **External Changes Detected:**
   - WebSocket notification received → Fetch from Neo4j
   - Manual refresh requested → Fetch from Neo4j

### 2. Cache Metadata Tracking

```typescript
interface CacheMetadata {
  sessionId: string;
  workspaceId: string;
  cachedAt: number;
  lastModified: number;
  nodeCount: number;
  edgeCount: number;
  hash: string;
  version: number;
}
```

### 3. Diff Application Logic

**When to use diffs:**
- Cache exists and valid
- Diff size <10% of cached state
- Cache age <30 minutes

**Diff Structure:**
```typescript
interface CanvasDiff {
  added: { nodes: Node[], edges: Edge[] };
  modified: { nodes: Node[], edges: Edge[] };
  removed: { nodeIds: string[], edgeIds: string[] };
  timestamp: number;
}
```

## Implementation Plan

### Phase 1: Core Strategy Engine (3-4 hours)
1. Create `src/canvas/cache-strategy.ts`
2. Implement decision tree logic
3. Add cache metadata tracking
4. Define invalidation reasons and policies

### Phase 2: Cache Validation (2-3 hours)
1. Implement cache age checks
2. Add external change detection
3. Create cache hash validation
4. Handle cache miss scenarios

### Phase 3: Diff Application (2-3 hours)
1. Implement diff generation from Neo4j changes
2. Create diff application logic in GraphCanvas
3. Add diff size estimation
4. Handle diff conflicts (rare edge cases)

### Phase 4: Neo4j Integration (2-3 hours)
1. Add last_modified timestamps to Neo4j nodes
2. Implement efficient delta queries
3. Create fetch optimization for session start
4. Add connection pooling (if not already done)

### Phase 5: Testing & Optimization (2-3 hours)
1. Write unit tests for decision logic
2. Write integration tests with Neo4j
3. Benchmark cache vs diff vs fetch performance
4. Optimize cache hit rate
5. Test edge cases (concurrent changes, network failures)

## Acceptance Criteria

- [ ] Cache strategy logic implemented and functional
- [ ] Session start always fetches from Neo4j
- [ ] Within-session uses cache when valid (<5 min, no changes)
- [ ] Diff application works for small incremental updates
- [ ] External changes trigger Neo4j fetch
- [ ] Cache metadata tracked accurately
- [ ] Cache hit rate >70% for typical sessions
- [ ] Performance meets requirements (cache <500ms, diff <200ms, fetch <2s)
- [ ] Unit tests cover decision logic (70% coverage)
- [ ] Integration tests validate Neo4j interaction

## Dependencies

- Canvas state management (already implemented)
- Neo4j client (already implemented)
- WebSocket server for change notifications (implemented in Phase 2)
- Cache metadata storage (filesystem or AgentDB)

## Estimated Effort

- Core Strategy Engine: 3-4 hours
- Cache Validation: 2-3 hours
- Diff Application: 2-3 hours
- Neo4j Integration: 2-3 hours
- Testing & Optimization: 2-3 hours
- **Total: 11-16 hours (1.5-2 days)**

## Benefits

**Performance:**
- Reduce Neo4j queries by 70-80%
- Faster canvas loading (cache: <500ms vs fetch: 2s)
- Lower database load

**Consistency:**
- Always fresh state on session start
- Incremental updates via diffs
- Automatic invalidation on external changes

**Scalability:**
- Support more concurrent users
- Lower database connection requirements
- Better resource utilization

## References

- [implan.md:100-104](../implan.md#L100-L104) - Phase 1 Cache Strategy section
- requirements.md FR-10.2 - Caching requirements
- CR-007 - AgentDB Persistent Caching (complements this CR)

## Notes

- **NOT related to LLM agent memory** - CR-007 handles AgentDB for spawned agent shared memory
- **Focus:** Graph display optimization (Neo4j vs cached canvas state)
- This CR focuses on **when to load graph data** (cache vs diff vs Neo4j)
- Cache strategy is critical for multi-user scenarios (WebSocket changes)
- Consider eventual consistency trade-offs (cache lag vs performance)
- Monitor cache hit rates in production and adjust thresholds
- Metadata storage could use filesystem or simple key-value store (AgentDB not required)
