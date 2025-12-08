# CR-037: UC/REQ Quality Enforcement per INCOSE Standards

**Type:** Feature
**Status:** Planned
**Priority:** HIGH
**Target Phase:** Phase 1 (Requirements)
**Created:** 2025-12-08
**Author:** andreas@siglochconsulting

## Problem / Use Case

The ontology defines UC and REQ quality criteria (from INCOSE GtWR v4), but:
1. **Requirements Engineer prompt** doesn't ask for pre/post conditions, scenarios, goals
2. **Validation rules** don't check UC/REQ quality attributes
3. **Phase gate** allows advancing without quality checks
4. **Reward calculation** references `uc_quality_score` and `req_quality_score` but they're never computed

**Result:** Low-quality UCs and REQs pass Phase 1 gate, causing problems in later phases.

### Current UC Generation

```
User: "Create a banking app for viewing balances and transferring money"

Current Output:
+ ViewAccountBalance|UC|ViewAccountBalance.UC.001|View the account balance
+ TransferFunds|UC|TransferFunds.UC.002|Transfer money between accounts

Missing (per INCOSE):
- Preconditions (user must be authenticated)
- Postconditions (balance updated, transfer confirmed)
- Main success scenario (step-by-step flow)
- Goal definition (what actor achieves)
- Actors (who triggers, who benefits)
```

### Current REQ Generation

```
Current Output:
+ ViewBalanceReq|REQ|ViewBalance.RQ.001|User must be able to view their account balance

Missing (per INCOSE GtWR):
- Verifiable: measurable acceptance criteria
- Singular: one requirement per statement (no "and")
- Unambiguous: precise terms, no "fast", "easy", "user-friendly"
- Complete: all conditions specified
```

## Requirements

### Functional Requirements

**UC Quality (from ontology ucQualityWeights):**
1. **FR-1**: UC must have at least one linked REQ (`uc_has_requirements`)
2. **FR-2**: UC must have at least one triggering ACTOR (`uc_has_actor`)
3. **FR-3**: UC must have main success scenario in description (`uc_has_scenario`)
4. **FR-4**: UC must have explicit goal statement (`uc_goal_defined`)
5. **FR-5**: UC should have postcondition (`uc_postcondition`)
6. **FR-6**: UC should have precondition (`uc_precondition`)

**REQ Quality (from ontology reqQualityWeights):**
7. **FR-7**: REQ must be verifiable - measurable criteria (`req_verifiable`)
8. **FR-8**: REQ must be necessary - no gold-plating (`req_necessary`)
9. **FR-9**: REQ must be singular - one req per statement (`req_singular`)
10. **FR-10**: REQ must be unambiguous - precise terms (`req_unambiguous`)
11. **FR-11**: REQ must conform to standard format (`req_conforming`)
12. **FR-12**: REQ must be complete - all conditions specified (`req_complete`)

### Non-Functional Requirements

1. **NFR-1**: Quality scores must be computable without LLM (deterministic validation)
2. **NFR-2**: Phase 1→2 gate requires `uc_quality_score >= 0.7` and `req_quality_score >= 0.7`
3. **NFR-3**: Prompts must guide LLM to produce compliant output

## Architecture / Solution Approach

### UC Node Extended Properties

Add optional properties to UC nodes per ontology:

```typescript
interface UCNode {
  // Existing
  uuid: string;
  type: 'UC';
  name: string;
  descr: string;
  semanticId: string;

  // NEW: INCOSE UC Template properties
  goal?: string;           // What actor achieves
  precondition?: string;   // Conditions before UC starts
  postcondition?: string;  // Conditions after UC completes
  mainScenario?: string;   // Step-by-step success path
  triggers?: string[];     // What initiates this UC
  actors?: string[];       // SemanticIds of involved ACTORs
}
```

### REQ Node Extended Properties

```typescript
interface REQNode {
  // Existing
  uuid: string;
  type: 'REQ';
  name: string;
  descr: string;
  semanticId: string;

  // NEW: INCOSE GtWR properties
  acceptanceCriteria?: string;   // How to verify
  rationale?: string;            // Why this requirement
  priority?: 'must' | 'should' | 'could' | 'wont';  // MoSCoW
  source?: string;               // Where it came from
}
```

### Validation Rules Implementation

Add new rules to `ontology-rules.json` validationRules section:

```json
{
  "uc_has_actor": {
    "id": "uc_has_actor",
    "description": "Every UC must have at least one ACTOR via io edges or compose",
    "phase": "phase1_requirements",
    "severity": "warning",
    "weight": 0.25,
    "cypher": "MATCH (uc:Node {type: 'UC'}) WHERE NOT EXISTS { MATCH (a:Node {type: 'ACTOR'})-[]->(uc) OR (uc)-[]->(a:Node {type: 'ACTOR'}) } RETURN uc.semanticId AS violation"
  },
  "uc_has_scenario": {
    "id": "uc_has_scenario",
    "description": "UC should have mainScenario property defined",
    "phase": "phase1_requirements",
    "severity": "warning",
    "weight": 0.20
  },
  "req_singular": {
    "id": "req_singular",
    "description": "REQ should not contain 'and' joining multiple requirements",
    "phase": "phase1_requirements",
    "severity": "warning",
    "weight": 0.15,
    "pattern": "descr should not match /\\band\\b.*shall|shall.*\\band\\b/i"
  }
}
```

### Updated Requirements Engineer Prompt

Add INCOSE UC template to `requirements-engineer.md`:

