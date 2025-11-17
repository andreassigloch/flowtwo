# Client-Side State Management & Virtuelle Knoten

**Version:** 1.0
**Date:** 2025-01-16
**Status:** Architecture Extension

## Problem

Die WebSocket-Synchronisation sendet **persistierte Graph-Daten** (Neo4j), aber jeder Client:

1. **Verwendet unterschiedliche Datenformate:**
   - Neo4j: `{ uuid, type, properties }`
   - GraphCanvasState: `{ nodes: GraphNode[], edges: GraphEdge[] }`
   - Cytoscape: `ElementDefinition[]` (komplett anderes Schema!)
   - Text Canvas: Tabellenzeilen mit aggregierten Relationships

2. **Hat lokale, virtuelle Knoten:**
   - Beispiel: Actor "FleetManager" wird in 5 verschiedenen Use Cases verwendet
   - In Neo4j: 1 Node
   - In Text Canvas: 5 virtuelle Zeilen (für bessere Lesbarkeit)
   - Diese virtuellen Knoten dürfen NICHT nach Neo4j synchronisiert werden!

3. **Benötigt lokale UI-States:**
   - Cytoscape Layout-Positionen (x, y)
   - Selected/Highlighted States
   - Collapsed Nodes (Hierarchie)
   - Filter-States
   - Viewport (Zoom, Pan)

## Architektur-Lösung

### 1. Dual State Model

Jeder Client verwaltet **zwei getrennte States**:

```typescript
interface ClientGraphState {
  // 1. PERSISTED STATE (synchronisiert mit Neo4j)
  persisted: {
    nodes: Map<UUID, OntologyNode>        // Source of truth
    relationships: Map<UUID, OntologyRelationship>
    version: number                        // Neo4j version
  }

  // 2. LOCAL STATE (nur Frontend, nicht synchronisiert)
  local: {
    virtualNodes: Map<string, VirtualNode>  // Frontend-only nodes
    positions: Map<UUID, Position>          // Cytoscape positions
    collapsed: Set<UUID>                    // Collapsed hierarchy nodes
    highlighted: Set<UUID>                  // UI highlighting
    selected: Set<UUID>                     // User selection
    filters: GraphFilters                   // Active filters
    viewport: Viewport                      // Zoom/Pan
  }

  // 3. DERIVED STATE (computed from persisted + local)
  derived: {
    cytoscapeElements: ElementDefinition[]  // For Cytoscape
    textRows: TextRow[]                     // For Text Canvas
    stats: GraphStats                       // Statistics
  }
}
```

### 2. Virtuelle Knoten

**Definition:**
- Virtuelle Knoten sind **Frontend-only Repräsentationen** von persistierten Nodes
- Sie haben **keine UUID** (oder eine lokale temp-ID mit Präfix `virtual-`)
- Sie werden NICHT nach Neo4j synchronisiert

**Anwendungsfälle:**

#### Use Case 1: Text Canvas - Duplizierte Actors

```typescript
// Neo4j: 1 Actor Node
const actor = {
  uuid: "actor-123",
  type: "ACTOR",
  Name: "FleetManager",
  Descr: "Person managing fleet"
}

// Text Canvas: 5 virtuelle Zeilen (eine pro Use Case)
const textRows = [
  {
    id: "virtual-actor-123-uc-1",  // Virtual ID!
    nodeType: "ACTOR",
    name: "FleetManager",
    description: "Person managing fleet",
    context: "ManageFleet Use Case",
    persistedUuid: "actor-123"      // Link to real node
  },
  {
    id: "virtual-actor-123-uc-2",
    nodeType: "ACTOR",
    name: "FleetManager",
    description: "Person managing fleet",
    context: "TrackVehicles Use Case",
    persistedUuid: "actor-123"
  },
  // ... 3 more virtual rows
]
```

#### Use Case 2: Graph Canvas - Collapsed Hierarchien

