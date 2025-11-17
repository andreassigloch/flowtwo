# LLM ↔ Neo4j ↔ Frontend Synchronisation Architektur

**Version:** 1.0
**Date:** 2025-01-16
**Status:** Design Document

## Problemstellung

Die FlowGround Anwendung hat drei Hauptkomponenten, die synchronisiert werden müssen:

1. **LLM (Large Language Model)**: Generiert Ontologie-Änderungen basierend auf User Requests
2. **Neo4j Database**: Persistiert den vollständigen Ontologie-Graph
3. **Frontend Graph Canvas**: Zeigt den Graph visuell an und erlaubt User-Interaktionen

**Anforderungen:**
- LLM-generierte Änderungen müssen in Neo4j gespeichert und live im Frontend angezeigt werden
- User-Änderungen im Frontend (drag & drop, edit) müssen in Neo4j gespeichert werden
- Der aktuelle Canvas-State (inkl. User-Änderungen) muss als Context für LLM-Requests verfügbar sein
- Real-time Updates mit <50ms Latenz für optimale UX

## Bestehende Infrastruktur

### ✅ Bereits implementiert:

**Frontend:**
- `GraphCanvas.tsx`: Canvas-basierte Graph-Visualisierung
- `useGraphCanvas.ts`: State Management + WebSocket Integration
- `graph-service.ts`: Cytoscape Integration, Validation, Stats
- WebSocket-basierte Collaboration (Multi-User)

**Backend:**
- `neo4j.service.ts`: Complete CRUD für Nodes/Relationships
- `graph-serializer.ts`: Format E Serialisierung für LLM (kompakt!)
- `websocket.server.ts`: WebSocket Server mit Room Management
- `canvas-sync-engine.ts`: Real-time Sync Engine mit Operational Transform

**Sync Infrastructure:**
- `operational-transform.ts`: Conflict Resolution
- `diff-algorithm.ts`: State Diffing
- `optimistic-update-manager.ts`: Optimistic UI Updates
- `presence-manager.ts`: Multi-User Presence

### ❌ Fehlende Komponenten:

1. **LLM Operations → Neo4j Bridge**
   - Kein Service der LLM Operations in Neo4j schreibt
   - Kein Event-Handler für LLM-generierte Operations

2. **Neo4j → Frontend Sync**
   - Kein Watch/Trigger Mechanismus für Neo4j Changes
   - Keine Broadcast-Logik für DB Updates

3. **Canvas State → LLM Context**
   - Keine Serialisierung von GraphCanvasState für LLM Input
   - Kein Snapshot-Service für Canvas Context Capture

## Architektur-Design

### 1. Datenfluss: User Request → LLM → Neo4j → Frontend

