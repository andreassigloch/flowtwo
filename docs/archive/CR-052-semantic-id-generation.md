# CR-052: Konsistente SemanticId-Generierung im Optimizer

**Type:** Bug Fix
**Status:** Completed
**Priority:** HIGH
**Created:** 2025-01-15
**Completed:** 2025-01-15

## Problem

Der Optimizer generiert kryptische semanticIds wie `FUNC_1765789510368_03lss6` statt lesbarer IDs wie `ValidatePayment.FUNC.a3b2c1`.

**Ursache:** `generateId()` in `move-operators.ts` verwendet Timestamp+Random ohne Bezug zum Node-Namen:
```typescript
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

**Symptom:** `/analyze` zeigt kryptische IDs in "Affects:" statt lesbarer Namen:
```
Affects: func4, func5, FUNC_1765789510368_03lss6
```

## Lösung

### Neues SemanticId-Format
```
{sanitizedName}.{TYPE}.{random6}
```

Beispiele:
- `ValidatePayment.FUNC.a3b2c1`
- `ValidatePayment+ValidateShipment.FUNC.x7y8z9` (Merge)
- `ValidatePayment_A.FUNC.m2n3o4` (Split)

### Implementierung

1. **Neue zentrale Utility:** `src/shared/utils/semantic-id.ts`
   - `generateSemanticId(name, type, existingIds)` mit Uniqueness-Check
   - `sanitizeName()` für konsistente Namensbereinigung

2. **Update:** `src/llm-engine/optimizer/move-operators.ts`
   - Ersetze alle `generateId()` Aufrufe durch `generateSemanticId()`
   - Übergebe `existingIds` Set aus Architecture für Kollisionsprüfung

## Current Status

- [x] Create `src/shared/utils/semantic-id.ts`
- [x] Update `move-operators.ts` (21 Stellen)
- [x] Add unit tests (13 tests passing)
- [x] Verify with optimizer unit tests

## Acceptance Criteria

- [x] `/optimize` generiert lesbare semanticIds (format: `{name}.{TYPE}.{random6}`)
- [x] `/analyze` zeigt lesbare Namen in "Affects:"
- [x] Keine Kollisionen möglich (Uniqueness-Check gegen existingIds)
- [x] Alle Optimizer-Tests passieren

## References

- Related: CR-028 (Architecture Optimization)
- Related: CR-049 (Optimizer Realignment)
