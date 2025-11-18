# GraphEngine - System Architecture

**Version:** 2.0.0 Greenfield
**Author:** andreas@siglochconsulting
**Date:** 2025-11-17 (Updated: 2025-11-18)
**Status:** Design Specification + Partial Implementation

**Implementation Status**:
- ✅ Terminal UI (4-terminal architecture with WebSocket)
- ✅ Canvas State Manager (Graph Canvas + Chat Canvas)
- ✅ Format E Parser (Diff protocol)
- ✅ LLM Engine (Anthropic integration with caching + streaming)
- ✅ Neo4j Client (persistence layer)
- ✅ WebSocket Server (real-time terminal synchronization)
- ⏳ Graph Engine (layout algorithms - in progress)

**Open Issues**:
- 🔧 **Terminal sync format**: Currently uses JSON serialized state, should use Format E for consistency (see section 4.2.3)
- 🔧 **ASCII graph viewer**: Functional-flow view not implemented (requires graphical rendering)

---

## 1. Architectural Overview

### 1.1 System Philosophy

**Canvas-Centric Architecture**: The Canvas component is the central state manager and source of truth during active sessions. All other components orbit around Canvas:

- **Terminal UI** renders Canvas state (BOTH graph AND chat)
- **LLM Engine** reads from and writes to Canvas
- **Neo4j** serves as long-term persistence (not real-time state)
- **Graph Engine** computes layouts from Canvas state

**Key Insight**: "Canvas" is a generic concept - there are TWO canvas types:
1. **Graph Canvas** - Manages graph state (nodes, edges, positions)
2. **Chat Canvas** - Manages conversation state (messages, LLM responses)

Both use the same Canvas State Manager pattern with Format E Diff as the universal change protocol.

### 1.2 Design Principles

1. **Separation of Concerns**: Each component has one clear responsibility
2. **Stateless Services**: Graph Engine and LLM Engine are stateless (Canvas holds state)
3. **Event-Driven**: Components communicate via messages/events (WebSocket, REST)
4. **Standalone Capable**: Components can be used independently (e.g., Graph Engine as library)
5. **Test-Driven**: Architecture designed for 70/20/10 test pyramid
6. **Universal Diff Protocol**: ALL changes (user edits, LLM operations, manual graph edits) use Format E Diff format

---

## 2. Logical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TERMINAL UI (TUI)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Chat Input   │  │ Graph Canvas │  │ View Selector│         │
│  │ (Textual)    │  │ (Rich)       │  │ (Dropdown)   │         │
│  └──────┬───────┘  └──────▲───────┘  └──────────────┘         │
└─────────┼──────────────────┼──────────────────────────────────┘
          │                  │
    User Input          Rendered Graph
    (Format E Diff)     (Positions + Metadata)
          │                  │
          ▼                  │
┌─────────────────────────────────────────────────────────────────┐
│                    ★ CANVAS (State Manager) ★                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ OWNS:                                                    │  │
│  │ • Current graph state (nodes, edges, positions)          │  │
│  │ • Dirty tracking (what changed since last save)          │  │
│  │ • View filters (5 view configurations)                   │  │
│  │ • User session state (current view, zoom, focus)         │  │
│  │                                                           │  │
│  │ RESPONSIBILITIES:                                        │  │
│  │ 1. Decide: Cache / Diff / Neo4j Fetch                    │  │
│  │ 2. Apply user edits (Format E Diff)                      │  │
│  │ 3. Apply LLM operations (Format E Diff)                  │  │
│  │ 4. Broadcast changes to all connected users              │  │
│  │ 5. Persist dirty nodes to Neo4j (on save/commit)         │  │
│  │ 6. Provide canvas state to LLM (Format E serialization)  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  WebSocket Server: Broadcasts canvas updates to Terminal UI    │
└────┬────────────────────┬───────────────┬──────────────────┬───┘
     │                    │               │                  │
     │ User Edit Diff     │ LLM Ops Diff  │ Persist         │ Serialize
     │                    │               │                  │ Canvas State
     ▼                    ▼               ▼                  ▼