```
┌─────────────┐
│ User Input  │ "Add a new function 'ParseInput' that satisfies REQ-001"
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  AI Assistant Service                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 1. Capture Canvas Context (Current Graph State)    │  │
│  │    - Serialize GraphCanvasState → Format E         │  │
│  │    - Include selected nodes, filters, etc.         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 2. Build LLM Prompt                                │  │
│  │    System Prompt:                                  │  │
│  │    - Ontology Rules (from ontology-v3.md)         │  │
│  │    - Current Graph Context (Format E)             │  │
│  │                                                    │  │
│  │    User Prompt:                                    │  │
│  │    - User Request + Canvas State                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 3. LLM Response Processing                         │  │
│  │    - Parse Operations from LLM response           │  │
│  │    - Deserialize Format E → Operation[]           │  │
│  │    - Validate operations (ontology rules)         │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  Graph Operation Executor Service (NEW!)                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 4. Execute Operations in Neo4j                     │  │
│  │    For each Operation:                             │  │
│  │      - CREATE: neo4j.createNode()                  │  │
│  │      - UPDATE: neo4j.updateNode()                  │  │
│  │      - DELETE: neo4j.deleteNode()                  │  │
│  │      - CREATE-REL: neo4j.createRelationship()      │  │
│  │                                                    │  │
│  │    - Handle TempId → UUID mapping                  │  │
│  │    - Maintain operation order (dependencies)       │  │
│  │    - Transaction support (all-or-nothing)          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 5. Emit Neo4j Change Events                        │  │
│  │    Event: 'graph:node-created'                     │  │
│  │    Event: 'graph:node-updated'                     │  │
│  │    Event: 'graph:edge-created'                     │  │
│  │    Event: 'graph:node-deleted'                     │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  WebSocket Broadcast Service                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 6. Convert to GraphCanvasUpdate                    │  │
│  │    Neo4jEvent → GraphCanvasUpdate {               │  │
│  │      type: 'node-add' | 'edge-add' | ...          │  │
│  │      node: { uuid, type, Name, position }         │  │
│  │      edge: { uuid, type, source, target }         │  │
│  │    }                                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 7. Broadcast to All Clients in Room                │  │
│  │    WebSocket Message Type: 'graph-update'          │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  Frontend: useGraphCanvas Hook                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 8. Receive WebSocket Update                        │  │
│  │    ws.on('graph-update', (event) => {              │  │
│  │      if (event.type === 'node-added') {            │  │
│  │        addNode(event.data.node)                    │  │
│  │      }                                              │  │
│  │      if (event.type === 'edge-added') {            │  │
│  │        addEdge(event.data.edge)                    │  │
│  │      }                                              │  │
│  │    })                                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 9. Update React State → Re-render                  │  │
│  │    setGraphData({ nodes, edges })                  │  │
│  │    → GraphCanvas re-renders with new data          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 2. Datenfluss: Frontend User Edit → Neo4j

```
┌──────────────────────────────────────────────────────────┐
│  GraphCanvas Component                                    │
│  User Action: Drag node, Edit properties, Add edge       │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  useGraphCanvas Hook                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 1. Create Canvas Operation                         │  │
│  │    const operation = {                             │  │
│  │      id: uuid(),                                   │  │
│  │      type: 'update',                               │  │
│  │      canvasType: 'graph',                          │  │
│  │      path: ['graph', 'nodes', nodeId, 'position'], │  │
│  │      payload: { x: 100, y: 200 },                  │  │
│  │      timestamp: Date.now(),                        │  │
│  │      userId,                                        │  │
│  │      version                                        │  │
│  │    }                                                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 2. Optimistic UI Update (Instant Feedback)         │  │
│  │    updateNode(nodeId, { position: { x, y } })      │  │
│  │    → UI updates immediately                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 3. Send via WebSocket                              │  │
│  │    ws.send({                                       │  │
│  │      type: 'graph-update',                         │  │
│  │      payload: { operation, nodeData }              │  │
│  │    })                                               │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  WebSocket Server                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 4. Handle 'graph-update' Message                   │  │
│  │    - Validate operation                            │  │
│  │    - Apply Operational Transform (if conflicts)    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 5. Update Neo4j                                    │  │
│  │    await neo4j.updateNode(nodeId, {                │  │
│  │      position: { x, y }                            │  │
│  │    })                                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 6. Broadcast to Other Clients                      │  │
│  │    roomManager.broadcastToRoom(roomId, update)     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 3. Canvas State Capture für LLM Context

```
┌──────────────────────────────────────────────────────────┐
│  Canvas Context Service (NEW!)                           │
│                                                           │
│  captureGraphContext(sessionId: string): string {         │
│    // 1. Get current canvas state                        │
│    const canvasState = getCanvasState(sessionId)         │
│                                                           │
│    // 2. Build Graph structure                           │
│    const graph = {                                       │
│      nodes: canvasState.graph.nodes.map(n => ({          │
│        uuid: n.id,                                       │
│        type: n.type,                                     │
│        properties: {                                     │
│          Name: n.label,                                  │
│          Descr: n.data.Descr,                            │
│          ...n.data                                       │
│        }                                                  │
│      })),                                                 │
│      relationships: canvasState.graph.edges.map(e => ({  │
│        uuid: e.id,                                       │
│        type: e.type,                                     │
│        source: e.source,                                 │
│        target: e.target                                  │
│      }))                                                  │
│    }                                                      │
│                                                           │
│    // 3. Serialize to Format E                           │
│    const formatE = graphSerializer.serializeToFormatE(   │
│      graph,                                              │
│      changedOnly: false  // Full context                │
│    )                                                      │
│                                                           │
│    // 4. Add metadata                                    │
│    const context = `                                     │
│## Current Graph State                                    │
│**Nodes:** ${graph.nodes.length}                          │
│**Edges:** ${graph.relationships.length}                  │
│**Selected:** ${canvasState.graph.selectedNodes.join()}   │
│**Filters:** ${JSON.stringify(canvasState.graph.filters)} │
│                                                           │
│${formatE}                                                 │
│    `                                                      │
│                                                           │
│    return context                                        │
│  }                                                        │
└──────────────────────────────────────────────────────────┘
```

