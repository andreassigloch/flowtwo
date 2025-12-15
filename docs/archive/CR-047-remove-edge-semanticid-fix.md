# CR-047: remove_edge Operation Ignores semanticId

**Type:** Bug Fix
**Status:** Completed
**Priority:** HIGH
**Created:** 2025-12-12

## Problem / Use Case

LLM-generated edge deletions were silently ignored. When the LLM produced Format-E operations like:
```
- GenerateDocument.FN.005 -io-> PRDDocument.FL.005
```

The parser correctly created:
```typescript
{
  type: 'remove_edge',
  semanticId: 'GenerateDocument.FN.005-io-PRDDocument.FL.005'
  // Note: no edge property
}
```

But `StatelessGraphCanvas.applyOperation()` checked `if (op.edge)` first, which was always `undefined` for parsed deletions, causing the operation to be silently skipped.

## Root Cause

In `src/canvas/stateless-graph-canvas.ts`, the `remove_edge` case had:

```typescript
case 'remove_edge':
  if (op.edge) {  // <-- Always false for parsed operations!
    // delete logic
  }
  break;
```

The Format-E parser only populates `semanticId` for remove operations (not the full edge object), but the canvas expected `op.edge`.

## Solution

Changed the logic to:
1. Try `op.edge` first (for programmatic operations that include the full edge)
2. Fall back to parsing `op.semanticId` format `sourceId-edgeType-targetId`

```typescript
case 'remove_edge':
  if (op.edge) {
    // Use edge object if provided
    const existing = this.agentDB.getEdgeByKey(...);
    if (existing) this.agentDB.deleteEdge(existing.uuid);
  } else if (op.semanticId) {
    // Parse semanticId format: sourceId-edgeType-targetId
    const parts = op.semanticId.split('-');
    if (parts.length === 3) {
      const [sourceId, edgeType, targetId] = parts;
      const existing = this.agentDB.getEdgeByKey(...);
      if (existing) this.agentDB.deleteEdge(existing.uuid);
    }
  }
  break;
```

## Files Modified

| File | Changes |
|------|---------|
| `src/canvas/stateless-graph-canvas.ts` | Fixed `remove_edge` case to parse `semanticId` |
| `tests/unit/canvas/stateless-graph-canvas.test.ts` | Added test for semanticId-only remove_edge |

## Verification

1. Unit tests pass: `npm run test -- tests/unit/canvas/stateless-graph-canvas.test.ts`
2. Build succeeds: `npm run build`
3. Manual test: LLM edge deletion now works in app

## Impact

This bug caused ALL LLM-generated edge deletions to fail silently. Any prompt asking to "remove", "delete", or "fix" edges would appear to succeed but leave the data unchanged.

## References

- Related: CR-046 (bidirectional io validation rule)
- Parser: `src/shared/parsers/format-e-parser.ts` (lines 577-585)