┌──────────┐    ┌──────────────────┐    ┌──────────────────────────┐
│ Terminal │    │   LLM ENGINE     │    │   NEO4J DATABASE         │
│   UI     │    │   (AgentDB)      │    │   (Long-term Storage)    │
│          │    │                  │    │                          │
│ Sends:   │    │ Receives:        │───▶│ Queries:                 │
│ - Edits  │    │ - Canvas State   │◀───│ - Stats (node counts)    │
│ - Cmds   │    │   (Format E)     │    │ - Historical versions    │
│          │    │ - Chat History   │    │ - Cross-workspace data   │
│          │    │                  │    │                          │
│          │    │ Outputs:         │    │ Stores:                  │
│          │    │ - Text Response  │    │ - workspaceId/systemId   │
│          │    │ - Format E Diff  │    │ - chatId (audit trail)   │
│          │    │   Operations     │    │ - Semantic IDs + UUIDs   │
│          │    │                  │    │ - AuditLog nodes         │
│          │    │                  │    │                          │
│          │    │ Caching:         │    │ Chat History:            │
│          │    │ - AgentDB        │    │ - Messages per chatId    │
│          │    │ - Anthropic API  │    │ - Multi-turn context     │
└──────────┘    └──────────────────┘    └──────────────────────────┘
                          │
                          │ Optional: Query Neo4j
                          │ (for stats/history, not current graph)
                          └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              GRAPH ENGINE (Stateless Service)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Input: Canvas State (Format E) + View Config             │  │
│  │                                                           │  │
│  │ Processing:                                              │  │
│  │ 1. Apply view filter (layout vs render nodes)            │  │
│  │ 2. Extract ports from FLOW nodes                         │  │
│  │ 3. Run layout algorithm (Reingold-Tilford, Sugiyama...)  │  │
│  │ 4. Compute port positions                                │  │
│  │ 5. Route edges (orthogonal, polyline, direct)            │  │
│  │                                                           │  │
│  │ Output: Positions + Port Positions + Edge Routes         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  REST API: POST /api/layout/compute, GET /api/views/{id}       │
│  Standalone-Capable: Yes (can be used as library)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Dual Canvas Architecture (Graph + Chat)

### 3.1 The Canvas Pattern

**Pattern Definition**: Canvas is a state manager that owns working data, tracks changes, and decides persistence strategy.

**Shared Responsibilities** (applies to BOTH canvas types):
1. **State Ownership**: Canvas owns the in-memory state (not Neo4j during active session)
2. **Dirty Tracking**: Canvas tracks what changed since last save
3. **Diff Application**: Canvas applies Format E Diff operations
4. **Broadcasting**: Canvas broadcasts changes to connected users (WebSocket)
5. **Persistence Decision**: Canvas decides when to save to Neo4j (cache/diff/fetch strategy)
6. **Context Provision**: Canvas provides state to LLM in Format E

### 3.2 Graph Canvas (Primary Focus)

**Purpose**: Manages ontology graph state (SYS, UC, FUNC, REQ, etc.)

**State Structure**:
```typescript
interface GraphCanvasState {
    workspaceId: string;
    systemId: string;  // Root SYS node semantic ID
    currentView: 'hierarchy' | 'functional-flow' | 'requirements' | 'allocation' | 'use-case';

    // Graph data
    nodes: Map<string, Node>;  // key = semantic ID
    edges: Map<string, Edge>;
    positions: Map<string, Position>;  // Layout positions

    // Dirty tracking
    dirtyNodes: Set<string>;
    dirtyEdges: Set<string>;
}
```

**Operations Accepted**:
- User edits via Terminal UI (manual node/edge creation/deletion)
- LLM-generated operations (from natural language)
- Graph manipulation commands (copy/paste, bulk operations)

**All operations use Format E Diff**:
```
<operations>
<base_snapshot>UrbanMobilityVehicle.SY.001@v42</base_snapshot>
<view_context>FunctionalFlow</view_context>

## Nodes
+ NewNode|FUNC|NewNode.FN.002|Description [x:100,y:200]
- OldNode.FN.003

## Edges
+ Parent.SY.001 -cp-> NewNode.FN.002
</operations>
```

### 3.3 Chat Canvas (Secondary Canvas)

**Purpose**: Manages conversation state (messages between user and LLM)

**State Structure**:
```typescript
interface ChatCanvasState {
    chatId: string;
    workspaceId: string;
    systemId: string;  // Which graph this chat is about

    // Chat data
    messages: Message[];  // Chronological message list

    // Dirty tracking
    dirtyMessages: Set<string>;  // Message IDs not yet persisted
}
```

