# CR-021: Graph State in AgentDB Shared Memory

**Type:** Architecture / Performance
**Status:** Analysis
**Priority:** HIGH
**Created:** 2025-11-20

## Problem Statement

**Current architecture sends entire graph in every LLM prompt:**
- Graph serialized to Format E (~5000+ chars for 107 nodes)
- Sent via Anthropic Prompt Caching (90% discount after first call)
- **Works for single agent, but doesn't scale for multi-agent scenarios**

**Multi-agent future requirement:**
- Multiple specialized agents working on same graph (validation, generation, analysis)
- Each agent needs graph context
- Sending full graph to each agent = redundant, expensive
- **Need shared memory accessible by all agents**

---

## Current State Analysis

### Graph is Already Text (Format E)

**Key Insight:** Graph state is already a text format (Format E), not a binary structure!

**Example:** [examples/graphengine-self-graph.txt](../../examples/graphengine-self-graph.txt)
- 180 nodes, 350 edges
- 29 KB text file
- Human-readable, diff-friendly
- Already serializable

**Current Storage:**
```
File System: examples/*.format-e (static snapshots)
  ↓
Neo4j: Cypher (queryable, durable)
  ↓
GraphCanvas: Map<string, Node> (runtime, in-memory)
  ↓
Format E: String (serialized for LLM)
```

**Reality:** Graph is ALWAYS text-based (Format E), never binary. Neo4j is just structured storage of that text.

### How Graph is Currently Accessed

**Single LLM Agent Flow:**
```
User Request
  ↓
GraphCanvas.getState() → Map<string, Node>
  ↓
parser.serializeGraph() → Format E string (~10ms)
  ↓
buildSystemPrompt() → Anthropic cache_control
  ↓
LLM processes with full graph context
```

**Token Usage (107 nodes, 35 edges):**
- First call: ~6000 tokens (write to cache)
- Subsequent: 12 new + 1422 cached = 1434 tokens
- Cost savings: 90% via prompt caching

**Limitations:**
- ❌ Serialization happens every request (~10ms overhead)
- ❌ Graph only in one agent's cache (Anthropic's)
- ❌ Other agents cannot access same snapshot
- ❌ Cache tied to specific prompt structure
- ❌ Changes invalidate entire cache

**Opportunity:**
- ✅ Format E is ALREADY text → Perfect for AgentDB
- ✅ No complex serialization needed (already done)
- ✅ Just store string, retrieve string
- ✅ **Simplest possible shared memory implementation**

---

## AgentDB Capabilities Analysis

### What AgentDB Provides

**From AgentDB README & Code Review:**

1. **Shared Memory Store**
   - Sub-millisecond memory engine
   - Embedded SQLite (disk or memory)
   - Vector search with semantic similarity
   - Universal runtime (Node.js, browser, edge)

2. **Memory Types**
   - **Semantic Cache**: LLM response caching (query → response)
   - **Episodic Memory**: Agent experience replay (Reflexion)
   - **Skill Library**: Successful patterns consolidation
   - **Causal Memory**: Intervention-based causality tracking
   - **Pattern Store**: Reasoning patterns with embeddings

3. **Current Implementation in GraphEngine**
   - [agentdb-service.ts](../../src/llm-engine/agentdb/agentdb-service.ts)
   - Methods: `checkCache()`, `cacheResponse()`, `storeEpisode()`, `loadAgentContext()`
   - Backend: In-memory Map (word-based matching) or AgentDB (vector embeddings)

4. **Perfect Match for Format E**
   - ✅ Format E = Text → AgentDB stores text natively
   - ✅ Semantic search → Find similar graphs/subgraphs
   - ✅ Shared memory → All agents access same snapshot
   - ⚠️ No graph-specific queries (but Format E is parseable)

---

## Proposed Solution: Graph in AgentDB Memory

### Strategy 1: Store Format E Text in AgentDB (SIMPLEST)

**Concept:** Graph is ALREADY text → Just store it!

```typescript
// Store Format E snapshot (already a string!)
const formatEString = parser.serializeGraph(graphCanvas.getState());
await agentdb.storeGraphSnapshot(systemId, formatEString);

// Retrieve for any agent
const formatEString = await agentdb.getGraphSnapshot(systemId);
// Parse if needed: parser.parseGraph(formatEString)
```

**Implementation:**
- **Store:** Format E string as-is (no conversion needed!)
- **Retrieve:** String lookup by systemId
- **Update:** Invalidate + re-store on graph changes
- **TTL:** 1 hour (or until graph modified)

