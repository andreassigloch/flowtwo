# CR-028: Architecture Optimization Cycles

**Type:** Feature
**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 3
**Created:** 2025-11-29
**Author:** andreas@siglochconsulting
**Depends On:** CR-027 (Agentic Framework)

## Problem / Use Case

### Current State
ONTOLOGY_RULES.md documents a comprehensive Architecture Optimization system (lines 296-590), but:
1. **Not implemented in JSON** - `qualityRules` and `optimization` sections exist only in documentation
2. **No Optimizer-Agent** - Agent framework (CR-027) doesn't include optimization agent
3. **No variant generation** - System validates but doesn't suggest improvements
4. **No Pareto optimization** - Single-score evaluation, no multi-objective trade-offs
5. **No test infrastructure** - No synthetic architectures for benchmarking

### Gap: Validation vs Optimization
| Current (CR-027) | Target (CR-028) |
|------------------|-----------------|
| Detect violations | Generate fix variants |
| Report problems | Propose solutions |
| Block phase gates | Improve until gate passes |
| Single reward score | Pareto front of trade-offs |

### Use Case
After Review-Agent identifies violations (reward < 0.7), Optimizer-Agent:
1. Analyzes violation patterns
2. Applies domain-specific move operators
3. Generates candidate architectures
4. Evaluates multi-objective scores
5. Presents Pareto front to user for selection

## Requirements

### Functional Requirements

**FR-028.1: JSON Schema Extension**
- Add `qualityRules.req` section to ontology-rules.json (REQ quality rules from INCOSE GtWR)
- Add `qualityRules.uc` section (UC quality rules)
- Add `optimization` section with algorithm parameters and move operators
- Version bump to 3.1.0

**FR-028.2: Move Operators**
- `FUNC_SPLIT`: Split oversized FUNC by sub-requirements
- `FUNC_MERGE`: Merge undersized FUNC set
- `FLOW_REDIRECT`: Add missing io edges
- `FLOW_CONSOLIDATE`: Merge redundant FLOWs with same SCHEMA
- `ALLOC_SHIFT`: Move high-volatility FUNC to dedicated MOD
- `ALLOC_REBALANCE`: Redistribute FUNCs across MODs
- `REQ_LINK`: Add satisfy edges FUNC→REQ
- `TEST_LINK`: Add verify edges REQ→TEST

**FR-028.3: Optimizer-Agent**
- New agent type in agent-config.json
- Triggered when Review-Agent returns reward < threshold
- Generates violation-targeted variants
- Respects hard rules (constraint propagation)

**FR-028.4: Multi-Objective Scoring**
- `reward_ontology`: Rule conformance (existing)
- `score_cohesion`: Intra-MOD FUNC connectivity
- `score_coupling`: Minimize fan-out (1 - avg_fan_out/max)
- `score_volatility`: High-vol FUNC isolation ratio
- `score_testability`: REQ→TEST coverage

**FR-028.5: Pareto Optimization**
- Generate non-dominated solution set
- Configurable Pareto front size (default: 5)
- Present trade-offs to user for selection

**FR-028.6: User Interaction Modes**
- Assisted: Propose per variant, user decides
- Semi-Auto: Run to threshold, user confirms final
- Full-Auto: Run to convergence (for AgentDB self-learning)

**FR-028.7: ViolationGuidedLocalSearch Algorithm**
- Violation-targeted variant generation
- Constraint propagation (reject hard rule violations)
- Best-first hill climbing with simulated annealing escape
- Convergence detection (no improvement for N iterations)

### Non-Functional Requirements

**NFR-028.1:** Move operator execution < 50ms per operator
**NFR-028.2:** Full optimization cycle < 30 seconds for 100-node graph
**NFR-028.3:** Memory usage < 500MB for variant storage
**NFR-028.4:** Convergence within 50 iterations for typical violations

## Architecture / Solution Approach

### 1. JSON Schema Extension

Add to `ontology-rules.json`:

