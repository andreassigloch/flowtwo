# CR-026: AgentDB Self-Learning with Ontology Rules

**Type:** Feature
**Status:** ✅ ARCHIVED - Merged into CR-032 Phase 6
**Archived:** 2025-12-05
**Priority:** MEDIUM
**Target Phase:** Phase 4 (Enhancement)
**Created:** 2025-11-27
**Author:** andreas@siglochconsulting

**Parent CR:** CR-019 (AgentDB Episodic Memory) - Completed
**Related:** CR-007 (AgentDB Shared Memory)
**Merged Into:** CR-032 (Unified Data Layer) Phase 6

---

## ⚠️ ARCHIVED - MERGED INTO CR-032

**This CR is now Phase 6 of [CR-032: Unified Data Layer Architecture](../cr/CR-032-unified-data-layer.md).**

CR-032 provides the foundation needed for self-learning:
- AgentDB as single source of truth (validation reads same data as LLM)
- Unified cache invalidation (no stale embeddings)
- Skill Library integrated into AgentDB
- Enhanced Reflexion Memory

Implementation should wait for CR-032 Phase 1-3 completion to avoid:
- Validation reading from Neo4j while LLM reads from Canvas (inconsistent rewards)
- Stale embedding cache causing wrong similarity scores
- Multiple cache invalidation paths

---

## Problem / Use Case

CR-019 implemented episodic memory storage (episodes table, storeEpisode/retrieveEpisodes APIs). However, **episodes are stored without meaningful evaluation**:

- `reward` is always 0.0 or manually set
- `success` is based only on execution errors, not quality
- No critique generation
- No learning from ontology rule violations

**Current Gap:**
```
User: "Create ProcessInput function"
→ LLM generates Format E
→ Neo4j executes successfully
→ Episode stored: reward=0.5, success=true, critique=null

PROBLEM: Function violates ontology rules (no satisfy→REQ edge)
         but episode is marked successful!
```

**Goal:** Derive reward/success automatically from ontology validation rules defined in:
- `docs/System Decomposition Rules.md`
- `docs/AGENTEN-BASIERTES SYSTEMS ENGINEERING.md`

## Requirements

### Functional Requirements

**FR-1: Automated Episode Evaluation**
- Run ontology validation after each graph modification
- Calculate reward from rule compliance (0.0 - 1.0)
- Determine success based on threshold (default: 0.7)
- Generate critique from violated rules

**FR-2: Validator Agent**
- Separate agent evaluates episodes (not self-evaluation)
- Executes Cypher validation queries against Neo4j
- Applies weighted scoring to rule violations
- Generates human-readable critique

**FR-3: Rule-Based Reward Calculator**
- Configurable rule weights
- Support for hard rules (binary fail) and soft rules (partial credit)
- Aggregate score from multiple rule categories

**FR-4: Episode Context Loading**
- Before LLM request: retrieve similar past episodes
- Include critiques in prompt context
- Enable learning from past mistakes

### Non-Functional Requirements

**NFR-1:** Validation adds < 500ms latency per request
**NFR-2:** Rules configurable without code changes (JSON/YAML)
**NFR-3:** Validation failures don't block user operations

## Architecture / Solution Approach

### 1. Evaluation Flow

```
User Request
    │
    ▼
LLM Engine → Format E Operations
    │
    ▼
Neo4j Execution (success/failure)
    │
    ▼
┌─────────────────────────────────────────┐
│ VALIDATOR AGENT (new)                   │
│                                         │
│ 1. Run Cypher validation queries        │
│ 2. Calculate weighted reward            │
│ 3. Generate critique from violations    │
│ 4. Store enriched episode               │
└─────────────────────────────────────────┘
    │
    ▼
AgentDB Episode Storage
    │
    ▼
Future Requests: Load relevant episodes with critiques
```

### 2. Ontology Rules as Reward Signals

**Phase 2→3 Rules (Logical Architecture):**

