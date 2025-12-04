# GraphEngine Ontology Rules

**Version:** 3.1.1
**Commit:** 3ce1c19
**Machine-readable source:** [ontology-rules.json](ontology-rules.json)

This document provides human-readable documentation for the consolidated ontology rules. The JSON file is the **single source of truth** for code and LLM validation.

## Document Structure

```
settings/
├── ontology-rules.json    ← Single source of truth (LLM, validators, display)
└── ONTOLOGY_RULES.md      ← Human-readable (this file)
```

---

## Quick Reference

### Node Types

| Type | Abbr | Description | Required Attributes |
|------|------|-------------|---------------------|
| SYS | SY | System boundary (root) | name |
| UC | UC | Use Case (meta-element) | name, goal, precondition, postcondition, primaryActor, scope |
| REQ | RQ | Requirement | name, text, rationale |
| FUNC | FN | Function (behavior) | name, description, volatility (optional) |
| FCHAIN | FC | Function Chain (activity) | name |
| FLOW | FL | Data Flow (3-layer interface) | name |
| ACTOR | AC | External entity | name |
| MOD | MD | Module (physical) | name |
| TEST | TC | Test Case | name |
| SCHEMA | SC | Global definition | name, struct |

### Edge Types

| Type | Nesting | Description |
|------|---------|-------------|
| compose | Yes | Hierarchical parent-child |
| io | No | Data flow via FLOW nodes |
| satisfy | Yes | Requirement satisfaction |
| verify | No | Test verification |
| allocate | Yes | Function→Module mapping |
| relation | No | Generic (FLOW→SCHEMA) |

---

## Integrity Rules (All Phases)

These rules apply at all times and are checked inline on every mutation.

| Rule ID | Description | Severity | Type |
|---------|-------------|----------|------|
| `no_duplicate_nodes` | No nodes with identical (type, name, parent) | Error | Hard |
| `no_duplicate_edges` | No edges with identical (source, target, edgeType) | Error | Hard |
| `naming` | PascalCase, max 25 chars | Error | Hard |
| `required_properties` | All required attributes set per node type | Error | Hard |

---

## Validation Rules by Phase

### Phase 1→2: Requirements Complete

#### Structural Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `req_semantic_id` | All REQ have semantic IDs | Error |
| `uc_satisfy_req` | UC→satisfy→REQ for all functional REQ | Warning |
| `sys_satisfy_nfr` | SYS→satisfy→REQ for all NFRs | Warning |

#### REQ Quality Rules (INCOSE GtWR v4)

Based on INCOSE Guide to Writing Requirements, reduced to machine-checkable rules.

| Rule ID | Characteristic | Description | Weight | Severity |
|---------|---------------|-------------|--------|----------|
| `req_verifiable` | Verifiable | REQ→verify→TEST or has quantifiable metric in text | 0.25 | Error |
| `req_necessary` | Necessary | REQ←satisfy←FUNC or REQ←satisfy←UC | 0.20 | Warning |
| `req_singular` | Singular | Only one "shall/soll" per REQ statement | 0.15 | Warning |
| `req_unambiguous` | Unambiguous | No weasel words | 0.15 | Warning |
| `req_conforming` | Conforming | Pattern: "[System] soll [Verb] [Objekt] [Kriterium]" | 0.15 | Warning |
| `req_complete` | Complete | Attribute `rationale` is set | 0.10 | Warning |

**Weasel Word List (German/English):**

| Category | German | English |
|----------|--------|---------|
| Vague quantities | einige, mehrere, viele | some, many, few |
| Vague timing | schnell, zeitnah, bald | fast, soon, timely |
| Vague quality | einfach, benutzerfreundlich, gut | easy, user-friendly, good |
| Approximations | ca., etwa, ungefähr | approximately, around |
| Escape clauses | wenn möglich, soweit praktikabel | if possible, as appropriate |

#### UC Quality Rules (Meta-Element)

