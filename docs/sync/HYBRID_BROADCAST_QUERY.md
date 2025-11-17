# Hybrid Architecture: Broadcast + Query

**Version:** 2.0
**Date:** 2025-01-16
**Status:** Architecture Revision - RECOMMENDED APPROACH

## Problem mit reinem Broadcast

Die ursprüngliche Architektur (nur WebSocket Broadcast) hat Limitierungen:

```
❌ PURE BROADCAST PROBLEM:

Client muss ALLE Nodes im Memory halten:
  persistedNodes = new Map<UUID, Node>()

Bei 10.000 Nodes im Graph:
  - Client lädt alle 10.000 Nodes
  - Memory: ~50 MB
  - Initial Load: ~5 Sekunden
  - Auch wenn User nur 50 FUNC Nodes sehen will!
```

## ✅ Lösung: Hybrid Broadcast + Query

```
┌─────────────────────────────────────────────────────────┐
│  HYBRID ARCHITECTURE                                     │
└─────────────────────────────────────────────────────────┘

CLIENT entscheidet:

  ┌──────────────────┐         ┌────────────────────┐
  │  QUERY/PULL      │         │  BROADCAST/PUSH    │
  │  (GraphQL/REST)  │         │  (WebSocket)       │
  └────────┬─────────┘         └─────────┬──────────┘
           │                             │
           │ On-Demand                   │ Real-time
           │ Full Data                   │ Diffs/Events
           │                             │
           ▼                             ▼
    ┌──────────────┐            ┌──────────────┐
    │ Initial Load │            │ Live Updates │
    │ Filter Query │            │ Commands     │
    │ Deep Fetch   │            │ Events       │
    │ Delta Sync   │            │ Presence     │
    └──────────────┘            └──────────────┘
           │                             │
           └─────────────┬───────────────┘
                         ▼
                 ┌──────────────┐
                 │    NEO4J     │
                 └──────────────┘
```

---

## Architektur-Komponenten

### 1. GraphQL/REST Query API ⭐ NEW

**Endpoint:** `POST /api/graphql` oder `GET /api/nodes`

**Capabilities:**
- Initial data loading
- Complex filtering
- Pagination
- Deep relationship traversal
- Delta sync (changes since version X)

**GraphQL Schema:**

```graphql
type Query {
  # Get nodes with filtering
  nodes(
    filter: NodeFilter
    limit: Int = 100
    offset: Int = 0
  ): [OntologyNode!]!

  # Get single node with all relationships
  node(uuid: ID!): NodeWithRelationships

  # Get changes since version
  changesSince(version: Int!): GraphChanges!

  # Get graph statistics
  stats(filter: NodeFilter): GraphStats!
}

input NodeFilter {
  types: [NodeType!]
  relationTypes: [RelationType!]
  nameContains: String
  validationStatus: ValidationStatus
  createdAfter: DateTime
  selectedOnly: Boolean
}

type OntologyNode {
  uuid: ID!
  type: NodeType!
  properties: NodeProperties!
  createdAt: DateTime!
  updatedAt: DateTime!
  version: Int!
}

type NodeWithRelationships {
  node: OntologyNode!
  incoming: [Relationship!]!
  outgoing: [Relationship!]!
  connectedNodes: [OntologyNode!]!
}

type GraphChanges {
  version: Int!
  nodes: [NodeChange!]!
  relationships: [RelationshipChange!]!
}

type NodeChange {
  uuid: ID!
  changeType: ChangeType!  # CREATED, UPDATED, DELETED
  node: OntologyNode
  diff: [FieldDiff!]
}
```

**REST Alternative:**

```
GET  /api/nodes?type=FUNC&limit=50
GET  /api/nodes/:uuid
GET  /api/nodes/:uuid/relationships
GET  /api/changes?since=version-42
POST /api/nodes/query  (complex filters in body)
```

---

### 2. WebSocket Broadcast (Enhanced)

**Message Types:**

#### 2a. Commands (User Actions)

