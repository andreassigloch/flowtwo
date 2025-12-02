# GraphEngine Learning System Architecture

**Version:** 1.0.0
**Author:** andreas@siglochconsulting
**Date:** 2025-12-01

This document describes how the ontology-rules-metrics-optimization concept works together as a continuous architecture quality assurance system.

---

## Core Philosophy

The system implements **continuous architecture quality assurance** through a feedback loop:

```
User Input → Graph State → Rule Evaluation → Violation Detection →
    → Optimization Suggestions → User Decision → Graph State (updated)
```

This is NOT a linear waterfall. Entry points include:
- **Greenfield**: Empty → Phase 1 → Phase 2 → Phase 3 → Phase 4
- **Import/Reverse Engineering**: PDF/Code extraction → partial model → gap analysis → completion
- **Iteration**: Jump between phases based on feedback

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│  Terminal UI / Chat / Canvas                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Commands, Natural Language
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LLM AGENT LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Chat Agent   │  │ Derivation   │  │ Architecture Validator   │   │
│  │ (user intent)│  │ Agent        │  │ (rule enforcement)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Structured Operations
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     VALIDATION ENGINE                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Rule Evaluator (loads from ontology-rules.json)                │ │
│  │ ├─ Integrity Rules (hard) → reject invalid operations         │ │
│  │ ├─ Validation Rules (soft) → penalties in scoring             │ │
│  │ └─ Similarity Detection → merge candidates                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Phase Gate Manager                                             │ │
│  │ ├─ Determines current phase from graph state                  │ │
│  │ └─ Filters applicable rules                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Violations, Scores
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     OPTIMIZATION ENGINE                              │
│  (CR-028 Sandbox / Future Integration)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Move         │  │ Multi-Obj    │  │ Pareto       │              │
│  │ Operators    │  │ Scorer       │  │ Front        │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Suggestions
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                      │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ Neo4j (Graph State)  │  │ AgentDB (Learning, Embeddings)       │ │
│  │ ├─ Nodes, Edges      │  │ ├─ Decision History                  │ │
│  │ ├─ Views, Sessions   │  │ ├─ Reward Signals                    │ │
│  │ └─ Cypher Queries    │  │ └─ Similarity Vectors                │ │
│  └──────────────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Trigger Matrix

### When to Evaluate What

| Trigger | Integrity Rules | Validation Rules | Similarity | Phase Gate | Optimization |
|---------|-----------------|------------------|------------|------------|--------------|
| **Node CREATE** | ✓ Immediate | - | Check duplicates | - | - |
| **Node UPDATE** | ✓ Immediate | - | Re-check if name/descr changed | - | - |
| **Edge CREATE** | ✓ Immediate | - | - | - | - |
| **View Change** | - | ✓ View-specific | - | - | - |
| **Phase Gate Request** | ✓ All | ✓ Phase-specific | ✓ All | ✓ Check pass/fail | - |
| **Optimization Request** | ✓ All | ✓ All | ✓ All | - | ✓ Full cycle |
| **Import (PDF/Code)** | ✓ All | - | ✓ Extensive | ✓ Detect phase | ✓ Gap analysis |
| **Periodic (background)** | - | ✓ Lightweight | ✓ New nodes only | - | - |

### Rule Application by Phase

| Rule ID | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Import |
|---------|---------|---------|---------|---------|--------|
| `no_duplicate_nodes` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `no_duplicate_edges` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `naming` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `required_properties` | ✓ | ✓ | ✓ | ✓ | Warn only |
| `uc_satisfy_req` | ✓ | - | - | - | - |
| `millers_law` | - | ✓ | ✓ | ✓ | ✓ |
| `function_requirements` | - | ✓ | ✓ | ✓ | Warn |
| `function_io` | - | ✓ | ✓ | ✓ | Warn |
| `flow_connectivity` | - | ✓ | ✓ | ✓ | Warn |
| `func_near_duplicate` | - | ✓ | ✓ | ✓ | ✓ |
| `nested_func_isolation` | - | ✓ | ✓ | ✓ | ✓ |
| `function_allocation` | - | - | ✓ | ✓ | Warn |
| `requirements_verification` | - | - | - | ✓ | Warn |
| `isolation` | - | - | - | ✓ | Warn |

---

## Data Flow & Storage

### Neo4j (Graph State)
- **Purpose**: Authoritative graph state, Cypher queries
- **Contains**: Nodes, Edges, Properties, Views, Sessions
- **Access**: Real-time CRUD, complex pattern matching

### AgentDB (Learning & Search)
- **Purpose**: Self-learning, similarity search, decision history
- **Contains**:
  - **Embeddings**: Node/Edge semantic vectors for similarity
  - **Decision Log**: What decisions were made, outcomes
  - **Reward Signals**: Which optimizations improved scores
  - **Pattern Cache**: Common violation→fix patterns
