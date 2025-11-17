# Vereinfachte Architektur: Canvas-Centric Model

**Version:** 3.0 - SIMPLIFIED
**Date:** 2025-01-16
**Status:** Architecture Simplification - RECOMMENDED

## Kernprinzip: Canvas als selbst-verantwortliche Blöcke

```
┌─────────────────────────────────────────────────────────────┐
│                     AKTEURE                                  │
│                                                              │
│         USER                        LLM(s)                  │
│          │                            │                     │
│          │  Interaktion               │  Generierung        │
│          ↓                            ↓                     │
└──────────┼────────────────────────────┼─────────────────────┘
           │                            │
           │                            │
┌──────────┼────────────────────────────┼─────────────────────┐
│          ↓                            ↓                     │
│    ┌─────────────────────────────────────────────┐          │
│    │           CANVAS = KONTEXT                  │          │
│    │  (Self-managed, Neo4j-aware)               │          │
│    └─────────────────────────────────────────────┘          │
│                                                              │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│    │  ChatCanvas  │  │ GraphCanvas  │  │  TextView    │    │
│    │              │  │              │  │              │    │
│    │ • Context    │  │ • Context    │  │ • Context    │    │
│    │ • Neo4j Sync │  │ • Neo4j Sync │  │ • Neo4j Sync │    │
│    │ • View Logic │  │ • View Logic │  │ • View Logic │    │
│    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│           │                 │                 │             │
│           │    Query/Diff   │   Cypher/Diff   │   Query     │
│           ↓                 ↓                 ↓             │
└───────────┼─────────────────┼─────────────────┼─────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ↓
                    ┌──────────────────┐
                    │      NEO4J       │
                    │  (Projekt-Welt)  │
                    │   Persistenz     │
                    └──────────────────┘
```

## Funktionale Blöcke

### 1. Akteure (Outside System)

**USER:**
- Interagiert mit Canvas
- Ändert Graph (drag & drop, edit)
- Stellt Fragen

**LLM(s):**
- Generiert Operations
- Liest Canvas Context
- Schreibt in Canvas

### 2. Canvas = Self-Managed Context Blöcke

Jeder Canvas ist **selbst-verantwortlich** für:

#### 2.1 ChatCanvas

```typescript
class ChatCanvas {
  // LOCAL CONTEXT
  private messages: ChatMessage[]
  private conversationHistory: ConversationContext

  // NEO4J MANAGEMENT
  async loadHistory(): Promise<void> {
    // Entscheidet selbst: Query für Conversation History
    this.messages = await neo4j.query(`
      MATCH (m:Message {sessionId: $sessionId})
      RETURN m ORDER BY m.timestamp
    `)
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    // Entscheidet selbst: Cypher CREATE
    await neo4j.run(`
      CREATE (m:Message {
        id: $id,
        content: $content,
        timestamp: datetime()
      })
    `)
  }

  // VIEW LOGIC
  render(): JSX.Element {
    return <ChatView messages={this.messages} />
  }
}
```

**Verantwortlichkeiten:**
- Context: Chat History
- Neo4j: Conversation Messages (optional)
- View: Message List

#### 2.2 GraphCanvas

