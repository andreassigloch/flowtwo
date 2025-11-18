# GraphEngine - Functional Requirements Specification

**Version:** 2.0.0 Greenfield
**Author:** andreas@siglochconsulting
**Date:** 2025-11-17
**Status:** Specification (No Implementation)

---

## 1. System Overview

**GraphEngine** is an LLM-driven Systems Engineering platform that enables users to:
- Define complex systems through natural language conversation
- Visualize system structures through 5 specialized views
- Maintain ontology-compliant graph databases (Ontology V3)
- Collaborate in multi-tenant workspaces

**Target Users:** Product Owners, Project Leads, Engineers (software/mechanical), Management (untrained in formal SE methodology)

**Core Principle:** User interacts via natural language → LLM interprets SE intent → Graph structures created/modified automatically → Multiple views visualize different perspectives

---

## 2. Functional Requirements

### FR-1: Natural Language Interface

#### FR-1.1: Terminal UI Chat Interface ✅ IMPLEMENTED
- User MUST be able to type natural language commands/questions in a terminal-based UI
- System MUST stream LLM responses in real-time (token-by-token)
- System MUST support multi-turn conversations with context retention
- System MUST display chat history within session

**Implementation**: 3-Terminal Architecture (macOS Terminal.app windows)
- **Terminal 1 (STDOUT)**: Application logs, LLM usage statistics, debug output
  - Uses `tail -f /tmp/graphengine.log` for real-time log viewing
  - All components write to shared log file with timestamps
- **Terminal 2 (GRAPH)**: ASCII graph visualization with auto-refresh
  - Displays hierarchical tree using compose edges only (per Ontology V3)
  - Polls `/tmp/graphengine-state.json` every 500ms for updates
  - Color-coded node types (SYS, UC, FCHAIN, FUNC, REQ, etc.)
  - Scrollable history (no console.clear on updates)
- **Terminal 3 (CHAT)**: Clean conversation interface
  - Readline-based input/output
  - Shows user messages and LLM text responses only
  - Brief status updates for graph changes (e.g., "✓ Graph updated: 5 nodes")
  - No debug output, no LLM usage stats (redirected to Terminal 1)

**IPC Mechanism**: Shared state file (`/tmp/graphengine-state.json`)
- Chat interface writes graph state after LLM operations
- Graph viewer polls file and reloads on timestamp change
- Simple, debuggable, no FIFO/WebSocket complexity

**Launcher**: `./launch-3terminals.sh`
- Uses osascript to spawn 3 separate Terminal.app windows
- Each terminal runs independent TypeScript process
- Clean separation of concerns for easy evaluation

#### FR-1.2: LLM-Guided System Definition
- LLM MUST guide users through SE methodology (INCOSE/SysML 2.0-inspired)
- LLM MUST ask clarifying questions when requirements are ambiguous
- LLM MUST suggest next logical steps in SE process (requirements → architecture → design → verification)
- LLM MUST recognize current SE phase and adapt guidance

#### FR-1.3: Entity Extraction
- LLM MUST extract SE entities from natural language (systems, use cases, functions, requirements, actors, etc.)
- LLM MUST map entities to Ontology V3 node types automatically
- LLM MUST infer relationships between entities (compose, io, satisfy, verify, allocate)

---

### FR-2: Graph Data Model (Ontology V3)

#### FR-2.1: Node Types
System MUST support 10 node types:

| Type | Abbr | Description | Example |
|------|------|-------------|---------|
| **SYS** | SY | System (top-level or subsystem) | "UrbanMobilityVehicle" |
| **UC** | UC | Use Case | "NavigateUrbanEnvironment" |
| **ACTOR** | AC | External entity interacting with system | "Driver", "Infrastructure" |
| **FCHAIN** | FC | Function Chain (sequence of functions) | "OrderProcessingChain" |
| **FUNC** | FN | Function (specific capability) | "ValidateOrder", "ProcessPayment" |
| **FLOW** | FL | Data Flow Contract (interface definition) | "OrderData", "PaymentInfo" |
| **REQ** | RQ | Requirement | "System must validate all inputs" |
| **TEST** | TS | Test Case / Verification | "ValidateInputFormat_Test" |
| **MOD** | MD | Module (physical/SW component) | "PaymentModule", "SensorHardware" |
| **SCHEMA** | SC | Global data structure definition | "OrderSchema", "VehicleStateSchema" |

#### FR-2.2: Edge Types
System MUST support 6 relationship types:

