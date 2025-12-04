# CR-031: Learning System Integration

**Type:** Integration
**Status:** Planned
**Priority:** HIGH
**Created:** 2025-12-02
**Updated:** 2025-12-02
**Author:** andreas@siglochconsulting

**Depends On:**
- CR-027 (Agentic Framework) - Completed
- CR-028 (Architecture Optimization) - Sandbox complete
- CR-029 (Ontology Consolidation) - Completed
- CR-030 (Evaluation Criteria) - Planned

**Enables:**
- CR-026 (AgentDB Self-Learning) - Provides runtime context

## Problem / Use Case

Components exist in isolation but aren't connected:

| CR | Component | Current State | Integration Needed |
|----|-----------|---------------|-------------------|
| CR-027 | Agent Framework | Completed | Already integrated |
| CR-028 | Optimizer | Sandbox (`eval/`) | Move to `src/`, wire to agents |
| CR-029 | Ontology Rules | Single JSON | Done |
| CR-030 | Rule Loader + Similarity | Planned | Implement, use in validation |
| CR-026 | Self-Learning | Planned | Enable with integrated flow |

**The Gap:** No UI commands, no background validation, no episode storage with rewards.

## Requirements

### Functional Requirements

**FR-031.1: Optimizer Integration**
- Move CR-028 optimizer from `eval/` to `src/llm-engine/optimizer/`
- Wire optimizer-agent to agent framework
- Trigger when validation reward < threshold

**FR-031.2: Dynamic Rule Loading**
- Use CR-030 rule-loader in main app
- Replace hardcoded validation with ontology-rules.json
- Phase-aware rule filtering

**FR-031.3: User Commands**
- `/validate` - Full validation report with violations
- `/phase-gate [N]` - Check phase N gate rules, report pass/fail
- `/optimize` - Trigger optimization, show Pareto front
- `/score` - Show multi-objective scores

**FR-031.4: Continuous Validation**
- Background validation on graph changes (debounced)
- Lightweight mode (integrity only) vs full mode
- Violation indicators in graph view

**FR-031.5: Self-Learning Integration (CR-026)**
- Store episodes with rule-based rewards
- Generate critiques from violations
- Load relevant past episodes via embedding search

### Non-Functional Requirements

- **NFR-031.1:** Background validation < 200ms (debounced)
- **NFR-031.2:** Full validation < 2s for 100 nodes
- **NFR-031.3:** Optimizer < 30s for suggestions
- **NFR-031.4:** No blocking of user operations