```typescript
// Neo4j: 100 Function Nodes
const functions = [
  { uuid: "func-1", Name: "ParseInput", ... },
  { uuid: "func-2", Name: "ValidateData", ... },
  // ... 98 more
]

// Graph Canvas: 1 virtueller "Collapsed Group" Node
const collapsedGroup = {
  id: "virtual-group-functions",  // Virtual!
  type: "GROUP",
  label: "Functions (100)",
  isVirtual: true,
  containedNodes: ["func-1", "func-2", ..., "func-100"],
  position: { x: 100, y: 200 }
}

// User kann Group expandieren → zeigt alle 100 echten Nodes
```

#### Use Case 3: Graph Canvas - Relationship Aggregation

```typescript
// Neo4j: 50 einzelne "satisfy" Relationships
// Function-1 → REQ-1
// Function-1 → REQ-2
// ...
// Function-1 → REQ-50

// Graph Canvas: 1 virtueller "Aggregated Edge"
const aggregatedEdge = {
  id: "virtual-edge-func1-reqs",  // Virtual!
  type: "satisfy",
  source: "func-1",
  target: "virtual-group-requirements",
  label: "satisfies 50 requirements",
  isVirtual: true,
  containedEdges: ["rel-1", "rel-2", ..., "rel-50"]
}
```

### 3. Transformation Pipeline

**WebSocket Update → Client State**

```typescript
class GraphStateManager {
  // Persisted state (source of truth)
  private persistedNodes = new Map<UUID, OntologyNode>()
  private persistedRels = new Map<UUID, OntologyRelationship>()

  // Local state
  private virtualNodes = new Map<string, VirtualNode>()
  private positions = new Map<UUID, Position>()
  private cytoscapeCache: ElementDefinition[] | null = null

  /**
   * Handle incoming WebSocket update
   */
  handleWebSocketUpdate(event: GraphUpdateEvent): void {
    switch (event.type) {
      case 'node-add':
        // 1. Update persisted state
        this.persistedNodes.set(event.node.uuid, event.node)

        // 2. Invalidate derived state cache
        this.cytoscapeCache = null

        // 3. Notify React (triggers re-render)
        this.emitChange()
        break

      case 'node-update':
        // Check if update is for persisted or virtual node
        if (event.nodeId.startsWith('virtual-')) {
          // Local virtual node - ignore WebSocket update
          console.warn('Ignoring WebSocket update for virtual node:', event.nodeId)
          return
        }

        // Update persisted state
        const node = this.persistedNodes.get(event.nodeId)
        if (node) {
          this.persistedNodes.set(event.nodeId, {
            ...node,
            ...event.updates
          })
          this.cytoscapeCache = null
          this.emitChange()
        }
        break

      case 'node-delete':
        // Remove from persisted state
        this.persistedNodes.delete(event.nodeId)

        // Also remove local state
        this.positions.delete(event.nodeId)
        this.collapsed.delete(event.nodeId)

        // Remove virtual nodes that reference this node
        this.removeVirtualNodesForPersisted(event.nodeId)

        this.cytoscapeCache = null
        this.emitChange()
        break
    }
  }

  /**
   * Transform to Cytoscape format (with virtual nodes)
   */
  toCytoscapeElements(): ElementDefinition[] {
    // Check cache
    if (this.cytoscapeCache) {
      return this.cytoscapeCache
    }

    const elements: ElementDefinition[] = []

    // 1. Add persisted nodes
    this.persistedNodes.forEach((node, uuid) => {
      // Skip if collapsed
      if (this.isNodeCollapsed(uuid)) {
        return
      }

      elements.push({
        group: 'nodes',
        data: {
          id: uuid,
          type: node.type,
          Name: node.properties.Name,
          Descr: node.properties.Descr,
          isVirtual: false  // Real node
        },
        position: this.positions.get(uuid) || { x: 0, y: 0 },
        classes: [node.type]
      })
    })

    // 2. Add virtual nodes (e.g., collapsed groups)
    this.virtualNodes.forEach((vNode, id) => {
      elements.push({
        group: 'nodes',
        data: {
          id: id,
          type: vNode.type,
          Name: vNode.label,
          Descr: vNode.description,
          isVirtual: true,  // Virtual node!
          virtualType: vNode.virtualType  // 'collapsed-group', 'duplicate', etc.
        },
        position: vNode.position,
        classes: [vNode.type, 'virtual']
      })
    })

    // 3. Add edges (similar logic)
    // ...

    // Cache result
    this.cytoscapeCache = elements

    return elements
  }

  /**
   * Transform to Text Canvas rows (with virtual duplicates)
   */
  toTextRows(): TextRow[] {
    const rows: TextRow[] = []

    // Strategy: For each relationship, create a row showing the relationship context
    // This may duplicate nodes (virtual rows)

    this.persistedRels.forEach((rel) => {
      const sourceNode = this.persistedNodes.get(rel.source)
      const targetNode = this.persistedNodes.get(rel.target)

      if (!sourceNode || !targetNode) return

      // Create virtual row showing relationship
      rows.push({
        id: `virtual-rel-${rel.uuid}`,  // Virtual ID!
        nodeType: sourceNode.type,
        name: sourceNode.properties.Name,
        description: sourceNode.properties.Descr,
        relationships: [{
          type: rel.type,
          target: rel.target,
          targetName: targetNode.properties.Name
        }],
        persistedUuid: sourceNode.uuid,  // Link to real node
        isVirtual: true,
        validationStatus: 'valid',
        validationMessages: []
      })
    })

    return rows
  }
}
```

