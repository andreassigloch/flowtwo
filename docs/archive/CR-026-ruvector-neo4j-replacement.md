# CR-026: RuVector as Neo4j Replacement

**Type:** Architecture Evaluation
**Status:** NOT IMPLEMENTED
**Priority:** LOW
**Created:** 2025-11-28

## Problem / Use Case

Evaluate if RuVector (Rust-based vector/graph database) could replace Neo4j to eliminate external database dependency and improve performance.

## Evaluation Result: NOT SUITABLE

RuVector cannot replace Neo4j for GraphEngine.

## Key Findings

### Performance (RuVector is 10x faster)

| Operation | Neo4j | RuVector | Speedup |
|-----------|-------|----------|---------|
| Total benchmark | 160ms | 15ms | **10.4x** |

Speed advantage comes from in-process execution (zero network latency).

### Functionality (RuVector lacks critical features)

| Feature | Neo4j | RuVector |
|---------|-------|----------|
| Cypher execution | Full | Parser only, returns empty |
| WHERE/aggregations | Yes | No |
| ACID guarantees | Yes | No |
| Persistence | Yes | Memory-only |

## Decision

**Continue using Neo4j.** Speed benefit does not compensate for missing query functionality.

## Evaluation Artifacts

Full evaluation project: `eval/ruvector-eval/`

```bash
cd eval/ruvector-eval && npm run benchmark
```

## References

- RuVector: https://github.com/ruvnet/ruvector
- Packages tested: `ruvector@0.1.2`, `@ruvector/graph-node@0.1.15`