| Type | Description | Valid Connections | Visual |
|------|-------------|-------------------|--------|
| **compose** | Hierarchical composition | SYS→SYS, SYS→UC, UC→FCHAIN, FCHAIN→FUNC, MOD→FUNC | Implicit (nested boxes) |
| **io** | Input/Output flow | FLOW→FUNC (input), FUNC→FLOW (output), ACTOR→FLOW, FLOW→ACTOR | Solid arrow |
| **satisfy** | Requirement satisfaction | FUNC→REQ, UC→REQ | Dashed arrow «satisfy» |
| **verify** | Test verification | TEST→REQ | Dashed arrow «verify» |
| **allocate** | Function allocation to module | FUNC→MOD | Solid arrow with diamond |
| **relation** | Generic relationship | Any→Any | Gray line |

#### FR-2.3: FLOW Nodes as Port Definitions
- FLOW nodes MUST NOT be rendered as separate visual symbols
- FLOW nodes MUST define ports on FUNC nodes:
  - `FLOW --io--> FUNC` = Input port on FUNC (left side)
  - `FUNC --io--> FLOW` = Output port on FUNC (right side)
- Port labels MUST display FLOW.Name
- Port tooltips MUST show FLOW properties (Type, Pattern, Validation)

#### FR-2.4: Semantic IDs
- Every node MUST have a semantic ID: `{NodeName}.{TypeAbbr}.{Counter}`
- Examples: `ValidateOrder.FN.001`, `PaymentData.FL.005`, `UrbanMobilityVehicle.SY.001`
- Semantic IDs MUST be unique within a workspace
- Semantic IDs MUST be used in all API/WebSocket communication (NOT UUIDs)

---

### FR-3: Multi-Tenancy & Access Control

#### FR-3.1: Workspace Isolation
- System MUST support multiple workspaces (tenant isolation)
- Each workspace MUST have unique `workspaceId`
- Users MUST be assigned to workspaces with roles: owner, admin, editor, viewer
- All data operations MUST filter by `workspaceId`

#### FR-3.2: System Scope
- Each top-level SYS node MUST have unique `systemId` (semantic ID)
- Graph queries MUST use `systemId` as traversal root
- One workspace CAN contain multiple systems
- Canvas state MUST be scoped by `workspaceId + systemId`

#### FR-3.3: Context Propagation
- Every operation MUST carry `workspaceId` + `systemId` context
- Neo4j queries MUST filter by both IDs
- Access violations MUST return 403 Forbidden

---

### FR-4: Canvas State Management

#### FR-4.1: Canvas as Source of Truth
- Canvas MUST own the working graph state during active session
- Canvas MUST maintain in-memory graph representation (nodes, edges, positions, zoom levels)
- Canvas MUST track dirty state (what changed since last save)
- Canvas MUST provide graph state to LLM on every request

#### FR-4.2: Cache Strategy
- Canvas MUST load graph from Neo4j on session start
- Canvas MUST apply all edits to in-memory state (NOT directly to Neo4j)
- Canvas MUST decide when to:
  - Use cache (no fetch)
  - Apply diff (incremental update)
  - Fetch from Neo4j (full reload)
- Canvas MUST persist to Neo4j only on:
  - Explicit save/commit
  - Session end
  - Configurable auto-save interval

#### FR-4.3: Multi-User Synchronization
- Canvas MUST broadcast changes to all connected users in same workspace+system
- Canvas MUST apply operational transform for concurrent edits
- Canvas MUST support max 10 concurrent users per workspace

---

### FR-5: Graph Visualization (5 Views)

#### FR-5.1: View Types
System MUST provide 5 specialized views:

**1. Hierarchy View**
- **Purpose:** System decomposition tree
- **Nodes:** All nodes connected via nesting relationships
- **Edges:** compose (implicit via nesting)
- **Layout:** Reingold-Tilford tree (top-down)
- **Use Case:** Understand system structure and subsystem breakdown

**2. Functional Flow View**
- **Purpose:** Function network with data flows
- **Nodes:** UC (container), FCHAIN (container), FUNC, ACTOR
- **Edges:** io (explicit), compose (implicit via nesting)
- **Ports:** FLOW nodes rendered as ports on FUNC blocks
- **Layout:** Orthogonal routing + nested containment
- **Use Case:** Design functional architecture with I/O contracts

**3. Requirements Traceability View**
- **Purpose:** Requirements flow through system
- **Nodes:** SYS, UC, FUNC, REQ, TEST
- **Edges:** satisfy, verify (both explicit)
- **Layout:** Sugiyama layered (SYS → UC → FUNC → REQ → TEST)
- **Use Case:** Trace requirements to implementation and tests

