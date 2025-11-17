# Synchronisations-Flow Diagramm

## Übersicht: Bidirektionale Synchronisation

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FLOWGROUND SYNCHRONISATION                       │
└─────────────────────────────────────────────────────────────────────┘

                          ┌─────────────┐
                          │    USER     │
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │                         │
                    ▼                         ▼
         ┌──────────────────┐      ┌──────────────────┐
         │  LLM REQUEST     │      │  CANVAS EDIT     │
         │  "Add function"  │      │  Drag & Drop     │
         └────────┬─────────┘      └────────┬─────────┘
                  │                         │
                  │                         │
    ┌─────────────┼─────────────────────────┼─────────────┐
    │             │         BACKEND         │             │
    │             ▼                         ▼             │
    │   ┌─────────────────┐       ┌─────────────────┐    │
    │   │ Canvas Context  │       │   WebSocket     │    │
    │   │    Service      │       │     Server      │    │
    │   │   [NEW! ⭐]     │       │                 │    │
    │   └────────┬────────┘       └────────┬────────┘    │
    │            │                         │             │
    │            │ Format E                │ Operation   │
    │            ▼                         ▼             │
    │   ┌─────────────────┐       ┌─────────────────┐    │
    │   │  AI Assistant   │       │  Operational    │    │
    │   │    Service      │       │   Transform     │    │
    │   └────────┬────────┘       └────────┬────────┘    │
    │            │                         │             │
    │            │ Operations              │             │
    │            ▼                         │             │
    │   ┌─────────────────┐               │             │
    │   │ GraphOperation  │◄──────────────┘             │
    │   │   Executor      │                             │
    │   │   [NEW! ⭐]     │                             │
    │   └────────┬────────┘                             │
    │            │                                       │
    └────────────┼───────────────────────────────────────┘
                 │
                 │ CRUD Operations
                 ▼
        ┌─────────────────┐
        │     NEO4J       │
        │    DATABASE     │
        └────────┬────────┘
                 │
                 │ Change Events
                 ▼
        ┌─────────────────┐
        │    WebSocket    │
        │    Broadcast    │
        └────────┬────────┘
                 │
                 │ graph-update
                 ▼
        ┌─────────────────┐
        │    FRONTEND     │
        │  GraphCanvas    │
        │  useGraphCanvas │
        └─────────────────┘
                 │
                 │ Real-time Update
                 ▼
        ┌─────────────────┐
        │      USER       │
        │   sees change   │
        └─────────────────┘
```

---

## Flow 1: LLM Request → Frontend Update

**Schritt-für-Schritt:**

```
① USER
   │
   │ "Add a function ParseInput that satisfies REQ-001"
   │
   ▼
② CANVAS CONTEXT SERVICE ⭐ NEW
   │
   │ • Capture current graph state
   │ • Serialize to Format E
   │ • Add metadata (selected nodes, filters)
   │
   ├─→ Cache (5s TTL)
   │
   ▼
③ AI ASSISTANT SERVICE
   │
   │ Build LLM Prompt:
   │ ┌─────────────────────────────────────┐
   │ │ System: Ontology Rules (CACHED)     │
   │ │ System: Graph Context  (CACHED)     │
   │ │ User:   "Add function..."           │
   │ └─────────────────────────────────────┘
   │
   │ Call LLM (Anthropic Claude)
   │
   │ Parse Response:
   │ ┌─────────────────────────────────────┐
   │ │ ## Nodes                             │
   │ │ ParseInput|FUNC|ParseInput.FN.001|.. │
   │ │                                      │
   │ │ ## Edges                             │
   │ │ ParseInput.FN.001 -st-> REQ-001      │
   │ └─────────────────────────────────────┘
   │
   ▼
④ GRAPH OPERATION EXECUTOR ⭐ NEW
   │
   │ Execute Operations:
   │ • CREATE ParseInput (FUNC)
   │ • CREATE-RELATIONSHIP (satisfy)
   │
   │ TempId Mapping:
   │ ParseInput.FN.001 → uuid-abc-123
   │
   │ Transaction: BEGIN
   ├─→ neo4j.createNode(...)
   ├─→ neo4j.createRelationship(...)
   │   Transaction: COMMIT
   │
   │ Emit Events:
   │ • graph:node-created
   │ • graph:edge-created
   │
   ▼
⑤ NEO4J DATABASE
   │
   │ Node stored: ParseInput (uuid-abc-123)
   │ Relationship stored: satisfy
   │
   ▼