```
qualityRules:
  req:
    rules: [req_verifiable, req_necessary, req_singular, req_unambiguous, req_conforming, req_complete]
    threshold: 0.7
  uc:
    rules: [uc_has_requirements, uc_has_actor, uc_has_scenario, uc_goal_defined, uc_postcondition, uc_precondition]
    threshold: 0.7

optimization:
  algorithm: "ViolationGuidedLocalSearch"
  parameters: {maxIterations: 50, convergenceThreshold: 0.01, annealingInitialTemp: 0.3, annealingDecay: 0.95, paretoFrontSize: 5}
  moveOperators: [FUNC_SPLIT, FUNC_MERGE, FLOW_REDIRECT, ALLOC_SHIFT, REQ_LINK, TEST_LINK]
  objectives: [{id: reward_ontology, weight: 0.50}, {id: req_quality_score, weight: 0.30}, {id: uc_quality_score, weight: 0.20}]
```

### 2. Component Structure

```
src/llm-engine/optimizer/
├── index.ts                    # Exports
├── types.ts                    # Variant, ParetoFront, MoveOperator types
├── optimizer-agent.ts          # Main agent orchestration
├── move-operators.ts           # Domain-specific mutations
├── multi-objective-scorer.ts   # Score calculation
├── pareto-front.ts             # Non-dominated sorting
├── violation-guided-search.ts  # Main algorithm
└── variant-manager.ts          # Variant storage and comparison
```

### 3. Algorithm Flow

```
1. Review-Agent detects violations, reward < threshold
2. Optimizer-Agent receives baseline + violations
3. For each violation:
   - Select applicable move operators
   - Apply to affected subgraph
   - Reject if hard rules violated
4. Score all candidates (multi-objective)
5. Update Pareto front
6. Select best or escape local optima (annealing)
7. Repeat until convergence or max iterations
8. Present Pareto front to user
```

### 4. Test Infrastructure

```
tests/
├── fixtures/
│   └── architectures/
│       ├── baseline-valid.json       # Clean architecture (reward ~0.9)
│       ├── millers-violation.json    # Too many/few FUNC
│       ├── orphan-nodes.json         # Unconnected nodes
│       ├── high-volatility.json      # Volatility isolation violations
│       └── missing-traceability.json # REQ without TEST
├── unit/
│   └── optimizer/
│       ├── move-operators.test.ts
│       ├── multi-objective-scorer.test.ts
│       ├── pareto-front.test.ts
│       └── violation-guided-search.test.ts
└── integration/
    └── optimizer/
        └── optimization-cycle.test.ts
```

## Implementation Plan

### Phase 1: JSON Schema Extension (2-3 hours)
- [ ] Add `qualityRules.req` section with INCOSE GtWR rules
- [ ] Add `qualityRules.uc` section
- [ ] Add `optimization` section with parameters and move operators
- [ ] Bump version to 3.1.0
- [ ] Update ONTOLOGY_RULES.md to reference JSON sections

### Phase 2: Test Fixtures (3-4 hours)
- [ ] Create baseline-valid.json (clean architecture)
- [ ] Create millers-violation.json (5-9 rule violations)
- [ ] Create orphan-nodes.json (isolation violations)
- [ ] Create high-volatility.json (volatility isolation violations)
- [ ] Create missing-traceability.json (REQ→TEST gaps)
- [ ] Document fixture purpose and expected scores

### Phase 3: Move Operators (4-6 hours)
- [ ] Implement MoveOperator interface
- [ ] Implement FUNC_SPLIT operator
- [ ] Implement FUNC_MERGE operator
- [ ] Implement FLOW_REDIRECT operator
- [ ] Implement ALLOC_SHIFT operator
- [ ] Implement REQ_LINK operator
- [ ] Implement TEST_LINK operator
- [ ] Unit tests for each operator

### Phase 4: Multi-Objective Scoring (3-4 hours)
- [ ] Implement score_cohesion calculation
- [ ] Implement score_coupling calculation
- [ ] Implement score_volatility calculation
- [ ] Implement score_testability calculation
- [ ] Integrate with existing reward_ontology
- [ ] Unit tests for scoring

### Phase 5: Pareto Front (2-3 hours)
- [ ] Implement non-dominated sorting
- [ ] Implement Pareto front maintenance
- [ ] Implement crowding distance (for diversity)
- [ ] Unit tests for Pareto operations

