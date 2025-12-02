# CR-030: Evaluation Criteria Implementation

**Type:** Feature
**Status:** Planned
**Priority:** HIGH
**Created:** 2025-12-01
**Updated:** 2025-12-02
**Depends On:** CR-029 (Ontology Consolidation)
**Enables:** CR-031 (Learning System Integration)

## Problem / Use Case

The CR-028 optimizer uses hardcoded evaluation criteria. With CR-029, we have a consolidated `ontology-rules.json` that defines rules, weights, and thresholds. We need:

1. **Rule Loader** - Load rules from JSON, not hardcode
2. **Similarity Scorer** - Detect duplicate/merge candidates
3. **Scalable Approach** - Work for 100 to 10,000+ nodes

## Requirements

### Functional Requirements

1. **Load rules dynamically** from `ontology-rules.json`
2. **Similarity scoring** using embeddings (AgentDB) + Neo4j index
3. **Flag candidates** for LLM agent review (not auto-decide)
4. **Phase-aware validation** - only apply rules for current phase

### Non-Functional Requirements

- **Scalability:** O(log n) similarity search via indexes
- **Cost:** <$0.05 per 1K nodes for embeddings
- **Performance:** <2s full validation for 100 nodes, <5s for 10K

## Architecture / Solution Approach

### Simplified Scoring Model

**Single score source:** Cosine similarity of embeddings (0.0 - 1.0)

| Match Type | Score | Source |
|------------|-------|--------|
| Exact Name match | 1.0 | Neo4j index |
| Embedding similarity | 0.0-1.0 | AgentDB vector search |

**Embedding input:** `"${node.type}: ${node.Name} - ${node.Descr}"`

**Thresholds (from ontology-rules.json):**
```json
"thresholds": {
  "nearDuplicate": 0.85,
  "mergeCandidate": 0.70,
  "review": 0.50
}
```

### Tiered Similarity Detection

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Neo4j Index (O(log n), free)                          │
│  ├─ Exact name match: score = 1.0                              │
│  └─ Prefix match: score = 0.9                                  │
├─────────────────────────────────────────────────────────────────┤
│  TIER 2: AgentDB Vector Search (O(log n), cached)              │
│  ├─ Compute embedding lazily (on first query)                  │
│  ├─ Store in node_embeddings table                             │
│  └─ Invalidate on Descr change only                            │
├─────────────────────────────────────────────────────────────────┤
│  TIER 3: LLM Review (O(k), k = candidates)                     │
│  ├─ Only flagged candidates sent to agent                      │
│  ├─ Max 50 nodes per batch (~5K tokens)                        │
│  └─ Agent sees full context, decides merge/keep                │
└─────────────────────────────────────────────────────────────────┘
```

### Scalability Analysis

| Nodes | Tier 1 | Tier 2 | Tier 3 | Total Time | LLM Cost |
|-------|--------|--------|--------|------------|----------|
| 100 | <10ms | skip | ~0 | <50ms | $0 |
| 1,000 | <50ms | <100ms | ~5K tokens | <500ms | ~$0.02 |
| 10,000 | <100ms | <200ms | ~10K tokens | <2s | ~$0.05 |

### Storage Design

**Neo4j (existing - no changes):**
- Nodes with uuid, type, Name, Descr
- Index on (type, Name) - add if missing

**AgentDB (new table):**
```sql
CREATE TABLE IF NOT EXISTS node_embeddings (
  node_uuid TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  text_content TEXT NOT NULL,
  embedding BLOB NOT NULL,
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  created_at INTEGER NOT NULL,
  invalidated_at INTEGER
);

CREATE INDEX idx_node_embeddings_type ON node_embeddings(node_type);
```

### File Structure

```
src/llm-engine/validation/
├── index.ts
├── rule-loader.ts           # Load from ontology-rules.json
├── rule-evaluator.ts        # Run Cypher rules via Neo4j
├── similarity-scorer.ts     # Tiered similarity detection
└── types.ts
```

## Implementation Plan

### Phase 1: Rule Loader (2-3 hours)
- [ ] Create `rule-loader.ts`
- [ ] Parse integrityRules, validationRules from JSON
- [ ] Implement `getRuleWeight(ruleId)` from structuralRuleWeights
- [ ] Implement `getRulesForPhase(phase)` filtering
- [ ] Unit tests

### Phase 2: Neo4j Index (1 hour)
- [ ] Add index: `CREATE INDEX node_type_name FOR (n) ON (n.type, n.Name)`
- [ ] Verify index used in queries

### Phase 3: Similarity Scorer (3-4 hours)
- [ ] Create `similarity-scorer.ts`
- [ ] Implement `getSimilarityScore(nodeA, nodeB)`:
  - Exact name match → 1.0
  - Else → embedding cosine similarity
- [ ] Implement `findSimilarNodes(node, threshold)`:
  - Tier 1: Neo4j prefix query
  - Tier 2: AgentDB vector search
- [ ] Implement lazy embedding computation
- [ ] Add `node_embeddings` table to AgentDB schema
- [ ] Unit tests

### Phase 4: Rule Evaluator (2-3 hours)
- [ ] Create `rule-evaluator.ts`
- [ ] Run Cypher queries from integrityRules
- [ ] Run Cypher queries from validationRules
- [ ] Call similarity-scorer for similarity-based rules
- [ ] Return violations with severity and weight
- [ ] Unit tests

## Current Status

- [ ] Phase 1: Rule Loader
- [ ] Phase 2: Neo4j Index
- [ ] Phase 3: Similarity Scorer
- [ ] Phase 4: Rule Evaluator

## Acceptance Criteria

- [ ] Rules loaded from `ontology-rules.json` (not hardcoded)
- [ ] Neo4j index on (type, Name) exists
- [ ] Similarity scorer returns 0.0-1.0 score
- [ ] Embeddings cached in AgentDB, invalidated on Descr change
- [ ] Flags work items for candidates ≥0.70 similarity
- [ ] Phase filtering works correctly
- [ ] Performance: <2s for 100 nodes, <5s for 10K nodes
- [ ] 80% test coverage

## What We Dropped (Simplification)

**Removed multi-factor scoring:**
- ❌ `actionVerb` - LLM interprets Name directly
- ❌ `flowSignature` - LLM sees io edges in context
- ❌ `reqSignature` - LLM sees satisfy edges in context
- ❌ `structHash` - LLM compares Struct JSON directly
- ❌ `usageSignature` - LLM sees connections in context
- ❌ `depth` - LLM sees hierarchy in Format E

**Rationale:** Agent reviews candidates with full context. Single embedding captures semantics. No precomputed properties = no invalidation complexity.

## Estimated Effort

| Phase | Hours |
|-------|-------|
| Rule Loader | 2-3 |
| Neo4j Index | 1 |
| Similarity Scorer | 3-4 |
| Rule Evaluator | 2-3 |
| **Total** | **8-11 hours (1.5-2 days)** |

## References

- [ontology-rules.json](../../settings/ontology-rules.json) - Rule definitions
- [learningsystem.md](../learningsystem.md) - Architecture overview
- CR-029: Ontology Consolidation
- CR-031: Learning System Integration