### 4. Update Strategien

#### Strategy 1: Optimistic Update with Rollback

```typescript
class OptimisticGraphUpdater {
  async updateNodePosition(nodeId: UUID, position: Position): Promise<void> {
    // 1. Check if virtual node
    if (nodeId.startsWith('virtual-')) {
      // Virtual node - only update local state, no WebSocket
      this.stateManager.setPosition(nodeId, position)
      return
    }

    // 2. Optimistic update (instant UI feedback)
    const previousPosition = this.stateManager.getPosition(nodeId)
    this.stateManager.setPosition(nodeId, position)

    try {
      // 3. Send to server
      await this.websocket.send({
        type: 'graph-update',
        payload: {
          type: 'node-update',
          nodeId,
          updates: { position }
        }
      })

      // 4. Wait for ACK (with timeout)
      await this.waitForAck(nodeId, 3000)

    } catch (error) {
      // 5. Rollback on error
      console.error('Update failed, rolling back:', error)
      this.stateManager.setPosition(nodeId, previousPosition)
    }
  }
}
```

#### Strategy 2: Merge Strategy (für concurrent updates)

```typescript
class MergeStrategy {
  mergeIncomingUpdate(
    local: GraphNode,
    remote: GraphNode
  ): GraphNode {
    // Merge strategy depends on field type

    return {
      ...local,
      // Persisted data: Always take remote (source of truth)
      uuid: remote.uuid,
      type: remote.type,
      Name: remote.Name,
      Descr: remote.Descr,

      // Local UI state: Keep local
      position: local.position,       // User's current view
      highlighted: local.highlighted, // User's selection
      selected: local.selected,

      // Conflict fields: Last-write-wins (use timestamp)
      collapsed: remote.updatedAt > local.updatedAt
        ? remote.collapsed
        : local.collapsed
    }
  }
}
```

#### Strategy 3: Differential Updates (nur Änderungen)

```typescript
class DifferentialUpdateStrategy {
  private lastSyncVersion = 0

  async syncChanges(): Promise<void> {
    // 1. Request only changes since last sync
    const changes = await this.websocket.request({
      type: 'sync-request',
      since: this.lastSyncVersion
    })

    // 2. Apply only changed nodes
    changes.nodes.forEach(node => {
      this.stateManager.updateNode(node.uuid, node)
    })

    // 3. Update version
    this.lastSyncVersion = changes.version
  }
}
```

### 5. Virtual Node Management