```typescript
class GraphCanvas {
  // LOCAL CONTEXT
  private nodes: Map<UUID, GraphNode>  // Cytoscape format
  private edges: Map<UUID, GraphEdge>
  private virtualNodes: Map<string, VirtualNode>  // Frontend-only
  private filters: GraphFilters
  private viewport: Viewport

  // NEO4J MANAGEMENT
  async loadGraph(filter?: NodeFilter): Promise<void> {
    // Entscheidet selbst: Query vs. Cypher
    if (filter) {
      // Filtered query
      const result = await neo4j.query(`
        MATCH (n:OntologyNode)
        WHERE n.type IN $types
        RETURN n
        LIMIT 100
      `, { types: filter.types })

      this.nodes = this.transformToCytoscape(result)
    } else {
      // Full graph (if small)
      const result = await neo4j.getAllNodes()
      this.nodes = this.transformToCytoscape(result)
    }
  }

  async syncNodePosition(nodeId: UUID, position: Position): Promise<void> {
    // Entscheidet selbst: Property Update
    await neo4j.run(`
      MATCH (n:OntologyNode {uuid: $nodeId})
      SET n.position = $position
    `, { nodeId, position })
  }

  async applyLLMOperations(operations: Operation[]): Promise<void> {
    // Entscheidet selbst: Cypher für CREATE/UPDATE/DELETE
    for (const op of operations) {
      switch (op.type) {
        case 'create':
          await neo4j.run(`
            CREATE (n:OntologyNode {
              uuid: $uuid,
              type: $type,
              Name: $name,
              Descr: $descr
            })
          `, op.data)

          // Update local cache
          this.nodes.set(op.data.uuid, this.toGraphNode(op.data))
          break

        // ... UPDATE, DELETE
      }
    }
  }

  // TRANSFORMATION LOGIC (Canvas-specific)
  private transformToCytoscape(nodes: OntologyNode[]): Map<UUID, GraphNode> {
    // Neo4j → Cytoscape format
    // Handles virtual nodes, positions, etc.
  }

  // VIEW LOGIC
  render(): JSX.Element {
    const cytoscapeElements = this.toCytoscapeElements()
    return <CytoscapeGraph elements={cytoscapeElements} />
  }
}
```

**Verantwortlichkeiten:**
- Context: Graph Nodes/Edges + Virtual Nodes + Filters + Viewport
- Neo4j: Cypher Queries (filtered), Property Updates, LLM Operations
- View: Cytoscape Rendering
- Transformation: Neo4j ↔ Cytoscape ↔ Virtual Nodes

#### 2.3 TextView

```typescript
class TextView {
  // LOCAL CONTEXT
  private rows: TextRow[]  // Virtual rows (with duplicates)
  private groupBy: 'type' | 'parent' | 'none'
  private filters: NodeFilter

  // NEO4J MANAGEMENT
  async loadRows(): Promise<void> {
    // Entscheidet selbst: Relationship-basierte Query
    // Kreiert virtuelle Duplikate für bessere Lesbarkeit

    const result = await neo4j.query(`
      MATCH (source)-[r]->(target)
      WHERE source.type IN $types
      RETURN source, r, target
    `, { types: this.filters.types })

    // Transform: 1 Relationship = 1 Virtual Row
    this.rows = result.map(record => ({
      id: `virtual-${record.r.uuid}`,  // Virtual!
      nodeType: record.source.type,
      name: record.source.Name,
      relationships: [{
        type: record.r.type,
        target: record.target.uuid,
        targetName: record.target.Name
      }],
      persistedUuid: record.source.uuid,  // Link to real node
      isVirtual: true
    }))
  }

  async updateRow(rowId: string, updates: Partial<TextRow>): Promise<void> {
    // Find real node UUID
    const row = this.rows.find(r => r.id === rowId)
    if (!row.persistedUuid) return

    // Update real node in Neo4j
    await neo4j.run(`
      MATCH (n:OntologyNode {uuid: $uuid})
      SET n.Name = $name, n.Descr = $descr
    `, { uuid: row.persistedUuid, ...updates })

    // Update ALL virtual rows for this node
    this.updateVirtualRows(row.persistedUuid, updates)
  }

  // VIEW LOGIC
  render(): JSX.Element {
    return <Table rows={this.rows} />
  }
}
```

**Verantwortlichkeiten:**
- Context: Virtual Rows (mit Duplikaten)
- Neo4j: Relationship Queries, Node Updates
- View: Table Rendering
- Transformation: Neo4j Relationships → Virtual Rows

### 3. Neo4j = Projekt-Welt (Persistence)

**Single Responsibility:** Persistenter Speicher

- Ontology Nodes
- Relationships
- Properties
- Version History (optional)

**KEINE Business Logic!** Canvas entscheiden wie sie Neo4j nutzen.

---

## Vorteile dieser Architektur

### ✅ 1. Klare Verantwortlichkeiten

```
ChatCanvas:    Chat History Management
GraphCanvas:   Graph Visualization + Cytoscape Logic
TextView:      Virtual Rows + Aggregation Logic
```

Jeder Canvas **weiß selbst**:
- Was er braucht
- Wie er es lädt (Query vs. Cypher)
- Wie er es transformiert (Neo4j → View Format)