**Message Structure**:
```typescript
interface Message {
    messageId: string;
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    operations?: string;  // Format E Diff (if assistant message contains ops)
    timestamp: Date;
}
```

**Operations Accepted**:
- User messages (typed in chat input)
- LLM responses (streamed tokens + operations)

**Chat Canvas ALSO uses Format E Diff** (for consistency):
```
<operations>
<base_snapshot>chat-550e8400@msgCount:15</base_snapshot>

## Messages
+ user|2025-11-17T10:30:00Z|Add payment processing function
+ assistant|2025-11-17T10:30:05Z|I'll add a payment function...|<operations>+ ProcessPayment|FUNC|...</operations>
</operations>
```

**Why Format E for chat?**
- Consistent protocol across entire system
- Enables chat history diffs (undo/redo in conversation)
- Token-efficient storage in AgentDB
- Same parsing/validation infrastructure

### 3.4 User Interaction Modes

#### Mode 1: Natural Language (Chat Canvas → Graph Canvas)

```
User types in Chat Canvas:
  "Add a payment processing function"
      ↓
Chat Canvas creates message diff:
  <operations>
  + user|timestamp|Add payment processing function
  </operations>
      ↓
Chat Canvas forwards to LLM (with Graph Canvas state)
      ↓
LLM generates response WITH operations:
  "I'll add a payment function<operations>+ ProcessPayment|FUNC|...</operations>"
      ↓
Chat Canvas stores message diff:
  <operations>
  + assistant|timestamp|I'll add...|<operations>...</operations>
  </operations>
      ↓
Chat Canvas extracts graph operations and sends to Graph Canvas:
  <operations>+ ProcessPayment|FUNC|...</operations>
      ↓
Graph Canvas applies diff, broadcasts to Terminal UI
```

#### Mode 2: Direct Graph Edit (Terminal UI → Graph Canvas)

**Future Feature** (not in Terminal UI MVP, but architecture supports it):

```
User clicks "Add Node" button in graph editor
      ↓
Terminal UI generates diff:
  <operations>
  + ManualNode|FUNC|ManualNode.FN.099|Manually created [x:mouse_x,y:mouse_y]
  </operations>
      ↓
Graph Canvas applies diff
      ↓
Graph Canvas broadcasts to all users (including Chat Canvas for audit)
      ↓
Chat Canvas OPTIONALLY logs:
  <operations>
  + system|timestamp|User added ManualNode via graph editor
  </operations>
```

**Key Point**: Whether user types in chat OR directly edits graph, the protocol is the same (Format E Diff).

### 3.5 Universal Diff Protocol

**ALL changes in the system use Format E Diff format**:

| Source | Destination | Diff Content |
|--------|-------------|--------------|
| User (chat input) | Chat Canvas | Message addition |
| LLM | Chat Canvas | Message addition (with embedded graph ops) |
| LLM | Graph Canvas | Graph operations (extracted from message) |
| User (graph edit) | Graph Canvas | Node/edge changes |
| Graph Canvas | Neo4j | Dirty nodes/edges |
| Chat Canvas | Neo4j | Dirty messages |
| Canvas (any) | Terminal UI | Broadcast updates |
| Canvas (any) | AgentDB | State snapshots |

**Benefits**:
1. **Single Parser**: One Format E parser handles all diffs
2. **Single Validator**: One validation engine for all operations
3. **Unified Audit Log**: All changes logged in same format
4. **Undo/Redo**: Works across graph AND chat (replay diffs)
5. **Token Efficiency**: 74% reduction applies to ALL state transfers

---

## 4. Component Specifications

### 4.1 Canvas State Manager (Dual Instance)

**Deployment**: TWO Canvas instances per session:
```typescript
// Single session has TWO canvases
interface Session {
    graphCanvas: GraphCanvasState;
    chatCanvas: ChatCanvasState;
}

const session = createSession(workspaceId, systemId, chatId);
```