```typescript
{
  type: 'command:node-move',
  nodeId: 'uuid-123',
  position: { x: 100, y: 200 },
  userId: 'user-1',
  timestamp: 1234567890
}

{
  type: 'command:node-edit',
  nodeId: 'uuid-123',
  field: 'Name',
  value: 'ParseUserInput',
  userId: 'user-1'
}
```

#### 2b. Diffs (Incremental Changes)

```typescript
{
  type: 'diff:node-updated',
  nodeId: 'uuid-123',
  version: 43,
  diffs: [
    {
      path: ['properties', 'Name'],
      op: 'replace',
      oldValue: 'ParseInput',
      newValue: 'ParseUserInput'
    }
  ],
  userId: 'user-1',
  timestamp: 1234567890
}
```

#### 2c. Events (LLM Operations, Bulk Changes)

```typescript
{
  type: 'event:nodes-created',
  nodeIds: ['uuid-456', 'uuid-789', 'uuid-012'],
  summary: '3 functions created by LLM',
  userId: 'user-1',
  timestamp: 1234567890,
  // Optional: minimal node data for quick preview
  preview: [
    { uuid: 'uuid-456', type: 'FUNC', Name: 'ValidateInput' },
    { uuid: 'uuid-789', type: 'FUNC', Name: 'ProcessData' },
    { uuid: 'uuid-012', type: 'FUNC', Name: 'SaveResult' }
  ]
}
```

#### 2d. Subscriptions (Selective Listening)

```typescript
// Client subscribes only to relevant events
ws.send({
  type: 'subscribe',
  filters: {
    nodeTypes: ['FUNC', 'REQ'],  // Only FUNC and REQ updates
    userId: 'exclude-self'        // Ignore own updates
  }
})
```

---

## Client-Side Implementation

### Hybrid State Manager

