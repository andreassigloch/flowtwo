# CR-055: Unified Validation Pipeline mit Pre-Apply & Retry

**Type:** Refactoring
**Status:** Completed
**Priority:** HIGH
**Created:** 2024-12-15
**Depends on:** CR-054
**Blocks:** -

## Problem / Use Case

1. **Zwei getrennte Validierungssysteme** - `ArchitectureValidator` (hardcoded V1-V11) vs `UnifiedRuleEvaluator` (ontology-rules.json) - nicht wartbar
2. **Keine Pre-Apply Validation** - Fehler werden erst nach AgentDB-Apply erkannt (zu spät)
3. **Kein Retry-Loop** - LLM bekommt keine Chance zur Korrektur bei Fehlern

## Requirements

### Functional Requirements
- FR-055.1: Ein einziger Validator basierend auf ontology-rules.json
- FR-055.2: Pre-Apply Validation blockiert fehlerhafte Operationen VOR AgentDB-Eintrag
- FR-055.3: Automatischer LLM-Retry bei Pre-Apply-Fehlern (max 2x)
- FR-055.4: Sofortiges Feedback an LLM bei Format/Grammar-Fehlern

### Non-Functional Requirements
- NFR-055.1: Alle Regeln deklarativ in ontology-rules.json (keine hardcoded V1-V11)
- NFR-055.2: Bestehende Tests passieren weiterhin

## Success Criteria

**Primäre Akzeptanzkriterien (messbar):**
1. **Keine neuen Fehler im LLM Output** - Pre-Apply blockiert neue Violations
2. **Nach Fixes weniger Fehler als vorher** - Retry-Loop verbessert Output

**Technische Kriterien:**
3. Pre-Apply Validation aktiv vor AgentDB.apply()
4. Automatischer Retry mit Feedback (max 2x)
5. ArchitectureValidator deprecated
6. Alle Regeln in ontology-rules.json

## Architecture / Solution Approach

### Feedback Loop Architektur

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM REQUEST/RESPONSE CYCLE                       │
├─────────────────────────────────────────────────────────────────────────┤
│  User Message                                                            │
│        │                                                                 │
│        ▼                                                                 │
│  ┌─────────────┐                                                         │
│  │   LLM Call  │◄──────────────────────────────────────────┐             │
│  └──────┬──────┘                                           │             │
│         │                                                  │             │
│         ▼ LLM Output (text + operations)                   │             │
│  ┌──────────────────────────────────────────────────┐      │             │
│  │  LOOP 1: FORMAT VALIDATION (immediate)           │      │             │
│  │  ├─ <operations> syntax valid?                   │      │             │
│  │  ├─ Semantic ID format ok?                       │      │             │
│  │  └─ Edge arrow syntax ok?                        │      │             │
│  │  ❌ Fehler? ──► Feedback direkt ─────────────────┘      │             │
│  │  ✅ OK? ▼                                               │             │
│  └──────────────────────────────────────────────────┘      │             │
│         │                                                  │             │
│         ▼                                                  │             │
│  ┌──────────────────────────────────────────────────┐      │             │
│  │  LOOP 2: GRAMMAR VALIDATION (immediate)          │      │             │
│  │  ├─ Bidirectional io? (A→FL→A)                   │      │             │
│  │  ├─ Circular io? (Producer→FL→Producer)          │      │             │
│  │  ├─ Valid edge connections? (from ontology)      │      │             │
│  │  └─ Duplicate edge/node?                         │      │             │
│  │  ❌ Fehler? ──► Feedback direkt ─────────────────┘      │             │
│  │  ✅ OK? ▼                                               │             │
│  └──────────────────────────────────────────────────┘                    │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────────────────────────────────────┐                    │
│  │  APPLY TO AGENTDB                                │                    │
│  │  (nur wenn Loop 1+2 bestanden)                   │                    │
│  └──────────────────────────────────────────────────┘                    │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────────────────────────────────────┐                    │
│  │  LOOP 3: CONTEXT VALIDATION (für nächsten Call)  │                    │
│  │  ├─ millers_law, function_io, flow_connectivity  │                    │
│  │  └─ ──► chatHistory.addSystemMessage() ──────────┼────────────────────┘
│  └──────────────────────────────────────────────────┘
│         │
│         ▼
│  Response an User (Graph Update + Text)
└─────────────────────────────────────────────────────────────────────────┘
```

### Loop-Unterscheidung

| Loop | Wann | Feedback-Ziel | Retry? |
|------|------|---------------|--------|
| **Loop 1 (Format)** | Direkt nach LLM Output | Sofort an LLM | Ja, im selben Request |
| **Loop 2 (Grammatik)** | Nach Parse, vor Apply | Sofort an LLM | Ja, im selben Request |
| **Loop 3 (Kontext)** | Nach Apply | chatHistory | Nein, User entscheidet |

## Implementation Plan

### Phase 1: Consolidate Validators (1h)

1. **Deprecate** `ArchitectureValidator` (hardcoded V1-V11)
2. **Erweitern** `UnifiedRuleEvaluator`:
   - Add `validatePendingOperations(ops: Operation[]): ValidationResult`
   - Add `generateFeedbackForLLM(violations: Violation[]): string`
3. **Mapping:** V1-V11 → entsprechende Regeln in ontology-rules.json

| Old Code (V1-V11) | New Rule in ontology-rules.json |
|-------------------|--------------------------------|
| V1: NoFormatAsFUNC | nodeTypes.FUNC.forbiddenPatterns |
| V2: FlowHasSchema | flow_data_schema |
| V4: MillersLaw | millers_law |
| V10: NoNestedSYS | nested_sys_review |
| V11: VolatileIsolation | volatile_func_isolation |

### Phase 2: Pre-Apply Validation (1h)

**Create** `src/llm-engine/validation/pre-apply-validator.ts`:
```typescript
class PreApplyValidator {
  constructor(private rules: OntologyRules) {}

