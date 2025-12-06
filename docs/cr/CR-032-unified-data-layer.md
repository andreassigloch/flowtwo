# CR-032: Unified Data Layer Architecture

**Type:** Architecture / Refactoring
**Status:** Planned
**Priority:** CRITICAL
**Target Phase:** Foundation for all future CRs
**Created:** 2025-12-05
**Author:** andreas@siglochconsulting

**Supersedes:** CR-021 (Graph in AgentDB - Phase 1 complete, Phase 2-3 replaced by this CR)
**Integrates:** CR-026 (Self-Learning - becomes feature on top of this architecture)
**Blocks:** All future CRs should build on this foundation

## Problem Statement

### Current State: Three Disconnected Data Sources

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Neo4j     │    │   Canvas    │    │  AgentDB    │
│ (database)  │    │  (UI state) │    │  (cache)    │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └────── No coordination ──────────────┘
```

**Evidence from codebase analysis:**

| Component | Reads From | Problem |
|-----------|------------|---------|
| Views | Canvas state | ✓ Correct |
| LLM Engine | AgentDB snapshot OR Canvas | Inconsistent - may see stale data |
| Validation | Neo4j direct | Different data than LLM sees |
| Similarity Scorer | Neo4j + embedding cache | Stale embeddings, no invalidation |

### Specific Issues Found

**Issue 1: Response Cache Ignores Graph Context**
- Location: [agentdb-service.ts:46-75](../../src/llm-engine/agentdb/agentdb-service.ts#L46-L75)
- Cache key: query text only (semantic similarity)
- Same query on different graph → same cached response → duplicate nodes

**Issue 2: Validation Uses Neo4j, LLM Uses Canvas**
- Location: [rule-evaluator.ts:95-98](../../src/llm-engine/validation/rule-evaluator.ts#L95-L98)
- Validation queries Neo4j directly
- Canvas has uncommitted changes (dirty tracking, auto-save delay)
- Validation results don't reflect current canvas state

**Issue 3: 6 Independent Caches Without Coordination**
- Response cache (AgentDB)
- Graph snapshot (AgentDB)
- Embedding cache (SimilarityScorer)
- Agent execution history
- WebSocket broadcast cache
- Canvas dirty set

**Issue 4: Operations Persistence Not Atomic**
- Location: [chat-interface.ts:1660-1680](../../src/terminal-ui/chat-interface.ts#L1660-L1680)
- Operations applied to Canvas memory
- No immediate Neo4j save (debounced auto-save)
- Crash = data loss

**Issue 5: No Variant Support for Optimization**
- Optimizer needs to compare multiple graph variants
- Current architecture: single graph only
- No isolation for experimental modifications

**Issue 6: No Deduplication on Import/Write (2025-12-05 discovery)**
- LLM agent "cleaned duplicates" in Canvas memory but not persisted to Neo4j
- Double-imports created 366 duplicate edges and 184 duplicate nodes
- Same semanticId with different UUIDs allowed
- Same (source, target, type) edge allowed with different UUIDs
- Validation showed false positives: "LLMIntegration.FN.001 / LLMIntegration.FN.001" (100% similar = same node twice)
- Root cause: No uniqueness constraints at write layer

## Requirements

### Functional Requirements

**FR-1: Single Source of Truth**
- AgentDB is the authoritative data store during session
- All components read from AgentDB
- All writes go through AgentDB

**FR-2: Full Graph CRUD in AgentDB**
- Node/Edge CRUD operations (not just Format E snapshots)
- Version tracking with monotonic counter
- Change notifications to dependent caches

**FR-3: Variant Isolation**
- Create isolated graph variants for optimization
- Compare variants without affecting main graph
- Hot/warm/cold tiering for memory efficiency

**FR-4: Unified Cache Invalidation**
- Graph version change invalidates all dependent caches
- Response cache keyed by query + graph version
- Embedding cache invalidated on node content change

**FR-5: Canvas as Stateless UI Layer**
- Canvas fetches from AgentDB on demand
- No local node/edge Maps
- View transformations only

**FR-6: Neo4j as Cold Storage**
- Load session: Neo4j → AgentDB
- Save session: AgentDB → Neo4j
- Complex Cypher queries delegated to Neo4j when needed

### Non-Functional Requirements

**NFR-1:** Read latency < 1ms (in-memory)
**NFR-2:** Write latency < 5ms (with version increment)
**NFR-3:** Memory overhead < 500KB per 1000 nodes
**NFR-4:** Zero data loss on graceful shutdown
**NFR-5:** Crash recovery from Neo4j (last persisted state)

## Architecture / Solution Approach

### Target Architecture (RuVector/Agentic-Flow Inspired)

```
┌─────────────────────────────────────────────────────────────────┐
│                     AgentDB (RuVector-style)                    │
│                   Single Source of Truth                        │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │   Graph Store    │  │  ReasoningBank   │  │ Skill Library │ │
│  │                  │  │                  │  │               │ │
│  │ • Nodes/Edges    │  │ • Graph state    │  │ • Successful  │ │
│  │ • Version track  │  │   embeddings     │  │   patterns    │ │
│  │ • CRUD methods   │  │ • GNN reranking  │  │ • Agent       │ │
│  │ • Change events  │  │   (future)       │  │   effectiveness│ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Reflexion Memory │  │  Variant Pool    │                    │
│  │                  │  │                  │                    │
│  │ • Task outcomes  │  │ • Isolated       │                    │
│  │ • Reward scores  │  │   graph copies   │                    │
│  │ • Critiques      │  │ • Compression    │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   Canvas     │  │ Agent Swarm  │  │  Validation  │
    │  (stateless) │  │              │  │              │
    │              │  │ • Ephemeral  │  │ • Reads from │
    │ • Views      │  │   agents     │  │   AgentDB    │
    │ • Layout     │  │ • Shared     │  │ • Same data  │
    │ • Transform  │  │   memory     │  │   as LLM     │
    └──────────────┘  └──────────────┘  └──────────────┘
                              │
                              ↓
                      ┌──────────────┐
                      │    Neo4j     │
                      │ (cold store) │
                      │              │
                      │ • Persist    │
                      │ • Complex    │
                      │   Cypher     │
                      │ • History    │
                      └──────────────┘