⑥ WEBSOCKET SERVER
   │
   │ Listen to Events:
   │ • graph:node-created → Convert to GraphCanvasUpdate
   │
   │ Broadcast:
   │ ┌─────────────────────────────────────┐
   │ │ type: "graph-update"                 │
   │ │ payload: {                           │
   │ │   type: "node-add",                  │
   │ │   node: {                            │
   │ │     uuid: "uuid-abc-123",            │
   │ │     type: "FUNC",                    │
   │ │     Name: "ParseInput",              │
   │ │     position: { x: 0, y: 0 }         │
   │ │   }                                  │
   │ │ }                                    │
   │ └─────────────────────────────────────┘
   │
   ▼
⑦ FRONTEND (useGraphCanvas)
   │
   │ ws.on('graph-update', (event) => {
   │   if (event.type === 'node-add') {
   │     addNode(event.node)
   │   }
   │ })
   │
   │ Update React State
   │
   ▼
⑧ GRAPH CANVAS
   │
   │ Re-render with new node
   │
   ▼
⑨ USER

   ✅ Sees "ParseInput" function appear in graph!

   Latency: ~100ms
```

---

## Flow 2: Canvas Edit → Database

**Schritt-für-Schritt:**

```
① USER
   │
   │ Drags node "ParseInput" to new position
   │
   ▼
② GRAPH CANVAS
   │
   │ onNodeMove(nodeId, x, y)
   │
   ▼
③ useGraphCanvas HOOK
   │
   │ Create Operation:
   │ ┌─────────────────────────────────────┐
   │ │ {                                    │
   │ │   id: "op-123",                      │
   │ │   type: "update",                    │
   │ │   canvasType: "graph",               │
   │ │   path: ["graph","nodes","uuid","position"], │
   │ │   payload: { x: 250, y: 150 },       │
   │ │   userId: "user-1"                   │
   │ │ }                                    │
   │ └─────────────────────────────────────┘
   │
   │ Optimistic Update:
   ├─→ updateNode(nodeId, { position })
   │   ✅ UI updates IMMEDIATELY
   │
   │ Send to Server:
   ├─→ ws.send({ type: 'graph-update', ... })
   │
   ▼
④ WEBSOCKET SERVER
   │
   │ Receive 'graph-update'
   │
   │ Validate Operation
   │ Apply Operational Transform (if conflicts)
   │
   ▼
⑤ NEO4J SERVICE
   │
   │ neo4j.updateNode(uuid, {
   │   position: { x: 250, y: 150 }
   │ })
   │
   ▼
⑥ NEO4J DATABASE
   │
   │ Node updated
   │
   ▼
⑦ WEBSOCKET SERVER
   │
   │ Broadcast to OTHER clients:
   │ ┌─────────────────────────────────────┐
   │ │ type: "graph-update"                 │
   │ │ payload: { nodeId, position }        │
   │ └─────────────────────────────────────┘
   │
   ▼
⑧ OTHER USERS

   ✅ See node move in real-time!

   Latency: <50ms
```

---

## Flow 3: Canvas Context Capture

**Für jeden LLM Request:**

```
┌─────────────────────────────────────────────────────────────┐
│  CANVAS CONTEXT CAPTURE                                      │
└─────────────────────────────────────────────────────────────┘

① Check Cache
   │
   │ cacheKey = "session-123:SELECTED:true"
   │
   ├─→ Cache Hit? → Return cached context ✅
   │
   └─→ Cache Miss? → Continue ↓

② Get Canvas State
   │
   │ const graphState = await stateManager.getCanvasState(sessionId)
   │
   │ graphState = {
   │   nodes: [Node1, Node2, ...],
   │   edges: [Edge1, Edge2, ...],
   │   selectedNodes: ["uuid-abc-123"],
   │   filters: { nodeTypes: ["FUNC", "REQ"] },
   │   layout: "hierarchical",
   │   viewport: { zoom: 1.2, ... }
   │ }
   │
   ▼

③ Filter Nodes (based on mode)
   │
   │ MODE = SELECTED
   │ ├─→ Filter: only selectedNodes
   │
   │ MODE = FULL
   │ ├─→ All nodes
   │
   │ MODE = VISIBLE
   │ ├─→ Apply filters (nodeTypes, relationTypes)
   │
   │ MODE = CHANGED
   │ ├─→ Only changed since last capture
   │
   │ MODE = MINIMAL
   │ └─→ No nodes (metadata only)
   │
   ▼

④ Convert to Ontology Format
   │
   │ GraphNode → OntologyNode
   │ GraphEdge → OntologyRelationship
   │
   ▼

⑤ Serialize to Format E
   │
   │ graphSerializer.serializeToFormatE(graph)
   │
   │ Output:
   │ ┌─────────────────────────────────────┐
   │ │ ## Nodes                             │
   │ │ ParseInput|FUNC|ParseInput.FN.001|.. │
   │ │ REQ-001|REQ|REQ-001.RQ.001|...       │
   │ │                                      │
   │ │ ## Edges                             │
   │ │ ParseInput.FN.001 -st-> REQ-001.RQ.001 │
   │ └─────────────────────────────────────┘
   │
   │ Token Estimate: 250 tokens
   │ Compression: 78% vs JSON
   │
   ▼