**Shared Implementation** (base class):
```typescript
abstract class CanvasBase {
    protected parser: FormatEParser;
    protected validator: FormatEValidator;
    protected neo4jClient: Neo4jClient;
    protected dirty: Set<string>;

    async applyDiff(diff: FormatEDiff): Promise<DiffResult> {
        // Parse and apply Format E diff
        const operations = this.parser.parseDiff(diff);

        // Validate
        if (!this.validator.isValid(operations)) {
            throw new ValidationError('...');
        }

        // Apply
        for (const op of operations) {
            this.applyOperation(op);
        }

        // Mark dirty
        this.markDirty(operations.affectedIds);

        // Broadcast
        this.broadcastUpdate(diff, { source: '...' });

        return { success: true };
    }

    async persistToNeo4j(force: boolean = false): Promise<PersistResult> {
        // Save dirty state to Neo4j
        if (!force && this.dirty.size === 0) {
            return { skipped: true };
        }

        // Get dirty items
        const dirtyItems = this.getDirtyItems();

        // Persist
        await this.neo4jClient.saveBatch(dirtyItems);

        // Create audit log
        await this.neo4jClient.createAuditLog({
            chatId: this.chatId,
            diff: this.serializeDirtyAsDiff(),
            action: 'persist'
        });

        // Clear dirty tracking
        this.dirty.clear();

        return { success: true, savedCount: dirtyItems.length };
    }

    protected abstract applyOperation(op: Operation): void;
}
```

**Graph Canvas Specialization**:
```typescript
class GraphCanvas extends CanvasBase {
    private nodes: Map<string, Node>;
    private edges: Map<string, Edge>;

    protected applyOperation(op: Operation): void {
        switch (op.type) {
            case 'add_node':
                this.nodes.set(op.semanticId, op.node);
                break;
            case 'remove_node':
                this.nodes.delete(op.semanticId);
                break;
            // ... edges, updates
        }
    }
}
```

**Chat Canvas Specialization**:
```typescript
class ChatCanvas extends CanvasBase {
    private messages: Message[];
    private graphCanvas: GraphCanvas;

    protected applyOperation(op: Operation): void {
        if (op.type === 'add_message') {
            this.messages.push(op.message);

            // If message contains graph operations, forward to Graph Canvas
            if (op.message.operations) {
                this.graphCanvas.applyDiff(op.message.operations);
            }
        }
    }
}
```

### 4.2 Terminal UI - 4-Terminal Architecture ✅ IMPLEMENTED

**Implementation**: 4 separate Terminal.app windows (macOS native)

**Layout**:
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Terminal 0:      │  │ Terminal 1:      │  │ Terminal 2:      │  │ Terminal 3:      │
│ WEBSOCKET        │  │ STDOUT           │  │ GRAPH            │  │ CHAT             │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ [WS] Server      │  │ [10:30:00] 🚀    │  │ ╔══════════════╗│  │ ╔══════════════╗│
│   listening on   │  │   Chat started   │  │ ║ GRAPH VIEWER ║│  │ ║ CHAT INTER..║│
│   port 3001      │  │ [10:30:02] ✅    │  │ ╚══════════════╝│  │ ╚══════════════╝│
│                  │  │   WS connected   │  │                  │  │                  │
│ [WS] Client      │  │ [10:30:05] 📨    │  │ ────────────────│  │ Commands: /help, │
│   subscribed:    │  │   User: Add...   │  │ Graph Update:    │  │  /save, /stats   │
│   workspace=demo │  │ [10:30:08] 📊    │  │ View: hierarchy  │  │                  │
│   system=UM.001  │  │   LLM Usage:     │  │ Nodes: 5 | E: 4  │  │ You: Add payment │
│                  │  │   Input: 150 tok │  │ ────────────────│  │                  │
│ [WS] Broadcast   │  │   Output: 85 tok │  │                  │  │ 🤖 Processing... │
│   graph_update   │  │   Cache: 97%     │  │ └─[SYS] Test...  │  │                  │
│   to 2 clients   │  │ [10:30:09] 📡    │  │   └─[UC] Pay..   │  │ Assistant: I'll  │
│                  │  │   Broadcast OK   │  │     └─[FUNC]...  │  │ add a payment    │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Terminal 0 (WEBSOCKET)**:
- Command: `npx tsx src/websocket-server.ts`
- Shows: WebSocket server status, client subscriptions, broadcasts
- Purpose: Central synchronization hub for real-time terminal updates
- Port: 3001 (configurable via WS_PORT in .env)