```typescript
interface VirtualNode {
  id: string                    // Must start with 'virtual-'
  type: 'GROUP' | 'DUPLICATE' | 'AGGREGATE'
  label: string
  description: string
  position: Position
  isVirtual: true               // Always true
  virtualType: VirtualNodeType
  metadata: {
    // Links to real nodes
    persistedNodes?: UUID[]     // For groups/aggregates
    persistedUuid?: UUID        // For duplicates

    // Virtual-specific data
    containedCount?: number     // For groups
    context?: string            // For duplicates (which context)
  }
}

type VirtualNodeType =
  | 'collapsed-group'   // Collapsed hierarchy
  | 'duplicate'         // Duplicated for readability
  | 'aggregate'         // Aggregated relationships
  | 'placeholder'       // Placeholder for loading

class VirtualNodeManager {
  /**
   * Create virtual collapsed group
   */
  createCollapsedGroup(
    containedNodes: UUID[],
    groupType: NodeType
  ): VirtualNode {
    return {
      id: `virtual-group-${groupType}-${Date.now()}`,
      type: 'GROUP',
      label: `${groupType} (${containedNodes.length})`,
      description: `Collapsed group of ${containedNodes.length} ${groupType} nodes`,
      position: this.calculateGroupCenter(containedNodes),
      isVirtual: true,
      virtualType: 'collapsed-group',
      metadata: {
        persistedNodes: containedNodes,
        containedCount: containedNodes.length
      }
    }
  }

  /**
   * Create virtual duplicate (for Text Canvas)
   */
  createDuplicate(
    persistedNode: OntologyNode,
    context: string
  ): VirtualNode {
    return {
      id: `virtual-dup-${persistedNode.uuid}-${context}`,
      type: 'DUPLICATE',
      label: persistedNode.properties.Name,
      description: persistedNode.properties.Descr,
      position: { x: 0, y: 0 },  // Not used in text canvas
      isVirtual: true,
      virtualType: 'duplicate',
      metadata: {
        persistedUuid: persistedNode.uuid,
        context
      }
    }
  }

  /**
   * Check if node is virtual
   */
  isVirtual(nodeId: string): boolean {
    return nodeId.startsWith('virtual-') || this.virtualNodes.has(nodeId)
  }

  /**
   * Get persisted UUID for virtual node
   */
  getPersistedUuid(virtualId: string): UUID | null {
    const vNode = this.virtualNodes.get(virtualId)
    return vNode?.metadata.persistedUuid || null
  }

  /**
   * Remove virtual nodes when persisted node is deleted
   */
  removeVirtualNodesForPersisted(uuid: UUID): void {
    const toRemove: string[] = []

    this.virtualNodes.forEach((vNode, id) => {
      // Check if virtual node references deleted node
      if (vNode.metadata.persistedUuid === uuid) {
        toRemove.push(id)
      } else if (vNode.metadata.persistedNodes?.includes(uuid)) {
        // Update group
        vNode.metadata.persistedNodes = vNode.metadata.persistedNodes.filter(
          n => n !== uuid
        )
        // Remove group if empty
        if (vNode.metadata.persistedNodes.length === 0) {
          toRemove.push(id)
        }
      }
    })

    toRemove.forEach(id => this.virtualNodes.delete(id))
  }
}
```

### 6. WebSocket Message Filter

**Wichtig:** Virtuelle Knoten dürfen NICHT via WebSocket synchronisiert werden!

```typescript
class WebSocketFilter {
  /**
   * Filter outgoing messages (prevent virtual node sync)
   */
  filterOutgoing(message: GraphUpdateMessage): boolean {
    // Check if update is for virtual node
    if (message.payload.nodeId?.startsWith('virtual-')) {
      console.warn('Blocking WebSocket send for virtual node:', message.payload.nodeId)
      return false  // Block message
    }

    // Check if update contains virtual node data
    if (message.payload.node?.isVirtual) {
      console.warn('Blocking WebSocket send for virtual node data')
      return false
    }

    return true  // Allow message
  }

  /**
   * Send update only if not virtual
   */
  async sendUpdate(update: GraphUpdate): Promise<void> {
    if (!this.filterOutgoing({ payload: update })) {
      return  // Silently ignore
    }

    await this.websocket.send({
      type: 'graph-update',
      payload: update,
      timestamp: Date.now()
    })
  }
}
```