```typescript
class HybridGraphStateManager {
  // Query API client
  private api: GraphQLClient

  // WebSocket client
  private ws: WebSocket

  // Local cache (only what's needed)
  private localCache = new Map<UUID, OntologyNode>()
  private localRelationships = new Map<UUID, OntologyRelationship>()

  // Current filter state
  private currentFilter: NodeFilter = {}

  // Sync version tracking
  private lastSyncVersion = 0

  /**
   * PHASE 1: Initial Load via Query API
   */
  async initialize(filter: NodeFilter): Promise<void> {
    console.log('[HybridGraph] Initial load with filter:', filter)

    // 1. Query initial data
    const result = await this.api.query({
      query: GET_FILTERED_NODES,
      variables: { filter, limit: 100 }
    })

    // 2. Populate local cache
    result.data.nodes.forEach(node => {
      this.localCache.set(node.uuid, node)
    })

    this.lastSyncVersion = result.data.version
    this.currentFilter = filter

    console.log(`[HybridGraph] Loaded ${this.localCache.size} nodes`)

    // 3. Connect WebSocket
    await this.connectWebSocket()

    // 4. Subscribe to updates matching filter
    this.subscribeToUpdates(filter)

    // 5. Emit initial state
    this.emitStateChanged()
  }

  /**
   * PHASE 2: Real-time Updates via WebSocket
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL)

      this.ws.onopen = () => {
        console.log('[HybridGraph] WebSocket connected')
        resolve()
      }

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        this.handleWebSocketMessage(message)
      }

      this.ws.onerror = reject
    })
  }

  private subscribeToUpdates(filter: NodeFilter): void {
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      filters: {
        nodeTypes: filter.types,
        relationTypes: filter.relationTypes
      }
    }))
  }

  private handleWebSocketMessage(message: WSMessage): void {
    switch (message.type) {
      case 'diff:node-updated':
        this.handleNodeDiff(message)
        break

      case 'event:nodes-created':
        this.handleNodesCreated(message)
        break

      case 'command:node-move':
        this.handleNodeMove(message)
        break
    }
  }

  /**
   * Handle incremental diff
   */
  private handleNodeDiff(message: NodeDiffMessage): void {
    const node = this.localCache.get(message.nodeId)

    if (!node) {
      // Node not in cache - check if matches filter
      if (this.matchesCurrentFilter(message)) {
        // Load full node data
        this.loadNode(message.nodeId)
      }
      return
    }

    // Apply diffs incrementally
    message.diffs.forEach(diff => {
      applyJsonPatch(node, diff)
    })

    this.lastSyncVersion = message.version
    this.emitNodeChanged(message.nodeId)
  }

  /**
   * Handle bulk creation event
   */
  private handleNodesCreated(message: NodesCreatedEvent): void {
    // Check if any new nodes match filter
    const relevantNodes = message.preview?.filter(n =>
      this.matchesCurrentFilter({ type: n.type })
    )

    if (relevantNodes && relevantNodes.length > 0) {
      // Load full data for relevant nodes
      this.loadNodes(relevantNodes.map(n => n.uuid))
    }
  }

  /**
   * FILTER CHANGE: Re-query via API
   */
  async applyFilter(newFilter: NodeFilter): Promise<void> {
    console.log('[HybridGraph] Applying new filter:', newFilter)

    // 1. Query with new filter
    const result = await this.api.query({
      query: GET_FILTERED_NODES,
      variables: { filter: newFilter, limit: 100 }
    })

    // 2. Clear and repopulate cache
    this.localCache.clear()
    result.data.nodes.forEach(node => {
      this.localCache.set(node.uuid, node)
    })

    // 3. Update subscription
    this.subscribeToUpdates(newFilter)

    this.currentFilter = newFilter
    this.emitStateChanged()
  }

  /**
   * ON-DEMAND LOAD: Deep fetch via API
   */
  async loadNodeWithRelationships(uuid: UUID): Promise<NodeWithRels> {
    // Check cache first
    if (this.localCache.has(uuid)) {
      const node = this.localCache.get(uuid)!
      const rels = this.getRelationshipsForNode(uuid)

      // If we have enough data, return from cache
      if (rels.length > 0) {
        return { node, relationships: rels }
      }
    }

    // Not in cache or incomplete - query API
    const result = await this.api.query({
      query: GET_NODE_WITH_RELATIONSHIPS,
      variables: { uuid }
    })

    // Update cache
    this.localCache.set(uuid, result.data.node.node)
    result.data.node.incoming.forEach(rel => {
      this.localRelationships.set(rel.uuid, rel)
    })
    result.data.node.outgoing.forEach(rel => {
      this.localRelationships.set(rel.uuid, rel)
    })

    return result.data.node
  }

  /**
   * AFTER RECONNECT: Delta sync via API
   */
  async syncAfterReconnect(): Promise<void> {
    console.log('[HybridGraph] Syncing after reconnect from version', this.lastSyncVersion)

    // Query only changes since last sync
    const result = await this.api.query({
      query: GET_CHANGES_SINCE,
      variables: { version: this.lastSyncVersion }
    })

    const changes = result.data.changesSince

    // Apply changes incrementally
    changes.nodes.forEach(change => {
      switch (change.changeType) {
        case 'CREATED':
          if (this.matchesCurrentFilter(change.node)) {
            this.localCache.set(change.node.uuid, change.node)
          }
          break

        case 'UPDATED':
          const node = this.localCache.get(change.uuid)
          if (node) {
            change.diff.forEach(diff => applyJsonPatch(node, diff))
          }
          break

        case 'DELETED':
          this.localCache.delete(change.uuid)
          break
      }
    })

    this.lastSyncVersion = changes.version
    this.emitStateChanged()

    console.log(`[HybridGraph] Synced ${changes.nodes.length} changes`)
  }

  /**
   * Helper: Check if node matches current filter
   */
  private matchesCurrentFilter(item: { type?: NodeType }): boolean {
    if (!this.currentFilter.types || this.currentFilter.types.length === 0) {
      return true
    }
    return item.type && this.currentFilter.types.includes(item.type)
  }

  /**
   * Helper: Load nodes by IDs
   */
  private async loadNodes(uuids: UUID[]): Promise<void> {
    const result = await this.api.query({
      query: GET_NODES_BY_IDS,
      variables: { uuids }
    })

    result.data.nodes.forEach(node => {
      this.localCache.set(node.uuid, node)
    })

    this.emitStateChanged()
  }

  /**
   * Get current state (for React)
   */
  getState(): GraphData {
    return {
      nodes: Array.from(this.localCache.values()),
      relationships: Array.from(this.localRelationships.values()),
      version: this.lastSyncVersion
    }
  }
}
```