```markdown
## INCOSE Use Case Template

For each UC, capture:

1. **Name**: Verb+Noun (e.g., ViewAccountBalance)
2. **Goal**: What actor achieves by completing this UC
3. **Preconditions**: What must be true before UC starts
4. **Postconditions**: What is true after UC completes successfully
5. **Trigger**: What initiates this UC
6. **Main Success Scenario**: Step-by-step flow
7. **Actors**: Primary actor (triggers), Secondary actors (involved)

### UC Format E Extended Syntax

\`\`\`
+ ViewBalance|UC|ViewBalance.UC.001|User views account balance|{"goal":"User knows current balance","precondition":"User authenticated","postcondition":"Balance displayed","mainScenario":"1. User selects account 2. System retrieves balance 3. System displays balance"}
\`\`\`

## INCOSE GtWR Requirement Characteristics

Every REQ must be:
- **Verifiable**: Has acceptance criteria (measurable)
- **Singular**: One requirement (no "and" combining multiple)
- **Unambiguous**: No vague terms (fast, easy, user-friendly → use numbers)
- **Complete**: All conditions specified

### Bad vs Good Requirements

| Bad | Good |
|-----|------|
| "System shall be fast" | "System shall respond within 2 seconds" |
| "System shall be easy to use" | "User shall complete checkout in <5 clicks" |
| "System shall handle errors and log them" | Split into 2 REQs |
```

### Quality Score Calculation

Implement in `src/llm-engine/validation/quality-scorer.ts`:

```typescript
export function calculateUCQualityScore(uc: UCNode, edges: Edge[]): number {
  let score = 0;
  const weights = {
    uc_has_requirements: 0.25,
    uc_has_actor: 0.25,
    uc_has_scenario: 0.20,
    uc_goal_defined: 0.15,
    uc_postcondition: 0.10,
    uc_precondition: 0.05
  };

  // Check each criterion
  if (hasLinkedRequirements(uc, edges)) score += weights.uc_has_requirements;
  if (hasLinkedActor(uc, edges)) score += weights.uc_has_actor;
  if (uc.mainScenario) score += weights.uc_has_scenario;
  if (uc.goal) score += weights.uc_goal_defined;
  if (uc.postcondition) score += weights.uc_postcondition;
  if (uc.precondition) score += weights.uc_precondition;

  return score;
}

export function calculateREQQualityScore(req: REQNode): number {
  let score = 0;
  const weights = {
    req_verifiable: 0.25,
    req_necessary: 0.20,
    req_singular: 0.15,
    req_unambiguous: 0.15,
    req_conforming: 0.15,
    req_complete: 0.10
  };

  if (req.acceptanceCriteria) score += weights.req_verifiable;
  if (!containsGoldPlating(req.descr)) score += weights.req_necessary;
  if (!containsMultipleRequirements(req.descr)) score += weights.req_singular;
  if (!containsVagueTerms(req.descr)) score += weights.req_unambiguous;
  if (followsStandardFormat(req.descr)) score += weights.req_conforming;
  if (isComplete(req)) score += weights.req_complete;

  return score;
}
```

## Implementation Plan

### Phase 1: Ontology & Schema Updates (2-3 hours)

1. Add UC extended properties to ontology node types
2. Add REQ extended properties to ontology node types
3. Add validation rules for quality criteria
4. Update Format E parser to handle extended properties

### Phase 2: Prompt Updates (2-3 hours)

1. Update `requirements-engineer.md` with INCOSE templates
2. Add UC template with goal/pre/post/scenario
3. Add REQ quality guidelines (verifiable, singular, etc.)
4. Add examples of good vs bad UCs and REQs

### Phase 3: Quality Scorer Implementation (3-4 hours)

1. Create `quality-scorer.ts`
2. Implement `calculateUCQualityScore()`
3. Implement `calculateREQQualityScore()`
4. Integrate with phase gate manager

### Phase 4: Integration & Testing (2-3 hours)

1. Update phase gate to check quality scores
2. Add `/quality` command to show scores
3. Unit tests for quality scorer
4. Integration test with sample UCs/REQs

## Current Status

- [ ] Extend UC node properties in ontology
- [ ] Extend REQ node properties in ontology
- [ ] Add validation rules
- [ ] Update requirements-engineer.md prompt
- [ ] Implement quality scorer
- [ ] Integrate with phase gate
- [ ] Add /quality command
- [ ] Unit tests
- [ ] Integration tests

## Acceptance Criteria

- [ ] UC nodes can have goal, precondition, postcondition, mainScenario properties
- [ ] REQ nodes can have acceptanceCriteria, rationale, priority, source properties
- [ ] `/analyze` reports UC quality score per node
- [ ] `/analyze` reports REQ quality score per node
- [ ] Phase 1→2 gate blocks if `uc_quality_score < 0.7` or `req_quality_score < 0.7`
- [ ] Requirements engineer asks for missing UC attributes
- [ ] Requirements engineer flags vague REQ terms

## Dependencies

- CR-036: /architect command (consumes Phase 1 output)
- Ontology rules schema
- Format E parser

## Estimated Effort

Total: 9-13 hours (2 days)

## References

- INCOSE Guide to Writing Requirements (GtWR) v4
- INCOSE SE Handbook v5
- ISO/IEC/IEEE 29148:2018 - Requirements Engineering
- [ontology-rules.json](../../settings/ontology-rules.json) - ucQualityWeights, reqQualityWeights
- [requirements-engineer.md](../../settings/prompts/requirements-engineer.md) - Current prompt