UC is a **container element**: UC node + satisfy→REQs + compose→FCHAINs (scenarios from user perspective).

| Rule ID | Description | Weight | Severity |
|---------|-------------|--------|----------|
| `uc_has_requirements` | UC→satisfy→REQ (≥1 functional REQ) | 0.25 | Error |
| `uc_has_actor` | UC→compose→FCHAIN, and FCHAIN has ACTOR boundary | 0.25 | Error |
| `uc_has_scenario` | UC→compose→FCHAIN (≥1 Main Success Scenario) | 0.20 | Warning |
| `uc_goal_defined` | Attribute `goal` set (user goal in one sentence) | 0.15 | Warning |
| `uc_postcondition` | Attribute `postcondition` set (success criterion) | 0.10 | Warning |
| `uc_precondition` | Attribute `precondition` set | 0.05 | Warning |

**UC Attributes:**

| Attribute | Description | Example |
|-----------|-------------|---------|
| `goal` | User's intent in one sentence | "User wants to export report as PDF" |
| `precondition` | System state before UC starts | "User is logged in, report data exists" |
| `postcondition` | Success criterion | "PDF file downloaded, audit log entry created" |
| `primaryActor` | Main actor triggering UC | "EndUser" |
| `scope` | System boundary (black-box view) | "ReportingModule" |

### Phase 2→3: Logical Architecture Complete

| Rule ID | Description | Severity | Weight |
|---------|-------------|----------|--------|
| `millers_law` | 5-9 children per parent (universal) | Warning | 0.10 |
| `function_requirements` | Every FUNC→satisfy→REQ | Error | 0.20 |
| `function_io` | Every FUNC has io↔FLOW in+out | Error | 0.15 |
| `flow_connectivity` | Every FLOW has io in+out | Error | 0.15 |
| `fchain_actor_boundary` | FCHAIN has ACTOR→...→ACTOR path | Warning | 0.10 |
| `nested_func_isolation` | Nested FUNC only within whitebox | Error | Hard |
| `volatile_func_isolation` | High-volatility FUNC has ≤2 dependents | Warning | 0.10 |
| `func_near_duplicate` | No FUNC pairs with similarity ≥ 0.85 | Error | Hard |
| `func_merge_candidate` | Flag FUNC pairs with similarity ≥ 0.70 | Warning | 0.10 |
| `schema_near_duplicate` | No SCHEMA pairs with similarity ≥ 0.85 | Error | Hard |
| `schema_merge_candidate` | Flag SCHEMA pairs with similarity ≥ 0.70 | Warning | 0.05 |

### Phase 3→4: Physical Architecture Complete

| Rule ID | Description | Severity | Weight |
|---------|-------------|----------|--------|
| `millers_law` | 5-9 children per parent (universal) | Warning | 0.10 |
| `function_allocation` | Every FUNC allocated to MOD | Error | 0.15 |

### Phase 4→Handoff: Verification Complete

| Rule ID | Description | Severity | Weight |
|---------|-------------|----------|--------|
| `requirements_verification` | Every REQ→verify→TEST | Error | 0.10 |
| `isolation` | No orphan nodes | Warning | 0.05 |

---

## FUNC Quality Rules

### Required Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `name` | ✓ | PascalCase, max 25 chars, pattern: [Verb][Object] |
| `descr` | ✓ | Describes Action, Input, Output (enforced by `required_properties`) |
| `volatility` | optional | high / medium / low |

### Description Quality

**Pattern (recommended):** "[Verb] [Input-Objekt] und [liefert/gibt zurück] [Output-Objekt]"

| Rule ID | Description | Weight | Severity |
|---------|-------------|--------|----------|
| `required_properties` | All nodes must have non-empty name and descr | - | Error (Hard) |
| `func_description_quality` | descr contains Action + Input + Output | 0.05 | Warning |

**Examples:**