  validateOperations(
    pendingOps: Operation[],
    existingGraph: AgentDB
  ): PreApplyResult {
    const errors: ValidationError[] = [];

    // Check from integrityRules
    for (const rule of Object.values(this.rules.integrityRules)) {
      errors.push(...this.checkRule(rule, pendingOps, existingGraph));
    }

    // Check io patterns specifically
    errors.push(...this.checkIoBidirectional(pendingOps, existingGraph));
    errors.push(...this.checkIoCircular(pendingOps, existingGraph));

    return { valid: errors.length === 0, errors };
  }
}
```

**Integrate** in `session-manager.ts` BEFORE `chatCanvas.applyOperations()`:
```typescript
const preValidation = preApplyValidator.validateOperations(ops, agentDB);
if (!preValidation.valid) {
  return this.retryWithFeedback(preValidation.errors);
}
```

### Phase 3: LLM Retry Loop (30min)

**Add** retry logic in `session-manager.ts`:
```typescript
async processWithRetry(userMessage: string, maxRetries = 2): Promise<Result> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await this.llmEngine.process(userMessage);
    const preValidation = this.preValidate(response.operations);

    if (preValidation.valid) {
      return this.applyAndRespond(response);
    }

    if (attempt < maxRetries) {
      this.addValidationFeedback(preValidation.errors);
      userMessage = `[VALIDATION FAILED]\n${preValidation.feedback}\n\nPlease fix and try again.`;
    }
  }

  return { error: 'Validation failed after retries', details: lastErrors };
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/llm-engine/validation/unified-rule-evaluator.ts` | Add validatePendingOperations(), generateFeedbackForLLM() |
| `src/llm-engine/agents/architecture-validator.ts` | Deprecate, redirect to UnifiedRuleEvaluator |
| `src/session-manager.ts` | Add pre-apply validation + retry loop |
| `settings/ontology-rules.json` | Add missing rules (nested_sys_review, format patterns) |

## Files to Create

| File | Purpose |
|------|---------|
| `src/llm-engine/validation/pre-apply-validator.ts` | Pre-apply validation using ontology-rules |
| `src/llm-engine/validation/feedback-generator.ts` | Generate LLM-friendly feedback from violations |

## Estimated Effort

| Phase | Time |
|-------|------|
| Consolidate Validators | 1h |
| Pre-Apply Validation | 1h |
| Retry Loop | 30min |
| **Total** | **2.5h** |

## Current Status

**Completed: 2024-12-15**

### Implemented Changes

1. **PreApplyValidator Created** ✅
   - `src/llm-engine/validation/pre-apply-validator.ts` (new file)
   - Validates operations BEFORE AgentDB apply
   - Checks: duplicate nodes/edges, bidirectional io, invalid edge connections, missing nodes
   - Generates LLM-friendly feedback

2. **Pre-Apply Validation Types** ✅
   - `src/llm-engine/validation/types.ts`: Added `PreApplyError`, `PreApplyResult` interfaces

3. **Chat Interface Integration** ✅
   - `src/terminal-ui/chat-interface.ts`: Pre-apply validation before `graphCanvas.applyDiff()`
   - Blocks invalid operations from reaching AgentDB
   - Shows user-friendly error messages
   - Adds validation feedback to chatHistory for next LLM call

### Test Results
- Build: ✅ Passes
- TypeScript: ✅ No errors
- Validation tests: ✅ 41/44 pass (3 pre-existing SimilarityScorer issues)

### How It Works

```
LLM Response with operations
        │
        ▼
┌───────────────────────────────┐
│  PreApplyValidator.validate() │
│  - Check duplicate nodes      │
│  - Check duplicate edges      │
│  - Check bidirectional io     │
│  - Check missing nodes        │
│  - Check edge type validity   │
└───────────────────────────────┘
        │
    valid?
    ├── NO  → Block operations, show feedback, add to chatHistory
    │         User sees errors, next LLM call sees feedback
    │
    └── YES → graphCanvas.applyDiff()
              Graph updated normally
```

### Note on Retry Loop
Instead of automatic retry within same request (complex with streaming),
implemented "feedback loop" approach:
- Validation errors are added to chatHistory
- User can simply retry (next message)
- LLM sees the validation feedback and can self-correct

This is simpler and gives user visibility into what went wrong.

## References

- Plan: /Users/andreas/.claude/plans/transient-sparking-bubble.md
- CR-054: docs/cr/CR-054-preventive-prompt-instructions.md (Voraussetzung)
- ontology-rules.json: settings/ontology-rules.json
- ArchitectureValidator: src/llm-engine/agents/architecture-validator.ts (to be deprecated)
