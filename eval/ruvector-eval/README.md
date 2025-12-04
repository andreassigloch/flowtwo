# RuVector Evaluation for GraphEngine

Evaluation project to test if [RuVector](https://github.com/ruvnet/ruvector) can replace Neo4j in GraphEngine.

## Evaluation Result: NOT SUITABLE

**RuVector cannot replace Neo4j for GraphEngine.**

### Packages Tested (2025-11-27)

We tested TWO separate packages:

#### 1. `ruvector` (v0.1.2) - Vector Database

| Aspect | Result |
|--------|--------|
| Package type | Pure vector database |
| Methods | `insert`, `search`, `delete`, `get`, `insertBatch` |
| Cypher support | **NO** |
| Graph relationships | **NO** |

#### 2. `@ruvector/graph-node` (v0.1.15) - Graph Database

| Aspect | Result |
|--------|--------|
| Package type | Hypergraph with vector embeddings |
| Node creation | **YES** (requires embedding) |
| Edge creation | **YES** (requires embedding) |
| kHopNeighbors | **YES** (works!) |
| Cypher queries | **PARSES but returns EMPTY** |

### @ruvector/graph-node Test Results

```
Working (3/10):
  [OK] createNode(): Requires embedding field
  [OK] createEdge(): Requires embedding field
  [OK] kHopNeighbors(): Returns connected node IDs

Not Working (7/10):
  [FAIL] Cypher MATCH (n): Parses but returns empty
  [FAIL] Cypher MATCH (n:Label): Returns 0 nodes
  [FAIL] Cypher Relationship Pattern: Returns 0 edges
  [FAIL] Cypher WHERE clause: Returns 0 nodes
  [FAIL] Cypher CREATE: No effect
  [FAIL] Cypher MERGE: No effect
  [FAIL] Cypher count(): Returns empty
```

### Root Cause

**`@ruvector/graph-node` has a Cypher parser that accepts queries but doesn't execute them:**
- `query()` method parses Cypher syntax without errors
- Returns `{ nodes: [], edges: [], stats: {...} }`
- Stats show correct node/edge counts (data IS stored)
- But query results are always empty arrays

This is likely an incomplete implementation - the Cypher parser exists but query execution against stored data isn't connected.

**Both packages require embeddings for all operations:**
- Every node requires a `Float32Array` embedding
- Every edge requires an embedding too
- This is a vector-first design, graph-second

## Performance Benchmark (2025-11-28)

We ran a direct comparison using GraphEngine's real data (184 nodes, 412 edges):

| Operation                      | Neo4j (ms) | RuVector (ms) | Speedup |
|--------------------------------|------------|---------------|---------|
| Insert 184 Nodes (batch)       |      20.82 |          6.21 | **3.4x** |
| Insert 412 Edges (batch)       |      50.39 |          8.98 | **5.6x** |
| Query All Nodes                |       5.56 |          0.00 | **10,000x+** |
| Query By Type (FUNC)           |       4.93 |          0.06 | **79x** |
| Find By ID (point query)       |       6.23 |          0.00 | **5,500x+** |
| 1-Hop Neighbors                |       9.92 |          0.08 | **129x** |
| Aggregation (count by type)    |       8.26 |          0.02 | **359x** |
| 100 Point Queries              |      54.54 |          0.13 | **425x** |
| **TOTAL**                      | **160.65** |      **15.48**| **10.4x** |

### Why RuVector is Faster

1. **In-process execution**: RuVector runs in Node.js process memory (zero network latency)
2. **Simple data structures**: Map/index lookups vs database queries
3. **No ACID overhead**: No transaction logging, no durability guarantees

### Why This Doesn't Matter for GraphEngine

Despite 10x+ speed advantage, RuVector **cannot be used** because:

1. **Cypher queries don't execute** - Parser works, execution returns empty
2. **Complex queries impossible** - No WHERE, aggregations, variable-length paths
3. **No ACID guarantees** - Unsafe for production data
4. **Memory-only** - All data lost on process restart

**Bottom line:** RuVector is fast for what it CAN do, but it CAN'T do what we need.

## Quick Start

```bash
cd eval/ruvector-eval
npm install
npm run benchmark      # Run Neo4j vs RuVector performance comparison
npm run eval           # Full evaluation
npm run test:graph     # Test @ruvector/graph-node specifically
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run benchmark` | **Neo4j vs RuVector performance comparison** |
| `npm run eval` | Full evaluation of ruvector core |
| `npm run test:graph` | Test @ruvector/graph-node Cypher support |
| `npm run import` | Test data import from exports/ |
| `npm run queries` | Test Cypher query compatibility |

## What Gets Tested

### 1. RuVector API Analysis
- Native module loading
- Available methods inspection
- Cypher/graph query capability check

### 2. Validation Queries (from validation-queries.ts)
- V1: Format as FUNC detection
- V2: FLOW missing SCHEMA
- V4: Miller's Law violation
- V5: Inter-block FLOW protocol check
- V6: Redundant SCHEMA detection
- V8: Schema variance check
- V9: Nested FUNC schema mismatch

### 3. CRUD Queries (from neo4j-client.ts)
- Batch node save (UNWIND + MERGE)
- Batch edge save
- Graph load with filters
- System listing
- Graph statistics

## Critical Missing Features

All GraphEngine queries require features RuVector doesn't have:

| Feature | Required By | RuVector Support |
|---------|-------------|------------------|
| MATCH pattern | All queries | NO |
| WHERE clause | All queries | NO |
| MERGE upsert | Node/Edge save | NO |
| UNWIND | Batch operations | NO |
| Relationships | Edge queries | NO |
| count(), collect() | Statistics | NO |
| datetime() | Timestamps | NO |
| NOT EXISTS | V9 validation | NO |
| Variable-length paths | V5 validation | NO |
| UNION | Statistics | NO |

## When RuVector WOULD Be Useful

RuVector could complement (not replace) Neo4j for:

- **Semantic search**: Find nodes by description similarity
- **Architecture similarity**: Find similar system patterns via embeddings
- **RAG applications**: Context retrieval for LLM prompts
- **Edge computing**: WASM support for client-side search

## Recommendation

**Continue using Neo4j** for GraphEngine's graph persistence needs.

If semantic search is needed in the future, consider:
1. Adding RuVector alongside Neo4j (not as replacement)
2. Using Neo4j's vector index feature (Neo4j 5.11+)
3. Using a dedicated vector DB like Pinecone/Weaviate

## Files

```
eval/ruvector-eval/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── benchmark.ts          # Neo4j vs RuVector performance comparison
    ├── format-e-parser.ts    # Format-E file parser
    ├── import-data.ts        # Data import test
    ├── test-queries.ts       # Query compatibility test
    ├── test-graph-node.ts    # @ruvector/graph-node Cypher test
    └── run-evaluation.ts     # Full evaluation runner
```

## Conclusion

**Neither RuVector package can replace Neo4j for GraphEngine:**

| Requirement | Neo4j | ruvector | @ruvector/graph-node |
|-------------|-------|----------|---------------------|
| Cypher queries | Full | None | Parser only (no execution) |
| MATCH patterns | Yes | No | Parses, returns empty |
| Relationships | First-class | No | Requires embeddings |
| WHERE filters | Yes | No | Parses, no effect |
| CREATE/MERGE | Yes | No | Parses, no effect |
| Aggregations | Yes | No | No |
| Graph traversal | Yes | No | kHopNeighbors only |

**Recommendation:** Continue using Neo4j. Consider RuVector only for semantic search as a supplementary feature.
