# CR-029: Ontology Files Consolidation

**Type:** Refactoring
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-12-01
**Completed:** 2025-12-01

## Problem / Use Case

Multiple ontology JSON files existed with redundant and outdated information:

| File | Version | Status |
|------|---------|--------|
| `settings/ontology-rules.json` | 3.1.1 | Master - single source of truth |
| `settings/ontology.json` | 3.0.8 | Deleted - was redundant |
| `docs/archive/ontology.json` | 3.0.6 | Archived - historical reference |
| `docs/archive/ontology_schema.json` | 3.0.7 | Archived - historical reference |

This created:
- Confusion about which file is authoritative
- Risk of inconsistency when updating
- Unnecessary maintenance overhead

## Requirements

1. Single source of truth for ontology definition
2. All visual properties (colors, styles) must be preserved
3. Code using ontology.json must be updated to use ontology-rules.json
4. Archive files remain for historical reference

## Solution Implemented

### Phase 1: Merged visual properties into ontology-rules.json

Added to each nodeType:
- `color`: Hex color code (e.g., "#FF00FF")
- `ansiColor`: Terminal ANSI code (e.g., "35")

Added to each edgeType:
- `visualStyle`: Rendering style (implicit, solid-arrow, dashed-arrow, etc.)

Added top-level:
- `zoomLevels`: ["L0", "L1", "L2", "L3", "L4"]
- `nestingEdgeTypes`: ["compose", "satisfy", "allocate"]

Standardized validConnections format to `{source, target}` objects for TypeScript compatibility.

### Phase 2: Updated code references

Updated files:
- `src/shared/types/ontology.ts` - Changed import from ontology.json to ontology-rules.json
- `src/terminal-ui/ascii-grid.ts` - Updated comment reference
- `settings/README.md` - Updated documentation to reference ontology-rules.json

### Phase 3: Deleted redundant file

- Removed `settings/ontology.json`
- Removed self-reference from meta.sources in ontology-rules.json

## Current Status

- [x] Analyzed redundancies
- [x] Created CR document
- [x] Phase 1: Merge properties
- [x] Phase 2: Update code
- [x] Phase 3: Delete redundant file
- [x] TypeScript compilation verified
- [x] Unit tests passing

## Acceptance Criteria

- [x] Single ontology file: `settings/ontology-rules.json`
- [x] All visual properties preserved
- [x] All code compiles and tests pass
- [x] `settings/ontology.json` deleted

## Estimated Effort

Total: 1-2 hours (actual: ~1 hour)