| FUNC Name | Good Description |
|-----------|------------------|
| ValidateOrder | "Prüft Bestelldaten auf Vollständigkeit und gibt ValidationResult zurück" |
| TransformData | "Transformiert RawData in NormalizedFormat" |
| CalculatePrice | "Berechnet Gesamtpreis basierend auf Positionen und Rabatten" |

---

## FUNC Similarity Detection

Detects functionally similar FUNCs that are candidates for merge/abstraction.

### Similarity Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Description-Semantik** | 0.35 | Semantic similarity of description texts |
| **Action-Verb** | 0.25 | Same function core from name (Validate, Create, Transform, ...) |
| **FLOW-Struktur** | 0.25 | Isomorphic io topology (same in/out count, similar SCHEMA types) |
| **REQ-Überlappung** | 0.10 | Jaccard index on satisfy→REQ edges |
| **Hierarchie-Position** | 0.05 | Same depth in compose tree |

### Action-Verb Extraction

**Pattern:** `[Verb][Object]` from FUNC name

| FUNC Name | Action | Object |
|-----------|--------|--------|
| ValidateOrder | Validate | Order |
| ValidatePayment | Validate | Payment |
| CreateInvoice | Create | Invoice |
| SendNotification | Send | Notification |

### Canonical Verb Groups (Synonyms)

| Canonical | Synonyms (DE/EN) |
|-----------|------------------|
| Validate | Check, Verify, Ensure, Assert, Prüfen, Validieren |
| Create | Generate, Build, Produce, Make, Erstellen, Erzeugen |
| Transform | Convert, Map, Translate, Parse, Transformieren, Konvertieren |
| Send | Emit, Publish, Dispatch, Notify, Senden, Versenden |
| Receive | Accept, Consume, Listen, Subscribe, Empfangen |
| Store | Save, Persist, Write, Cache, Speichern |
| Retrieve | Load, Fetch, Read, Get, Laden, Abrufen |
| Calculate | Compute, Evaluate, Derive, Berechnen |

### Description Analysis

**Extracted Elements:**

| Element | Description | Example |
|---------|-------------|---------|
| Action-Phrase | Main verb/action | "prüft", "validiert", "transformiert" |
| Input-Object | What is processed | "...der Bestellung", "...des Payments" |
| Output-Object | What is returned | "...gibt Status zurück", "...liefert Result" |
| Condition | When/how | "wenn...", "basierend auf..." |

### FLOW Structure Isomorphism

Two FUNCs are structurally similar if:

| Criterion | Check |
|-----------|-------|
| Input count | \|inputs_A\| == \|inputs_B\| |
| Output count | \|outputs_A\| == \|outputs_B\| |
| SCHEMA abstraction | Both use same abstract type (Entity, Status, Result) |

**SCHEMA Type Abstraction:**

| Concrete | Abstract |
|----------|----------|
| OrderSchema, PaymentSchema, ShipmentSchema | EntitySchema |
| OrderStatus, PaymentStatus | StatusSchema |
| ValidationResult, CalculationResult | ResultSchema |

### Similarity Thresholds

| Similarity | Classification | Action | Severity |
|------------|----------------|--------|----------|
| ≥ 0.85 | **Near-Duplicate** | Block or force merge | Error (Hard) |
| ≥ 0.70 | **Merge-Candidate** | Optimizer suggests merge | Warning |
| ≥ 0.50 | **Review** | Manual review recommended | Info |
| < 0.50 | **Distinct** | OK - different functions | - |

---

## Whitebox Rules (Nested Functions)

**Key Rule: `nested_func_isolation`**

Nested FUNCs may ONLY communicate with:
1. Other nested FUNCs **within the same parent** (whitebox)
2. **Parent-level FLOWs** (boundary interfaces)

**FORBIDDEN:** Direct io connections between nested FUNCs of different parents.

**Rationale:** Maintains encapsulation. Cross-whitebox communication must route through parent-level interfaces to preserve modularity.