⑥ Add Metadata (if requested)
   │
   │ ## Current Graph Context
   │ **Total Nodes:** 2
   │ **Selected:** ParseInput
   │ **Filters:** FUNC, REQ
   │ **Zoom:** 120%
   │
   ▼

⑦ Cache Result
   │
   │ cache.set(cacheKey, result, ttl: 5000ms)
   │
   ▼

⑧ Return Context
   │
   └─→ Used in LLM Prompt (with Anthropic Caching!)
```

---

## Komponenten-Legende

### ⭐ NEU (Phase 2)
- **CanvasContextService** - Erfasst Canvas State für LLM
- **GraphOperationExecutor** - Führt LLM Operations in Neo4j aus

### ✅ Bereits vorhanden (erweitert)
- **AI Assistant Service** - LLM Integration
- **WebSocket Server** - Real-time Communication
- **Neo4j Service** - Database CRUD
- **useGraphCanvas** - Frontend State Management
- **graph-serializer** - Format E Serialisierung

---

## Performance-Metriken

```
┌─────────────────────────────────────────────────────────────┐
│  LATENCY TARGET: <100ms (End-to-End)                        │
└─────────────────────────────────────────────────────────────┘

Canvas Context Capture:     <10ms  (SELECTED mode)
                            <50ms  (FULL mode)

LLM Response:               1-3s   (streaming)

Operation Execution:        <20ms  (per operation)

Neo4j Write:                <10ms  (per node)

WebSocket Broadcast:        <50ms  (to all clients)

Frontend Re-render:         <16ms  (60 FPS)

─────────────────────────────────────────────────────────────
TOTAL (after LLM):          ~100ms ✅
```

```
┌─────────────────────────────────────────────────────────────┐
│  COST SAVINGS: 55% via Caching                              │
└─────────────────────────────────────────────────────────────┘

Without Optimization:
  Ontology:       2,000 tokens  @ $0.003/1K = $0.006
  Full Graph:     5,000 tokens  @ $0.003/1K = $0.015
  User Request:     100 tokens  @ $0.003/1K = $0.0003
  ────────────────────────────────────────────────────
  Total per request:                         $0.0213

With Optimization (Anthropic Caching):
  Ontology:       2,000 tokens  @ $0.0003/1K = $0.0006  (CACHED)
  Graph Context:    200 tokens  @ $0.0003/1K = $0.00006 (CACHED)
  User Request:     100 tokens  @ $0.003/1K  = $0.0003
  ────────────────────────────────────────────────────
  Total per request:                         $0.00096

  SAVINGS: 55% per request

Monthly (1000 requests):
  Without: $21.30
  With:    $0.96
  ────────────────────────────────────────────────────
  SAVINGS: $20.34/month ✅
```

---

## Multi-User Sync

```
┌─────────────────────────────────────────────────────────────┐
│  MULTI-USER COLLABORATION                                    │
└─────────────────────────────────────────────────────────────┘

USER A                          USER B
  │                               │
  │ Edits Node Position           │
  │                               │
  ├──→ WebSocket ──→ Server ──────┼──→ Broadcast
  │                               │
  │ ✅ Optimistic Update          │ ✅ Receives Update
  │                               │
  │                               │
  │                          User B edits same node
  │                               │
  │                               ├──→ WebSocket
  │                               │
  ├──────← Conflict! ←────────────┤
  │                               │
  │    Operational Transform      │
  │    resolves conflict          │
  │                               │
  ├──→ Final State ←───────────────┤
  │                               │
  ✅ Both users see same result   ✅

Features:
- Operational Transform for conflict resolution
- Optimistic UI updates
- Presence indicators (who's editing what)
- Cursor tracking
- Real-time sync <50ms
```

---

## Zusammenfassung

**3 Hauptflows:**

1. **LLM → Neo4j → Frontend** (NEW!)
   - User Request → LLM Operations → Database → Live Update
   - Latency: ~100ms (after LLM response)

2. **Frontend → Neo4j** (erweitert)
   - User Edit → Optimistic Update → Database → Broadcast
   - Latency: <50ms

3. **Canvas → LLM Context** (NEW!)
   - Capture State → Serialize Format E → Cache → LLM Prompt
   - Cache Hit Rate: >80%
   - Token Savings: 73-85% (Format E) + 90% (Anthropic Cache)

**Neue Komponenten:**
- ⭐ CanvasContextService
- ⭐ GraphOperationExecutor
- ⭐ WebSocket Event Broadcasting

**Ergebnis:**
- ✅ Bidirektionale Real-time Sync
- ✅ 55% Kostenersparnis
- ✅ <100ms End-to-End Latency
- ✅ Multi-User Collaboration