**Why This Works:**
- ✅ Format E is ALREADY text (examples/graphengine-self-graph.txt)
- ✅ No serialization complexity (already done for LLM)
- ✅ Human-readable (debug-friendly)
- ✅ Version-controllable (git diff works)

**Pros:**
- ✅ Trivial implementation (~50 lines of code)
- ✅ Reuses existing AgentDB infrastructure
- ✅ Available to all agents instantly
- ✅ Fast retrieval (sub-ms from memory backend)
- ✅ Semantic search possible (e.g., "graphs with payment functions")

**Cons:**
- ❌ Full re-serialization on every update (~10ms)
- ❌ No partial updates (but Format E Diff exists!)
- ❌ No graph-specific queries (but parseable)
- ❌ Still sends full graph to LLM (Strategy 2 fixes this)

---

### Strategy 2: Smart Context Injection (Hybrid)

**Concept:** Keep graph in AgentDB + inject only relevant subgraph to LLM

```typescript
// Agent requests task
const task = "Add payment processing function";

// Extract relevant context from graph
const context = await agentdb.getRelevantContext(task, {
  nodeTypes: ['FUNC', 'FLOW'],
  maxNodes: 20,
  semanticSearch: true
});

// Build prompt with SUBSET, not full graph
const prompt = buildPrompt(task, context); // ~500 tokens vs 5000
```

**Implementation:**
1. **Store graph in AgentDB** (Format E text blob)
2. **Parse on retrieval** (Format E → Node/Edge objects)
3. **Semantic search for relevant nodes** (vector embeddings)
4. **Extract subgraph** (relevant nodes + neighbors)
5. **Serialize subset to Format E** (smaller prompt)

**Pros:**
- ✅ Dramatically reduces LLM token usage (10x reduction possible)
- ✅ Faster LLM responses (less context to process)
- ✅ Multi-agent ready (each gets relevant subset)
- ✅ Scales to large graphs (1000+ nodes)

**Cons:**
- ❌ Complex: requires graph parsing + traversal logic
- ❌ Risk: Missing relevant nodes (semantic search imperfect)
- ❌ Overhead: Parse Format E on every retrieval

---

### Strategy 3: Neo4j + AgentDB Dual Memory

**Concept:** Neo4j = source of truth, AgentDB = fast access layer

```typescript
// On graph change
await neo4j.saveNodes(dirtyNodes);           // Persist to Neo4j
await agentdb.invalidateGraph(systemId);     // Clear cache

// On agent request
let graph = await agentdb.getGraphSnapshot(systemId);
if (!graph) {
  graph = await neo4j.loadGraph(systemId);  // Fallback to Neo4j
  await agentdb.cacheGraphSnapshot(systemId, graph); // Cache for next time
}
```

**Implementation:**
- **Neo4j:** Source of truth (durable, queryable)
- **AgentDB:** Fast cache layer (in-memory, shared)
- **Sync:** Write-through on updates, cache-aside on reads

**Pros:**
- ✅ Best of both worlds (durability + speed)
- ✅ Multi-agent friendly (shared cache)
- ✅ No data loss (Neo4j backup)
- ✅ Fast reads (AgentDB sub-ms)

**Cons:**
- ❌ Additional complexity (two systems to manage)
- ❌ Cache invalidation overhead
- ❌ Still sends full graph to LLM (unless combined with Strategy 2)

---

## Recommendation: Hybrid Approach

**Phase 1: Graph Snapshot in AgentDB (Quick Win)**
- Store full Format E in AgentDB as semantic cache
- Share across multiple agents
- Minimal code changes
- **Effort:** 2-3 hours

**Phase 2: Smart Context Injection (Optimization)**
- Parse Format E to extract relevant subgraph
- Reduce LLM token usage by 5-10x
- Enable 1000+ node graphs
- **Effort:** 1-2 days

**Phase 3: Vector-Based Node Search (Advanced)**
- Embed individual nodes (not just full graph)
- Semantic search for "find all payment functions"
- True graph intelligence
- **Effort:** 3-5 days

---

## Implementation Plan: Phase 1

### Add Graph Snapshot Methods to AgentDB Service

**File:** [agentdb-service.ts](../../src/llm-engine/agentdb/agentdb-service.ts)

