# CR-019: Full Specification View with Multiple Occurrences

**Type:** Feature
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-11-20
**Completed:** 2025-11-20

---

## Problem / Use Case

GraphEngine needs a comprehensive view that shows the complete system specification with all element types in their hierarchical contexts. Currently:
- **Hierarchy view** only shows `compose` relationships (structural decomposition)
- **Requirements view** only shows `satisfy` and `verify` relationships
- **Allocation view** only shows `allocate` relationships

Users need a single view that shows **all nesting relationships simultaneously**, revealing how elements are used across different contexts. When an element (e.g., `Neo4jService`) is:
- Composed into a module via `compose`
- Allocated to multiple modules via `allocate`
- Satisfying requirements via `satisfy`

...it should appear multiple times in the specification, once in each context, with clear indication of which occurrence is the primary definition and which are references.

---

## Requirements

### Functional Requirements

**FR-1: Multi-Occurrence Rendering**
- Elements appearing in multiple contexts must be shown multiple times
- First occurrence = primary (fully expanded with children)
- Subsequent occurrences = references (collapsed, showing link to primary)
- Each occurrence shows which nesting edge type connects it to parent

**FR-2: All Nesting Edge Types**
- Include all three nesting edge types: `compose`, `satisfy`, `allocate`
- Start from root SYS nodes (no incoming nesting edges)
- Breadth-first traversal determines occurrence order
- First visit to an element = primary occurrence

**FR-3: Reference Links**
- Reference occurrences show path to primary definition
- Terminal UI format: `→ ElementName [see path/to/primary]`
- Path format: hierarchical path from root (e.g., "GraphEngine/Backend/Neo4jService")

**FR-4: Reference Indicator**
- Reference occurrences (not primary) display `→` indicator
- Format: `[TYPE] ElementName →`
- No usage counter on primary occurrences (simplified design)

**FR-5: Depth Control**
- Optional `maxDepth` parameter (default: null = unlimited)
- When depth limit reached, stop expanding children
- User can limit output for large graphs

**FR-6: All Node Types**
- Include all node types: SYS, UC, FCHAIN, FUNC, MOD, ACTOR, REQ, TEST, SCHEMA, FLOW
- No filtering by node type (unlike other views)

### Non-Functional Requirements

**NFR-1: Performance**
- Handle graphs up to 2000 nodes
- Compute time < 3 seconds
- Efficient occurrence tracking (no redundant traversals)

**NFR-2: Terminal UI Simplicity**
- No interactive links (terminal limitation)
- Plain text reference format
- Copy-pasteable paths
- Clear visual distinction between primary and reference

**NFR-3: Consistency**
- Follow existing view architecture (ViewConfig, LayoutConfig, RenderConfig)
- Use same YAML-like tree rendering as hierarchy view
- Integrate with existing ViewFilter and GraphViewer classes

---

## Architecture / Solution Approach

### 1. Enhanced ViewFilter Logic

**Location:** `src/graph-engine/view-filter.ts`

**Changes:**
- Detect `allowMultipleOccurrences` parameter in layout config
- If enabled, use multi-occurrence traversal algorithm
- Build occurrence map during layout filter phase
- Track primary vs reference for each occurrence

**Data Structure:**
```typescript
interface Occurrence {
  nodeId: string;
  path: string;  // Hierarchical path from root
  isPrimary: boolean;
  depth: number;
  parentPath: string | null;
  nestingEdgeType: EdgeType;  // Which edge connects to parent
}

interface OccurrenceMap {
  byNode: Map<string, Occurrence[]>;  // nodeId → all occurrences
  byPath: Map<string, Occurrence>;     // path → occurrence
}
```

### 2. Multi-Occurrence Traversal Algorithm

**Strategy:** Breadth-first from root nodes

```typescript
function buildMultiOccurrenceTree(
  graph: GraphState,
  nestingEdgeTypes: EdgeType[],
  maxDepth: number | null
): OccurrenceMap {
  const occurrenceMap: OccurrenceMap = {
    byNode: new Map(),
    byPath: new Map(),
  };

  // Find root nodes (no incoming nesting edges)
  const roots = findRootNodes(graph, nestingEdgeTypes);

  // BFS queue
  const queue: QueueItem[] = roots.map(node => ({
    nodeId: node.id,
    path: node.properties.Name,
    depth: 0,
    parentPath: null,
    edgeType: null,
  }));

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check depth limit
    if (maxDepth !== null && current.depth > maxDepth) {
      continue;
    }

    // Record occurrence
    if (!occurrenceMap.byNode.has(current.nodeId)) {
      occurrenceMap.byNode.set(current.nodeId, []);
    }

    const occurrences = occurrenceMap.byNode.get(current.nodeId)!;
    const isPrimary = occurrences.length === 0;

    const occurrence: Occurrence = {
      nodeId: current.nodeId,
      path: current.path,
      isPrimary,
      depth: current.depth,
      parentPath: current.parentPath,
      nestingEdgeType: current.edgeType,
    };

    occurrences.push(occurrence);
    occurrenceMap.byPath.set(current.path, occurrence);

    // Only expand children for primary occurrence
    if (!isPrimary) {
      continue;
    }

    // Find children via all nesting edge types
    for (const edgeType of nestingEdgeTypes) {
      const children = getChildrenViaEdgeType(graph, current.nodeId, edgeType);

      for (const child of children) {
        queue.push({
          nodeId: child.id,
          path: `${current.path}/${child.properties.Name}`,
          depth: current.depth + 1,
          parentPath: current.path,
          edgeType,
        });
      }
    }
  }

  return occurrenceMap;
}
```