## Komponenten-Spezifikation

### 1. GraphOperationExecutor Service

**Location:** `src/backend/services/graph-operation-executor.ts`

**Responsibilities:**
- Execute LLM-generated Operations in Neo4j
- Handle TempId → UUID mapping
- Maintain operation order based on dependencies
- Emit change events for WebSocket broadcast

**Interface:**
```typescript
class GraphOperationExecutor {
  constructor(
    private neo4j: Neo4jService,
    private eventEmitter: EventEmitter
  ) {}

  async executeOperations(
    operations: Operation[],
    userId: string
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = []
    const tempIdMap = new Map<string, string>()

    for (const op of operations) {
      try {
        const result = await this.executeOperation(op, tempIdMap, userId)
        results.push(result)

        // Emit event for WebSocket broadcast
        this.emitChangeEvent(op, result)
      } catch (error) {
        results.push({
          operationId: op.id,
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  private async executeOperation(
    op: Operation,
    tempIdMap: Map<string, string>,
    userId: string
  ): Promise<ExecutionResult> {
    switch (op.type) {
      case 'create':
        const node = await this.neo4j.createNode(
          op.nodeType!,
          { Name: op.data.Name, Descr: op.data.Descr },
          userId
        )

        // Map tempId → uuid
        if (op.tempId) {
          tempIdMap.set(op.tempId, node.uuid)
        }

        return {
          operationId: op.id,
          success: true,
          uuid: node.uuid,
          tempId: op.tempId
        }

      case 'update':
        await this.neo4j.updateNode(
          op.data.uuid!,
          { Name: op.data.Name, Descr: op.data.Descr },
          userId
        )
        return { operationId: op.id, success: true }

      case 'delete':
        await this.neo4j.deleteNode(op.data.uuid!)
        return { operationId: op.id, success: true }

      case 'create-relationship':
        // Resolve tempIds to UUIDs
        const sourceUuid = op.sourceTempId
          ? tempIdMap.get(op.sourceTempId)
          : op.sourceUuid
        const targetUuid = op.targetTempId
          ? tempIdMap.get(op.targetTempId)
          : op.targetUuid

        const rel = await this.neo4j.createRelationship(
          op.relType!,
          sourceUuid!,
          targetUuid!,
          {},
          userId
        )

        return {
          operationId: op.id,
          success: true,
          uuid: rel.uuid
        }

      default:
        throw new Error(`Unknown operation type: ${op.type}`)
    }
  }

  private emitChangeEvent(op: Operation, result: ExecutionResult): void {
    if (!result.success) return

    switch (op.type) {
      case 'create':
        this.eventEmitter.emit('graph:node-created', {
          uuid: result.uuid,
          type: op.nodeType,
          data: op.data
        })
        break

      case 'update':
        this.eventEmitter.emit('graph:node-updated', {
          uuid: op.data.uuid,
          updates: op.data
        })
        break

      case 'delete':
        this.eventEmitter.emit('graph:node-deleted', {
          uuid: op.data.uuid
        })
        break

      case 'create-relationship':
        this.eventEmitter.emit('graph:edge-created', {
          uuid: result.uuid,
          type: op.relType,
          source: op.sourceUuid || result.tempId,
          target: op.targetUuid
        })
        break
    }
  }
}
```

### 2. CanvasContextService

**Location:** `src/backend/services/canvas-context.service.ts`

**Responsibilities:**
- Capture current GraphCanvasState
- Serialize to Format E for LLM context
- Include metadata (selected nodes, filters, etc.)

**Interface:**
```typescript
class CanvasContextService {
  constructor(
    private graphSerializer: GraphSerializer,
    private stateManager: StateManager
  ) {}

  async captureGraphContext(
    sessionId: string,
    options: {
      includeMetadata?: boolean
      selectedOnly?: boolean
    } = {}
  ): Promise<string> {
    // Get current canvas state
    const canvasState = await this.stateManager.getCanvasState(sessionId)

    // Filter nodes if selectedOnly
    const nodes = options.selectedOnly
      ? canvasState.graph.nodes.filter(n =>
          canvasState.graph.selectedNodes.includes(n.id)
        )
      : canvasState.graph.nodes

    // Build graph structure
    const graph = {
      nodes: nodes.map(n => ({
        uuid: n.id,
        type: n.type,
        properties: {
          Name: n.label,
          Descr: n.data.Descr,
          ...n.data
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user',
        version: 1
      })),
      relationships: canvasState.graph.edges
        .filter(e =>
          nodes.some(n => n.id === e.source) &&
          nodes.some(n => n.id === e.target)
        )
        .map(e => ({
          uuid: e.id,
          type: e.type,
          source: e.source,
          target: e.target,
          properties: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user'
        }))
    }

    // Serialize to Format E
    const formatE = await this.graphSerializer.serializeToFormatE(
      graph,
      false // Full context, not diff
    )

    // Add metadata if requested
    if (options.includeMetadata) {
      const metadata = `## Current Graph State
