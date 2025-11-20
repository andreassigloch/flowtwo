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

## Critical Issue: Precision Requirements Contradiction

### The Problem

**Two fundamentally different use cases:**

1. **Graph Modifications** (MUST be 100% precise)
   - "Add edge from ProcessPayment.FN.001 to PaymentData.FL.001"
   - **Requirement:** Exact node match (semantic ID)
   - **Failure mode:** Wrong node modified = data corruption
   - **Precision:** 1.0 (exact match only)

2. **Information Queries** (Can be fuzzy)
   - "Explain how payment processing works"
   - **Requirement:** Relevant context (semantic similarity)
   - **Failure mode:** Missing some context = incomplete answer
   - **Precision:** 0.7-0.9 (semantic similarity OK)

**Contradiction:**
- Vector search is fuzzy by nature (cosine similarity ~0.85)
- Exact match requires deterministic lookup (hash/index)
- **Can't use same search strategy for both!**

---

### Solution: Dual-Mode Search Strategy

**Mode 1: EXACT (for modifications)**
```typescript
// Modify operations ALWAYS use semantic ID (deterministic)
const node = graphCanvas.getNode('ProcessPayment.FN.001'); // O(1) Map lookup
if (!node) throw new Error('Node not found'); // Fail fast

// NO vector search involved - direct key access
```

**Mode 2: SEMANTIC (for queries/context)**
```typescript
// Information queries use vector search (fuzzy)
const results = await agentdb.vectorSearch(
  'payment processing functions',
  0.75, // Lower threshold = more results
  k: 10
);

// Parse Format E to extract relevant subgraph
const context = parseRelevantNodes(results);
```

**Key Insight:** These are DIFFERENT operations with DIFFERENT requirements!

---

### Architecture: Separate Layers

```
┌─────────────────────────────────────────────────────────────┐
│ LLM Agent Layer                                             │
│ - Decides: Modify or Query?                                 │
│ - Parses user intent                                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
                     ├─────────────────┬─────────────────┐
                     ↓                 ↓                 ↓
         ┌───────────────────┐  ┌──────────────┐  ┌──────────────┐
         │ MODIFY Mode       │  │ QUERY Mode   │  │ HYBRID Mode  │
         │ (Exact match)     │  │ (Fuzzy)      │  │ (Both)       │
         └───────────────────┘  └──────────────┘  └──────────────┘
                     ↓                 ↓                 ↓
         ┌───────────────────┐  ┌──────────────────────────────┐
         │ GraphCanvas       │  │ AgentDB Vector Search        │
         │ Map.get(semID)    │  │ Semantic similarity > 0.75   │
         │ O(1) exact        │  │ Returns top-k matches        │
         └───────────────────┘  └──────────────────────────────┘
```

---

### Implementation Strategy

#### 1. LLM Response Format Distinguishes Modes

**Modification Operations (Format E):**
```xml
<operations>
<base_snapshot>PaymentSystem.SY.001</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process payment
        ↑
        Semantic ID = EXACT identifier (no ambiguity)

## Edges
+ OrderProcessing.FC.001 -cp-> ProcessPayment.FN.001
                                         ↑
                                    Exact reference
</operations>
```

**Query/Context Operations:**
- No `<operations>` block
- Pure text response
- LLM uses context from vector search

#### 2. Graph Modifications Never Use Vector Search

**Current (correct) implementation:**
```typescript
// chat-interface.ts:449
const diff = parser.parseDiff(response.operations);
await graphCanvas.applyDiff(diff);

// graph-canvas.ts: applyDiff()
for (const op of diff.operations) {
  if (op.type === 'add_node') {
    this.state.nodes.set(op.semanticId, op.node); // Direct Map access
  }
}
```

**Semantic IDs are deterministic:**
- Format: `{Name}.{TypeAbbr}.{Counter}`
- Example: `ProcessPayment.FN.001`
- Unique per system
- **No ambiguity possible**

#### 3. Information Queries Use Vector Search

**New capability (Phase 2):**
```typescript
// For "explain payment processing" query
async function getRelevantContext(query: string): Promise<string> {
  // 1. Vector search for relevant nodes
  const results = await agentdb.vectorSearch(
    query,
    0.75, // More lenient for context
    k: 20 // Get more results
  );

  // 2. Extract semantic IDs from Format E
  const relevantIds = results.flatMap(r =>
    parseSemanticIds(r.content)
  );

  // 3. Exact lookup in GraphCanvas
  const nodes = relevantIds.map(id =>
    graphCanvas.getNode(id) // Still exact!
  ).filter(Boolean);

  // 4. Serialize subset to Format E
  return serializeSubgraph(nodes);
}
```