## Cytoscape Integration

### 1. Cytoscape Element Definition

```typescript
interface CytoscapeElementDefinition {
  group: 'nodes' | 'edges'
  data: {
    id: string                    // UUID or virtual-xxx
    type: NodeType | RelationType
    Name: string
    Descr: string
    isVirtual: boolean            // NEW! Flag for virtual nodes
    virtualType?: VirtualNodeType // NEW! Type of virtual node
    persistedUuid?: UUID          // NEW! Link to real node
  }
  position?: { x: number; y: number }
  classes?: string[]
}
```

### 2. Position Sync Strategy

```typescript
class CytoscapePositionManager {
  private cy: Core
  private stateManager: GraphStateManager

  setupListeners(): void {
    // Listen to Cytoscape position changes
    this.cy.on('position', 'node', (event) => {
      const node = event.target
      const nodeId = node.id()
      const position = node.position()

      // Update local state
      this.stateManager.setPosition(nodeId, position)

      // Sync to server (only if not virtual)
      if (!this.stateManager.isVirtual(nodeId)) {
        this.debouncedSyncPosition(nodeId, position)
      }
    })

    // Listen to WebSocket updates
    this.stateManager.on('node-position-updated', (nodeId, position) => {
      // Update Cytoscape (if node exists)
      const node = this.cy.getElementById(nodeId)
      if (node.length > 0) {
        node.position(position)
      }
    })
  }

  /**
   * Debounced position sync (batch rapid moves)
   */
  private debouncedSyncPosition = debounce(
    async (nodeId: UUID, position: Position) => {
      await this.websocket.send({
        type: 'graph-update',
        payload: {
          type: 'node-update',
          nodeId,
          updates: { position }
        }
      })
    },
    200  // 200ms debounce
  )
}
```

### 3. Virtual Node Rendering

```typescript
class CytoscapeRenderer {
  /**
   * Update Cytoscape with current state (including virtual nodes)
   */
  render(): void {
    const elements = this.stateManager.toCytoscapeElements()

    // Clear and rebuild (or use diff for performance)
    this.cy.elements().remove()
    this.cy.add(elements)

    // Apply styles (different for virtual nodes)
    this.cy.style()
      .selector('node:not(.virtual)')
      .style({
        'background-color': '#3498db',
        'border-width': 2,
        'border-color': '#2980b9'
      })
      .selector('node.virtual')
      .style({
        'background-color': '#95a5a6',  // Gray for virtual
        'border-width': 2,
        'border-color': '#7f8c8d',
        'border-style': 'dashed',        // Dashed border
        'opacity': 0.7                   // Semi-transparent
      })
      .update()

    // Run layout (but preserve manual positions)
    this.runLayoutPreservingPositions()
  }
}
```

## Text Canvas Integration

### 1. Virtual Rows for Duplicates

```typescript
class TextCanvasRowManager {
  /**
   * Generate text rows with virtual duplicates for better readability
   */
  generateRows(): TextRow[] {
    const rows: TextRow[] = []

    // Strategy: Create one row per relationship
    // This naturally duplicates nodes that have multiple relationships

    this.stateManager.getPersistedRelationships().forEach((rel) => {
      const sourceNode = this.stateManager.getPersistedNode(rel.source)
      const targetNode = this.stateManager.getPersistedNode(rel.target)

      if (!sourceNode || !targetNode) return

      rows.push({
        id: `virtual-row-${rel.uuid}`,  // Virtual row ID
        nodeType: sourceNode.type,
        name: sourceNode.properties.Name,
        description: sourceNode.properties.Descr,
        relationships: [{
          type: rel.type,
          target: rel.target,
          targetName: targetNode.properties.Name
        }],
        persistedUuid: sourceNode.uuid,     // Link to real node
        isVirtual: true,                    // Virtual row!
        validationStatus: this.validate(sourceNode, rel),
        validationMessages: []
      })
    })

    return rows
  }

  /**
   * Handle row edit (update real node)
   */
  async handleRowEdit(rowId: string, updates: Partial<TextRow>): Promise<void> {
    // Get persisted UUID
    const row = this.rows.find(r => r.id === rowId)
    if (!row || !row.persistedUuid) {
      throw new Error('Cannot edit virtual row without persisted node')
    }

    // Update persisted node (not the virtual row)
    await this.stateManager.updateNode(row.persistedUuid, {
      Name: updates.name,
      Descr: updates.description
    })

    // All virtual rows for this node will update automatically
    // via WebSocket broadcast
  }
}
```

