# CR-011: Add SE Methodology Prompts

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 3
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

LLM currently lacks Systems Engineering methodology guidance. According to [implan.md:236-240](../implan.md#L236-L240), the system should provide INCOSE/SysML 2.0 best practices to guide users through the SE lifecycle:

- Recognize current development phase (requirements → architecture → design → verification)
- Provide INCOSE/SysML 2.0 methodology guidance
- Suggest logical next steps based on current phase
- Enforce SE best practices (V-model, traceability, etc.)

**Current Status:** NOT IMPLEMENTED (marked as Phase 3 remaining task)

**Impact:** Without SE methodology guidance, users may:
- Skip critical SE phases (e.g., requirements before design)
- Create incomplete specifications
- Violate traceability requirements
- Miss verification/validation steps

## Requirements

**From implan.md Phase 3 remaining tasks:**
1. Phase recognition: Identify current SE lifecycle phase
2. INCOSE/SysML 2.0 guidance: Provide methodology recommendations
3. Suggest next steps: Recommend logical next entities/relationships
4. Best practices enforcement: Warn about SE anti-patterns

**SE Phases to Support:**
1. **Requirements Definition** (REQ, UC, STAKEHOLDER)
2. **Functional Architecture** (FUNC, FLOW, PORT, INTERFACE)
3. **Physical Architecture** (MOD, COMP, SCHEMA)
4. **Allocation** (FUNC→MOD mappings)
5. **Verification & Validation** (TEST, validation rules)

## Proposed Solution

### 1. Phase Recognition Engine

```typescript
interface SEPhase {
  name: string;
  description: string;
  requiredEntities: NodeType[];
  optionalEntities: NodeType[];
  nextPhases: SEPhase[];
}

interface PhaseAnalysis {
  currentPhase: SEPhase;
  completeness: number; // 0-100%
  missingEntities: NodeType[];
  suggestedNextSteps: string[];
}
```

**Phase Detection Logic:**
- Analyze canvas entity distribution
- Check for phase-specific patterns
- Identify missing critical entities
- Determine phase completeness percentage

### 2. INCOSE/SysML 2.0 Prompt Templates

**Requirements Phase Prompts:**
```
"I see you have {req_count} requirements defined. Consider:
- Adding use cases (UC) to describe user interactions
- Defining stakeholder needs (STAKEHOLDER) for traceability
- Creating test cases (TEST) to verify each requirement

According to INCOSE guidelines, every requirement should be:
- Verifiable (linked to at least one TEST)
- Traceable (satisfiedBy relationship to implementation)
- Clear and unambiguous"
```

**Functional Architecture Prompts:**
```
"Your requirements are well-defined. Next logical step: Functional Architecture
- Derive functions (FUNC) from use cases (UC)
- Define functional flows (FLOW) between functions
- Specify interfaces (INTERFACE) and ports (PORT)

SysML 2.0 best practice: Maintain functional/physical separation"
```

**Allocation Phase Prompts:**
```
"I see {func_count} functions but no modules. Consider:
- Creating modules (MOD) for physical architecture
- Allocating functions to modules (allocated_to edges)
- Defining component boundaries (COMP)

INCOSE V-model: Allocation bridges functional and physical views"
```

**Verification Phase Prompts:**
```
"Your architecture is complete. Now verify:
- Create test cases (TEST) for requirements (REQ)
- Define verification methods (analysis, inspection, test, demonstration)
- Ensure every REQ has verified_by relationship to at least one TEST

SysML 2.0: Requirements verification is mandatory before design freeze"
```

### 3. Next Step Suggestions

**Context-Aware Recommendations:**
```typescript
interface NextStepSuggestion {
  action: string;
  entityType: NodeType;
  reason: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  incoseReference: string;
}
```

**Example Suggestions:**
- "Add TEST for REQ-001 (CRITICAL: requirement not verified)"
- "Allocate FUNC-005 to a MODULE (HIGH: orphaned function)"
- "Define FLOW between FUNC-003 and FUNC-007 (MEDIUM: missing data flow)"

### 4. Anti-Pattern Detection

**Common SE Anti-Patterns:**
- Design before requirements (physical entities before functional)
- Orphaned requirements (no satisfiedBy or verified_by)
- Missing traceability (incomplete trace chains)
- Allocation gaps (functions not allocated to modules)
- Interface mismatches (port types don't match)

## Implementation Plan

### Phase 1: Phase Recognition (3-4 hours)
1. Create `src/llm-engine/se-methodology.ts`
2. Define SEPhase data structures
3. Implement phase detection algorithm
4. Calculate phase completeness metrics

### Phase 2: Prompt Template Library (3-4 hours)
1. Create `src/llm-engine/prompts/se-methodology-prompts.ts`
2. Write prompt templates for each SE phase
3. Add INCOSE/SysML 2.0 references
4. Implement prompt selection logic based on phase

### Phase 3: Next Step Suggestions (2-3 hours)
1. Implement suggestion generation logic
2. Prioritize suggestions (critical warnings first)
3. Add rationale and INCOSE references
4. Format suggestions for chat output

### Phase 4: Anti-Pattern Detection (2-3 hours)
1. Define anti-pattern rules
2. Implement detection algorithms
3. Generate warning messages
4. Suggest corrective actions

### Phase 5: LLM Integration (2-3 hours)
1. Inject SE prompts into LLM context
2. Add phase info to system prompts
3. Implement suggestion command (/suggest)
4. Add SE guidance to auto-derivation (CR-005)

### Phase 6: Testing & Refinement (2-3 hours)
1. Write unit tests for phase detection
2. Test prompt effectiveness with real scenarios
3. Validate INCOSE compliance
4. Refine suggestion priorities
5. Document SE methodology configuration

## Acceptance Criteria

- [ ] Phase recognition correctly identifies SE lifecycle phase
- [ ] INCOSE/SysML 2.0 prompts provided for each phase
- [ ] Next step suggestions are context-aware and prioritized
- [ ] Anti-patterns detected and warnings issued
- [ ] SE guidance integrated with auto-derivation (CR-005)
- [ ] /suggest command shows SE methodology recommendations
- [ ] All prompts reference INCOSE/SysML 2.0 standards
- [ ] Unit tests cover phase detection logic (70% coverage)
- [ ] SE methodology documentation complete

## Dependencies

- LLM Engine must be functional (already implemented)
- Canvas state management (already implemented)
- Auto-derivation logic (CR-005) - enhances suggestions
- Ontology validation (CR-006) - complements SE guidance

## Estimated Effort

- Phase Recognition: 3-4 hours
- Prompt Template Library: 3-4 hours
- Next Step Suggestions: 2-3 hours
- Anti-Pattern Detection: 2-3 hours
- LLM Integration: 2-3 hours
- Testing & Refinement: 2-3 hours
- **Total: 14-20 hours (2-3 days)**

## Benefits

**User Guidance:**
- Clear SE methodology roadmap
- Prevents common SE mistakes
- Educates users on INCOSE best practices

**Quality Assurance:**
- Enforces traceability requirements
- Detects incomplete specifications
- Ensures verification coverage

**Productivity:**
- Suggests logical next steps
- Reduces time spent planning
- Automates SE compliance checks

## References

- [implan.md:236-240](../implan.md#L236-L240) - Phase 3 SE Methodology section
- INCOSE Systems Engineering Handbook v4
- SysML 2.0 specification (OMG)
- requirements.md FR-8.1 - LLM guidance requirements

## Notes

- Start with basic phase recognition, enhance incrementally
- INCOSE references should be specific (section numbers)
- Consider adding SE methodology configuration (strict vs permissive)
- May need periodic prompt updates as SysML 2.0 evolves
- Integrate with validation advisor (CR-006) for comprehensive guidance