**Terminal 1 (STDOUT)**:
- Command: `tail -f /tmp/graphengine.log`
- Shows: All application logs with timestamps
- Purpose: Debugging, monitoring, LLM usage statistics
- Updates: Real-time as processes write to log file

**Terminal 2 (GRAPH)**:
- Command: `npx tsx src/terminal-ui/graph-viewer.ts`
- Shows: ASCII tree visualization of graph
- Features:
  - Color-coded node types (SYS=magenta, UC=yellow, FUNC=green, REQ=red)
  - Hierarchical tree using only compose edges (per Ontology V3)
  - Scrollable history (updates append, no clear)
  - Update timestamp on each refresh
- Updates: Real-time via WebSocket (subscribes to `graph_update` events)

**Terminal 3 (CHAT)**:
- Command: `npx tsx src/terminal-ui/chat-interface.ts`
- Shows: User input and LLM text responses only
- Features:
  - Readline-based input (standard terminal input)
  - Streaming LLM responses (text chunks displayed incrementally)
  - Commands: /help, /load, /save, /stats, /view, /clear, exit
  - Silent graph updates (no status messages in chat)
- Updates: User-initiated, LLM responses

### 4.2.1 WebSocket Communication Flow ✅ IMPLEMENTED

**IPC Mechanism**: WebSocket (replaces file-based polling)

```typescript
// Chat interface broadcasts after graph update
wsClient.broadcastUpdate(
  'graph_update',
  JSON.stringify({
    nodes: Array.from(state.nodes.entries()),
    edges: Array.from(state.edges.entries()),
    ports: Array.from(state.ports.entries()),
    currentView: state.currentView,
    timestamp: Date.now()
  }),
  {
    userId: config.userId,
    sessionId: config.chatId,
    origin: 'llm-operation'
  }
);

// Graph viewer receives and processes update
async function handleGraphUpdate(update: BroadcastUpdate) {
  const stateData = JSON.parse(update.diff);
  const nodesMap = new Map(stateData.nodes);
  const edgesMap = new Map(stateData.edges);

  await graphCanvas.loadGraph({ nodes: nodesMap, edges: edgesMap, ports: portsMap });
  render();
}
```

### 4.2.2 Advantages of WebSocket Approach

1. **Real-time**: Instant updates (no 500ms polling delay)
2. **Scalable**: Supports future multi-user collaboration
3. **Unified**: Terminal-UI and Web-UI can share same WebSocket server
4. **Efficient**: Server-side broadcast (no file I/O overhead)
5. **Fail-loud**: Explicit errors if WebSocket unavailable (no silent failures)

### 4.2.3 Open Issue: Format E for Terminal Sync 🔧

**Current Implementation**:
- Terminal sync uses **JSON serialized state** (Map entries as arrays)
- LLM operations use **Format E diff** protocol
- Inconsistent: Two different formats for graph state transfer

**Desired Implementation**:
- Terminal sync should use **Format E** (consistent with LLM operations)
- Benefits: Single parser, token efficiency, universal diff protocol
- Migration path: Change `notifyGraphUpdate()` to use `parser.serializeGraph(state)` instead of `JSON.stringify()`

**Rationale for current approach**:
- File-based polling used JSON format (legacy)
- WebSocket replaced polling but kept same format (minimal change)
- Works correctly but violates "Universal Diff Protocol" design principle

**Advantages of 3-Terminal Approach**:
1. **Simple**: No tmux complexity, no quote escaping issues
2. **Debuggable**: Each process independent, easy to inspect
3. **Native**: Uses macOS Terminal.app (familiar UX)
4. **Scrollable**: Full terminal history, Cmd+K to clear
5. **Clean Separation**: Logs, visualization, interaction clearly separated
6. **Fast Evaluation**: Immediately see if system works (goal: easy evaluation)

### 4.3 Format E Diff Validator

**Single validator for ALL diffs** (graph + chat):