### ✅ 2. Keine zentrale Synchronisation nötig

**Problem mit zentralem Sync:**
```
❌ Central Sync Service
  ├─ GraphOperationExecutor
  ├─ ChangeLog Service
  ├─ WebSocket Broadcaster
  └─ Transformation Logic

  → Komplexe Koordination
  → Tight Coupling
```

**Canvas-Centric Lösung:**
```
✅ Each Canvas Self-Manages
  GraphCanvas: Lädt/Updated direkt Neo4j
  TextView:    Lädt/Updated direkt Neo4j

  → Kein Sync Service nötig
  → Loose Coupling
```

### ✅ 3. Optimierungen pro Canvas

Jeder Canvas kann **eigene Strategie** wählen:

**GraphCanvas:**
- Kleine Graphen: Load full graph
- Große Graphen: Filtered queries + virtualization
- Real-time: WebSocket für concurrent edits (optional)

**TextView:**
- Immer: Relationship-based queries (virtual duplicates)
- Grouping: Aggregation in query

**ChatCanvas:**
- Simple: Load last 50 messages
- Advanced: Pagination, infinite scroll

### ✅ 4. User + LLM = Gleichberechtigte Akteure

```
USER → GraphCanvas.updateNode(...)
                   ↓
                Neo4j.updateNode(...)

LLM → GraphCanvas.applyOperations([...])
                  ↓
               Neo4j.createNodes(...)
```

Beide nutzen **dieselbe Canvas-API**!

### ✅ 5. Skalierung

Canvas können **unabhängig** skalieren:

- GraphCanvas: Lazy loading, virtualization
- TextView: Pagination
- ChatCanvas: Simple history

---

## Kommunikationsflüsse

### Flow 1: User Edit → Neo4j

```
1. User drags node in GraphCanvas
   ↓
2. GraphCanvas.handleNodeMove(nodeId, position)
   ↓
3. GraphCanvas.syncNodePosition(nodeId, position)
   ├─ Optimistic: Update local this.nodes
   └─ Persist: neo4j.run("MATCH ... SET n.position = ...")
   ↓
4. GraphCanvas.render()
```

**Kein externer Sync!** GraphCanvas managed alles selbst.

### Flow 2: LLM Operations → Neo4j

```
1. User: "Add function ParseInput"
   ↓
2. LLM generates Operations
   ↓
3. GraphCanvas.applyLLMOperations(operations)
   ├─ For each operation:
   │   ├─ neo4j.run("CREATE ...")
   │   └─ Update local this.nodes
   ↓
4. GraphCanvas.render()
```

**Kein GraphOperationExecutor!** GraphCanvas macht es selbst.

### Flow 3: Filter Change → Reload

```
1. User: "Show only FUNC nodes"
   ↓
2. GraphCanvas.applyFilter({ types: ['FUNC'] })
   ↓
3. GraphCanvas.loadGraph(filter)
   ├─ neo4j.query("MATCH ... WHERE type IN ...")
   ├─ Clear this.nodes
   └─ Load new filtered nodes
   ↓
4. GraphCanvas.render()
```

**Kein Query API Service!** GraphCanvas macht direkte Neo4j Query.

### Flow 4: Multi-User (Optional)

Falls **concurrent editing** gewünscht:

```
GraphCanvas kann OPTIONAL WebSocket hinzufügen:

1. User A edits node
   ↓
2. GraphCanvas.syncNodePosition(...)
   ├─ neo4j.run(...)
   └─ ws.broadcast({ type: 'node-moved', nodeId, position })
   ↓
3. User B's GraphCanvas receives broadcast
   ↓
4. GraphCanvas.handleRemoteUpdate(update)
   ├─ Update local this.nodes
   └─ render()
```

Aber: **WebSocket ist optional**, nicht zentral!

---

## Canvas Context für LLM

Jeder Canvas kann **seinen Context serialisieren**:

```typescript
class GraphCanvas {
  serializeContext(): string {
    // Canvas entscheidet selbst wie er serialisiert
    const nodes = Array.from(this.nodes.values())
    const formatE = graphSerializer.toFormatE(nodes)

    return `