**Key:** Vector search finds WHICH nodes, exact lookup retrieves them

---

### Concrete Examples

#### Example 1: Modification (Exact Match Required)

**User:** "Add an edge from ProcessPayment to PaymentData"

**LLM Response:**
```xml
<operations>
+ ProcessPayment.FN.001 -io-> PaymentData.FL.001
</operations>
```

**Processing:**
1. Parse semantic IDs: `ProcessPayment.FN.001`, `PaymentData.FL.001`
2. Exact lookup: `graphCanvas.getNode('ProcessPayment.FN.001')` ✅
3. If not found → ERROR (fail fast)
4. Create edge with exact IDs

**No vector search involved!**

---

#### Example 2: Query (Fuzzy Match OK)

**User:** "Explain how payment processing works in my system"

**LLM Response:** (no `<operations>` block)
```
Your system processes payments through the ProcessPayment function,
which receives PaymentData as input...
```

**Processing:**
1. Vector search: `vectorSearch('payment processing', 0.75, k=10)`
2. Results:
   - `ProcessPayment|FUNC|...` (similarity: 0.92)
   - `ValidatePayment|FUNC|...` (similarity: 0.78)
   - `PaymentData|FLOW|...` (similarity: 0.76)
3. Extract semantic IDs from Format E snippets
4. Exact lookup to get full nodes
5. Build context for LLM

**Vector search finds candidates, exact lookup retrieves data**

---

#### Example 3: Hybrid (Modification + Context)

**User:** "Add a validation function for payment data"

**LLM needs:**
1. **Context** (fuzzy): What payment functions already exist?
2. **Modification** (exact): Create new node with exact ID

**Processing:**
```typescript
// 1. Get context via vector search (fuzzy)
const context = await getRelevantContext('payment validation');

// 2. Build prompt with context
const prompt = buildPrompt(userMessage, context);

// 3. LLM generates operations with EXACT IDs
const response = await llm.generate(prompt);

// 4. Apply operations with exact matching
await graphCanvas.applyDiff(parseDiff(response.operations));
```

---

## Resolution: No Contradiction!

**They are different operations at different layers:**

| Operation | Layer | Search Type | Precision | Purpose |
|-----------|-------|-------------|-----------|---------|
| **Modify graph** | GraphCanvas | Map lookup | 1.0 (exact) | Change data |
| **Find context** | AgentDB | Vector search | 0.7-0.9 (fuzzy) | Inform LLM |
| **Retrieve nodes** | GraphCanvas | Map lookup | 1.0 (exact) | Get data |

**Architecture guarantees correctness:**
- Modifications always use semantic IDs (deterministic)
- Vector search only finds WHICH nodes are relevant
- Actual retrieval/modification uses exact Map lookup
- **No data corruption possible from fuzzy search**

---

## Risks & Mitigations

### Risk 1: LLM Hallucinates Semantic IDs
**Problem:** LLM generates wrong semantic ID in `<operations>` block

**Example:**
```xml
<operations>
+ ProcessPayment.FN.999 -io-> PaymentData.FL.001
              ↑ Wrong counter!
</operations>
```

**Mitigation:**
1. **Validation layer** - Check all semantic IDs exist before applying
2. **Fail fast** - Reject entire diff if any ID invalid
3. **LLM context** - Include existing IDs in system prompt
4. **Format E Diff validation** - Parser checks semanticId format

**Implementation:** [canvas-base.ts:validateDiff](../../src/canvas/canvas-base.ts)

---

### Risk 2: Vector Search Returns Irrelevant Nodes
**Problem:** Context includes unrelated nodes, confuses LLM

**Mitigation:**
1. **Tunable threshold** - Adjust similarity threshold per query type
2. **Reranking** - Use multiple signals (similarity + graph distance)
3. **Max results limit** - Cap at 20 nodes to avoid noise
4. **Metadata filtering** - Filter by node type (e.g., only FUNCs)

---

### Risk 3: Cache Staleness
**Problem:** Agent uses outdated graph after updates

**Mitigation:**
- Invalidate on every graph update
- Short TTL (1 hour)
- Version tracking in metadata

### Risk 4: Memory Overhead
**Problem:** Large graphs consume significant memory

**Mitigation:**
- Phase 2: Smart context injection (only relevant subset)
- Compression (Format E is text → gzip)
- Backend-specific limits (e.g., 10MB max)

### Risk 5: Serialization Cost
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