**4. Allocation View**
- **Purpose:** Physical/software module allocation
- **Nodes:** MOD (container), FUNC
- **Edges:** allocate (explicit), compose (implicit)
- **Layout:** Nested containment (treemap)
- **Use Case:** Map functions to hardware/software modules

**5. Use Case Diagram View**
- **Purpose:** UML-compliant use case visualization
- **Nodes:** UC, ACTOR
- **Edges:** compose (implicit), actor associations
- **Layout:** Radial (UC-centered)
- **Use Case:** Stakeholder communication, requirements elicitation

#### FR-5.2: View Switching
- User MUST be able to switch between views via dropdown/command
- View switch MUST trigger layout recomputation
- View switch MUST preserve zoom level and focus where possible
- View switch MUST complete in <2 seconds for graphs with <1000 nodes

#### FR-5.3: Rendering Rules
- Node rendering MUST follow `rendering_ontology.json` specification
- Each node type MUST have defined:
  - Symbol (rectangle, ellipse, stick-figure, etc.)
  - Stereotype (SysML 2.0-inspired: «system», «function», «requirement», etc.)
  - Zoom levels (L0-L4 with different detail levels)
  - Styling (colors, strokes, fonts)
- FLOW nodes MUST NOT render as separate symbols (only as ports)

---

### FR-6: Layout Algorithms

#### FR-6.1: Reingold-Tilford (Tree Layout)
- MUST support hierarchical tree structures
- MUST align nodes at same hierarchy level on same Y-coordinate
- MUST minimize tree width
- MUST support orientation: top-down, left-right, bottom-up, right-left
- MUST complete in <1 second for trees with <500 nodes

#### FR-6.2: Sugiyama (Layered Layout)
- MUST support directed acyclic graphs (DAGs)
- MUST assign nodes to layers based on longest path
- MUST minimize edge crossings using barycenter heuristic
- MUST support layer constraints (force specific nodes to specific layers)
- MUST complete in <2 seconds for DAGs with <1000 nodes

#### FR-6.3: Orthogonal Layout
- MUST route edges with only 90° angles (Manhattan routing)
- MUST support port-based connectivity
- MUST minimize edge-node overlaps
- MUST support left-to-right or top-to-bottom main flow direction
- MUST complete in <3 seconds for graphs with <500 nodes and <1000 edges

#### FR-6.4: Nested Containment (Treemap)
- MUST pack child nodes within container nodes
- MUST use squarified treemap algorithm
- MUST maintain configurable aspect ratio
- MUST support auto-resizing of containers

---

### FR-7: Format E Serialization

#### FR-7.1: Full Graph Serialization
- System MUST serialize graphs in Format E syntax:
  ```
  ## View-Context
  Type: FunctionalFlow
  Filter: UC,FUNC,ACTOR nodes | compose,io edges

  ## Nodes
  NodeName|Type|SemanticID|Description [x:100,y:200,zoom:L2]

  ## Edges
  SourceID -op-> TargetID
  ```
- Format E MUST achieve >70% token reduction vs JSON
- Semantic IDs MUST be used (NOT UUIDs)

#### FR-7.2: Diff Format (Incremental Updates)
- System MUST support diff operations:
  ```
  <operations>
  <base_snapshot>SystemID@version</base_snapshot>
  <view_context>ViewName</view_context>

  ## Nodes
  + AddedNode|Type|ID|Descr [attrs]
  - RemovedNodeID
  - OldNodeID|Old descr
  + OldNodeID|New descr [updated attrs]

  ## Edges
  + SourceID -op-> TargetID
  - SourceID -op-> TargetID
  </operations>
  ```
- Diff MUST support: add node, remove node, update node, add edge, remove edge
- Diff MUST be validated before application

---

### FR-8: LLM Operations

#### FR-8.1: Auto-Derivation
LLM MUST automatically derive:
- **UC → FUNC**: Use case decomposition into functions
- **REQ → TEST**: Test case generation from requirements
- **FUNC → FLOW**: I/O flow inference from function descriptions
- **FUNC → MOD**: Allocation suggestions based on function type

