# CR-055: Pre-Apply Validation Pipeline

**Type:** Feature
**Status:** Implemented
**Priority:** HIGH
**Created:** 2025-12-16
**Author:** andreas@siglochconsulting

## Problem / Use Case

LLM erzeugt neue Fehler beim Reparieren bestehender Fehler, weil:
1. Pre-Apply Validation blockierte legitime "Direction Correction" Patterns
2. Validator prüfte Zwischenzustände statt den kompletten Batch

**Beispiel:** LLM will io-Edge Richtung korrigieren:
```
## Edges
- ValidateImpl.FN.020 -io-> ValidationResult.FL.003   # delete wrong
+ ValidationResult.FL.003 -io-> ValidateImpl.FN.020   # add correct
```

Alter Validator: Blockierte mit BIDIRECTIONAL_IO, weil er nicht erkannte, dass die alte Edge gelöscht wird.

## Requirements

### Functional Requirements
- FR-1: Direction Correction Pattern erlauben (`- A→B` + `+ B→A` in same batch)
- FR-2: Multiple `<operations>` Blocks zu einem Block mergen (Mistral-Kompatibilität)
- FR-3: Batch-aware Validation (alle Operationen als Einheit prüfen)

### Non-Functional Requirements
- NFR-1: Pre-Apply Validation < 50ms
- NFR-2: Keine false positives bei legitimen Correction Patterns

## Architecture / Solution Approach

### Direction Correction Pattern

Der `PreApplyValidator` tracked jetzt `pendingEdgeRemovals`:

```typescript
// Collect pending removals for lookahead validation
const pendingEdgeRemovals = new Set<string>();
for (const op of operations) {
  if (op.action === 'remove' && op.type === 'edge') {
    pendingEdgeRemovals.add(`${op.sourceId}|${op.edgeType}|${op.targetId}`);
  }
}

// In checkBidirectionalIo:
const reverseKey = `${op.targetId}|io|${op.sourceId}`;
const reverseBeingDeleted = pendingEdgeRemovals?.has(reverseKey) ?? false;

if (reverseExists && !reverseBeingDeleted) {
  // Error: Bidirectional io
}
// else: reverse is being deleted = direction correction (valid)
```

### Multi-Block Merging (Mistral-Kompatibilität)

`ResponseParser.parseResponse()` merged multiple `<operations>` Blocks:

```typescript
// Extract ALL complete operations blocks
const allOperations = this.extractAllOperationsBlocks(response);

// Combine ALL operations blocks into one
const allContent: string[] = [];
for (const block of allOperations) {
  const content = this.extractOperationsContent(block);
  if (content) allContent.push(content);
}
combinedOperations = `<operations>\n${allContent.join('\n')}\n</operations>`;
```

**Wichtig:** Dies ist notwendig weil einige LLM-Provider (z.B. Mistral) multiple Operations-Blocks hintereinander streamen statt alle Operationen in einem Block zu kombinieren.

### Validation Timing

```
LLM streamt Response
    │
    ▼
chunk.type === 'complete'  ← Erst hier wird validiert
    │
    ▼
ResponseParser.parseResponse()  ← Merged alle Blocks
    │
    ▼
PreApplyValidator.validateOperations()  ← Prüft als Einheit
    │
    ├── Valid? → applyOperations()
    └── Invalid? → Retry mit Feedback
```

## Implementation Status

### Completed
- [x] `pendingEdgeRemovals` tracking in PreApplyValidator
- [x] Direction Correction Pattern in `checkBidirectionalIo()`
- [x] Unit tests für Direction Correction (3 tests)
- [x] Multi-Block Merging in ResponseParser (existierte bereits via CR-034 Codekommentar)

### Files Modified
- `src/llm-engine/validation/pre-apply-validator.ts` - Direction Correction Logic
- `tests/unit/validation/pre-apply-validator.test.ts` - Unit Tests (NEW)

## Acceptance Criteria

- [x] `- A→B` + `+ B→A` in same batch = VALID (direction correction)
- [x] `+ B→A` ohne delete bei existierender `A→B` = BIDIRECTIONAL_IO error
- [x] `+ A→B` + `+ B→A` in same batch = BIDIRECTIONAL_IO_BATCH error
- [x] Multiple `<operations>` Blocks werden korrekt gemerged
- [x] Unit tests passieren

## Test Coverage

```bash
npm run test -- tests/unit/validation/pre-apply-validator.test.ts
```

Tests:
1. `should allow delete + add reverse io edge in same batch`
2. `should block adding reverse edge WITHOUT deleting existing`
3. `should block adding both directions in same batch`

## References

- Plan file: `.claude/plans/transient-sparking-bubble.md`
- Related: CR-034 (Code-Kommentar referenziert Multi-Block, aber thematisch Phase State)
- Related: CR-054 (Prompt-Instruktionen für LLM)