## Performance Optimierungen

### 1. Incremental Updates (nicht kompletter Rebuild)

```typescript
class IncrementalUpdateStrategy {
  updateNode(nodeId: UUID, updates: Partial<OntologyNode>): void {
    // 1. Update persisted state
    const node = this.persistedNodes.get(nodeId)
    if (node) {
      this.persistedNodes.set(nodeId, { ...node, ...updates })
    }

    // 2. Incremental Cytoscape update (not full rebuild)
    const cyNode = this.cy.getElementById(nodeId)
    if (cyNode.length > 0) {
      cyNode.data({
        Name: updates.properties?.Name,
        Descr: updates.properties?.Descr
      })
    }

    // 3. Update virtual nodes that reference this node
    this.updateVirtualNodesForPersisted(nodeId, updates)

    // 4. Emit change (React will re-render only affected components)
    this.emitNodeChange(nodeId)
  }

  private updateVirtualNodesForPersisted(
    uuid: UUID,
    updates: Partial<OntologyNode>
  ): void {
    // Find all virtual nodes that reference this node
    this.virtualNodes.forEach((vNode, id) => {
      if (vNode.metadata.persistedUuid === uuid) {
        // Update virtual node label/description
        vNode.label = updates.properties?.Name || vNode.label
        vNode.description = updates.properties?.Descr || vNode.description

        // Update in Cytoscape
        const cyNode = this.cy.getElementById(id)
        if (cyNode.length > 0) {
          cyNode.data({
            Name: vNode.label,
            Descr: vNode.description
          })
        }
      }
    })
  }
}
```

### 2. Virtualization (nur sichtbare Nodes rendern)

```typescript
class VirtualizationStrategy {
  private viewport: { x: number; y: number; width: number; height: number }

  /**
   * Get only visible nodes (for large graphs)
   */
  getVisibleNodes(): OntologyNode[] {
    const visibleNodes: OntologyNode[] = []

    this.persistedNodes.forEach((node, uuid) => {
      const position = this.positions.get(uuid)
      if (!position) return

      // Check if in viewport
      if (this.isInViewport(position)) {
        visibleNodes.push(node)
      }
    })

    return visibleNodes
  }

  /**
   * Lazy load nodes as user pans/zooms
   */
  onViewportChange(viewport: Viewport): void {
    this.viewport = viewport

    // Get newly visible nodes
    const visibleNodes = this.getVisibleNodes()

    // Update Cytoscape (only add/remove delta)
    this.updateCytoscapeIncremental(visibleNodes)
  }
}
```

### 3. Debouncing (batch rapid updates)

```typescript
class DebouncedUpdater {
  private pendingUpdates = new Map<UUID, Partial<OntologyNode>>()
  private updateTimer: NodeJS.Timeout | null = null

  /**
   * Queue update (debounced)
   */
  queueUpdate(nodeId: UUID, updates: Partial<OntologyNode>): void {
    // Merge with existing pending updates
    const existing = this.pendingUpdates.get(nodeId) || {}
    this.pendingUpdates.set(nodeId, { ...existing, ...updates })

    // Reset timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
    }

    // Batch updates after 100ms of inactivity
    this.updateTimer = setTimeout(() => {
      this.flushUpdates()
    }, 100)
  }

  /**
   * Flush all pending updates
   */
  private async flushUpdates(): Promise<void> {
    const updates = Array.from(this.pendingUpdates.entries())
    this.pendingUpdates.clear()

    // Send batched update
    await this.websocket.send({
      type: 'batch-update',
      payload: {
        updates: updates.map(([nodeId, data]) => ({
          nodeId,
          updates: data
        }))
      }
    })
  }
}
```

