# GraphEngine Ontology Rules

**Machine-readable source:** [ontology-rules.json](ontology-rules.json)

This document provides human-readable documentation for the consolidated ontology rules. The JSON file is the authoritative source for code and LLM validation.

## Document Structure

```
settings/
├── ontology-rules.json    ← Machine-parseable (LLM, validators, reward calc)
├── ONTOLOGY_RULES.md      ← Human-readable (this file)
└── ontology.json          ← Node/Edge type definitions (display config)
```

## Quick Reference

### Node Types

| Type | Abbr | Description | Required Edges |
|------|------|-------------|----------------|
| SYS | SY | System boundary (root) | compose→UC/MOD/FUNC |
| UC | UC | Use Case (user-facing) | satisfy→REQ |
| REQ | RQ | Requirement | verify→TEST |
| FUNC | FN | Function (behavior) | satisfy→REQ, io↔FLOW |
| FCHAIN | FC | Function Chain (activity) | compose→ACTOR/FUNC/FLOW |
| FLOW | FL | Data Flow (3-layer interface) | relation→SCHEMA, io↔FUNC |
| ACTOR | AC | External entity | io↔FLOW |
| MOD | MD | Module (physical) | allocate→FUNC |
| TEST | TC | Test Case | verify←REQ |
| SCHEMA | SC | Global definition | Struct property required |

### Edge Types

| Type | Nesting | Description |
|------|---------|-------------|
| compose | Yes | Hierarchical parent-child |
| io | No | Data flow via FLOW nodes |
| satisfy | Yes | Requirement satisfaction |
| verify | No | Test verification |
| allocate | Yes | Function→Module mapping |
| relation | No | Generic (FLOW→SCHEMA) |

## Validation Rules

### Phase 1→2: Requirements Complete

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `req_semantic_id` | All REQ have semantic IDs | Error |
| `uc_satisfy_req` | UC→satisfy→REQ for all functional REQ | Warning |
| `sys_satisfy_nfr` | SYS→satisfy→REQ for all NFRs | Warning |

### Phase 2→3: Logical Architecture Complete

| Rule ID | Description | Severity | Weight |
|---------|-------------|----------|--------|
| `millers_law_func` | 5-9 top-level FUNC under SYS | Warning | 0.10 |
| `function_requirements` | Every FUNC→satisfy→REQ | Error | 0.20 |
| `function_io` | Every FUNC has io↔FLOW in+out | Error | 0.15 |
| `flow_connectivity` | Every FLOW has io in+out | Error | 0.15 |
| `fchain_actor_boundary` | FCHAIN has ACTOR→...→ACTOR path | Warning | 0.10 |
| `nested_func_isolation` | Nested FUNC only within whitebox | Error | 0.15 |

### Phase 3→4: Physical Architecture Complete

| Rule ID | Description | Severity | Weight |
|---------|-------------|----------|--------|
| `millers_law_mod` | 5-9 top-level MOD under SYS | Warning | 0.10 |
| `function_allocation` | Every FUNC allocated to MOD | Error | 0.15 |

### Phase 4→Handoff: Verification Complete

| Rule ID | Description | Severity | Weight |
|---------|-------------|----------|--------|
| `requirements_verification` | Every REQ→verify→TEST | Error | 0.10 |
| `isolation` | No orphan nodes | Warning | 0.05 |
| `naming` | PascalCase, max 25 chars | Error | 0.05 |

## Whitebox Rules (Nested Functions)

**Key Rule: `nested_func_isolation`**

Nested FUNCs may ONLY communicate with:
1. Other nested FUNCs **within the same parent** (whitebox)
2. **Parent-level FLOWs** (boundary interfaces)

**FORBIDDEN:** Direct io connections between nested FUNCs of different parents.

```
✅ VALID:
TopLevelA
├── NestedA1 -io-> InternalFlow -io-> NestedA2  (same whitebox)
└── NestedA1 -io-> BoundaryFlow (exposed at parent level)
    BoundaryFlow -io-> TopLevelB

❌ INVALID:
TopLevelA -compose-> NestedA1
                        │
                        io (FORBIDDEN: cross-whitebox)
                        ▼
TopLevelB -compose-> NestedB1
```

**Rationale:** Maintains encapsulation. Cross-whitebox communication must route through parent-level interfaces to preserve modularity.

## Reward Calculation

For AgentDB self-learning (CR-026):

```
reward = 1.0 - Σ(weight × violations / total_nodes)

If any HARD rule fails → reward = 0.0
Success threshold: reward ≥ 0.7
```

### Rule Weights

| Rule | Weight | Type |
|------|--------|------|
| function_requirements | 0.20 | Soft |
| function_io | 0.15 | Soft |
| flow_connectivity | 0.15 | Soft |
| function_allocation | 0.15 | Soft |
| nested_func_isolation | 0.15 | Hard |
| required_properties | 0.10 | Hard |
| millers_law_func | 0.10 | Soft |
| millers_law_mod | 0.10 | Soft |
| requirements_verification | 0.10 | Soft |
| fchain_actor_boundary | 0.10 | Soft |

## LLM Context Usage

The JSON contains an `llmContext` section for injecting into prompts:

```json
{
  "systemPromptSection": "You are working with a Systems Engineering ontology...",
  "critiqueTemplate": "Validation failed:\n{violations}\n\nTo fix: {suggestions}",
  "suggestionMap": { ... }
}
```

## Cypher Validation Queries

Each rule has a `cypher` field with the Neo4j query. Example:

```cypher
// function_requirements
MATCH (f:FUNC) WHERE NOT (f)-[:satisfy]->(:REQ)
RETURN f.semanticId AS violation, 'Missing satisfy→REQ edge' AS reason
```

## Standards Compliance

- **INCOSE SE Handbook v5** - Functional/Physical architecture separation
- **ISO/IEC/IEEE 15288:2023** - Technical processes
- **A-SPICE** - SYS.2→SYS.3→SYS.4 mapping
- **SysML 2.0** - 3-Layer FLOW/SCHEMA model

## References

- [ontology-rules.json](ontology-rules.json) - Machine-readable rules
- [ontology.json](ontology.json) - Display configuration
- CR-026: AgentDB Self-Learning with Ontology Rules
