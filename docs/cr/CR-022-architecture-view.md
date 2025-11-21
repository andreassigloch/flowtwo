# CR-022: Logical Architecture View

**Type:** Feature
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-11-21
**Completed:** 2025-11-21

---

## Problem / Use Case

GraphEngine needs a high-level architecture view showing first-level logical function blocks. This view provides:
- System overview for stakeholders
- Architecture documentation
- Quick understanding of major components and their relationships

Unlike the hierarchy view (which shows full decomposition) or spec view (which shows all occurrences), the architecture view focuses on the top 2 levels only.

---

## Requirements

### Functional Requirements

**FR-1: Box Rendering**
- Major function blocks rendered as ASCII boxes
- Box contains header with node type and name
- Direct children listed inside the box

**FR-2: Limited Depth**
- Default maxDepth: 2 levels (system + major blocks)
- At max depth, show child count instead of expanding

**FR-3: Data Flow Display**
- Show `io` edges as data flow arrows after the blocks
- Format: `[TYPE] Source ──▶ [TYPE] Target`

**FR-4: Node Types**
- Include: SYS, MOD, UC, FCHAIN, FUNC
- Hide: FLOW, REQ, TEST, ACTOR, SCHEMA (focus on logical blocks)

### Non-Functional Requirements

**NFR-1: Performance**
- Handle up to 500 nodes
- Render time < 1 second

**NFR-2: Readability**
- Clear box boundaries
- Color-coded node types
- Consistent indentation

---

## Architecture / Solution Approach

### View Configuration

Added to `DEFAULT_VIEW_CONFIGS` in `src/shared/types/view.ts`:

```typescript
architecture: {
  viewId: 'architecture',
  name: 'Logical Architecture View',
  description: 'First-level logical function blocks and their relationships',
  layoutConfig: {
    includeNodeTypes: ['SYS', 'MOD', 'UC', 'FCHAIN', 'FUNC'],
    includeEdgeTypes: ['compose', 'io'],
    algorithm: 'treemap',
    parameters: {
      maxDepth: 2,
      nestingEdgeTypes: ['compose'],
    },
  },
  renderConfig: {
    showNodes: ['SYS', 'MOD', 'UC', 'FCHAIN', 'FUNC'],
    showEdges: ['io'],
  },
}
```

### Rendering Functions

Added to `src/terminal-ui/graph-viewer.ts`:
- `renderArchitectureView()` - Main entry point
- `renderArchitectureBlock()` - Renders individual box with children

### Example Output

```
┌──────────────────────────────────────┐
│ [SYS] GraphEngine                    │
│──────────────────────────────────────│
│ ├─[MOD] Terminal UI                  │
│ ├─[MOD] Canvas                       │
│ ├─[MOD] LLM Engine                   │
│ └─[MOD] Neo4j Database               │
└──────────────────────────────────────┘

Data Flows:
  [MOD] Terminal UI ──▶ [MOD] Canvas
  [MOD] Canvas ──▶ [MOD] LLM Engine
```

---

## Implementation Plan

### Phase 1: Type Definition (0.5 hours)
- Add 'architecture' to ViewType union
- Add configuration to DEFAULT_VIEW_CONFIGS

### Phase 2: Rendering (1 hour)
- Implement renderArchitectureView function
- Implement renderArchitectureBlock helper
- Add case to switch statement

### Phase 3: Documentation (0.5 hours)
- Create architecture.json spec file
- Update views README.md

---

## Current Status

- [x] ViewType updated with 'architecture'
- [x] DEFAULT_VIEW_CONFIGS entry added
- [x] renderArchitectureView() implemented
- [x] renderArchitectureBlock() implemented
- [x] Switch case added in graph-viewer.ts
- [x] architecture.json spec file created
- [x] views/README.md updated

---

## Acceptance Criteria

- [x] Architecture view renders major blocks as ASCII boxes
- [x] Direct children shown inside each box
- [x] maxDepth limits expansion (default: 2)
- [x] Data flows shown as arrows at the bottom
- [x] Color-coded node types
- [x] View selectable via `/view architecture` command

---

## Dependencies

- ViewType and ViewConfig from view.ts
- graph-viewer.ts rendering infrastructure
- getNodeColor() for terminal colors

---

## Estimated Effort

**Total:** 2 hours

---

## References

- View Configuration: docs/specs/views/architecture.json
- View Types: src/shared/types/view.ts:22
- Rendering: src/terminal-ui/graph-viewer.ts:744

---

**End of CR-022**
