# CR-019: Full Specification View

**Type:** Feature
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-11-20
**Completed:** 2025-11-20

---

## Problem / Use Case

GraphEngine needs a specification view that shows complete system documentation with all element types in their hierarchical contexts. Unlike hierarchy view (single occurrence) or architecture view (top 2 levels), the spec view shows elements multiple times when used in different contexts, enabling full traceability.

---

## Requirements

### Functional Requirements

**FR-1: Complete Element Listing**
- Show ALL node types (SYS, UC, FCHAIN, FUNC, MOD, ACTOR, REQ, TEST, SCHEMA, FLOW)
- Include all nesting relationships (compose, satisfy, allocate)

**FR-2: Multiple Occurrences**
- Elements appearing via different edge types shown multiple times
- First occurrence = primary (fully expanded)
- Subsequent occurrences = reference (with `→` indicator)

**FR-3: Clear Reference Distinction**
- Primary: `[TYPE] ElementName` (no marker)
- Reference: `[TYPE] ElementName →` (arrow indicator only)

**FR-4: Depth Control**
- Optional maxDepth parameter
- Default: unlimited depth

### Non-Functional Requirements

**NFR-1: Performance**
- Handle up to 2000 nodes
- Render time < 3 seconds

---

## Architecture / Solution Approach

### Multi-Occurrence Traversal
- BFS traversal from root nodes (no incoming nesting edges)
- Track occurrences per node across all contexts
- First encounter = primary, subsequent = reference

### All Nesting Edge Types
- `compose` - Structural decomposition
- `satisfy` - Requirement hierarchy
- `allocate` - Module allocation

---

## Implementation

---

## Files Modified

### Configuration
- **docs/specs/views/spec.json** - View configuration (NEW)
- **src/shared/types/view.ts:21** - Added 'spec' to ViewType enum
- **src/shared/types/view.ts:261** - Added spec view to DEFAULT_VIEW_CONFIGS
- **docs/specs/views/README.md:127** - Documentation

### Implementation
- **src/graph-engine/view-filter.ts** - Added multi-occurrence traversal logic
  - `buildMultiOccurrenceTree()` - BFS traversal with occurrence tracking
  - `findRootNodes()` - Identify nodes without incoming nesting edges
  - `getChildrenViaEdgeType()` - Get children via specific edge type
  - Interfaces: `Occurrence`, `OccurrenceMap`

- **src/terminal-ui/graph-viewer.ts** - Added spec view rendering
  - `renderSpecView()` - Main rendering function
  - `buildOccurrenceMap()` - Build occurrence map for terminal UI
  - `renderOccurrence()` - Render single occurrence (primary or reference)
  - `findChildOccurrences()` - Find child occurrences of a path

### Tests
- **tests/unit/graph-engine/spec-view.test.ts** - 7 unit tests (NEW)
  - First occurrence marked as primary
  - Correct hierarchical paths
  - maxDepth parameter respected
  - Circular dependency handling
  - All nesting edge types included
  - Root node detection
  - Primary occurrence expansion

- **tests/integration/views/spec-view.test.ts** - 6 integration tests (NEW)
  - Complete system specification rendering
  - Empty graph handling
  - Single node graph
  - Deep nesting hierarchy
  - All node types support
  - Complex multi-occurrence scenarios

---

## Key Features

### 1. Multi-Occurrence Support
Elements can appear multiple times when used in different contexts:
- **Primary occurrence:** First encounter during BFS traversal
  - Fully expanded with all children
  - No special marker
- **Reference occurrences:** Subsequent encounters
  - Collapsed (no children shown)
  - Format: `[TYPE] ElementName →` (arrow indicator)

### 2. All Nesting Edge Types
Includes all three nesting relationships:
- `compose` - Structural decomposition
- `satisfy` - Requirement hierarchy
- `allocate` - Module allocation

### 3. Terminal UI Friendly
Simplified for terminal display:
- Tree structure with indentation
- Clear visual distinction (→ marker for references only)
- Color-coded node types

### 4. Edge Case Handling
- **Circular dependencies:** Prevented with visited path tracking
- **Empty graph:** Gracefully handled
- **Depth limit:** Optional maxDepth parameter
- **Single node:** Works correctly

---

## Example Output

```
[SYS] GraphEngine
├─[MOD] Backend
│ ├─[FUNC] ChatAPI
│ └─[FUNC] Neo4jService
│   └─[REQ] REQ-002: Data Persistence
├─[MOD] Frontend
│ └─[FUNC] ChatAPI →
└─[MOD] Database
  └─[FUNC] Neo4jService →
```

References (ChatAPI and Neo4jService appearing in multiple contexts) are marked with `→`.

---

## Test Results

**All tests passing:**
- 7 unit tests (spec-view.test.ts)
- 6 integration tests (spec-view.test.ts)
- 0 new lint errors
- 0 new type errors

---

## Performance

- BFS traversal: O(N + E) where N = nodes, E = edges
- Occurrence tracking: O(N × avg occurrences)
- Target: < 3s for graphs with 2000 nodes
- Actual: < 3ms in tests (significantly under target)

---

## Usage

### Switch to Spec View
```bash
# In GraphViewer terminal (Terminal 2)
/view spec
```

### With Depth Limit
Configuration parameter (in view config):
```json
{
  "layoutConfig": {
    "parameters": {
      "maxDepth": 3
    }
  }
}
```

---

---

## Current Status

- [x] ViewType updated with 'spec'
- [x] DEFAULT_VIEW_CONFIGS entry added
- [x] buildMultiOccurrenceTree() implemented in view-filter.ts
- [x] renderSpecView() implemented in graph-viewer.ts
- [x] renderOccurrence() shows → for references only
- [x] spec.json view configuration created
- [x] views/README.md updated
- [x] Unit tests passing (7 tests)
- [x] Integration tests passing (6 tests)

---

## Acceptance Criteria

- [x] Spec view renders complete system specification
- [x] Elements appearing multiple times shown with clear distinction
- [x] References marked with `→` indicator (no usage counter)
- [x] Primary occurrences fully expanded
- [x] All nesting edge types supported (compose, satisfy, allocate)
- [x] View selectable via `/view spec` command

---

## Dependencies

- ViewType and ViewConfig from view.ts
- graph-viewer.ts rendering infrastructure
- view-filter.ts traversal logic

---

## Estimated Effort

**Total:** 3 hours

---

## References

- View Configuration: docs/specs/views/spec.json
- View Types: src/shared/types/view.ts:21
- Traversal Logic: src/graph-engine/view-filter.ts
- Rendering: src/terminal-ui/graph-viewer.ts

---

## Future Enhancements (Not Implemented)

- Interactive links in web UI (terminal UI is non-interactive)
- Filter by element type
- Search/highlight specific elements
- Export to documentation format

---

**End of CR-019**