## Testing

### 1. Test Virtual Node Isolation

```typescript
describe('Virtual Node Management', () => {
  it('should not sync virtual nodes to server', async () => {
    const virtualNode = {
      id: 'virtual-group-123',
      isVirtual: true
    }

    // Try to send update
    await stateManager.updateNode(virtualNode.id, { position: { x: 100, y: 100 } })

    // Verify WebSocket was NOT called
    expect(mockWebSocket.send).not.toHaveBeenCalled()
  })

  it('should update all virtual duplicates when persisted node changes', async () => {
    // Create persisted node
    const node = { uuid: 'actor-123', Name: 'FleetManager' }

    // Create 3 virtual duplicates
    const vNode1 = virtualNodeManager.createDuplicate(node, 'UC-1')
    const vNode2 = virtualNodeManager.createDuplicate(node, 'UC-2')
    const vNode3 = virtualNodeManager.createDuplicate(node, 'UC-3')

    // Update persisted node
    await stateManager.updateNode('actor-123', { Name: 'FleetManager2' })

    // Verify all virtual duplicates updated
    expect(virtualNodes.get(vNode1.id).label).toBe('FleetManager2')
    expect(virtualNodes.get(vNode2.id).label).toBe('FleetManager2')
    expect(virtualNodes.get(vNode3.id).label).toBe('FleetManager2')
  })
})
```

### 2. Test Format Transformations

```typescript
describe('Format Transformations', () => {
  it('converts persisted state to Cytoscape format', () => {
    const elements = stateManager.toCytoscapeElements()

    expect(elements).toEqual([
      {
        group: 'nodes',
        data: {
          id: 'uuid-123',
          type: 'FUNC',
          Name: 'ParseInput',
          isVirtual: false
        },
        position: { x: 100, y: 200 }
      }
    ])
  })

  it('includes virtual nodes in Cytoscape output', () => {
    // Add virtual collapsed group
    const vNode = virtualNodeManager.createCollapsedGroup(
      ['func-1', 'func-2'],
      'FUNC'
    )

    const elements = stateManager.toCytoscapeElements()

    const virtualElement = elements.find(e => e.data.id === vNode.id)
    expect(virtualElement.data.isVirtual).toBe(true)
    expect(virtualElement.classes).toContain('virtual')
  })
})
```

## Zusammenfassung

### Dual State Model:
```
PERSISTED STATE (Neo4j synchronized)
  ├── nodes: Map<UUID, OntologyNode>
  └── relationships: Map<UUID, OntologyRelationship>

LOCAL STATE (Frontend only)
  ├── virtualNodes: Map<string, VirtualNode>
  ├── positions: Map<UUID, Position>
  ├── collapsed: Set<UUID>
  └── filters: GraphFilters

DERIVED STATE (computed)
  ├── cytoscapeElements: ElementDefinition[]
  └── textRows: TextRow[]
```

### Key Rules:

1. **Virtual Nodes:**
   - ID starts with `virtual-`
   - `isVirtual: true` flag
   - NOT sent via WebSocket
   - Link to persisted node via `persistedUuid`

2. **Transformations:**
   - Each client transforms Neo4j → local format
   - Cytoscape: `ElementDefinition[]`
   - Text Canvas: `TextRow[]` with duplicates
   - GraphCanvasState: `GraphNode[]`

3. **Updates:**
   - Optimistic: Update local immediately
   - Sync: Send to server (if not virtual)
   - Merge: Apply remote updates to persisted state
   - Cascade: Update virtual nodes that reference changed node

4. **Performance:**
   - Incremental updates (not full rebuild)
   - Debouncing (batch rapid changes)
   - Virtualization (only render visible)
   - Caching (Cytoscape elements)

---

**Status:** Architecture Complete
**Implementation Effort:** +2 weeks (on top of base sync)