## GraphCanvas Context
**Nodes:** ${nodes.length}
**Filters:** ${this.filters.types.join(', ')}
**Selected:** ${this.selectedNodes.join(', ')}

${formatE}
    `
  }
}

class TextView {
  serializeContext(): string {
    return `
## TextView Context
**Rows:** ${this.rows.length}
**Grouped by:** ${this.groupBy}

${this.rows.map(r => `${r.name} → ${r.relationships.map(rel => rel.targetName).join(', ')}`).join('\n')}
    `
  }
}

// LLM Request
const llmPrompt = `
${chatCanvas.serializeContext()}
${graphCanvas.serializeContext()}
${textView.serializeContext()}

User Request: ${userMessage}
`
```

**Kein CanvasContextService!** Jeder Canvas serialisiert sich selbst.

---

## Vereinfachtes Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────┐
│                    AKTEURE                               │
│                                                          │
│     USER                           LLM                  │
│      │                              │                   │
│      │    Interaktion               │  Generierung      │
│      │                              │                   │
└──────┼──────────────────────────────┼───────────────────┘
       │                              │
       │                              │
       ↓                              ↓
┌─────────────────────────────────────────────────────────┐
│               CANVAS (Self-Managed)                      │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ChatCanvas   │  │GraphCanvas  │  │ TextView    │     │
│  │             │  │             │  │             │     │
│  │• Messages   │  │• Nodes/Edges│  │• Virtual    │     │
│  │• History    │  │• Cytoscape  │  │  Rows       │     │
│  │             │  │• Filters    │  │• Grouping   │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │            │
│         │  Neo4j Query   │  Neo4j Cypher  │  Neo4j     │
│         │  (Optional)    │  (Direct)      │  Query     │
│         │                │                │            │
└─────────┼────────────────┼────────────────┼────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           ↓
                  ┌─────────────────┐
                  │     NEO4J       │
                  │ (Projekt-Welt)  │
                  │                 │
                  │ • Nodes         │
                  │ • Relationships │
                  │ • Properties    │
                  └─────────────────┘
```

**3 Schichten, klare Verantwortlichkeiten:**

1. **Akteure:** USER + LLM (outside system)
2. **Canvas:** Self-managed Context Blöcke
3. **Neo4j:** Persistente Projekt-Welt

**KEIN zentraler Sync Service!**

---

## Implementation

### GraphCanvas Beispiel (vollständig)

```typescript
interface GraphCanvasProps {
  sessionId: string
  userId: string
}

class GraphCanvas extends React.Component<GraphCanvasProps> {
  // LOCAL STATE
  private nodes = new Map<UUID, GraphNode>()
  private edges = new Map<UUID, GraphEdge>()
  private virtualNodes = new Map<string, VirtualNode>()
  private filters: GraphFilters = { types: [] }
  private cytoscape: Core | null = null

  // NEO4J CLIENT
  private neo4j: Neo4jService

  // WEBSOCKET (optional, for multi-user)
  private ws: WebSocket | null = null

  constructor(props: GraphCanvasProps) {
    super(props)
    this.neo4j = new Neo4jService(NEO4J_CONFIG)
  }

  async componentDidMount() {
    // Initial load
    await this.loadGraph()

    // Optional: Connect WebSocket for multi-user
    if (ENABLE_COLLABORATION) {
      this.connectWebSocket()
    }
  }

  /**
   * LOAD from Neo4j
   */
  async loadGraph(filter?: NodeFilter): Promise<void> {
    // Canvas decides: Use Cypher query
    const cypherQuery = filter
      ? `MATCH (n:OntologyNode) WHERE n.type IN $types RETURN n LIMIT 100`
      : `MATCH (n:OntologyNode) RETURN n`

    const result = await this.neo4j.run(cypherQuery, { types: filter?.types })

    // Transform: Neo4j → Cytoscape
    result.records.forEach(record => {
      const node = record.get('n').properties
      this.nodes.set(node.uuid, {
        id: node.uuid,
        type: node.type,
        label: node.Name,
        position: node.position || { x: 0, y: 0 },
        data: node
      })
    })

    // Load relationships
    await this.loadEdges()

    // Re-render
    this.setState({ loaded: true })
  }

