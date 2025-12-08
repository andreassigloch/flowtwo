# CR-025: Format E 1:N Edge Syntax

**Type:** Enhancement
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-11-27
**Completed:** 2025-11-27

## Problem / Use Case

Current Format E edge syntax requires one line per edge:
```
Canvas.MOD -cp-> CanvasBase.MOD
Canvas.MOD -cp-> ChatCanvas.MOD
Canvas.MOD -cp-> GraphCanvas.MOD
Canvas.MOD -cp-> Index.MOD
```

For graphs with many edges sharing the same source and type, this is inefficient. The `physical-layer-auto.format-e` example has 113 edge lines where many could be consolidated.

## Requirements

### Functional Requirements
- FR-1: Parser MUST accept 1:N edge syntax: `Source -type-> Target1, Target2, Target3`
- FR-2: Parser MUST remain backward-compatible with existing 1:1 edge syntax
- FR-3: Serializer MUST group edges by (source, type) and emit 1:N format
- FR-4: Mixed formats in same file MUST be supported (some 1:1, some 1:N)

### Non-Functional Requirements
- NFR-1: Token reduction target: 50-70% fewer edge lines for typical graphs
- NFR-2: No performance regression for parsing (<10% slower acceptable)

## Architecture / Solution Approach

### Syntax Definition

**1:N Edge Format:**
```
SourceID -type-> TargetID1, TargetID2, TargetID3
```

**Rules:**
- Targets separated by comma + optional whitespace
- Line can wrap (continuation with leading whitespace)
- Empty targets ignored (trailing comma allowed)

**Examples:**
```
# Single target (existing, still valid)
Canvas.MOD -cp-> Index.MOD

# Multiple targets (new)
Canvas.MOD -cp-> CanvasBase.MOD, ChatCanvas.MOD, GraphCanvas.MOD

# With line continuation (optional future enhancement)
Canvas.MOD -cp-> CanvasBase.MOD, ChatCanvas.MOD,
                 GraphCanvas.MOD, Index.MOD
```

### Parser Changes

Location: `src/shared/parsers/format-e-parser.ts`

1. `parseEdgeLine()` - Modify to split target on comma, return array of `ParsedEdgeLine`
2. `parseGraph()` - Handle array return from edge parsing
3. `parseDiff()` - Same treatment for diff operations

### Serializer Changes

1. `serializeGraph()` - Group edges by (sourceId, type), emit consolidated lines
2. `serializeEdge()` - New overload for multiple targets
3. `serializeDiff()` - Group edge operations similarly

## Implementation Plan

### Phase 1: Parser Enhancement (2-3 hours)
- Modify `parseEdgeLine()` to return `ParsedEdgeLine[]`
- Update callers to handle array
- Add unit tests for 1:N parsing

### Phase 2: Serializer Enhancement (2-3 hours)
- Add edge grouping logic in `serializeGraph()`
- Implement multi-target serialization
- Add unit tests for 1:N serialization

### Phase 3: Validation & Cleanup (1-2 hours)
- Round-trip tests (parse → serialize → parse)
- Update example files
- Measure token reduction

## Current Status

- [x] Parser: 1:N edge parsing
- [x] Serializer: Edge grouping and 1:N output
- [x] Unit tests (24 tests passing)
- [x] Integration tests (import-export tests passing)
- [x] Round-trip verification

## Acceptance Criteria

- [x] `Canvas.MOD -cp-> A, B, C` parses to 3 edges
- [x] Existing 1:1 syntax still works
- [x] Export produces grouped 1:N format
- [x] Round-trip: parse(serialize(graph)) === graph
- [x] Token reduction ≥50% on `physical-layer-auto.format-e`

## Results

Tested on `examples/physical-layer-auto.format-e`:

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Edge lines | 110 | 35 | **68%** |
| File size | 6,772 bytes | 6,032 bytes | 11% |
| Total lines | 168 | 82 | 51% |

Round-trip verification: 44 nodes, 108 edges - perfect match.

## Dependencies

None - self-contained enhancement to existing Format E implementation.

## Estimated Effort

Total: 5-8 hours (1 day)

## References

- [format-e.ts](../../src/shared/types/format-e.ts) - Type definitions
- [format-e-parser.ts](../../src/shared/parsers/format-e-parser.ts) - Parser implementation
- [physical-layer-auto.format-e](../../examples/physical-layer-auto.format-e) - Example file