```typescript
/**
 * Store graph snapshot in shared memory
 */
async storeGraphSnapshot(
  systemId: string,
  formatEString: string,
  metadata?: { nodeCount: number; edgeCount: number }
): Promise<void> {
  const cached: CachedResponse = {
    query: `GRAPH_SNAPSHOT:${systemId}`,
    response: formatEString,
    operations: null,
    timestamp: Date.now(),
    ttl: 3600 * 1000, // 1 hour TTL
  };

  await this.backend!.cacheResponse(cached);
}

/**
 * Retrieve graph snapshot from shared memory
 */
async getGraphSnapshot(systemId: string): Promise<string | null> {
  const results = await this.backend!.vectorSearch(
    `GRAPH_SNAPSHOT:${systemId}`,
    0.99, // Exact match
    1
  );

  if (results.length > 0) {
    return results[0].content;
  }

  return null;
}

/**
 * Invalidate graph snapshot (on updates)
 */
async invalidateGraphSnapshot(systemId: string): Promise<void> {
  // Note: Current backends don't have explicit delete
  // Workaround: Store with TTL=0 or implement delete method
  // For now: Just let it expire naturally (1 hour)
}
```

### Modify LLM Engine to Use Graph Snapshot

**File:** [llm-engine.ts](../../src/llm-engine/llm-engine.ts)

**Before:**
```typescript
const request = {
  message,
  canvasState: parser.serializeGraph(graphCanvas.getState()), // Serialize every time
};
```

**After:**
```typescript
// Try AgentDB shared memory first
let canvasState = await agentdb.getGraphSnapshot(systemId);

if (!canvasState) {
  // Fallback: Serialize from GraphCanvas
  canvasState = parser.serializeGraph(graphCanvas.getState());

  // Store for other agents
  await agentdb.storeGraphSnapshot(systemId, canvasState, {
    nodeCount: graphCanvas.getState().nodes.size,
    edgeCount: graphCanvas.getState().edges.size
  });
}

const request = { message, canvasState };
```

### Invalidate on Graph Updates

**File:** [chat-interface.ts](../../src/terminal-ui/chat-interface.ts)

**After applying LLM operations:**
```typescript
await graphCanvas.applyDiff(diff);

// Invalidate shared graph snapshot
await agentdb.invalidateGraphSnapshot(config.systemId);
```

---

## Expected Benefits

### Immediate (Phase 1)
- ✅ Shared graph state across multiple agents
- ✅ ~5-10ms faster retrieval (vs re-serialization)
- ✅ Foundation for multi-agent architecture

### Future (Phase 2-3)
- ✅ 5-10x token reduction via smart context
- ✅ Support for 1000+ node graphs
- ✅ Semantic graph queries ("find all validation functions")
- ✅ Multi-agent coordination (different agents, same graph)

---

## Multi-Agent Scenarios Enabled

With graph in AgentDB, these become possible:

1. **Parallel Validation**
   - Agent A: Validates ontology compliance
   - Agent B: Validates requirement traceability
   - Agent C: Validates architecture patterns
   - All access same graph snapshot

2. **Specialized Generation**
   - Agent A: Generates use cases
   - Agent B: Generates function chains
   - Agent C: Generates test cases
   - Share graph context without re-serialization

3. **Distributed Analysis**
   - Agent A: Analyzes architectural dependencies
   - Agent B: Identifies missing requirements
   - Agent C: Suggests optimizations
   - All work on consistent graph state

---

## Risks & Mitigations

### Risk 1: Cache Staleness
**Problem:** Agent uses outdated graph after updates

**Mitigation:**
- Invalidate on every graph update
- Short TTL (1 hour)
- Version tracking in metadata

### Risk 2: Memory Overhead
**Problem:** Large graphs consume significant memory

**Mitigation:**
- Phase 2: Smart context injection (only relevant subset)
- Compression (Format E is text → gzip)
- Backend-specific limits (e.g., 10MB max)

### Risk 3: Serialization Cost
**Problem:** Format E serialization still expensive

**Mitigation:**
- Only serialize once per update (vs every LLM call)
- Lazy loading (serialize on first access)
- Incremental updates (Phase 3: delta-based)

---

## Next Steps

1. **Discuss with team** - Validate multi-agent requirements
2. **Prototype Phase 1** - 2-3 hours implementation
3. **Measure performance** - Compare with current approach
4. **Plan Phase 2** - If Phase 1 successful, design smart context

---

## Author
andreas@siglochconsulting

**Version:** 1.0.0
**Related:** CR-006 (Ontology Validation), Future multi-agent architecture