---

## Volatility Management (Design for Change)

FUNC nodes have an optional `volatility` property.

### Volatility Levels

| Level | Description | Examples |
|-------|-------------|----------|
| **high** | External dependencies, frequent changes | External APIs, AI/ML models, third-party integrations |
| **medium** | Internal logic with occasional updates | Business rules, internal services |
| **low** | Stable core functionality | Database operations, stable algorithms, infrastructure |

### Classification Criteria

**HIGH volatility:**
- Depends on external APIs (social media, payment, weather)
- Uses AI/ML models (prompts, inference, embeddings)
- Integrates with third-party systems
- Subject to regulatory changes
- User-configurable behavior

**LOW volatility:**
- Core business logic with stable rules
- Data persistence/retrieval
- Stable algorithms (sorting, validation)
- Infrastructure utilities (logging, monitoring)

### Architectural Guidance

| Volatility | Max Dependents | Pattern |
|------------|----------------|---------|
| high | ≤2 | Isolate behind Adapter/Facade |
| medium | Fan-out ≤7 | Standard coupling rules |
| low | Unlimited | High fan-in acceptable |

---

## Reward Calculation

### Structural Reward (reward_ontology)

Calculated as: `1.0 - Σ(weight × violations / total_nodes)`

If any **Hard** rule fails → `reward_ontology = 0.0`

### REQ Quality Score

| Rule | Weight |
|------|--------|
| `req_verifiable` | 0.25 |
| `req_necessary` | 0.20 |
| `req_singular` | 0.15 |
| `req_unambiguous` | 0.15 |
| `req_conforming` | 0.15 |
| `req_complete` | 0.10 |

Calculated as: `Σ(weight × passing_reqs / total_reqs)`

### UC Quality Score

| Rule | Weight |
|------|--------|
| `uc_has_requirements` | 0.25 |
| `uc_has_actor` | 0.25 |
| `uc_has_scenario` | 0.20 |
| `uc_goal_defined` | 0.15 |
| `uc_postcondition` | 0.10 |
| `uc_precondition` | 0.05 |

Calculated as: `Σ(weight × passing_ucs / total_ucs)`

### FUNC Distinctness Score

Measures how distinct (non-similar) functions are:

`func_distinctness_score = 1.0 - (merge_candidate_pairs / total_func_pairs)`

Target: 1.0 (no similar FUNCs)

### Total Reward

| Component | Weight |
|-----------|--------|
| `reward_ontology` | 0.40 |
| `req_quality_score` | 0.25 |
| `uc_quality_score` | 0.15 |
| `func_distinctness_score` | 0.20 |

**Success threshold:** `reward_total ≥ 0.7`

### Phase-Specific Thresholds

| Phase Gate | Required Scores |
|------------|-----------------|
| 1→2 (Requirements Complete) | `req_quality_score` ≥ 0.7, `uc_quality_score` ≥ 0.7 |
| 2→3 (Logical Architecture) | `reward_ontology` (FUNC/FLOW rules) ≥ 0.7, `func_distinctness_score` ≥ 0.8 |
| 3→4 (Physical Architecture) | `reward_ontology` (MOD/allocate rules) ≥ 0.7 |
| 4→Handoff (Verification) | `reward_total` ≥ 0.7 |

---

## Rule Weights Summary

### Integrity Rules (Hard)

| Rule | Type |
|------|------|
| no_duplicate_nodes | Hard |
| no_duplicate_edges | Hard |
| naming | Hard |
| required_properties | Hard |
| nested_func_isolation | Hard |
| func_near_duplicate | Hard |
| schema_near_duplicate | Hard |

### Structural Rules (Soft)