**Total Nodes:** ${graph.nodes.length}
**Total Edges:** ${graph.relationships.length}
**Selected Nodes:** ${canvasState.graph.selectedNodes.join(', ') || 'None'}
**Active Filters:** ${this.formatFilters(canvasState.graph.filters)}
**Layout:** ${canvasState.graph.layout}
**Zoom:** ${(canvasState.graph.viewport.zoom * 100).toFixed(0)}%

`
      return metadata + formatE
    }

    return formatE
  }

  private formatFilters(filters: GraphCanvasState['filters']): string {
    const parts: string[] = []

    if (filters.nodeTypes.length > 0) {
      parts.push(`Node Types: ${filters.nodeTypes.join(', ')}`)
    }
    if (filters.relationTypes.length > 0) {
      parts.push(`Relations: ${filters.relationTypes.join(', ')}`)
    }
    if (filters.showFlows !== undefined) {
      parts.push(`Show Flows: ${filters.showFlows}`)
    }

    return parts.length > 0 ? parts.join(' | ') : 'None'
  }
}
```

### 3. WebSocket Event Handlers (Extension)

**Location:** `src/backend/websocket/websocket.server.ts`

**Add Neo4j Event Listeners:**
```typescript
class WebSocketServerManager {
  // ... existing code ...

  setupNeo4jEventListeners(executor: GraphOperationExecutor): void {
    const eventEmitter = executor.getEventEmitter()

    // Node created
    eventEmitter.on('graph:node-created', (event) => {
      this.broadcastGraphUpdate({
        type: 'node-add',
        node: {
          uuid: event.uuid,
          type: event.type,
          Name: event.data.Name,
          position: { x: 0, y: 0 } // Will be auto-layouted
        }
      })
    })

    // Node updated
    eventEmitter.on('graph:node-updated', (event) => {
      this.broadcastGraphUpdate({
        type: 'node-update',
        node: {
          uuid: event.uuid,
          ...event.updates
        }
      })
    })

    // Node deleted
    eventEmitter.on('graph:node-deleted', (event) => {
      this.broadcastGraphUpdate({
        type: 'node-delete',
        nodeId: event.uuid
      })
    })

    // Edge created
    eventEmitter.on('graph:edge-created', (event) => {
      this.broadcastGraphUpdate({
        type: 'edge-add',
        edge: {
          uuid: event.uuid,
          type: event.type,
          sourceUuid: event.source,
          targetUuid: event.target
        }
      })
    })
  }

  private broadcastGraphUpdate(update: GraphCanvasUpdate): void {
    // Broadcast to all rooms
    this.roomManager.getAllRooms().forEach(room => {
      this.roomManager.broadcastToRoom(
        room.id,
        {
          type: 'graph-update',
          payload: update,
          timestamp: Date.now()
        }
      )
    })
  }
}
```

## Integration mit AI Assistant

**Modify:** `src/backend/ai-assistant/ai-assistant.service.ts`