| Rule | Cypher Check | Weight | Type |
|------|--------------|--------|------|
| function_requirements | `MATCH (f:FUNC) WHERE NOT (f)-[:satisfy]->(:REQ)` | 0.20 | Soft |
| function_io | `MATCH (f:FUNC) WHERE NOT ()-[:io]->(f) OR NOT (f)-[:io]->()` | 0.15 | Soft |
| flow_connectivity | `MATCH (fl:FLOW) WHERE NOT ()-[:io]->(fl) OR NOT (fl)-[:io]->()` | 0.15 | Soft |
| millers_law_func | 5-9 top-level FUNC blocks | 0.10 | Soft |
| fchain_connectivity | ACTOR→...→ACTOR path exists | 0.10 | Soft |

**Phase 3→4 Rules (Physical Architecture):**

| Rule | Cypher Check | Weight | Type |
|------|--------------|--------|------|
| function_allocation | `MATCH (f:FUNC) WHERE NOT (:MOD)-[:allocate]->(f)` | 0.15 | Soft |
| millers_law_mod | 5-9 top-level MOD blocks | 0.10 | Soft |
| requirements_verification | `MATCH (r:REQ) WHERE NOT (r)-[:verify]->(:TEST)` | 0.10 | Soft |

**Universal Rules:**

| Rule | Check | Weight | Type |
|------|-------|--------|------|
| naming_convention | PascalCase, max 25 chars | 0.05 | Soft |
| required_properties | uuid, type, Name, Descr | 0.10 | Hard |
| isolation | No orphan nodes | 0.05 | Soft |

### 3. Reward Calculation

```typescript
interface ValidationResult {
  rule: string;
  passed: boolean;
  violations: string[];  // semanticIds of violating nodes
  weight: number;
}

function calculateReward(results: ValidationResult[]): number {
  let reward = 1.0;

  for (const result of results) {
    if (!result.passed) {
      if (result.type === 'hard') {
        return 0.0;  // Hard rule failure = total failure
      }
      reward -= result.weight;
    }
  }

  return Math.max(0, reward);
}
```

### 4. Critique Generation

```typescript
function generateCritique(results: ValidationResult[]): string {
  const violations = results.filter(r => !r.passed);

  if (violations.length === 0) {
    return null;  // No critique for successful episodes
  }

  return violations.map(v =>
    `${v.rule}: ${v.violations.length} violation(s) - ${v.violations.slice(0,3).join(', ')}`
  ).join('\n');
}
```

**Example Critique:**
```
function_requirements: 1 violation(s) - ProcessInput.FUNC.001
function_io: 1 violation(s) - ProcessInput.FUNC.001
Missing: satisfy→REQ edge, io↔FLOW connections
```

### 5. Episode Context Loading

Before LLM request, load similar episodes:

```typescript
// In llm-engine.ts before sendRequest()
const episodes = await agentdb.retrieveEpisodes('llm-engine', userMessage, 3);

const failedEpisodes = episodes.filter(e => !e.success && e.critique);
if (failedEpisodes.length > 0) {
  const lessonsLearned = failedEpisodes
    .map(e => `Previous attempt: "${e.task}"\nCritique: ${e.critique}`)
    .join('\n\n');

  // Inject into system prompt
  systemPrompt += `\n\nLessons from similar past tasks:\n${lessonsLearned}`;
}
```

## Implementation Plan

### Phase 1: Validation Rules Engine (4-6 hours)
1. Create `OntologyValidator` class
2. Define rule configurations (JSON)
3. Implement Cypher query execution
4. Unit tests for individual rules

### Phase 2: Reward Calculator (2-3 hours)
1. Implement weighted scoring
2. Handle hard vs soft rules
3. Calculate aggregate reward
4. Unit tests for scoring logic

### Phase 3: Critique Generator (2-3 hours)
1. Generate human-readable critiques
2. Format for LLM context injection
3. Truncate for token limits

