# CR-001: Implement Layout Algorithms

**Status:** Planned
**Priority:** Medium
**Target Phase:** Phase 3
**Created:** 2025-11-19

## Problem

Four layout algorithms in [graph-engine.ts:79-92](../../src/graph-engine/graph-engine.ts#L79-L92) are stubs that throw "not yet implemented (Phase 3)" errors:

1. `sugiyama` - Hierarchical layout for directed acyclic graphs
2. `orthogonal` - Grid-based orthogonal edge routing
3. `treemap` - Space-filling rectangular layout
4. `radial` - Circular/radial tree layout

Currently only `reingold-tilford` (tree layout) and `force-directed` layouts are implemented.

## Proposed Solution

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

## Implementation Plan

1. Research existing algorithms (D3.js, Graphviz, Cytoscape.js)
2. Implement basic version of each algorithm
3. Add configuration options (spacing, direction, constraints)
4. Write unit tests for each layout
5. Add layout examples to visualize.ts
6. Document algorithm choices and parameters

## Acceptance Criteria

- [ ] All 4 layout functions return valid node positions
- [ ] No "not yet implemented" errors thrown
- [ ] Unit tests cover basic layout scenarios
- [ ] Documentation explains when to use each layout
- [ ] Examples demonstrate each layout type

## Dependencies

- None (can be implemented independently)

## Estimated Effort

- Research: 2-4 hours
- Implementation: 8-12 hours
- Testing: 3-5 hours
- Documentation: 2-3 hours
- **Total: 15-24 hours**

## References

- Sugiyama, K., Tagawa, S., & Toda, M. (1981). "Methods for Visual Understanding of Hierarchical System Structures"
- Bruls, M., Huizing, K., & Van Wijk, J. J. (2000). "Squarified Treemaps"
- D3.js Layout Algorithms: https://d3js.org/
- Graphviz Documentation: https://graphviz.org/documentation/

## Notes

- Start with simple implementations, optimize later if performance becomes an issue
- Consider using existing libraries (dagre, d3-hierarchy) if appropriate
- Keep API consistent with existing `reingold-tilford` layout
