# AiSE Reloaded - System Architecture

**Version**: 2.0.0
**Date**: November 2025
**Author**: andreas@siglochconsulting
**Type**: AI-Guided Systems Engineering Assistant

---

## Executive Summary

AiSE Reloaded ist ein **KI-geführter Systems Engineering Assistent**, der unerfahrene Benutzer durch den kompletten SE-Prozess führt. Die KI moderiert den Dialog, stellt intelligente Fragen, und baut **automatisch im Hintergrund** die Ontologie V3 Struktur auf.

**Kernprinzip**: Der Benutzer **spricht natürlich** mit dem AI-Assistenten über sein System. Die KI extrahiert automatisch Systeme, Use Cases, Funktionen, Requirements und erstellt die Verlinkungen - **ohne dass der Benutzer die Ontologie kennen muss**.

**Architecture Pattern**: Modular Monolith with clear logical module boundaries

---

## 1. Logical Architecture

### 1.1 Architectural Principles

1. **Implementation-Agnostic**: Modules define WHAT and HOW they communicate, not WHERE they run
2. **Single Data Path**: All operations flow through Data Manager
3. **Streaming Execution**: LLM operations execute progressively, not batch
4. **Context-Driven**: Every operation carries workspaceId (access) + systemId (graph root)
5. **Event-Driven Sync**: Data changes propagate via events to all canvases
6. **Database Abstraction**: Only Database Adapter knows about Neo4j

---

### 1.2 Logical Modules Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       PRESENTATION                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Chat Canvas │  │ Text Canvas │  │ Graph Canvas│            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                           │                                     │
│              Commands (with RequestContext)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATA MANAGER                                │
│  Single point for all data operations                           │
│  • Validate context (workspace/system access)                   │
│  • Validate operations (technical + semantic)                   │
│  • Execute via Database Adapter                                 │
│  • Emit events to Sync Coordinator                              │
└───────────┬─────────────────────┬───────────────────────────────┘
            │                     │
            │ Commands            │ Events
            ▼                     ▼
┌───────────────────┐   ┌────────────────────┐
│ DATABASE ADAPTER  │   │ SYNC COORDINATOR   │
│ Standard ↔ Neo4j  │   │ Event Broadcasting │
└─────────┬─────────┘   └──────────┬─────────┘
          │                        │
          ▼                        │ Events (WebSocket)
     ┌────────┐                    │
     │  Neo4j │                    └──────────────────────┐
     └────────┘                                           │
                                                          ▼
                            ┌─────────────────────────────────────┐
                            │     ALL PRESENTATION INSTANCES      │
                            │  • Chat: Show AI response           │
                            │  • Text: Update table rows          │
                            │  • Graph: Update visual graph       │
                            └─────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      AI ASSISTANT                               │
