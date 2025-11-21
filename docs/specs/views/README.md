# View Configurations

**Version:** 1.0.0
**Author:** andreas@siglochconsulting
**Date:** 2025-11-18

---

## Overview

This directory contains JSON configuration files for GraphEngine's 7 specialized views. Each view filters the ontology graph to show specific perspectives and applies appropriate layout algorithms.

---

## View Definitions

### 1. [hierarchy.json](hierarchy.json) - Hierarchy View

**Purpose:** System decomposition tree

**Layout Algorithm:** Reingold-Tilford (tree layout)

**Shows:**
- Node types: SYS, UC, FCHAIN, FUNC, MOD, ACTOR, REQ, TEST, SCHEMA
- Relationships: compose (implicit via nesting)

**Use Case:** Understand system structure and subsystem breakdown

**Performance:** <2s for <1000 nodes

---

### 2. [functional-flow.json](functional-flow.json) - Functional Flow View

**Purpose:** Function network with data flows

**Layout Algorithm:** Orthogonal (Manhattan routing)

**Shows:**
- Node types: UC, FCHAIN, FUNC, ACTOR
- Ports: FLOW nodes rendered as ports on FUNC blocks
- Relationships: io (explicit arrows), compose (implicit nesting)

**Key Features:**
- FLOW nodes NOT rendered as separate symbols
- FLOW → FUNC = input port (left side)
- FUNC → FLOW = output port (right side)
- 90° angles only (orthogonal routing)

**Use Case:** Design functional architecture with I/O contracts

**Performance:** <3s for <500 nodes + <1000 edges

---

### 3. [requirements.json](requirements.json) - Requirements Traceability View

**Purpose:** Requirements flow through system

**Layout Algorithm:** Sugiyama (layered graph)

**Shows:**
- Node types: SYS, UC, FUNC, REQ, TEST
- Relationships: satisfy, verify (both explicit with stereotypes)

**Layering:**
1. Layer 0: SYS (system)
2. Layer 1: UC (use cases)
3. Layer 2: FUNC (functions)
4. Layer 3: REQ (requirements)
5. Layer 4: TEST (test cases)

**Validation Rules:**
- Every REQ must have ≥1 incoming satisfy edge
- Every REQ must have ≥1 incoming verify edge

**Use Case:** Trace requirements to implementation and tests

**Performance:** <2s for <1000 nodes

---

### 4. [allocation.json](allocation.json) - Allocation View

**Purpose:** Physical/software module allocation

**Layout Algorithm:** Treemap (squarified)

**Shows:**
- Node types: MOD (containers), FUNC (allocated to modules)
- Relationships: allocate (explicit with diamond marker), compose (nesting)

**Key Features:**
- MOD nodes are containers (auto-resize)
- FUNC nodes packed within allocated MOD
- Squarified algorithm maintains aspect ratio ~1.618
- Size based on node count

**Use Case:** Map functions to hardware/software modules

**Performance:** <2s for <500 nodes

---

### 5. [use-case-diagram.json](use-case-diagram.json) - Use Case Diagram View

**Purpose:** UML-compliant use case visualization

**Layout Algorithm:** Radial (center-out)

**Shows:**
- Node types: UC (center), ACTOR (outer ring)
- Relationships: relation (actor-UC associations)

**Key Features:**
- UC nodes in center circle (radius: 200)
- ACTOR nodes in outer ring (radius: 400)
- System boundary (optional) drawn as rectangle
- Standard UML 2.5 appearance

**Use Case:** Stakeholder communication, requirements elicitation

**Performance:** <1s for <200 nodes

---

### 6. [architecture.json](architecture.json) - Logical Architecture View

**Purpose:** First-level logical function blocks overview

**Layout Algorithm:** Treemap (box containment)

**Shows:**
- Node types: SYS, MOD, UC, FCHAIN, FUNC (top-level only)
- Relationships: compose (implicit via boxes), io (explicit arrows)

**Key Features:**
- Major function blocks rendered as ASCII boxes
- Direct children listed within each block
- Limited depth (default: 2 levels)
- Data flows shown as arrows between blocks
- High-level architecture overview

**Rendering:**
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

**Use Case:** Architecture documentation, stakeholder communication, system overview

**Performance:** <1s for <500 nodes

---

### 7. [spec.json](spec.json) - Specification View

**Purpose:** Complete system specification listing with full element hierarchy

**Layout Algorithm:** Reingold-Tilford (tree layout with multiple occurrences)

**Shows:**
- Node types: ALL (SYS, UC, FCHAIN, FUNC, MOD, ACTOR, REQ, TEST, SCHEMA, FLOW)
- Relationships: compose, satisfy, allocate (all implicit via nesting)

**Key Features:**
- **Multiple occurrences:** Elements appear multiple times when used in different contexts
- **Primary vs Reference:** First occurrence = primary (fully expanded), subsequent = references
- **Links:** Reference occurrences link back to primary definition
- **Bidirectional:** Primaries show "Referenced by: [contexts]"
- **Depth control:** Optional maxDepth parameter (default: unlimited)