```

### AgentDB API Evolution

**Current API (CR-021 Phase 1):**
```typescript
// Snapshot-only storage
storeGraphSnapshot(systemId, formatE): void
getGraphSnapshot(systemId): string | null
invalidateGraphSnapshot(systemId): void
checkCache(query): CachedResponse | null
cacheResponse(query, response, operations): void
storeEpisode(...): void
```

**Proposed API (CR-032):**
```typescript
// === Graph Store (new) ===
getNode(semanticId): Node | null
setNode(node): void
deleteNode(semanticId): void
getNodes(filter?: NodeFilter): Node[]
getEdge(key): Edge | null
setEdge(edge): void
deleteEdge(key): void
getEdges(filter?: EdgeFilter): Edge[]
getGraphVersion(): number
onGraphChange(callback): unsubscribe

// === Variant Pool (new) ===
createVariant(baseSystemId): variantId
getVariant(variantId): GraphState
applyToVariant(variantId, diff): void
promoteVariant(variantId): void  // becomes main graph
discardVariant(variantId): void
listVariants(): VariantInfo[]

// === ReasoningBank (enhanced) ===
embedGraphState(systemId): vector
findSimilarStates(vector, k): GraphState[]
recordScore(systemId, score, phase): void

// === Response Cache (fixed) ===
checkCache(query, graphVersion): CachedResponse | null  // version in key!
cacheResponse(query, graphVersion, response, operations): void

// === Skill Library (new, from CR-026) ===
recordSuccess(pattern, context): void
findApplicablePatterns(context): Pattern[]

// === Reflexion Memory (enhanced, from CR-026) ===
storeEpisode(agentId, task, reward, success, critique, output): void
retrieveEpisodes(agentId, task?, k?): Episode[]
getAgentEffectiveness(agentId): EffectivenessMetrics

// === Persistence ===
loadFromNeo4j(workspaceId, systemId): void
persistToNeo4j(): void
```

### Canvas Transformation

**Current Canvas (stateful):**
```typescript
class GraphCanvas {
  private state: GraphCanvasState;  // owns the data
  private dirty: Set<string>;        // tracks changes

  getState(): GraphCanvasState { return this.state; }
  applyDiff(diff): void { /* modifies this.state */ }
}
```

**Proposed Canvas (stateless):**
```typescript
class GraphCanvas {
  private agentDB: AgentDBService;  // reference only

  getState(): GraphCanvasState {
    // Fetch on demand from AgentDB
    return {
      nodes: this.agentDB.getNodes(),
      edges: this.agentDB.getEdges(),
      version: this.agentDB.getGraphVersion(),
    };
  }