#### FR-8.2: Validation Advisor
- LLM MUST validate against 12 ontology rules:
  1. `naming`: Node names must be PascalCase, max 25 chars
  2. `isolation`: No isolated nodes (except top-level SYS)
  3. `function_io`: Every FUNC must have ≥1 input AND ≥1 output FLOW
  4. `fchain_connectivity`: All elements in FCHAIN must be connected via io
  5. `functional_flow`: ACTOR→FLOW→FUNC→...→FLOW→ACTOR chain required
  6. `leaf_usecase_actor`: Leaf UC (no child UC) must have ≥1 ACTOR
  7. `requirement_satisfied`: Every REQ must be satisfied by ≥1 FUNC or UC
  8. `requirement_verified`: Every REQ must be verified by ≥1 TEST
  9. `no_circular_compose`: No circular compose relationships
  10. `valid_io_connection`: FLOW Type must match on both sides of connection
  11. `allocated_functions`: Every FUNC should be allocated to ≥1 MOD (warning, not error)
  12. `schema_referenced`: SCHEMA nodes should be referenced by ≥1 FLOW (warning)

- LLM MUST explain violations in natural language
- LLM MUST suggest fixes
- LLM MUST NOT block on warnings (only errors)

#### FR-8.3: Context-Aware Responses
- LLM MUST receive full canvas state in Format E on every request
- LLM MUST reference existing nodes by semantic ID (avoid duplicates)
- LLM MUST maintain conversation history via chatId
- LLM MUST query Neo4j for statistics/historical data when needed

---

### FR-9: Persistence & Audit

#### FR-9.1: Neo4j Storage
- System MUST persist graphs in Neo4j 5.x Community Edition
- Every node MUST have: `uuid`, `workspaceId`, `systemId`, semantic properties
- Every edge MUST have: `uuid`, `type`, `source`, `target`
- Neo4j MUST enforce unique constraints on semantic IDs within workspace

#### FR-9.2: Audit Logging
- System MUST log all operations to AuditLog nodes:
  ```cypher
  CREATE (l:AuditLog {
    chatId: string,
    timestamp: datetime,
    userId: string,
    action: "user-edit" | "llm-operation",
    diff: string,  // Format E Diff
    workspaceId: string,
    systemId: string
  })
  ```
- Audit logs MUST be queryable by chatId, userId, workspaceId, systemId, date range
- Audit logs MUST support undo/redo via diff replay

#### FR-9.3: Chat History Persistence
- System MUST persist chat messages in Neo4j or AgentDB
- Chat history MUST be retrievable by chatId
- Chat history MUST include: timestamp, role (user/assistant), content, operations
- Chat history MUST support conversation export

---

### FR-10: Prompt Caching

#### FR-10.1: Anthropic Native Caching
- System MUST use Anthropic's prompt caching for:
  - Ontology V3 schema (~2000 tokens)
  - SE methodology prompts (~1500 tokens)
  - Canvas state (variable size)
  - Rendering ontology rules (~1000 tokens)
- Cache TTL: 5 minutes (Anthropic default)
- Expected savings: 50-90% token reduction on cached sections

#### FR-10.2: AgentDB Persistent Caching
- System MUST cache in AgentDB:
  - LLM responses (by prompt hash + canvas hash)
  - Canvas state history (per chat session)
  - Ontology snapshots (per workspace)
  - Derivation rules
- Cache TTL: Configurable per cache type (default 30 min for responses, persistent for history)
- Cache invalidation MUST occur on canvas state changes

---

### FR-11: Interactive Features

#### FR-11.1: Expand/Collapse
- User MUST be able to expand/collapse container nodes (SYS, UC, FCHAIN, MOD)
- Expand MUST load children if not already in canvas state
- Collapse MUST hide children but preserve their state
- Expand/collapse MUST preserve mental map (minimal position changes)

#### FR-11.2: Zoom Levels
System MUST support 5 zoom levels per node type:

| Level | Rendering | Content |
|-------|-----------|---------|
| **L0** | Icon only | Type icon, no label |
| **L1** | Compact | Name (max 10 chars) + status badge |
| **L2** | Standard | Stereotype, full name, ports |
| **L3** | Detailed | + Requirements IDs, test status, allocation info |
| **L4** | Expanded | Full internal structure (children visible) |

- Zoom level MUST be configurable per node type in view definition
- Default: L2 for most nodes

#### FR-11.3: Pan & Zoom (Canvas Navigation)
- User MUST be able to pan canvas (drag or arrow keys)
- User MUST be able to zoom in/out (scroll or +/- keys)
- Canvas MUST preserve focus point during zoom
- Canvas MUST show minimap for large graphs (>100 nodes)

---

## 3. Non-Functional Requirements

### NFR-1: Performance