### Phase 4: Integration (3-4 hours)
1. Hook validator into LLM Engine post-execution
2. Update episode storage with reward/critique
3. Implement episode context loading
4. Integration tests

### Phase 5: Configuration & Tuning (2-3 hours)
1. Externalize rule weights to config
2. Add enable/disable per rule
3. Tune thresholds based on real usage
4. Documentation

## Current Status

- [ ] Phase 1: Validation Rules Engine
- [ ] Phase 2: Reward Calculator
- [ ] Phase 3: Critique Generator
- [ ] Phase 4: Integration
- [ ] Phase 5: Configuration & Tuning

## Acceptance Criteria

- [ ] Episodes have meaningful reward (not always 0.5)
- [ ] Episodes have success based on rule compliance
- [ ] Episodes have critiques for violations
- [ ] Similar past episodes loaded before LLM requests
- [ ] Critiques appear in LLM context
- [ ] Validation adds < 500ms latency
- [ ] Rules configurable via JSON
- [ ] Unit tests for validator (80% coverage)
- [ ] Integration test for full flow

## Dependencies

- CR-019 (AgentDB Episodic Memory) - Completed
- Neo4j connection for Cypher queries
- Ontology rules documentation (exists)

## Estimated Effort

- Validation Rules Engine: 4-6 hours
- Reward Calculator: 2-3 hours
- Critique Generator: 2-3 hours
- Integration: 3-4 hours
- Configuration & Tuning: 2-3 hours
- **Total: 13-19 hours (2-3 days)**

## Benefits

**Automated Quality Feedback:**
- Every operation evaluated against ontology rules
- Consistent, objective reward signals
- No manual evaluation needed

**Self-Improving System:**
- LLM learns from past mistakes via critiques
- Avoids repeating same violations
- Quality improves over time

**Transparency:**
- Clear explanation of why operations scored low
- Traceable to specific rule violations
- Debugging aid for users

## Example: Complete Flow

```
User: "Create a ProcessData function under MainSystem"

1. LLM generates Format E:
   [FUNC] ProcessData.FUNC.042 Descr="Processes incoming data"
   [FUNC] ProcessData.FUNC.042 [cp] MainSystem.SYS.001

2. Neo4j executes: SUCCESS

3. Validator runs:
   ┌─────────────────────────────────────────────────────┐
   │ Rule                    │ Result │ Violations      │
   ├─────────────────────────────────────────────────────┤
   │ required_properties     │ PASS   │ -               │
   │ naming_convention       │ PASS   │ -               │
   │ function_requirements   │ FAIL   │ ProcessData     │
   │ function_io             │ FAIL   │ ProcessData     │
   │ isolation               │ PASS   │ -               │
   └─────────────────────────────────────────────────────┘

4. Reward calculated:
   Base: 1.0
   - function_requirements: -0.20
   - function_io: -0.15
   = 0.65

5. Episode stored:
   {
     task: "Create ProcessData function under MainSystem",
     reward: 0.65,
     success: false,  // Below 0.7 threshold
     critique: "function_requirements: Missing satisfy→REQ edge\n
                function_io: Missing io↔FLOW connections"
   }

6. Next similar request loads this episode:
   "Previous attempt failed with: Missing satisfy→REQ edge, Missing io↔FLOW"
   → LLM now knows to add these edges
```

## References

- CR-019: AgentDB Episodic Memory (completed)
- `docs/System Decomposition Rules.md` - Structural rules
- `docs/AGENTEN-BASIERTES SYSTEMS ENGINEERING.md` - Phase gates & Cypher checks
- AgentDB LearningSystem: `node_modules/agentdb/src/controllers/LearningSystem.ts`
- Reflexion Paper: https://arxiv.org/abs/2303.11366

## Notes

- Consider privacy: critiques may contain task details
- Validation should be non-blocking (async where possible)
- Start with soft rules only, add hard rules after tuning
- Monitor reward distribution to detect miscalibration