```typescript
class AIAssistantService {
  constructor(
    private neo4j: Neo4jService,
    private graphSerializer: GraphSerializer,
    private canvasContext: CanvasContextService,
    private operationExecutor: GraphOperationExecutor
  ) {}

  async *streamChat(request: ChatRequest): AsyncGenerator<ChatResponseChunk> {
    // 1. Capture canvas context
    const canvasContext = await this.canvasContext.captureGraphContext(
      request.sessionId,
      { includeMetadata: true }
    )

    // 2. Build LLM prompt with context
    const systemPrompt = [
      { text: this.getOntologyPrompt() },
      { text: `Current Graph:\n${canvasContext}`,
        cache_control: { type: "ephemeral" } }
    ]

    // 3. Call LLM
    const response = await this.llm.streamChat({
      system: systemPrompt,
      messages: [{ role: 'user', content: request.message }]
    })

    // 4. Parse operations from response
    const operations: Operation[] = []
    let textResponse = ''

    for await (const chunk of response) {
      textResponse += chunk.text

      // Stream text to user
      yield {
        type: 'ai-response-chunk',
        sessionId: request.sessionId,
        messageId: chunk.messageId,
        chunk: chunk.text,
        isComplete: false
      }
    }

    // 5. Extract operations from response
    const extractedOps = await this.extractOperations(textResponse)

    // 6. Execute operations in Neo4j
    if (extractedOps.length > 0) {
      const results = await this.operationExecutor.executeOperations(
        extractedOps,
        request.userId
      )

      // Operations automatically broadcast via WebSocket events

      yield {
        type: 'ai-response-chunk',
        sessionId: request.sessionId,
        messageId: 'final',
        chunk: '',
        isComplete: true,
        operations: extractedOps
      }
    }
  }

  private async extractOperations(text: string): Promise<Operation[]> {
    // Extract Format E blocks from LLM response
    const formatEMatch = text.match(/```format-e\n([\s\S]+?)\n```/i)

    if (!formatEMatch) {
      return []
    }

    const formatE = formatEMatch[1]

    // Deserialize Format E → Operations
    const operations = await this.graphSerializer.deserializeFromFormatE(formatE)

    return operations
  }
}
```

## Performance Optimierungen

### 1. Differential Updates (nur Änderungen broadcasten)

```typescript
// Statt vollem Graph, nur geänderte Nodes
const changedNodeIds = new Set<string>()

eventEmitter.on('graph:node-created', (event) => {
  changedNodeIds.add(event.uuid)
})

// Batch updates alle 100ms
setInterval(() => {
  if (changedNodeIds.size > 0) {
    broadcastDiff(changedNodeIds)
    changedNodeIds.clear()
  }
}, 100)
```

### 2. Canvas Context Caching

```typescript
class CanvasContextService {
  private cache = new Map<string, { context: string, timestamp: number }>()
  private CACHE_TTL = 5000 // 5 seconds

  async captureGraphContext(sessionId: string): Promise<string> {
    const cached = this.cache.get(sessionId)

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.context
    }

    const context = await this.generateContext(sessionId)

    this.cache.set(sessionId, {
      context,
      timestamp: Date.now()
    })

    return context
  }
}
```

### 3. Format E Compression

Format E ist bereits 73-85% kleiner als JSON. Zusätzliche Optimierungen:

```typescript
// Verwende Semantic IDs statt UUIDs in Format E
CargoManagement.SY.001  // statt 550e8400-e29b-41d4-a716-446655440000

// Abkürzungen für Relationship Types
-cp->  // compose
-io->  // io
-st->  // satisfy
-vf->  // verify
```

## Fehlerbehandlung

### 1. Operation Execution Failures

```typescript
async executeOperations(operations: Operation[]): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = []

  try {
    // Use Neo4j transaction
    await this.neo4j.runTransaction(async (tx) => {
      for (const op of operations) {
        const result = await this.executeOperation(op, tx)
        results.push(result)
      }
    })
  } catch (error) {
    // Rollback all operations
    logger.error('Operation execution failed, rolling back', error)

    // Notify frontend about failure
    this.eventEmitter.emit('graph:operation-failed', {
      operations,
      error: error.message
    })

    throw error
  }

  return results
}
```

### 2. WebSocket Reconnection

Already implemented in `canvas-sync-engine.ts`:
- Exponential backoff
- Max 5 reconnection attempts
- Optimistic updates with rollback on failure

### 3. Conflict Resolution

Already implemented via Operational Transform:
- Last-write-wins for simple conflicts
- OT for concurrent edits
- Manual resolution for complex conflicts

## Testing Strategy

### 1. Integration Tests