#### NFR-1.1: Layout Computation
- Layout MUST complete in <2 seconds for graphs with <1000 nodes
- Layout MUST be interruptible (user can cancel long-running layouts)
- Layout MUST use incremental algorithms where possible (avoid full recomputation)

#### NFR-1.2: LLM Response Time
- Time to first token MUST be <500ms
- Token streaming MUST maintain <50ms per token
- Canvas update after LLM operations MUST complete in <200ms

#### NFR-1.3: Rendering Performance
- Canvas MUST render at 60fps for <500 visible nodes
- Canvas MUST use virtualization for >500 nodes
- View switch MUST feel instantaneous (<100ms UI update)

### NFR-2: Scalability

#### NFR-2.1: Graph Size Limits
- System MUST support graphs with up to 10,000 nodes per workspace
- System MUST support up to 50,000 edges per workspace
- System MUST degrade gracefully beyond limits (warnings, not failures)

#### NFR-2.2: Concurrent Users
- System MUST support up to 10 concurrent users per workspace
- System MUST support up to 100 concurrent users across all workspaces
- System MUST queue requests beyond limits (not reject)

### NFR-3: Reliability

#### NFR-3.1: Data Persistence
- Canvas MUST auto-save every 5 minutes (configurable)
- Canvas MUST save on session end (even on crash)
- Canvas MUST recover from Neo4j connection loss (retry with exponential backoff)

#### NFR-3.2: Validation
- System MUST validate all Format E before parsing (syntax check)
- System MUST validate all operations before execution (semantic check)
- System MUST rollback invalid operations (no partial state)

### NFR-4: Usability

#### NFR-4.1: Terminal UI Responsiveness
- Terminal UI MUST feel responsive even on slow connections
- Terminal UI MUST show loading indicators for operations >500ms
- Terminal UI MUST support keyboard-only navigation

#### NFR-4.2: Error Messages
- Error messages MUST be shown in natural language (not technical codes)
- Error messages MUST suggest corrective actions
- Error messages MUST be logged with full context (for debugging)

---

## 4. Constraints

### C-1: Technology Stack
- **Runtime:** Bun 1.0+ (or Node.js 20+)
- **Language:** TypeScript 5.0+ (strict mode)
- **Backend:** Fastify (or Hono for edge compatibility)
- **Terminal UI:** Ink (React for CLI)
- **Graph Layouts:** ELK.js + custom algorithms
- **Database:** Neo4j 5.x Community Edition (NOT Enterprise)
- **LLM:** Anthropic SDK (@anthropic-ai/sdk)
- **Agent Memory:** AgentDB via MCP TypeScript client
- **Testing:** Vitest (or Bun test)

### C-2: Dependency Minimization
- System MUST minimize external dependencies
- System MUST use built-in libraries where possible
- System MUST NOT use heavy frameworks (no Electron, no web browser)

### C-3: Ontology Flexibility
- System SHOULD be ontology-agnostic in design
- System MAY support custom ontologies via config file swap (post-MVP)
- System MUST use Ontology V3 for MVP

### C-4: SysML 2.0 Compatibility
- System naming conventions SHOULD follow SysML 2.0 where applicable
- System diagram types SHOULD map to SysML 2.0 diagram types
- System DOES NOT require SysML 2.0 import/export in MVP

---

## 5. Out of Scope (Post-MVP)

- Web browser UI (Terminal UI only for MVP)
- Real-time collaborative editing (multi-user is supported, but no conflict-free replicated data types)
- SysML 2.0 import/export
- Custom ontology support
- Voice input (text only)
- Mobile apps
- Integration with external tools (Jira, Azure DevOps, etc.)
- Code generation from functions
- Simulation & what-if analysis
- Advanced analytics dashboard

---

## 6. Acceptance Criteria

System is considered MVP-complete when:

1. ✅ User can create a complete system via natural language (SYS → UC → FUNC → REQ → TEST)
2. ✅ User can switch between all 5 views and see correct visualization
3. ✅ LLM auto-derives functions from use cases with >80% accuracy
4. ✅ LLM validates against all 12 ontology rules and explains violations
5. ✅ Canvas state persists across sessions (save/load from Neo4j)
6. ✅ Multi-user sync works for 2+ users editing same workspace
7. ✅ Layout computation completes in <2s for 500-node graph
8. ✅ Prompt caching achieves >60% token reduction
9. ✅ All operations are audit-logged with chatId tracing
10. ✅ Zero data loss on crash (auto-save recovers state)

---

**End of Requirements Specification**