### Phase 6: ViolationGuidedLocalSearch (4-6 hours)
- [ ] Implement main algorithm loop
- [ ] Implement constraint propagation (hard rule filter)
- [ ] Implement best-first selection
- [ ] Implement simulated annealing escape
- [ ] Implement convergence detection
- [ ] Unit tests for algorithm

### Phase 7: Optimizer-Agent Integration (4-6 hours)
- [ ] Add optimizer-agent to agent-config.json
- [ ] Create optimizer-agent prompt (settings/prompts/)
- [ ] Integrate with Review-Agent handoff
- [ ] Implement user interaction modes
- [ ] Integration tests

### Phase 8: Benchmarking (2-3 hours)
- [ ] Performance benchmarks (variants/sec)
- [ ] Convergence benchmarks (iterations to threshold)
- [ ] Memory usage benchmarks
- [ ] Document benchmark results

## Current Status

- [x] Architecture Optimization documented in ONTOLOGY_RULES.md
- [ ] Phase 1: JSON Schema Extension
- [ ] Phase 2: Test Fixtures
- [ ] Phase 3: Move Operators
- [ ] Phase 4: Multi-Objective Scoring
- [ ] Phase 5: Pareto Front
- [ ] Phase 6: ViolationGuidedLocalSearch
- [ ] Phase 7: Optimizer-Agent Integration
- [ ] Phase 8: Benchmarking

## Acceptance Criteria

- [ ] `ontology-rules.json` v3.1.0 with `qualityRules` and `optimization` sections
- [ ] 5+ test fixture architectures with known violation patterns
- [ ] All 6 move operators implemented with unit tests
- [ ] Multi-objective scoring produces consistent results
- [ ] Pareto front correctly identifies non-dominated solutions
- [ ] ViolationGuidedLocalSearch converges within 50 iterations
- [ ] Optimizer-Agent integrates with CR-027 agent framework
- [ ] Performance: < 30 seconds for 100-node optimization cycle
- [ ] 80% unit test coverage for optimizer module

## Dependencies

- **CR-027** (Agentic Framework) - Agent infrastructure, handoffs, routing
- **CR-026** (AgentDB Self-Learning) - Full-Auto mode uses reward signals
- `ontology-rules.json` v3.0.7+ - Base validation rules

## Test Data Requirements

### Synthetic Architecture Fixtures

| Fixture | Purpose | Expected Violations | Expected Score |
|---------|---------|---------------------|----------------|
| baseline-valid | Regression baseline | None | ~0.9 |
| millers-violation | Test FUNC_SPLIT/MERGE | millers_law_func | ~0.6 |
| orphan-nodes | Test isolation detection | isolation | ~0.5 |
| high-volatility | Test ALLOC_SHIFT | volatile_func_isolation | ~0.7 |
| missing-traceability | Test REQ_LINK/TEST_LINK | function_requirements, requirements_verification | ~0.5 |

### Temporary Data During Optimization

- **Variant Pool**: In-memory storage of candidate architectures
- **Evaluation Cache**: Memoized scores to avoid re-computation
- **Pareto Archive**: Persistent non-dominated solutions
- **Mutation Log**: Audit trail of applied operators

## Estimated Effort

| Phase | Hours |
|-------|-------|
| JSON Schema Extension | 2-3 |
| Test Fixtures | 3-4 |
| Move Operators | 4-6 |
| Multi-Objective Scoring | 3-4 |
| Pareto Front | 2-3 |
| ViolationGuidedLocalSearch | 4-6 |
| Optimizer-Agent Integration | 4-6 |
| Benchmarking | 2-3 |
| **Total** | **24-35 hours (3-5 days)** |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Search space explosion | Violation-guided + constraint propagation (~99.75% reduction) |
| Local optima | Simulated annealing escape mechanism |
| Slow convergence | Domain-specific move operators (not random mutations) |
| Memory overflow | Bounded Pareto front size, variant pruning |
| Inconsistent results | Deterministic seed for reproducibility in tests |

## References

- ONTOLOGY_RULES.md: Architecture Optimization section (lines 296-590)
- CR-027: Agentic Framework and Process Upgrade
- CR-026: AgentDB Self-Learning
- Card & Glass (1990): Fan-in/Fan-out metrics
- Deb et al. (2002): NSGA-II for multi-objective optimization