  /**
   * UPDATE in Neo4j
   */
  async updateNodePosition(nodeId: UUID, position: Position): Promise<void> {
    // Optimistic update
    const node = this.nodes.get(nodeId)
    if (node) {
      node.position = position
      this.forceUpdate()
    }

    // Persist to Neo4j
    await this.neo4j.run(`
      MATCH (n:OntologyNode {uuid: $nodeId})
      SET n.position = $position
    `, { nodeId, position })

    // Optional: Broadcast to other users
    if (this.ws) {
      this.ws.send(JSON.stringify({
        type: 'node-moved',
        nodeId,
        position
      }))
    }
  }

  /**
   * APPLY LLM Operations
   */
  async applyLLMOperations(operations: Operation[]): Promise<void> {
    for (const op of operations) {
      switch (op.type) {
        case 'create':
          // Create in Neo4j
          const uuid = await this.neo4j.createNode(
            op.nodeType!,
            { Name: op.data.Name, Descr: op.data.Descr }
          )

          // Update local state
          this.nodes.set(uuid, {
            id: uuid,
            type: op.nodeType!,
            label: op.data.Name,
            position: { x: 0, y: 0 },
            data: op.data
          })
          break

        case 'update':
          await this.neo4j.updateNode(op.data.uuid, op.data)
          // Update local...
          break

        case 'delete':
          await this.neo4j.deleteNode(op.data.uuid)
          this.nodes.delete(op.data.uuid)
          break
      }
    }

    this.forceUpdate()
  }

  /**
   * SERIALIZE Context for LLM
   */
  serializeContext(): string {
    const nodes = Array.from(this.nodes.values())
    const formatE = this.toFormatE(nodes)

    return `## GraphCanvas Context
**Nodes:** ${nodes.length}
**Filters:** ${this.filters.types.join(', ') || 'None'}
**Selected:** ${this.getSelectedNodeIds().join(', ') || 'None'}

${formatE}
`
  }

  /**
   * RENDER
   */
  render() {
    const elements = this.toCytoscapeElements()

    return (
      <div>
        <GraphToolbar onFilterChange={this.applyFilter} />
        <CytoscapeGraph
          elements={elements}
          onNodeMove={this.updateNodePosition}
        />
      </div>
    )
  }

  // ... Helper methods for transformation, etc.
}
```

**Alles in EINEM Canvas!**
- Neo4j Management ✅
- Local State ✅
- Transformation Logic ✅
- View Rendering ✅
- Optional WebSocket ✅

---

## Vergleich: Alt vs. Neu

### ❌ Alte Architektur (zu komplex)

```
Frontend
  ├─ GraphCanvas (View only)
  ├─ useGraphCanvas (State only)
  └─ graph-service (Utils only)

Backend
  ├─ GraphOperationExecutor ← Central!
  ├─ ChangeLog Service ← Central!
  ├─ WebSocket Broadcaster ← Central!
  ├─ CanvasContextService ← Central!
  └─ Neo4j Service

→ 8+ Services
→ Complex coordination
→ Tight coupling
```

### ✅ Neue Architektur (einfach)

```
Canvas (Self-Managed)
  ├─ ChatCanvas
  ├─ GraphCanvas
  └─ TextView

Neo4j (Persistence)

→ 3 Canvas + 1 DB
→ No central coordination
→ Loose coupling
```

---

## Zusammenfassung

### Kernprinzipien:

1. **Canvas = Funktionale Blöcke**
   - Jeder Canvas ist selbst-verantwortlich
   - Hält lokalen Context
   - Managed Neo4j Kommunikation
   - Entscheidet eigene Strategie

2. **Keine zentrale Synchronisation**
   - Kein GraphOperationExecutor
   - Kein ChangeLog Service
   - Kein zentraler WebSocket Broadcaster
   - Kein CanvasContextService

3. **User + LLM = Akteure**
   - Beide nutzen Canvas-API
   - Gleichberechtigt

4. **Neo4j = Projekt-Welt**
   - Reine Persistenz
   - Keine Business Logic

### Vorteile:

- ✅ Einfacher
- ✅ Klare Verantwortlichkeiten
- ✅ Weniger Code
- ✅ Besser skalierbar
- ✅ Leichter zu testen

---

**Diese Architektur ist VIEL besser!** 🎯