│  Natural Language → Commands (generates, doesn't execute)       │
│  Input: User message + Canvas State + Conversation History      │
│  Output: Streaming text + <operations> blocks                   │
└───────────┬─────────────────────────────────────────────────────┘
            │ Operations (parsed from <operations> blocks)
            ▼
       DATA MANAGER (immediate execution)
```

---

### 1.3 Module: Presentation

**Responsibility**: User interaction via 3 synchronized canvases (Chat, Text, Graph)

**Three Canvases**:
1. **Chat Canvas**: Natural language conversation with AI
   - Streaming text responses
   - User input
   - Conversation history

2. **Text Canvas**: Tabular view of ontology
   - Sortable/filterable table of nodes
   - Inline editing
   - Export capabilities

3. **Graph Canvas**: Visual graph representation
   - Interactive graph visualization (Cytoscape)
   - Drag & drop positioning
   - Zoom, pan, layout controls

**Communication**:
- **Sends Commands to**: Data Manager (create, update, delete operations)
- **Receives Events from**: Sync Coordinator (data change notifications)
- **Protocol**: Commands carry RequestContext, Events trigger UI updates

**Key Principle**: Presentation sends commands but doesn't execute them. Updates come via events.

---

### 1.4 Module: Data Manager

**Responsibility**: Single point for ALL data operations (CRUD). Orchestrates validation, execution, and event emission.

**Operations**:
```typescript
interface DataManager {
  // Execute command (create, update, delete, query)
  execute(command: Command, context: RequestContext): Promise<Result>;

  // Batch operations (transactional)
  batch(commands: Command[], context: RequestContext): Promise<Result[]>;

  // Query operations
  query(query: Query, context: RequestContext): Promise<OntologyNode[] | OntologyRelationship[]>;
}

interface Command {
  context: RequestContext;
  action: 'create' | 'update' | 'delete' | 'read' | 'traverse';
  entity: 'node' | 'relationship';
  data: any;  // Standard format (not Neo4j specific)
}
```

**Execution Flow**:
```
Command received
   ↓
1. Validate Context (workspace/system access)
   ↓
2. Technical Validation (syntax, references)
   ↓
3. Execute via Database Adapter
   ↓
4. Semantic Validation (ontology rules - non-blocking)
   ↓
5. Emit Event to Sync Coordinator
   ↓
Return Result
```

**Two Validation Types**:

1. **Technical Validation** (blocking):
   - Malformed syntax
   - Invalid UUIDs/references
   - Type errors
   - **Action**: Reject operation, LLM must revise

2. **Semantic Validation** (non-blocking):
   - Ontology V3 rule violations
   - Isolated nodes
   - Incomplete architecture
   - **Action**: Separate validation report to user

**Communication**:
- **Receives from**: Presentation, AI Assistant
- **Sends to**: Database Adapter (persistence), Sync Coordinator (events)
- **Protocol**: Async with transaction support

---

### 1.5 Module: Database Adapter

**Responsibility**: Translation layer between standard format and Neo4j. ONLY module that knows about database specifics.

**Operations**:
```typescript
interface DatabaseAdapter {
  // Execute command (translate standard format → Cypher)
  execute(command: Command): Promise<Result>;

  // Query (translate standard query → Cypher)
  query(query: Query): Promise<OntologyNode[] | OntologyRelationship[]>;

  // Batch transaction
  batch(commands: Command[]): Promise<Result[]>;
}
```

**Translation Examples**:

**Standard Format → Neo4j Cypher**:
```typescript
// Input (Standard)
{
  action: 'create',
  entity: 'node',
  data: {
    type: 'FUNC',
    name: 'ValidateOrder',
    workspaceId: 'ws-1',
    systemId: 'sys-1'
  }
}

// Output (Cypher)
CREATE (n:OntologyNode:FUNC {
  uuid: $uuid,
  Name: $name,
  workspaceId: $workspaceId,
  systemId: $systemId,
  CreatedAt: timestamp()
})
```

**Cypher → Standard Format**:
```typescript
// Query Result (Neo4j)
{
  uuid: '550e8400...',
  Name: 'ValidateOrder',
  workspaceId: 'ws-1',
  systemId: 'sys-1'
}

// Translated (Standard)
{
  uuid: '550e8400...',
  type: 'FUNC',
  name: 'ValidateOrder',
  workspaceId: 'ws-1',
  systemId: 'sys-1'
}
```

**Key Principles**:
- Database Adapter is the ONLY module talking to Neo4j
- All context filters (WHERE clauses) added here
- All property translations (name→Name, description→Descr) handled here
- Database-agnostic standard format used everywhere else

---

### 1.6 Module: Sync Coordinator

**Responsibility**: Real-time event distribution to all users in workspace

**Operations**:
```typescript
interface SyncCoordinator {
  // Subscribe to events for workspace
  subscribe(workspaceId: UUID, callback: (event: Event) => void): Subscription;

  // Publish event to all subscribers
  publish(event: Event): void;

  // Get online users
  getPresence(workspaceId: UUID): User[];
}

interface Event {
  type: 'node-created' | 'node-updated' | 'node-deleted' |
        'relationship-created' | 'relationship-updated' | 'relationship-deleted';
  context: RequestContext;
  data: OntologyNode | OntologyRelationship;
  timestamp: number;
}
```

**Event Flow**:
```
Data Manager completes operation
   ↓
Emits Event
   ↓
Sync Coordinator receives Event
   ↓
Broadcast to all WebSocket connections in workspace
   ↓
All Presentation instances receive Event
   ↓
Update Chat/Text/Graph Canvases
```

**Communication**:
- **Receives from**: Data Manager (events)
- **Sends to**: All Presentation instances in workspace (WebSocket)
- **Protocol**: Publish/Subscribe via WebSocket

---

### 1.7 Module: AI Assistant

**Responsibility**: Natural language processing - converts user messages to commands. Streams responses with progressive execution.

**Critical Context**: Canvas State (current Graph + Text) is ALWAYS provided as LLM input context.

**Streaming Execution Model**:
```
User Message + Canvas State + Conversation History
   ↓
LLM Streaming Response:
   │
   ├─ Text chunk: "I'll create the system first..."
   │     ↓
   │  IMMEDIATE broadcast to Chat Canvas
   │
   ├─ <operations> Block #1 detected
   │     <operations>
   │       SYS:Payment System:Handles payment processing
   │     </operations>
   │     ↓
   │  Parse → Technical Validation → IMMEDIATE Execution
   │     ↓
   │  Events → Text/Graph Canvas update (SYS node appears)
   │
   ├─ Text chunk: "Now adding actors..."
   │     ↓
   │  IMMEDIATE broadcast to Chat Canvas
   │
   ├─ <operations> Block #2 detected
   │     <operations>
   │       ACTOR:Customer:Person making payment
   │       ACTOR:Payment Gateway:Processes transactions
   │     </operations>
   │     ↓
   │  Parse → Technical Validation → IMMEDIATE Execution
   │     (Block #2 can reference SYS created in Block #1)
   │     ↓
   │  Events → Text/Graph Canvas update (2 ACTOR nodes appear)
   │
   └─ Stream continues...

KEY PRINCIPLES:
• Each <operations> block executes IMMEDIATELY upon detection
• NO buffering until end-of-stream
• User sees progressive results as LLM produces them
• Text streaming parallel to operation execution
• Cross-block references allowed (can reference nodes from previous blocks OR canvas state)
```

**Operations**:
```typescript
interface AIAssistant {
  // Stream response with progressive execution
  streamResponse(
    message: string,
    context: RequestContext,
    canvasState: CanvasState,  // CRITICAL: current graph/text content
    history: Message[]
  ): AsyncIterable<Chunk>;
}

type Chunk = TextChunk | OperationsBlock;

interface TextChunk {
  type: 'text';
  content: string;  // Word or phrase
}

interface OperationsBlock {
  type: 'operations';
  commands: Command[];  // Parsed from <operations> block
}
```

**Communication**:
- **Receives from**: Presentation (user messages + canvas state)
- **Sends to**:
  - Presentation (text chunks via WebSocket)
  - Data Manager (parsed commands from <operations> blocks)
- **Protocol**: Async streaming with immediate execution per block

**Canvas State as Context**:
The current state of Text Canvas and Graph Canvas is serialized and sent to LLM as context. This allows LLM operations to:
- Reference existing nodes by name or UUID
- Reference nodes created in previous operation blocks (same stream)
- Be self-contained (create all referenced entities)

---

### 1.8 Context Model

**RequestContext** - Carried by every command and event:
```typescript
interface RequestContext {
  userId: UUID;        // Who is acting
  workspaceId: UUID;   // Access control boundary
  systemId: UUID;      // Graph root (top SYS node)
  taskId: UUID;        // Operation tracking (undo/audit)
  timestamp: number;   // When
}
```

**Critical Distinction**:
- **workspaceId**: Access control - "Can this user access this data?"
- **systemId**: Graph root - "Which SYS graph are we querying?"

Both are REQUIRED and serve different purposes.

---

## 2. Communication Flows

### 2.1 Flow: User Creates Nodes via Chat (Streaming)

**Scenario**: User types "Add a payment system with customer and payment gateway actors"

```
1. USER ACTION
   User types message in Chat Canvas
   │
   ▼
2. PRESENTATION
   Sends: message + context + canvas state
   │
   ▼
3. AI ASSISTANT - STREAMING RESPONSE

   Stream Chunk 1: "I'll create the system first..."
   → IMMEDIATE broadcast to Chat Canvas

   <operations>
     SYS:Payment System:Handles payment processing
   </operations>
   → IMMEDIATE parse & execute
   │
   ▼
4. DATA MANAGER (Block #1)
   ├─ Technical Validation (syntax, references)
   ├─ Execute (create SYS node via Database Adapter)
   └─ Emit event
   │
   ▼
5. SYNC COORDINATOR
   Broadcasts event to all workspace users
   │
   ▼
6. ALL PRESENTATION INSTANCES
   Chat Canvas: Shows "I'll create..."
   Text Canvas: New row appears (SYS)
   Graph Canvas: SYS node appears
   │
   [LLM continues streaming...]
   │
3. AI ASSISTANT (continued)

   Stream Chunk 2: "Now adding the actors..."
   → IMMEDIATE broadcast to Chat Canvas

   <operations>
     ACTOR:Customer:Person making payment
     ACTOR:Payment Gateway:Processes transactions
   </operations>
   → IMMEDIATE parse & execute
   │
   ▼
4. DATA MANAGER (Block #2)
   ├─ Technical Validation (can reference SYS from Block #1)
   ├─ Execute (create 2 ACTOR nodes)
   └─ Emit event
   │
   ▼
5. SYNC COORDINATOR
   Broadcasts event
   │
   ▼
6. ALL PRESENTATION INSTANCES
   Chat Canvas: Shows "Now adding actors..."
   Text Canvas: 2 new rows appear (ACTORs)
   Graph Canvas: 2 ACTOR nodes appear
```

**Key Observations**:
- **Progressive execution**: Each `<operations>` block executes IMMEDIATELY
- **No buffering**: User sees results as LLM produces them
- **Parallel streams**: Text streaming + operation execution happen concurrently
- **Cross-block references**: Block #2 can reference SYS created in Block #1
- **Technical validation per block**: Each block independently validated

---

### 2.2 Flow: User Edits Node via Graph Canvas

**Scenario**: User drags node to new position

```
1. USER ACTION
   User drags node in Graph Canvas
   │
   ▼
2. PRESENTATION (Graph Canvas)
   ├─ Optimistic UI update (move node immediately)
   ├─ Generate command: update position
   └─ Send to Data Manager
   │
   ▼
3. DATA MANAGER
   ├─ Validate context (workspace/system access)
   ├─ NO ontology validation (position is UI state)
   ├─ Execute via Database Adapter
   └─ Emit event
   │
   ▼
4. SYNC COORDINATOR
   Broadcasts event
   │
   ▼
5. ALL OTHER PRESENTATION INSTANCES
   Graph Canvas updates node position
```

**Key Observations**:
- Optimistic update for immediate feedback
- Same data path as LLM operations
- Other users see update in real-time

---

## 3. Ontology V3 Schema

### 3.1 Node Types (10)

- **SYS** - System/Container
- **ACTOR** - External entity interacting with system
- **UC** - Use Case
- **FCHAIN** - Functional Chain
- **FUNC** - Function
- **FLOW** - Data/Energy/Material Flow
- **REQ** - Requirement
- **TEST** - Test Case
- **MOD** - Module/Component
- **SCHEMA** - Data Schema

### 3.2 Relationship Types (6)

- **compose** - Hierarchical composition (SYS→UC, UC→FUNC)
- **io** - Input/Output (FUNC→FLOW)
- **participate** - Actor participation (ACTOR→UC)
- **satisfy** - Requirement satisfaction (FUNC→REQ)
- **verify** - Test verification (TEST→REQ)
- **allocate** - Module allocation (MOD→FUNC)
- **relation** - Generic relationship

### 3.3 Validation Rules (12)

```
R1:  SYS must have at least 1 ACTOR
R2:  UC must have at least 1 incoming compose from SYS/UC
R3:  FUNC must have at least 1 incoming compose from UC/FCHAIN/FUNC
R4:  FUNC must have at least 1 input FLOW (io relationship)
R5:  FUNC must have at least 1 output FLOW (io relationship)
R6:  FLOW must be connected to at least 2 FUNCs (or 1 FUNC + 1 ACTOR)
R7:  REQ must have at least 1 satisfy relationship to FUNC/UC
R8:  TEST must have at least 1 verify relationship to REQ
R9:  MOD must have at least 1 allocate relationship to FUNC
R10: SCHEMA must be referenced by at least 1 FLOW
R11: No circular compose relationships
R12: Node names must be unique within workspace
```

### 3.4 Node Properties

```typescript
interface OntologyNode {
  uuid: UUID;              // Unique identifier
  type: NodeType;          // SYS, ACTOR, UC, etc.
  name: string;            // Display name
  description: string;     // Detailed description
  workspaceId: UUID;       // Access control
  systemId: UUID;          // Graph root
  createdBy: UUID;         // Audit: creator
  createdAt: number;       // Audit: timestamp
  modifiedBy: UUID;        // Audit: last modifier
  modifiedAt: number;      // Audit: last modification
  taskId: UUID;            // Operation tracking
}
```

---

## 4. Technology Stack

**Frontend**:
- React 18 with TypeScript
- Zustand (state management)
- Cytoscape.js (graph visualization)
- WebSocket (real-time updates)

**UI Framework Requirements**:
- **Design Tokens** (CSS custom properties):
  - Color palette (primary, secondary, success, warning, error, info)
  - Spacing scale (8px base: xs/sm/md/lg/xl/2xl)
  - Typography scale (font sizes, weights, families)
  - Borders, shadows, transitions, z-index scale
- **Semantic Element Naming**: `[context]-[element-type]-[action/state]`
  - Example: `test-run-button-execute`, `system-selector-dropdown`
  - All elements must have matching `data-testid` attribute
- **ARIA Accessibility**:
  - All interactive elements: `aria-label`, `aria-describedby`
  - Focus management: `:focus-visible` styling
  - Loading states: `aria-busy`, disabled states: `aria-disabled`
  - Screen reader text: `.sr-only` class
- **Reusable Components**:
  - Buttons (primary, secondary, icon variants)
  - Form controls (input, select, textarea with focus states)
  - Cards (header, body, footer)
  - Status badges (success, error, warning, info)
  - Loading spinner
- **Layout Utilities**:
  - Flexbox (flex, flex-col, items-center, justify-between, gap-*)
  - Grid (grid-cols-1/2/3/4)
  - Spacing (p-*/m-* for padding/margin)
- **Optional Base**: Pico.css (10KB CDN) with AiSE custom overrides (3KB)

**Backend**:
- Node.js with Express
- TypeScript
- WebSocket Server (ws library)
- Anthropic Claude API (LLM)

**Database**:
- Neo4j 5.14 (graph database)
- Cypher query language

**Testing**:
- Jest (unit tests)
- Playwright (E2E tests)

---

## 5. Deployment Architecture

### 5.1 Development (Modular Monolith)

```
┌─────────────────────────────────────┐
│   Single Process (Node.js)          │
│   ├─ Express HTTP Server            │
│   ├─ WebSocket Server                │
│   ├─ Data Manager                    │
│   ├─ Database Adapter                │
│   ├─ Sync Coordinator                │
│   └─ AI Assistant                    │
└─────────────────┬───────────────────┘
                  │
                  ▼
          ┌──────────────┐
          │   Neo4j DB   │
          └──────────────┘
```

### 5.2 Production (Optional Separation)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│   Backend    │────▶│   Neo4j DB   │
│  (Static)    │     │  (Node.js)   │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Redis Cache  │
                     │ (Optional)   │
                     └──────────────┘
```

---

## 6. Security & Access Control

**Authentication**:
- User authentication via JWT tokens
- userId carried in RequestContext

**Authorization**:
- workspaceId defines access boundary
- All Neo4j queries filtered by workspaceId
- Context Manager validates access before operations

**Audit Trail**:
- All operations tagged with taskId
- createdBy, modifiedBy tracked on all nodes
- Operation history reconstructable via taskId

---

## 7. Contracts & Interfaces

Detailed TypeScript interfaces for all module contracts:
- [docs/contracts/MODULE_CONTRACTS.md](contracts/MODULE_CONTRACTS.md)

**Key Contracts**:
1. RequestContext - Context model for all operations
2. Command - Standard operation format
3. Event - Standard event format
4. CanvasState - Serialized canvas state for LLM context
5. OntologyNode/OntologyRelationship - Standard data formats

---

## 8. Implementation Notes

### 8.1 Immediate Execution Model

**Parse-on-Detection**:
```typescript
async function processLLMStream(stream: AsyncIterable<string>) {
  let textBuffer = '';

  for await (const chunk of stream) {
    textBuffer += chunk;

    // Check for complete <operations> block
    if (textBuffer.includes('</operations>')) {
      const block = extractOperationsBlock(textBuffer);

      // IMMEDIATE execution (don't wait for stream end)
      await executeOperationsBlock(block);

      // Remove processed block from buffer
      textBuffer = removeProcessedBlock(textBuffer);
    }

    // Broadcast text chunk to Chat Canvas
    broadcastTextChunk(chunk);
  }
}
```

**Cross-Block References**:
- Block #2 can reference nodes created in Block #1 by name or UUID
- Database Adapter resolves references during translation
- Canvas state updated after each block, available for next block

### 8.2 Error Handling

**Technical Validation Failure**:
```
<operations> block fails validation
   ↓
Reject block, return error to LLM
   ↓
LLM revises and resubmits
   ↓
Retry execution
```

**Semantic Validation**:
```
Operation executes successfully
   ↓
Semantic validation runs (non-blocking)
   ↓
If violations found:
   Generate validation report
   Show to user (separate UI)
   User can fix later
```

---

## 9. Performance Targets

- LLM response latency: <500ms to first token
- Operation execution: <100ms per command
- Event broadcast: <50ms to all clients
- Graph query: <200ms for typical queries (10-100 nodes)

---

## Glossary

- **Canvas**: One of 3 synchronized views (Chat, Text, Graph)
- **Command**: Standard format operation (create, update, delete, query)
- **Context**: RequestContext with workspace/system/user/task info
- **Event**: Notification of data change
- **Ontology**: Structured representation of system (nodes + relationships)
- **Streaming Execution**: Progressive execution of LLM operations as they're generated
- **Technical Validation**: Syntax/reference validation (blocking)
- **Semantic Validation**: Business rule validation (non-blocking)
- **workspaceId**: Access control boundary
- **systemId**: Graph root (top SYS node)