```typescript
class FormatEDiffValidator {
    private parser: FormatEParser;

    validate(diff: string, context: 'graph' | 'chat'): ValidationResult {
        // Parse
        const operations = this.parser.parseDiff(diff);

        // Syntax validation (universal)
        if (!this.validateSyntax(operations)) {
            return { valid: false, errors: ['...'] };
        }

        // Semantic validation (context-specific)
        if (context === 'graph') {
            return this.validateGraphOperations(operations);
        } else if (context === 'chat') {
            return this.validateChatOperations(operations);
        }
    }

    private validateGraphOperations(ops: Operations): ValidationResult {
        // Validate against ontology rules
        for (const op of ops.addNodes) {
            // Check node type valid
            if (!VALID_NODE_TYPES.includes(op.node.type)) {
                return {
                    valid: false,
                    errors: [`Invalid type ${op.node.type}`]
                };
            }

            // Check semantic ID format
            if (!SEMANTIC_ID_PATTERN.test(op.node.semanticId)) {
                return {
                    valid: false,
                    errors: ['Invalid semantic ID']
                };
            }

            // Check ontology rules (e.g., FUNC must have IO)
            // ...
        }
        return { valid: true, errors: [] };
    }

    private validateChatOperations(ops: Operations): ValidationResult {
        // Validate chat message operations
        for (const op of ops.addMessages) {
            // Check role valid
            const validRoles = ['user', 'assistant', 'system'] as const;
            if (!validRoles.includes(op.message.role)) {
                return {
                    valid: false,
                    errors: ['Invalid role']
                };
            }

            // Check timestamp format
            // Check content not empty
            // ...
        }
        return { valid: true, errors: [] };
    }
}
```

---

## 5. Data Flow Examples (Updated)

### 5.1 User Types in Chat → Graph Updates

```
1. User types: "Add payment function"
   Terminal UI (Chat Panel) → Chat Canvas

2. Chat Canvas creates message diff:
   <operations>
   + user|2025-11-17T10:30:00Z|Add payment function
   </operations>

3. Chat Canvas applies diff (stores user message)

4. Chat Canvas forwards to LLM:
   POST /api/llm/chat {
     message: "Add payment function",
     canvasState: "<Graph Canvas serialized as Format E>",
     chatHistory: "<Chat Canvas serialized as Format E>"
   }

5. LLM responds (streaming):
   "I'll add a payment function<operations>+ ProcessPayment|FUNC|...</operations>"

6. Chat Canvas receives response chunks:
   a) Text chunks → Chat Panel displays incrementally
   b) Operations tag detected → Extract graph diff

7. Chat Canvas stores assistant message:
   <operations>
   + assistant|2025-11-17T10:30:05Z|I'll add...|<operations>+ ProcessPayment|FUNC|...</operations>
   </operations>

8. Chat Canvas extracts graph operations and forwards to Graph Canvas:
   <operations>
   + ProcessPayment|FUNC|ProcessPayment.FN.002|...
   </operations>

9. Graph Canvas applies diff, broadcasts to Terminal UI (Graph Panel)

10. Terminal UI (Graph Panel) requests layout, renders updated graph
```

### 5.2 User Edits Graph Directly (Future)

```
1. User clicks "Add Node" in Graph Panel
   Terminal UI generates diff:
   <operations>
   + ManualNode|FUNC|ManualNode.FN.099|Created manually [x:300,y:200]
   </operations>

2. Terminal UI → Graph Canvas (WebSocket):
   {
     type: "user-edit",
     diff: "<operations>...</operations>",
     source: "graph-editor"
   }

3. Graph Canvas applies diff, broadcasts to all users

4. Graph Canvas OPTIONALLY notifies Chat Canvas:
   "User manually added node ManualNode"

5. Chat Canvas OPTIONALLY creates system message:
   <operations>
   + system|timestamp|Graph edited: ManualNode added
   </operations>

6. Both panels update in all connected Terminal UIs
```

---

## 6. Key Architectural Decisions (Updated)

1. ✅ **Dual Canvas Pattern**: Graph Canvas + Chat Canvas (same state manager pattern)
2. ✅ **Universal Diff Protocol**: Format E Diff for ALL changes (graph, chat, user edits, LLM ops)
3. ✅ **Canvas Decides Persistence**: Not LLM, not Terminal UI - Canvas owns the decision
4. ✅ **Semantic IDs Standard**: All communication uses semantic IDs (not UUIDs)
5. ✅ **Chat IDs for Audit**: Every operation traceable to conversation
6. ✅ **FLOW Nodes as Ports**: Not rendered as separate symbols
7. ✅ **Two-Layer Caching**: Anthropic native + AgentDB persistent
8. ✅ **Chat is ALSO a Canvas**: Same pattern, same diff format, same broadcast mechanism

---

**End of Architecture Specification**