  applyDiff(diff): void {
    // Delegate to AgentDB
    for (const op of diff.operations) {
      if (op.type === 'add_node') this.agentDB.setNode(op.node);
      if (op.type === 'remove_node') this.agentDB.deleteNode(op.semanticId);
      // etc.
    }
    // AgentDB handles version increment and notifications
  }
}
```

### Validation Fix

**Current (queries Neo4j):**
```typescript
// rule-evaluator.ts:95
const nodes = await this.loadNodesForSimilarity(workspaceId, systemId);
// ↑ This queries Neo4j!
```

**Proposed (reads AgentDB):**
```typescript
const nodes = this.agentDB.getNodes({ workspaceId, systemId });
// Same data that LLM sees
```

### Response Cache Fix

**Current (query only):**
```typescript
checkCache(query: string)  // ignores graph state
```

**Proposed (query + version):**
```typescript
checkCache(query: string, graphVersion: number)
// Different graph = different cache entry
```

## Implementation Plan

### Phase 1: AgentDB Graph Store (8-12 hours)

**1.1 Add CRUD methods to AgentDB**
- `getNode/setNode/deleteNode`
- `getEdge/setEdge/deleteEdge`
- `getNodes/getEdges` with filters
- Version tracking with monotonic counter

**1.2 Enforce uniqueness constraints**
- `setNode()` rejects duplicate semanticId (different uuid)
- `setEdge()` rejects duplicate (source, target, type) combinations
- Throw `DuplicateSemanticIdError` / `DuplicateEdgeError` on violation
- Optional: `setNode(node, { upsert: true })` to allow intentional overwrites

```typescript
// Example implementation in graph-store.ts
setNode(node: Node, options?: { upsert?: boolean }): void {
  const existing = this.nodes.get(node.semanticId);
  if (existing && existing.uuid !== node.uuid && !options?.upsert) {
    throw new DuplicateSemanticIdError(node.semanticId, existing.uuid, node.uuid);
  }
  this.nodes.set(node.semanticId, node);
  this.version++;
  this.emit('change', { type: 'node', id: node.semanticId });
}

setEdge(edge: Edge, options?: { upsert?: boolean }): void {
  const key = `${edge.sourceId}|${edge.type}|${edge.targetId}`;
  const existing = this.edgeIndex.get(key);
  if (existing && existing.uuid !== edge.uuid && !options?.upsert) {
    throw new DuplicateEdgeError(edge.sourceId, edge.targetId, edge.type);
  }
  this.edges.set(edge.uuid, edge);
  this.edgeIndex.set(key, edge);
  this.version++;
  this.emit('change', { type: 'edge', id: edge.uuid });
}
```

**1.3 Add change notification system**
- `onGraphChange(callback)` subscription
- Emit on any write operation
- Include affected IDs and version

**1.4 Update response cache key**
- Include graph version in cache lookup
- Invalidate on version change

**Files:**
- `src/llm-engine/agentdb/agentdb-service.ts` (extend)
- `src/llm-engine/agentdb/graph-store.ts` (new)
- `src/llm-engine/agentdb/types.ts` (extend)
- `src/llm-engine/agentdb/errors.ts` (new - DuplicateSemanticIdError, DuplicateEdgeError)

### Phase 2: Canvas Stateless Refactor (6-8 hours)

**2.1 Remove state from GraphCanvas**
- Remove `private state: GraphCanvasState`
- Remove `private dirty: Set<string>`
- Inject AgentDB reference

**2.2 Delegate to AgentDB**
- `getState()` fetches from AgentDB
- `applyDiff()` writes to AgentDB
- Remove dirty tracking (AgentDB handles it)

**2.3 Update all Canvas consumers**
- Views: no change (still call getState())
- Chat interface: no change (still call applyDiff())
- WebSocket: broadcast version change events

**Files:**
- `src/canvas/graph-canvas.ts` (refactor)
- `src/canvas/canvas-base.ts` (simplify)
- `src/canvas/chat-canvas.ts` (update)

### Phase 3: Validation Integration (4-6 hours)

**3.1 Change RuleEvaluator data source**
- Replace Neo4j queries with AgentDB reads
- Same data as LLM sees

**3.2 Update SimilarityScorer**
- Read nodes from AgentDB
- Invalidate embeddings on node change (via subscription)

**Files:**
- `src/llm-engine/validation/rule-evaluator.ts`
- `src/llm-engine/validation/similarity-scorer.ts`

### Phase 4: Variant Pool (6-8 hours)

**4.1 Implement variant isolation**
- `createVariant(baseId)` - deep copy
- `applyToVariant(id, diff)` - isolated changes
- `promoteVariant(id)` - replace main graph
- `discardVariant(id)` - cleanup

**4.2 Add compression tiering**
- Hot: full precision, frequent access
- Warm: full precision, infrequent access
- Cold: compressed, archived

**Files:**
- `src/llm-engine/agentdb/variant-pool.ts` (new)

### Phase 5: Neo4j Persistence Layer (4-6 hours)

**5.1 Implement sync operations**
- `loadFromNeo4j()` - populate AgentDB on session start
- `persistToNeo4j()` - save AgentDB to Neo4j

**5.2 Add auto-persist**
- Periodic persistence (configurable interval)
- Persist on graceful shutdown
- Dirty tracking in AgentDB

**Files:**
- `src/llm-engine/agentdb/neo4j-sync.ts` (new)

### Phase 6: CR-026 Integration (Self-Learning) (8-12 hours)

With unified data layer in place, CR-026 becomes straightforward:

**6.1 Skill Library**
- Store successful patterns in AgentDB
- Query by context similarity

**6.2 Enhanced Reflexion Memory**
- Automatic reward from validation (same data source!)
- Critique generation from rule violations
- Episode context loading

**Files:**
- `src/llm-engine/agentdb/skill-library.ts` (new)
- `src/llm-engine/agentdb/reflexion-memory.ts` (enhance)

## Current Status

- [ ] Phase 1: AgentDB Graph Store
- [ ] Phase 2: Canvas Stateless Refactor
- [ ] Phase 3: Validation Integration
- [ ] Phase 4: Variant Pool
- [ ] Phase 5: Neo4j Persistence Layer
- [ ] Phase 6: CR-026 Integration

## Acceptance Criteria

### Data Consistency
- [ ] All components read from AgentDB (no Neo4j bypass)
- [ ] Validation sees same data as LLM
- [ ] Response cache includes graph version
- [ ] Graph changes invalidate dependent caches

### Data Integrity (Deduplication)
- [ ] `setNode()` rejects duplicate semanticId with different uuid
- [ ] `setEdge()` rejects duplicate (source, target, type) with different uuid
- [ ] Import operations use `{ upsert: true }` for intentional overwrites
- [ ] No duplicate nodes/edges can enter the system

### Canvas Stateless
- [ ] Canvas has no private node/edge Maps
- [ ] Canvas delegates all writes to AgentDB
- [ ] Views still work correctly

### Variant Support
- [ ] Can create isolated variants
- [ ] Optimizer can compare variants
- [ ] Variants don't affect main graph

### Persistence
- [ ] Session loads from Neo4j on start
- [ ] Session persists to Neo4j on shutdown
- [ ] No data loss on graceful shutdown

### Self-Learning (CR-026)
- [ ] Skill Library stores successful patterns
- [ ] Reflexion Memory has automatic reward
- [ ] Agents learn from past episodes

## Dependencies

- CR-021 Phase 1 complete (graph snapshot caching) - foundation
- Neo4j connection working
- Existing validation rules (ontology-rules.json)

## Estimated Effort

| Phase | Effort | Cumulative |
|-------|--------|------------|
| Phase 1: AgentDB Graph Store | 8-12 hours | 8-12 hours |
| Phase 2: Canvas Stateless | 6-8 hours | 14-20 hours |
| Phase 3: Validation Integration | 4-6 hours | 18-26 hours |
| Phase 4: Variant Pool | 6-8 hours | 24-34 hours |
| Phase 5: Neo4j Persistence | 4-6 hours | 28-40 hours |
| Phase 6: CR-026 Integration | 8-12 hours | 36-52 hours |

**Total: 36-52 hours (5-7 days)**

## Migration Strategy

### Backward Compatibility

During migration, support both patterns:

```typescript
// Temporary: Canvas can use either pattern
class GraphCanvas {
  private legacyState?: GraphCanvasState;  // old pattern
  private agentDB?: AgentDBService;         // new pattern

