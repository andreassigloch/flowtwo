# CR-001: Layout Algorithms and Rendering Configuration

**Status:** Planned
**Priority:** Medium
**Target Phase:** Phase 3
**Created:** 2025-11-19
**Updated:** 2025-11-28

## Problem

### Layout Algorithms
Four layout algorithms in [graph-engine.ts:79-92](../../src/graph-engine/graph-engine.ts#L79-L92) are stubs that throw "not yet implemented (Phase 3)" errors:

1. `sugiyama` - Hierarchical layout for directed acyclic graphs
2. `orthogonal` - Grid-based orthogonal edge routing
3. `treemap` - Space-filling rectangular layout
4. `radial` - Circular/radial tree layout

Currently only `reingold-tilford` (tree layout) and `force-directed` layouts are implemented.

### Rendering Configuration (from CR-013)
Missing `rendering_ontology.json` with:
- L0-L4 zoom levels per node type (what to show at each zoom)
- Symbol/shape definitions
- Edge rendering styles

**Note:** Node colors already in `settings/ontology.json` (CR-023).

## Proposed Solution

### Part A: Layout Algorithms

Implement basic versions of all 4 layout algorithms:

### 1. Sugiyama (Layered Graph Drawing)
- **Purpose:** Hierarchical layout for DAGs (directed acyclic graphs)
- **Algorithm:**
  - Layer assignment (longest path)
  - Crossing reduction (barycenter heuristic)
  - X-coordinate assignment (priority layout)
- **Use case:** Dataflow diagrams, process flows, dependency graphs

### 2. Orthogonal Layout
- **Purpose:** Grid-based layout with horizontal/vertical edges only
- **Algorithm:**
  - Planarization
  - Orthogonalization (bend minimization)
  - Compaction
- **Use case:** Entity-relationship diagrams, circuit diagrams

### 3. Treemap Layout
- **Purpose:** Space-filling rectangular partitions
- **Algorithm:**
  - Squarified treemap (Bruls et al.)
  - Recursive subdivision
  - Size-based area allocation
- **Use case:** Hierarchical data visualization, file systems, portfolio views

### 4. Radial Layout
- **Purpose:** Circular/radial tree arrangement
- **Algorithm:**
  - Root at center
  - Children arranged in concentric circles
  - Angular spacing based on subtree size
- **Use case:** Org charts, taxonomies, social networks

### Part B: Rendering Configuration

Create `settings/rendering.json`:

```json
{
  "zoomLevels": {
    "L0": { "showLabel": "id", "showPorts": false },
    "L1": { "showLabel": "id + name", "showPorts": false },
    "L2": { "showLabel": "full", "showPorts": true },
    "L3": { "showLabel": "full + properties", "showPorts": true },
    "L4": { "showLabel": "full + metadata", "showPorts": true }
  },
  "nodeShapes": {
    "SYS": "rectangle",
    "FUNC": "rounded-rectangle",
    "FLOW": "ellipse",
    "MOD": "container",
    "REQ": "rectangle",
    "TEST": "hexagon",
    "UC": "oval",
    "ACTOR": "stick-figure",
    "FCHAIN": "rectangle-dashed",
    "SCHEMA": "document"
  },
  "edgeStyles": {
    "compose": { "style": "solid", "arrow": "none" },
    "io": { "style": "solid", "arrow": "open" },
    "satisfy": { "style": "dashed", "arrow": "open" },
    "verify": { "style": "dotted", "arrow": "open" },
    "allocate": { "style": "dashed", "arrow": "filled" },
    "relation": { "style": "dotted", "arrow": "none" }
  }
}
```

## Implementation Plan

### Phase 1: Rendering Config (2-3 hours)
1. Create `settings/rendering.json` with zoom levels
2. Define shapes and edge styles for all types
3. Integrate with graph-viewer.ts

### Phase 2: Layout Algorithms (12-16 hours)
1. Research existing algorithms (D3.js, Graphviz, Cytoscape.js)
2. Implement Sugiyama (4-5 hours)
3. Implement Orthogonal (3-4 hours)
4. Implement Treemap (2-3 hours)
5. Implement Radial (2-3 hours)

### Phase 3: Testing & Integration (3-5 hours)
1. Unit tests for each layout
2. Test zoom levels with ASCII renderer
3. Verify view configs work with layouts

## Acceptance Criteria

- [ ] `settings/rendering.json` with L0-L4 zoom levels
- [ ] All 10 node types have shape definitions
- [ ] All 6 edge types have style definitions
- [ ] All 4 layout functions return valid node positions
- [ ] No "not yet implemented" errors thrown
- [ ] Unit tests cover basic layout scenarios

## Dependencies

- `settings/ontology.json` - Node colors (already exists)
- View configs in `docs/specs/views/*.json` (already exist)

## Estimated Effort

- Rendering Config: 2-3 hours
- Layout Algorithms: 12-16 hours
- Testing & Integration: 3-5 hours
- **Total: 17-24 hours (2-3 days)**

## References

- Sugiyama, K., Tagawa, S., & Toda, M. (1981). "Methods for Visual Understanding of Hierarchical System Structures"
- Bruls, M., Huizing, K., & Van Wijk, J. J. (2000). "Squarified Treemaps"
- D3.js Layout Algorithms: https://d3js.org/
- Graphviz Documentation: https://graphviz.org/documentation/

## Notes

- Start with simple implementations, optimize later if performance becomes an issue
- Consider using existing libraries (dagre, d3-hierarchy) if appropriate
- Keep API consistent with existing `reingold-tilford` layout