| Rule | Weight |
|------|--------|
| function_requirements | 0.20 |
| function_io | 0.15 |
| flow_connectivity | 0.15 |
| function_allocation | 0.15 |
| millers_law | 0.10 |
| requirements_verification | 0.10 |
| fchain_actor_boundary | 0.10 |
| volatile_func_isolation | 0.10 |
| func_merge_candidate | 0.10 |
| schema_near_duplicate | 0.10 |
| func_description_quality | 0.05 |
| schema_merge_candidate | 0.05 |

---

## Architecture Optimization

### Agent Roles

| Agent | Role | Trigger |
|-------|------|---------|
| **Inline-Validator** | Synchronous check on each mutation | Node/Edge creation |
| **State-Manager** | Phase tracking, activity monitoring | Heuristic or explicit |
| **Review-Agent** | Batch validation, reward calculation | Phase gate |
| **Optimizer-Agent** | Variant generation, comparison, recommendation | Post-review if reward < threshold |

### Validation Timing

| Timing | Rules |
|--------|-------|
| **Inline** (on mutation) | `no_duplicate_*`, `naming`, `required_properties`, `nested_func_isolation` |
| **Batch** (phase gate) | `millers_law_*`, `function_io`, `flow_connectivity`, `func_similarity`, `requirements_verification` |

### Search Space Reduction

| Technique | Description | Effect |
|-----------|-------------|--------|
| **Constraint Propagation** | Reject variants violating Hard Rules immediately | ~90% reduction |
| **Violation-Guided** | Only mutate nodes/edges with active violations | ~95% reduction |
| **Locality** | Restrict changes to affected subgraph | ~80% reduction |
| **Move Operators** | Domain-specific mutations instead of random | Faster convergence |

### Move Operators

| Move ID | Trigger Rule | Action |
|---------|--------------|--------|
| `FUNC_SPLIT` | `millers_law_func` (>9) | Split largest FUNC by sub-requirements |
| `FUNC_MERGE` | `millers_law_func` (<5) | Merge similar FUNCs |
| `FUNC_MERGE_SIMILAR` | `func_merge_candidate` | Merge FUNCs with similarity ≥ 0.70, abstract common pattern |
| `FLOW_REDIRECT` | `flow_connectivity` | Add missing io edges to FLOW |
| `FLOW_CONSOLIDATE` | Redundant FLOWs | Merge FLOWs with same SCHEMA |
| `ALLOC_SHIFT` | `volatile_func_isolation` | Move high-vol FUNC to dedicated MOD |
| `ALLOC_REBALANCE` | `millers_law_mod` | Redistribute FUNCs across MODs |
| `REQ_LINK` | `function_requirements` | Add satisfy edge FUNC→REQ |
| `TEST_LINK` | `requirements_verification` | Add verify edge REQ→TEST |

### Complexity Estimate

| Approach | Variants/Iteration | Total Evaluations |
|----------|-------------------|-------------------|
| Brute Force | 10^50+ | ❌ infeasible |
| Random GA | 100 × 250 | ~25,000 |
| Violation-Guided | 5-15 × 20-50 | ~500 |

### User Interaction Modes

| Mode | Description |
|------|-------------|
| **Assisted** | Optimizer proposes, user decides per variant |
| **Semi-Auto** | Optimizer runs to threshold, user confirms final |
| **Full-Auto** | Optimizer runs to convergence (AgentDB self-learning) |

---

## Standards Compliance

| Standard | Coverage |
|----------|----------|
| **INCOSE SE Handbook v5** | Functional/Physical architecture separation |
| **INCOSE GtWR v4** | REQ quality rules |
| **ISO/IEC/IEEE 15288:2023** | Technical processes |
| **ISO/IEC/IEEE 29148:2018** | Requirements engineering |
| **A-SPICE** | SYS.2→SYS.3→SYS.4 mapping |
| **SysML 2.0** | 3-Layer FLOW/SCHEMA model |

---

## References

- [ontology-rules.json](ontology-rules.json) - Single source of truth (rules + display)
- CR-026: AgentDB Self-Learning with Ontology Rules
- CR-029: Ontology Files Consolidation