**Traversal Strategy:**
1. Start from root SYS nodes (no incoming nesting edges)
2. Breadth-first traversal following all nesting edge types
3. First encounter = primary occurrence (fully expanded)
4. Subsequent encounters = reference with link to primary

**Rendering:**
```
GraphEngine [primary, used in 3 contexts]
├─ Backend Module
│  ├─ ChatAPI [primary]
│  │  └─ Neo4jService [primary]
│  └─ WebSocketServer
│     └─ Neo4jService → [see Backend Module/Neo4jService]
├─ Frontend Module
│  └─ Chat Component
│     └─ ChatAPI → [see Backend Module/ChatAPI]
└─ Shared Types
   └─ Neo4jService → [see Backend Module/Neo4jService]
```

**Use Case:**
- Complete system documentation
- Element usage analysis
- Dependency visualization across contexts
- Specification completeness checking

**Performance:** <3s for <2000 nodes

---

## Configuration Schema

Each view configuration follows this structure:

```json
{
  "id": "view-identifier",
  "name": "Human-readable name",
  "description": "Purpose and scope",
  "version": "1.0.0",
  "layoutConfig": {
    "algorithm": "reingold-tilford | sugiyama | orthogonal | treemap | radial",
    "orientation": "top-down | left-right | center-out",
    "includeNodeTypes": ["SYS", "UC", ...],
    "includeRelTypes": ["compose", "io", ...],
    "nodeSpacing": { ... },
    "algorithmProperties": { ... }
  },
  "renderConfig": {
    "showNodes": ["SYS", "UC", ...],
    "hideNodes": ["FLOW"],
    "showEdges": ["io", "satisfy", ...],
    "hideEdges": ["compose"],
    "edgeRouting": "straight | polyline | orthogonal",
    "defaultZoomLevel": "L2",
    "nodeStyles": { ... },
    "edgeStyles": { ... }
  },
  "useCase": "Description of when to use this view",
  "primaryRelationships": ["List of key relationships shown"],
  "performanceTarget": {
    "maxNodes": 1000,
    "maxComputeTime": "2s"
  }
}
```

---

## Layout vs Render Separation

**Important:** Each view has TWO filter stages:

### Layout Filter (`layoutConfig`)
- Determines which nodes/edges participate in layout computation
- Example: Functional Flow includes FLOW nodes for port extraction

### Render Filter (`renderConfig`)
- Determines which nodes/edges are actually drawn
- Example: Functional Flow hides FLOW nodes (rendered as ports instead)

**Why?** FLOW nodes need to be in layout graph to extract port positions, but are NOT rendered as separate visual elements.

---

## FLOW Node Special Handling

FLOW nodes are **NEVER** rendered as separate visual symbols. Instead:

1. **Layout stage:** FLOW nodes included to determine port connectivity
2. **Port extraction:**
   - `FLOW --io--> FUNC` creates input port on FUNC (left)
   - `FUNC --io--> FLOW` creates output port on FUNC (right)
3. **Render stage:** FLOW nodes hidden, ports shown on FUNC blocks

**Port Properties from FLOW:**
- Label: FLOW.Name
- Tooltip: FLOW.Type | FLOW.Pattern | FLOW.Validation

---

## Usage

### Loading View Configuration

```typescript
import { ViewConfig } from '../shared/types/view.js';
import hierarchyView from './views/hierarchy.json';

const viewFilter = new ViewFilter(hierarchyView);
const layoutGraph = viewFilter.applyLayoutFilter(canvasState);
const renderGraph = viewFilter.applyRenderFilter(layoutGraph);
```

### Switching Views

```typescript
// User command: /view functional-flow
const viewName = 'functional-flow';
const viewConfig = await loadViewConfig(`./docs/specs/views/${viewName}.json`);

// Apply filters
const layoutGraph = viewFilter.applyLayoutFilter(canvasState, viewConfig);

// Run layout algorithm
const positions = await graphEngine.computeLayout(layoutGraph, viewConfig.layoutConfig);

// Apply render filter
const renderGraph = viewFilter.applyRenderFilter(layoutGraph, viewConfig);

// Render to Terminal UI
terminalUI.renderGraph(renderGraph, positions);
```

---

## Implementation Status

| View | Config | Layout Algorithm | Status |
|------|--------|------------------|--------|
| Hierarchy | ✅ | ✅ Reingold-Tilford | **Working** |
| Functional Flow | ✅ | ❌ Orthogonal | Config ready, layout needed |
| Requirements | ✅ | ❌ Sugiyama | Config ready, layout needed |
| Allocation | ✅ | ❌ Treemap | Config ready, layout needed |
| Use Case Diagram | ✅ | ❌ Radial | Config ready, layout needed |
| Architecture | ✅ | ✅ Treemap (box) | **Working** |
| Spec | ✅ | ❌ Reingold-Tilford (enhanced) | Config ready, multi-occurrence logic needed |

---

## Validation

View configurations can be validated against JSON Schema:

```bash
npm run validate:views
```

**Validation checks:**
- All referenced node types exist in Ontology V3
- All referenced edge types valid
- Algorithm parameters within acceptable ranges
- Required fields present
- No unknown properties

---

**End of View Configurations README**