- **Access**: Vector search, reward lookup, pattern retrieval

### Intermediate Storage (In-Memory)
- **Violation Cache**: Recent evaluations (TTL-based)
- **Similarity Matrix**: Pairwise scores for current session
- **Score History**: Multi-objective scores per iteration

---

## Processing Modes

### 1. Interactive Mode (Real-time)
```
User Action → Immediate Validation → Feedback in <100ms
```
- Only integrity rules
- Cached similarity lookups
- No optimization

### 2. View Mode (On View Switch)
```
/view fchain → Load View Config → Apply View-specific Rules → Highlight Violations
```
- FCHAIN View: Check actor boundaries, flow paths
- Logical View: Check FUNC decomposition, io connections
- Physical View: Check MOD allocation, coupling

### 3. Phase Gate Mode (Explicit Request)
```
/phase-gate 2 → Full Evaluation → Pass/Fail + Gap Report
```
- All integrity rules (must pass)
- All validation rules for target phase
- Similarity detection
- Generates actionable gap list

### 4. Optimization Mode (Background/Request)
```
/optimize → Full Scoring → Generate Variants → Pareto Front → Suggestions
```
- Multi-objective scoring
- Move operators (SPLIT, MERGE, LINK, REALLOC, CREATE, DELETE)
- Returns top-N improvement suggestions