  getState(): GraphCanvasState {
    if (this.agentDB) {
      return this.agentDB.getGraphState();
    }
    return this.legacyState!;
  }
}
```

### Feature Flags

```typescript
// config.ts
export const USE_UNIFIED_DATA_LAYER = process.env.USE_UNIFIED_DATA_LAYER === 'true';
```

### Rollback Plan

If issues found:
1. Set `USE_UNIFIED_DATA_LAYER=false`
2. Canvas uses legacy state pattern
3. No data loss (Neo4j is backup)

## Benefits

### Immediate
- ✅ Consistent data across all components
- ✅ No more stale cache issues
- ✅ Validation reflects actual state

### Medium-term
- ✅ Variant support for optimization
- ✅ Self-learning via CR-026
- ✅ Simpler Canvas code

### Long-term
- ✅ Multi-agent coordination
- ✅ GNN-based scoring (RuVector pattern)
- ✅ Scalable to large graphs

## Risks & Mitigations

### Risk 1: Performance Regression
**Problem:** AgentDB reads slower than Canvas Map access
**Mitigation:** AgentDB uses in-memory Maps internally, same O(1) access

### Risk 2: Migration Complexity
**Problem:** Many files depend on Canvas state
**Mitigation:** Feature flags, gradual rollout, backward compatibility

### Risk 3: Data Loss During Migration
**Problem:** State in wrong place during transition
**Mitigation:** Neo4j is always backup, can recover from last persist

## References

- CR-021: Graph in AgentDB (Phase 1 complete)
- CR-026: Self-Learning with Ontology Rules
- [RuVector](https://github.com/ruvnet/ruvector) - Self-learning vector DB
- [Agentic-Flow](https://github.com/ruvnet/agentic-flow) - Multi-agent orchestration
- Codebase analysis: Data handling review (2025-12-05)