---

## Backend Implementation

### GraphQL Resolver

```typescript
class GraphQLResolver {
  constructor(
    private neo4j: Neo4jService,
    private changeLog: ChangeLogService
  ) {}

  /**
   * Query: Get filtered nodes
   */
  async nodes(
    parent: any,
    args: { filter?: NodeFilter; limit?: number; offset?: number }
  ): Promise<OntologyNode[]> {
    const { filter = {}, limit = 100, offset = 0 } = args

    // Build Cypher query
    const cypherFilter = this.buildCypherFilter(filter)

    const result = await this.neo4j.run(`
      MATCH (n:OntologyNode)
      ${cypherFilter.where}
      RETURN n
      ORDER BY n.createdAt DESC
      SKIP $offset
      LIMIT $limit
    `, {
      ...cypherFilter.params,
      offset,
      limit
    })

    return result.records.map(r => this.mapNode(r.get('n')))
  }

  /**
   * Query: Get node with relationships
   */
  async node(
    parent: any,
    args: { uuid: string }
  ): Promise<NodeWithRelationships> {
    const result = await this.neo4j.run(`
      MATCH (n:OntologyNode {uuid: $uuid})
      OPTIONAL MATCH (n)-[r_out]->(target)
      OPTIONAL MATCH (source)-[r_in]->(n)
      RETURN n,
             collect(DISTINCT r_out) as outgoing,
             collect(DISTINCT r_in) as incoming,
             collect(DISTINCT target) as targets,
             collect(DISTINCT source) as sources
    `, { uuid: args.uuid })

    const record = result.records[0]

    return {
      node: this.mapNode(record.get('n')),
      outgoing: record.get('outgoing').map(r => this.mapRelationship(r)),
      incoming: record.get('incoming').map(r => this.mapRelationship(r)),
      connectedNodes: [
        ...record.get('targets').map(n => this.mapNode(n)),
        ...record.get('sources').map(n => this.mapNode(n))
      ]
    }
  }

  /**
   * Query: Get changes since version
   */
  async changesSince(
    parent: any,
    args: { version: number }
  ): Promise<GraphChanges> {
    // Get changes from changelog
    const changes = await this.changeLog.getChangesSince(args.version)

    return {
      version: this.changeLog.getCurrentVersion(),
      nodes: changes.nodes.map(c => ({
        uuid: c.nodeId,
        changeType: c.type,
        node: c.type === 'DELETED' ? null : c.node,
        diff: c.diff
      })),
      relationships: changes.relationships
    }
  }

  /**
   * Helper: Build Cypher filter
   */
  private buildCypherFilter(filter: NodeFilter): {
    where: string
    params: Record<string, any>
  } {
    const conditions: string[] = []
    const params: Record<string, any> = {}

    if (filter.types && filter.types.length > 0) {
      conditions.push('n.type IN $types')
      params.types = filter.types
    }

    if (filter.nameContains) {
      conditions.push('n.Name CONTAINS $nameContains')
      params.nameContains = filter.nameContains
    }

    if (filter.createdAfter) {
      conditions.push('n.createdAt > datetime($createdAfter)')
      params.createdAfter = filter.createdAfter
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    return { where, params }
  }
}
```

### Change Log Service ⭐ NEW