### 5. Import Mode (Reverse Engineering)
```
Import PDF/Code → Extract Partial Model → Gap Analysis → Enrichment Plan
```
- Relaxed validation (warn, don't reject)
- Heavy similarity detection (find duplicates from extraction errors)
- Phase detection (what's present determines starting point)
- Generates "enrichment plan" (what's missing per phase)

---

## LLM Integration Points

| Component | LLM Role | Input | Output |
|-----------|----------|-------|--------|
| Chat Agent | Intent parsing | Natural language | Structured commands |
| Derivation Agent | Architecture generation | UC/REQ description | FUNC/FLOW proposals |
| Validator Agent | Rule interpretation | Violation + context | Human-readable explanation |
| Optimizer Agent | Suggestion ranking | Pareto candidates | Prioritized recommendations |
| Import Agent | Entity extraction | PDF/Code snippets | Proposed nodes/edges |

### When NOT to Use LLM
- Integrity rule evaluation (deterministic Cypher)
- Simple validation rules (pattern matching)
- Score calculation (mathematical)
- Phase detection (rule-based)

### When to Use LLM
- Similarity scoring (semantic understanding)
- Suggestion explanation (natural language)
- Import entity extraction (unstructured → structured)
- Gap analysis narratives (context-aware)

---

## Entry Points & Workflows

### A. Greenfield (New System)
```
1. Create SYS node
2. Phase 1: Add UC, REQ, satisfy edges
   → Phase Gate 1 → Pass? Continue
3. Phase 2: Add FUNC, FLOW, FCHAIN, io edges
   → Similarity check (prevent duplicates early)
   → Phase Gate 2 → Pass? Continue
4. Phase 3: Add MOD, allocate edges
   → Optimization suggestions (coupling/cohesion)
   → Phase Gate 3 → Pass? Continue
5. Phase 4: Add TEST, verify edges
   → Full traceability check
   → Phase Gate 4 → Ready for handoff
```

### B. Import (Reverse Engineering)
```
1. Import source (PDF, code, existing docs)
2. Extract entities → Partial graph
3. Detect phase: "You have UC+FUNC but no MOD → Phase 2 incomplete"
4. Gap analysis: "Missing: 12 io edges, 3 FLOW nodes, all TEST"
5. Similarity scan: "3 potential duplicate FUNCs detected"
6. User decision: Auto-fix duplicates? Complete gaps?
7. Resume at detected phase
```

### C. Iteration (Jump Between Phases)
```
Current: Phase 3 complete
User: "Need to add new UC for reporting feature"
→ Back to Phase 1 for new UC
→ Derive FUNC/FLOW (Phase 2)
→ Allocate to existing MOD or new (Phase 3)
→ Add TEST (Phase 4)
→ Re-run Phase Gates to ensure consistency
```

---

## Self-Learning Loop (AgentDB)

```
┌─────────────────────────────────────────────────────────────┐
│                    SELF-LEARNING CYCLE                       │
│                                                              │
│  1. User makes decision (accept/reject suggestion)          │
│     ↓                                                        │
│  2. Log to AgentDB: {context, decision, outcome}            │
│     ↓                                                        │
│  3. Calculate reward: Δscore (before → after)               │
│     ↓                                                        │
│  4. Update pattern weights: good patterns ↑, bad ↓         │
│     ↓                                                        │
│  5. Next similar context: prefer high-reward patterns       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Reward Signals from ontology-rules.json
- `structuralRuleWeights`: How much each rule violation hurts score
- `rewardThresholds`: When to consider improvement significant
- `qualityIndicators`: Fan-out, instability, depth metrics

---

## Scoring System

### Multi-Objective Scoring

The optimizer evaluates architectures on multiple dimensions:

| Objective | Weight | Description |
|-----------|--------|-------------|
| `ontology_conformance` | 0.30 | Rule violations (hard + soft) |
| `cohesion` | 0.20 | FUNC distribution per MOD (Miller's Law) |
| `coupling` | 0.15 | Inter-MOD dependencies (fan-out) |
| `volatility_isolation` | 0.15 | High-vol FUNC isolation |
| `traceability` | 0.10 | REQ←FUNC and REQ→TEST coverage |
| `connectivity` | 0.10 | FUNC io edge coverage |

### Pareto Front

When objectives conflict, the system maintains a Pareto front of non-dominated solutions:
- Solution A dominates B if A is better in at least one objective and not worse in any
- Top-N non-dominated solutions presented to user
- User chooses based on priorities (not forced into single "best")

---

## Move Operators

The optimization engine uses 6 generic operators:

| Operator | Description | Applicable To |
|----------|-------------|---------------|
| `SPLIT` | Split oversized node into two | Miller's Law violation |
| `MERGE` | Combine undersized nodes | Fragmented modules |
| `LINK` | Add missing edge | Disconnected nodes |
| `REALLOC` | Move child to different parent | Coupling issues |
| `CREATE` | Create missing node | Orphan, missing TEST |
| `DELETE` | Remove redundant node | Duplicates, empty containers |

---

## Summary: The Big Picture

1. **Ontology** defines WHAT (node/edge types, valid connections)
2. **Rules** define HOW WELL (integrity = must, validation = should)
3. **Metrics** measure QUALITY (multi-objective scores)
4. **Optimization** suggests IMPROVEMENTS (move operators)
5. **Learning** remembers WHAT WORKS (AgentDB patterns)

The system is designed to:
- Accept input at ANY stage (not just greenfield)
- Validate continuously but intelligently (right rules at right time)
- Suggest, not force (human remains in control)
- Learn from decisions (improve over time)

---

## Similarity Detection

### Simplified Approach

The similarity scorer uses a **single score** (0.0 - 1.0) based on semantic embeddings:

| Match Type | Score | Source |
|------------|-------|--------|
| Exact Name match | 1.0 | Neo4j index |
| Embedding similarity | 0.0-1.0 | AgentDB vector search |

**Embedding input:** `"${node.type}: ${node.Name} - ${node.Descr}"`

### Tiered Detection (Scalability)

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Neo4j Index (O(log n), free)                          │
│  ├─ Exact name match → score = 1.0                             │
│  └─ Prefix match → score = 0.9                                 │
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

### Thresholds (from ontology-rules.json)

| Threshold | Value | Action |
|-----------|-------|--------|
| `nearDuplicate` | ≥ 0.85 | Error - likely duplicate |
| `mergeCandidate` | ≥ 0.70 | Warning - review for merge |
| `review` | ≥ 0.50 | Info - possibly related |

### Why Single Factor?

**Dropped multi-factor scoring:**
- ❌ `actionVerb`, `flowSignature`, `reqSignature`, `structHash` - LLM sees full context
- ❌ Complex weighting - embedding captures semantics naturally
- ❌ Precomputed properties - no invalidation complexity

**Agent reviews candidates with full Format E context and decides.**

---

## Storage Architecture

| Storage | Purpose | Data |
|---------|---------|------|
| **Neo4j** | Graph state (authoritative) | Nodes, Edges, Properties |
| **Neo4j** | Fast lookup | Index on (type, Name) |
| **AgentDB** | Episode learning | task, reward, critique, success |
| **AgentDB** | Episode retrieval | episode_embeddings |
| **AgentDB** | Similarity search | node_embeddings (lazy) |

### When to Use What

| Data Type | Storage | Compute | Invalidate |
|-----------|---------|---------|------------|
| Node properties | Neo4j | On user action | Immediate |
| Node embedding | AgentDB | Lazy (first query) | On Descr change |
| Episode | AgentDB | On user decision | Never |
| Episode embedding | AgentDB | On episode store | Never |

---

## References

- [ontology-rules.json](../settings/ontology-rules.json) - Single source of truth
- [ONTOLOGY_RULES.md](../settings/ONTOLOGY_RULES.md) - Human-readable rules
- [CR-030](cr/CR-030-evaluation-criteria-implementation.md) - Evaluation criteria
- [CR-031](cr/CR-031-learning-system-integration.md) - Learning system integration
