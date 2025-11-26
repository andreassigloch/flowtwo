# CR-005: Implement Auto-Derivation Logic

**Status:** Partially Complete (UC → FUNC done)
**Priority:** CRITICAL - MVP Blocker
**Target Phase:** Phase 3
**Created:** 2025-11-19
**MVP Acceptance Criteria:** #3 (AI assistance with suggestions)

## Problem

Core AI-assisted derivation features are not implemented. According to [implan.md:172-187](../implan.md#L172-L187) and requirements.md FR-8.1, the system should automatically derive related entities:

- **UC → FUNC**: Use Case scenarios → Function definitions
- **REQ → TEST**: Requirements → Test cases
- **FUNC → FLOW**: Functions → Functional flows
- **FUNC → MOD**: Functions → Module allocation

**Current Status:** UC → FUNC implemented and tested (2025-11-21)

**Impact:** Without auto-derivation, users must manually create all relationships, defeating the purpose of AI assistance.

## Requirements

**From requirements.md FR-8.1:**
- LLM analyzes context and suggests derived entities
- User can accept/reject/modify suggestions
- Derivation maintains ontology compliance
- Suggestions include rationale

## Proposed Solution

### 1. UC → FUNC Derivation
**Input:** Use Case with scenarios
**Output:** Function definitions

```typescript
interface UCtoFuncDerivation {
  useCase: UseCaseNode;
  derivedFunctions: FunctionNode[];
  rationale: string;
}
```

**Algorithm:**
1. Parse UC scenarios for actions/verbs
2. Group related actions into functions
3. LLM suggests function names, descriptions, interfaces
4. User reviews and confirms

### 2. REQ → TEST Derivation
**Input:** Requirement specification
**Output:** Test case definitions

```typescript
interface ReqToTestDerivation {
  requirement: RequirementNode;
  derivedTests: TestNode[];
  coverageCriteria: string;
}
```

**Algorithm:**
1. Extract testable conditions from requirement
2. Generate test scenarios (positive, negative, edge cases)
3. LLM suggests test descriptions and expected results
4. User reviews and confirms

### 3. FUNC → FLOW Derivation
**Input:** Function definition with inputs/outputs
**Output:** Functional flow graph

```typescript
interface FuncToFlowDerivation {
  function: FunctionNode;
  derivedFlow: FlowNode;
  dataFlow: Port[];
}
```

**Algorithm:**
1. Analyze function interfaces (inputs/outputs)
2. Suggest internal processing steps
3. LLM generates flow diagram nodes
4. User reviews and refines

### 4. FUNC → MOD Derivation
**Input:** Function allocation constraints
**Output:** Module allocation suggestions

```typescript
interface FuncToModDerivation {
  functions: FunctionNode[];
  suggestedModules: ModuleNode[];
  allocationRationale: string;
}
```

**Algorithm:**
1. Group functions by cohesion (data/functional coupling)
2. Apply architectural constraints
3. LLM suggests module boundaries
4. User reviews and adjusts

## Implementation Plan

### Phase 1: Core Derivation Engine (8-12 hours)
1. Create `src/llm-engine/auto-derivation.ts`
2. Implement derivation request/response protocol
3. Add LLM prompt templates for each derivation type
4. Implement validation against ontology schema

### Phase 2: UC → FUNC (4-6 hours)
1. Parse use case scenarios
2. Extract action verbs and entities
3. Generate function suggestions with LLM
4. Return structured derivation result

### Phase 3: REQ → TEST (4-6 hours)
1. Parse requirement text for testable conditions
2. Generate test scenario templates
3. LLM fills in test details
4. Return test case suggestions

### Phase 4: FUNC → FLOW (6-8 hours)
1. Analyze function interfaces
2. Generate flow node structure
3. LLM suggests processing steps
4. Return flow graph suggestions

### Phase 5: FUNC → MOD (4-6 hours)
1. Analyze function cohesion
2. Apply allocation heuristics
3. LLM suggests module groupings
4. Return allocation suggestions

### Phase 6: Integration & Testing (8-10 hours)
1. Integrate with chat interface (/derive command)
2. Add user confirmation workflow
3. Implement suggestion visualization
4. Write unit tests for derivation logic
5. Write integration tests with LLM

## Acceptance Criteria

- [x] UC → FUNC derivation produces valid function definitions
- [ ] REQ → TEST derivation generates comprehensive test cases
- [ ] FUNC → FLOW derivation creates valid flow diagrams
- [ ] FUNC → MOD derivation suggests cohesive modules
- [x] All derived entities comply with ontology_schema.json
- [ ] User can accept/reject/modify suggestions
- [x] Derivation rationale is provided in natural language
- [x] Unit tests cover derivation logic (70% coverage)
- [ ] Integration tests validate LLM interaction

## Current Status

### Phase 2: UC → FUNC ✅ COMPLETE (2025-11-21)

**Implemented:**
- `src/llm-engine/auto-derivation.ts` - Architecture Derivation Agent v2.0
  - Analyzes **ALL Use Cases** (not single UC selection)
  - Checks **existing FUNCs** for SE compliance (KEEP/OPTIMIZE/DECOMPOSE)
  - Pure **Format E Diff** output (no custom formats)
  - SE principle: Observable + Verifiable at interface boundary

- `/derive` command in chat interface (`src/terminal-ui/chat-interface.ts`)
  - Analyzes ALL UCs to derive system-wide architecture
  - Shows UC list being analyzed
  - Streams LLM analysis response in real-time
  - Extracts and applies Format E operations
  - Reports function/flow counts after application

- Unit tests: 13 tests passing (`tests/unit/llm-engine/auto-derivation.test.ts`)

**SE Guidelines Applied:**
- Functions must be observable at interface boundary (has I/O via FLOW)
- Functions must be verifiable at interface boundary (testable at boundary)
- Existing FUNCs checked: KEEP if compliant, OPTIMIZE if missing I/O, DECOMPOSE if impl-level
- FUNC compose FUNC for sub-function hierarchy (L2/L3 decomposition)

**Usage:**
```
/derive   # Analyzes ALL Use Cases and derives logical architecture
```

### Remaining Phases (Not Started)

- **Phase 3: REQ → TEST** - Generate test cases from requirements
- **Phase 4: FUNC → FLOW** - Infer I/O flows from function descriptions
- **Phase 5: FUNC → MOD** - Suggest module allocation based on function type

## Dependencies

- LLM Engine must be functional (already implemented)
- Ontology schema validation (needs CR-006)
- Chat interface command handling (already implemented)

## Estimated Effort

- UC → FUNC: 4-6 hours
- REQ → TEST: 4-6 hours
- FUNC → FLOW: 6-8 hours
- FUNC → MOD: 4-6 hours
- Core Engine: 8-12 hours
- Integration & Testing: 8-10 hours
- **Total: 34-48 hours (5-6 days)**

## MVP Impact

**This is a CRITICAL MVP blocker:**
- MVP Acceptance Criteria #3: "AI assistance with entity derivation and relationship suggestions"
- Without this, the system is just a manual graph editor
- Core value proposition depends on AI-powered assistance

## References

- [implan.md:172-187](../implan.md#L172-L187) - Phase 3 Auto-Derivation section
- requirements.md FR-8.1 - LLM Integration requirements
- CURRENT_STATUS.md - Shows Phase 1 & 2 complete, Phase 3 pending

## Notes

- Start with UC → FUNC (most requested feature)
- Implement incrementally (one derivation type per sprint)
- Get user feedback after each derivation type
- Consider caching common derivation patterns (via AgentDB in CR-007)