```typescript
/**
 * Tracks all graph changes for delta sync
 */
class ChangeLogService {
  private currentVersion = 0
  private changes: Change[] = []
  private readonly MAX_CHANGES = 10000  // Keep last 10k changes

  /**
   * Record a change
   */
  recordChange(change: Change): void {
    this.currentVersion++

    this.changes.push({
      ...change,
      version: this.currentVersion,
      timestamp: Date.now()
    })

    // Trim old changes
    if (this.changes.length > this.MAX_CHANGES) {
      this.changes = this.changes.slice(-this.MAX_CHANGES)
    }
  }

  /**
   * Get changes since version
   */
  getChangesSince(version: number): ChangeSet {
    const relevantChanges = this.changes.filter(c => c.version > version)

    return {
      nodes: relevantChanges.filter(c => c.entityType === 'node'),
      relationships: relevantChanges.filter(c => c.entityType === 'relationship')
    }
  }

  getCurrentVersion(): number {
    return this.currentVersion
  }
}

interface Change {
  version: number
  timestamp: number
  entityType: 'node' | 'relationship'
  changeType: 'CREATED' | 'UPDATED' | 'DELETED'
  nodeId: UUID
  node?: OntologyNode
  diff?: FieldDiff[]
  userId: string
}
```

---

## Use Case Examples

### Use Case 1: Initial Load with Filter

```typescript
// User opens app, wants to see only FUNC nodes

const stateManager = new HybridGraphStateManager()

await stateManager.initialize({
  types: ['FUNC'],
  limit: 50
})

// Result:
// - Query API: 50 FUNC nodes loaded
// - Client Memory: 50 nodes (~2 KB)
// - WebSocket: Subscribed to FUNC updates only
// - Load Time: ~200ms

// vs Pure Broadcast:
// - Load ALL 10,000 nodes
// - Client Memory: 10,000 nodes (~500 KB)
// - Load Time: ~5 seconds
```

### Use Case 2: User Changes Filter

```typescript
// User clicks "Show only REQ nodes"

await stateManager.applyFilter({
  types: ['REQ'],
  limit: 50
})

// Result:
// - Query API: 50 REQ nodes
// - Client clears cache, loads new data
// - WebSocket: Re-subscribe to REQ updates
// - Time: ~100ms
```

### Use Case 3: LLM Creates Nodes

```typescript
// LLM creates 5 new FUNC nodes

// Backend:
1. GraphOperationExecutor creates nodes in Neo4j
2. ChangeLog.recordChange() for each node
3. WebSocket broadcast:
   {
     type: 'event:nodes-created',
     nodeIds: ['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4', 'uuid-5'],
     preview: [
       { uuid: 'uuid-1', type: 'FUNC', Name: 'ParseInput' },
       ...
     ]
   }

// Client:
1. Receives event
2. Checks: preview nodes match filter? (type: FUNC) ✅
3. Loads full data: await loadNodes(['uuid-1', ..., 'uuid-5'])
4. Updates cache and UI
```

### Use Case 4: User Expands Node (Deep Fetch)

```typescript
// User clicks on node to see all relationships

const nodeWithRels = await stateManager.loadNodeWithRelationships('uuid-123')

// Result:
// - Query API: GET /graphql { node(uuid: "uuid-123") { ... relationships } }
// - Loads: Node + all incoming + all outgoing + connected nodes
// - Caches: All fetched data
// - Time: ~150ms

// Future clicks on same node: served from cache (<1ms)
```

### Use Case 5: Reconnect After Disconnect

```typescript
// WebSocket disconnects for 2 minutes
// User continues working offline (optimistic updates)
// WebSocket reconnects

await stateManager.syncAfterReconnect()

// Backend query:
// GET /graphql { changesSince(version: 42) }

// Returns:
// {
//   version: 58,
//   nodes: [
//     { uuid: 'uuid-123', changeType: 'UPDATED', diff: [...] },
//     { uuid: 'uuid-456', changeType: 'CREATED', node: {...} },
//     { uuid: 'uuid-789', changeType: 'DELETED' }
//   ]
// }

// Client applies 16 changes incrementally
// Result: Fully synced in ~300ms
```

---

## Performance Comparison