```typescript
describe('LLM → Neo4j → Frontend Sync', () => {
  it('should sync LLM-generated nodes to frontend', async () => {
    // 1. Mock LLM response with operations
    const operations = [
      { type: 'create', nodeType: 'FUNC', data: { Name: 'ParseInput', Descr: '...' } }
    ]

    // 2. Execute operations
    const results = await executor.executeOperations(operations, 'user-1')

    // 3. Verify Neo4j update
    const node = await neo4j.getNode(results[0].uuid!)
    expect(node.properties.Name).toBe('ParseInput')

    // 4. Verify WebSocket broadcast
    expect(mockWebSocket.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'graph-update',
        payload: expect.objectContaining({
          type: 'node-add',
          node: expect.objectContaining({ Name: 'ParseInput' })
        })
      })
    )
  })

  it('should include canvas context in LLM requests', async () => {
    // 1. Setup canvas state
    const canvasState = {
      graph: {
        nodes: [{ id: 'uuid-1', type: 'SYS', label: 'CargoSystem', ... }],
        edges: [],
        selectedNodes: ['uuid-1']
      }
    }

    // 2. Capture context
    const context = await canvasContext.captureGraphContext('session-1')

    // 3. Verify Format E serialization
    expect(context).toContain('## Nodes')
    expect(context).toContain('CargoSystem|SYS|')
    expect(context).toContain('**Selected Nodes:** uuid-1')
  })
})
```

### 2. Performance Tests

```typescript
describe('Sync Performance', () => {
  it('should sync within 50ms latency', async () => {
    const startTime = performance.now()

    // Execute operation
    await executor.executeOperations([operation], 'user-1')

    // Wait for WebSocket broadcast
    await waitForWebSocketMessage()

    const latency = performance.now() - startTime
    expect(latency).toBeLessThan(50)
  })

  it('should handle 100+ concurrent operations', async () => {
    const operations = Array.from({ length: 100 }, (_, i) => ({
      type: 'create',
      nodeType: 'FUNC',
      data: { Name: `Func${i}`, Descr: '...' }
    }))

    const startTime = performance.now()
    await executor.executeOperations(operations, 'user-1')
    const duration = performance.now() - startTime

    // Should complete in <1 second
    expect(duration).toBeLessThan(1000)
  })
})
```

## Rollout Plan

### Phase 1: Core Infrastructure (Week 1)
- ✅ Implement `GraphOperationExecutor` Service
- ✅ Implement `CanvasContextService`
- ✅ Add Neo4j event emitters
- ✅ Unit tests

### Phase 2: WebSocket Integration (Week 2)
- ✅ Add Neo4j event listeners to WebSocket server
- ✅ Implement broadcast logic for graph updates
- ✅ Frontend: Update useGraphCanvas to handle new events
- ✅ Integration tests

### Phase 3: AI Assistant Integration (Week 3)
- ✅ Integrate CanvasContextService into AI Assistant
- ✅ Update LLM prompt construction
- ✅ Connect GraphOperationExecutor to AI Assistant
- ✅ End-to-end tests

### Phase 4: Optimization & Monitoring (Week 4)
- ✅ Implement differential updates
- ✅ Add canvas context caching
- ✅ Performance monitoring dashboard
- ✅ Load testing

## Monitoring & Metrics

### Key Metrics to Track:

1. **Latency Metrics:**
   - LLM Response Time: P50, P95, P99
   - Neo4j Write Time: Average, Max
   - WebSocket Broadcast Time: <50ms target
   - End-to-End Latency (User Request → Frontend Update)

2. **Throughput Metrics:**
   - Operations/second
   - Concurrent users
   - WebSocket messages/second

3. **Error Metrics:**
   - Operation execution failures
   - WebSocket disconnections
   - Conflict resolution failures

4. **Business Metrics:**
   - LLM-generated operations accuracy
   - User acceptance rate of LLM suggestions
   - Manual edits after LLM operations

## Appendix

### Format E Example

```
## Nodes
CargoManagement|SYS|CargoManagement.SY.001|Central cargo management system
ManageFleet|UC|ManageFleet.UC.001|Manage fleet of transport vehicles
FleetManager|ACTOR|FleetManager.AC.001|Person managing fleet operations
ValidateInput|FUNC|ValidateInput.FN.001|Validates user input data
CargoModule|MOD|CargoModule.MD.001|Cargo handling module

## Edges
CargoManagement.SY.001 -cp-> ManageFleet.UC.001
ManageFleet.UC.001 -cp-> FleetManager.AC.001
ValidateInput.FN.001 -al-> CargoModule.MD.001
```

### Operation Example

```typescript
{
  id: "op-001",
  type: "create",
  nodeType: "FUNC",
  tempId: "ValidateInput.FN.001",
  data: {
    Name: "ValidateInput",
    Descr: "Validates user input data"
  },
  dependsOn: []
}
```

---

**Status:** Ready for Implementation
**Next Steps:** Begin Phase 1 - Core Infrastructure