## Architecture / Solution Approach

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      USER INTERFACE                                  │
│  /validate  /phase-gate  /optimize  /score                          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   CHAT INTERFACE                                     │
│  src/terminal-ui/chat-interface.ts                                  │
│  + handleValidateCommand()                                          │
│  + handlePhaseGateCommand()                                         │
│  + handleOptimizeCommand()                                          │
│  + handleScoreCommand()                                             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│               VALIDATION & OPTIMIZATION ENGINE                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ src/llm-engine/validation/ (CR-030)                          │   │
│  │ ├── rule-loader.ts        # Load from ontology-rules.json    │   │
│  │ ├── rule-evaluator.ts     # Cypher + similarity rules        │   │
│  │ ├── similarity-scorer.ts  # Tiered: Neo4j → AgentDB → LLM    │   │
│  │ └── violation-reporter.ts # Format for UI                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ src/llm-engine/optimizer/ (from eval/cr-028-optimizer)       │   │
│  │ ├── multi-objective-scorer.ts                                │   │
│  │ ├── move-operators.ts                                        │   │
│  │ ├── pareto-front.ts                                          │   │
│  │ └── violation-guided-search.ts                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                        │
│  Neo4j:                                                             │
│  ├── Graph nodes/edges (authoritative state)                       │
│  ├── Cypher validation queries                                     │
│  └── Index on (type, Name) for fast lookup                         │
│                                                                     │
│  AgentDB:                                                           │
│  ├── episodes (task, reward, critique, success)                    │
│  ├── episode_embeddings (for retrieval)                            │
│  └── node_embeddings (for similarity, lazy-computed)               │
└─────────────────────────────────────────────────────────────────────┘
```

### Storage Responsibilities

| Storage | What | When Updated |
|---------|------|--------------|
| **Neo4j** | Nodes, Edges, Properties | On user action |
| **Neo4j** | Index (type, Name) | Auto |
| **AgentDB** | Episodes (decisions + rewards) | After user accepts/rejects |
| **AgentDB** | Episode embeddings | On episode store |
| **AgentDB** | Node embeddings | Lazy, on first similarity query |

### Trigger Matrix

| Trigger | Handler | Rules Applied | Response |
|---------|---------|---------------|----------|
| Node/Edge CREATE | `onGraphChange()` | Integrity only | Reject/accept |
| `/validate` | `handleValidateCommand()` | All (current phase) | Full report |
| `/phase-gate N` | `handlePhaseGateCommand()` | Phase N gate rules | Pass/Fail + gaps |
| `/optimize` | `handleOptimizeCommand()` | All + optimization | Pareto suggestions |
| `/score` | `handleScoreCommand()` | Scoring objectives | Multi-score display |
| View change | `onViewChange()` | View-specific | Highlight violations |

### File Structure

```
src/llm-engine/
├── agents/                          # CR-027 (existing)
│   ├── config-loader.ts
│   ├── workflow-router.ts
│   ├── work-item-manager.ts
│   ├── agent-executor.ts
│   └── phase-gate-manager.ts
├── validation/                      # CR-030 + CR-031 (NEW)
│   ├── index.ts
│   ├── rule-loader.ts
│   ├── rule-evaluator.ts
│   ├── similarity-scorer.ts
│   └── types.ts
├── optimizer/                       # CR-028 → CR-031 (MOVE)
│   ├── index.ts
│   ├── types.ts
│   ├── multi-objective-scorer.ts
│   ├── move-operators.ts
│   ├── pareto-front.ts
│   └── violation-guided-search.ts
├── agentdb/                         # Existing + updates
│   ├── agentdb-backend.ts          # Add node_embeddings table
│   └── embedding-service.ts
└── auto-derivation.ts               # CR-005 (existing)
```

## Implementation Plan

### Phase 1: Move Optimizer (2-3 hours)
- [ ] Move `eval/cr-028-optimizer/src/*.ts` to `src/llm-engine/optimizer/`
- [ ] Update imports to use main app types
- [ ] Verify tests pass

### Phase 2: Validation Module (CR-030) (8-11 hours)
- [ ] Implement rule-loader.ts
- [ ] Add Neo4j index on (type, Name)
- [ ] Implement similarity-scorer.ts with tiered approach
- [ ] Add node_embeddings table to AgentDB
- [ ] Implement rule-evaluator.ts
- [ ] Unit tests

### Phase 3: UI Commands (3-4 hours)
- [x] Add `/validate` command
- [x] Add `/phase-gate N` command
- [x] Add `/optimize` command
- [x] Add `/score` command
- [x] Format output for terminal

### Phase 4: Continuous Validation (2-3 hours)
- [ ] Add debounced `onGraphChange()` handler
- [ ] Implement lightweight mode (integrity only)
- [ ] Add violation indicators in graph view

### Phase 5: Self-Learning Connection (3-4 hours)
- [ ] Store episodes with rule-based rewards
- [ ] Generate critiques from violations
- [ ] Retrieve past episodes via embedding search
- [ ] Integration test for learning cycle

### Phase 6: Integration Testing (3-4 hours)
- [ ] E2E: Create violating graph → /validate → /optimize
- [ ] Phase gate progression test
- [ ] Performance benchmarks

## Current Status

- [ ] Phase 1: Move Optimizer
- [x] Phase 2: Validation Module (CR-030) - Completed separately
- [x] Phase 3: UI Commands - Completed 2025-12-04
- [ ] Phase 4: Continuous Validation
- [ ] Phase 5: Self-Learning Connection
- [ ] Phase 6: Integration Testing

## Acceptance Criteria

- [ ] Optimizer code in `src/llm-engine/optimizer/`
- [x] Rules loaded from `ontology-rules.json`
- [x] Similarity scoring via Neo4j index + AgentDB embeddings
- [x] `/validate` shows violations with severities
- [x] `/phase-gate N` reports pass/fail with gap list
- [x] `/optimize` shows optimization suggestions
- [x] `/score` displays multi-objective scores
- [ ] Background validation on graph changes
- [ ] Episodes stored with rewards and critiques
- [ ] Performance: <2s validation, <30s optimization
- [ ] 80% test coverage

## Relationship to Other CRs

### Integrates
| CR | What |
|----|------|
| CR-027 | Agent framework (workflow-router, work-items) |
| CR-028 | Optimizer code (move from sandbox) |
| CR-029 | Ontology rules (load from JSON) |
| CR-030 | Validation module (rule-loader, similarity-scorer) |

### Enables
| CR | How |
|----|-----|
| CR-026 | Provides runtime context for self-learning |

## Estimated Effort

| Phase | Hours |
|-------|-------|
| Move Optimizer | 2-3 |
| Validation Module (CR-030) | 8-11 |
| UI Commands | 3-4 |
| Continuous Validation | 2-3 |
| Self-Learning Connection | 3-4 |
| Integration Testing | 3-4 |
| **Total** | **22-29 hours (3-4 days)** |

## References

- [learningsystem.md](../learningsystem.md) - Architecture overview
- [ontology-rules.json](../../settings/ontology-rules.json) - Single source of truth
- [CR-030](CR-030-evaluation-criteria-implementation.md) - Evaluation criteria
- [CR-028](../archive/CR-028-architecture-optimization-cycles.md) - Optimizer sandbox