### Scenario: 10,000 nodes in database, user wants to see 50 FUNC nodes

| Metric | Pure Broadcast | Hybrid (Broadcast + Query) | Improvement |
|--------|----------------|---------------------------|-------------|
| **Initial Load** | 10,000 nodes | 50 nodes | **200x less data** |
| **Load Time** | ~5 seconds | ~200ms | **25x faster** |
| **Client Memory** | ~500 KB | ~2.5 KB | **200x less memory** |
| **Network Transfer** | ~500 KB | ~2.5 KB | **200x less bandwidth** |
| **Filter Change** | Client-side filter (~50ms) | New query (~100ms) | Comparable |
| **Real-time Update** | <50ms | <50ms | Same |
| **Reconnect Sync** | Re-load all 10,000 | Delta sync (~300ms) | **16x faster** |

### Scenario: Large graph with 100,000 nodes

| Metric | Pure Broadcast | Hybrid | Improvement |
|--------|----------------|--------|-------------|
| **Initial Load** | 100,000 nodes | 100 nodes | **1000x less** |
| **Load Time** | ~30 seconds | ~300ms | **100x faster** |
| **Client Memory** | ~5 MB | ~5 KB | **1000x less** |
| **Network** | ~5 MB | ~5 KB | **1000x less** |

---

## Implementation Roadmap

### Phase 1: GraphQL API (Week 1)

- [ ] GraphQL schema definition
- [ ] Resolver implementation
- [ ] ChangeLog service
- [ ] Query optimization (indexes)
- [ ] Pagination support

### Phase 2: Enhanced WebSocket (Week 2)

- [ ] Command/Diff/Event message types
- [ ] Selective subscriptions
- [ ] Filter-based broadcasting
- [ ] Connection management

### Phase 3: Hybrid Client (Week 3)

- [ ] HybridGraphStateManager
- [ ] Query API integration
- [ ] WebSocket integration
- [ ] Cache management
- [ ] Delta sync logic

### Phase 4: Testing & Optimization (Week 4)

- [ ] Load testing (100k+ nodes)
- [ ] Reconnection testing
- [ ] Memory profiling
- [ ] Query optimization
- [ ] Cache strategy tuning

---

## Migration from Pure Broadcast

**Backward Compatible:**

```typescript
// Old code (pure broadcast) still works:
const stateManager = new GraphStateManager()
await stateManager.initialize()  // Loads everything via WebSocket

// New code (hybrid):
const hybridManager = new HybridGraphStateManager()
await hybridManager.initialize({ types: ['FUNC'] })  // Loads only FUNC via Query
```

**Migration Strategy:**

1. Week 1: Implement GraphQL API alongside WebSocket
2. Week 2: Add HybridGraphStateManager as alternative
3. Week 3: Update frontend to use hybrid by default
4. Week 4: Monitor performance, optimize
5. Week 5: Deprecate pure broadcast mode (optional)

---

## Monitoring

### Key Metrics:

```typescript
// Query API metrics
graphql_query_duration_ms{query="nodes"}
graphql_query_result_size{query="nodes"}
graphql_cache_hit_rate

// WebSocket metrics
websocket_message_rate{type="diff"}
websocket_message_rate{type="command"}
websocket_message_rate{type="event"}
websocket_subscription_count

// Client metrics
client_cache_size_bytes
client_cache_hit_rate
client_query_count_per_session
client_sync_duration_ms
```

---

## Summary

**Hybrid Broadcast + Query is the recommended architecture:**

✅ **Best of Both Worlds:**
- Query API: Efficient, filtered loading
- WebSocket: Real-time updates

✅ **Scalability:**
- Handles 100k+ nodes
- Client only loads what's needed
- Minimal memory footprint

✅ **Performance:**
- 100x faster initial load
- 1000x less memory
- <50ms real-time updates

✅ **Features:**
- Complex filtering
- Deep relationship fetching
- Delta sync after reconnect
- Selective subscriptions

**Recommended for production deployment!** 🚀