### 3. Terminal UI Rendering

**Location:** `src/terminal-ui/graph-viewer.ts`

**Simplified Approach (No Interactive Links):**
- Primary: `[TYPE] ElementName` (no marker)
- Reference: `[TYPE] ElementName →` (arrow indicates reference)
- Visual distinction via `→` marker only
- No usage counters (simplified design decision)

**Rendering Logic:**
```typescript
function renderSpecViewNode(
  occurrence: Occurrence,
  occurrenceMap: OccurrenceMap,
  graph: GraphState,
  indent: number
): string[] {
  const node = graph.nodes.get(occurrence.nodeId)!;
  const allOccurrences = occurrenceMap.byNode.get(occurrence.nodeId)!;
  const prefix = '  '.repeat(indent);

  if (occurrence.isPrimary) {
    // Render primary occurrence
    const usageCount = allOccurrences.length;
    const marker = usageCount > 1
      ? ` [primary, used in ${usageCount} contexts]`
      : ' [primary]';

    const lines = [`${prefix}${node.properties.Name}${marker}`];

    // Render children (recursively)
    const childOccurrences = findChildOccurrences(occurrence.path, occurrenceMap);
    for (const child of childOccurrences) {
      lines.push(...renderSpecViewNode(child, occurrenceMap, graph, indent + 1));
    }

    return lines;
  } else {
    // Render reference occurrence
    const primary = allOccurrences.find(occ => occ.isPrimary)!;
    return [`${prefix}→ ${node.properties.Name} [see ${primary.path}]`];
  }
}
```

---

## Implementation Plan

### Phase 1: Core Multi-Occurrence Logic (4-5 hours)
- Implement `buildMultiOccurrenceTree` function in ViewFilter
- Add occurrence tracking data structures
- Write unit tests for traversal algorithm
- Handle circular dependency detection

### Phase 2: Rendering Logic (2-3 hours)
- Extend GraphViewer to handle spec view
- Implement primary vs reference rendering
- Format paths correctly
- Add usage count display

### Phase 3: Integration (2-3 hours)
- Wire up spec view in ViewFilter
- Connect to existing layout pipeline
- Test with realistic graph data
- Handle edge cases (empty graph, single node, etc.)

### Phase 4: Testing (2-3 hours)
- Unit tests for multi-occurrence logic
- Integration tests for full rendering
- Edge case testing (circular deps, max depth, etc.)
- Performance testing with large graphs

### Phase 5: Documentation (1 hour)
- Update view.ts types if needed
- Add inline comments
- Update README if needed

---

## Current Status

- [x] View configuration created (spec.json)
- [x] ViewType enum updated
- [x] Documentation written (README.md, spec-view-example.md, spec-implementation-guide.md)
- [x] Multi-occurrence traversal implementation (src/graph-engine/view-filter.ts)
- [x] Terminal UI rendering implementation (src/terminal-ui/graph-viewer.ts)
- [x] Unit tests (tests/unit/graph-engine/spec-view.test.ts - 7 tests passing)
- [x] Integration tests (tests/integration/views/spec-view.test.ts - 6 tests passing)
- [x] Edge case handling (circular deps, empty graph, depth limit)

---

## Acceptance Criteria

- [x] Spec view renders all node types in hierarchical structure
- [x] Elements appearing in multiple contexts shown multiple times
- [x] Primary occurrences render without marker
- [x] Reference occurrences show `[TYPE] ElementName →` format
- [x] No usage counter (simplified design)
- [x] All three nesting edge types (compose, satisfy, allocate) included
- [x] maxDepth parameter works correctly
- [x] No infinite loops with circular dependencies
- [x] Performance < 3s for graphs with 2000 nodes (verified in tests)
- [x] Terminal UI rendering clear and readable without interactive links
- [x] Unit tests cover traversal algorithm (7 tests)
- [x] Integration tests cover full rendering pipeline (6 tests)
- [x] Edge cases handled (empty graph, single node, max depth)

---

## Dependencies

- Existing ViewFilter class (src/graph-engine/view-filter.ts:35)
- Existing GraphViewer class (src/terminal-ui/graph-viewer.ts)
- Existing view configuration system (src/shared/types/view.ts:15)
- Reingold-Tilford layout algorithm (can be used as-is, no enhancement needed)

---

## Estimated Effort

**Total:** 11-15 hours (1.5-2 days)

**Breakdown:**
- Multi-occurrence logic: 4-5 hours
- Rendering logic: 2-3 hours
- Integration: 2-3 hours
- Testing: 2-3 hours
- Documentation: 1 hour

---

## References

- View Configuration: docs/specs/views/spec.json
- View Types: src/shared/types/view.ts:21
- View Documentation: docs/specs/views/README.md:127
- Rendering Example: docs/specs/views/spec-view-example.md
- Implementation Guide: docs/specs/views/spec-implementation-guide.md
- Existing Hierarchy View: src/shared/types/view.ts:127

---

**End of CR-019**
