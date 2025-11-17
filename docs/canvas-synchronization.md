# Canvas Synchronization Architecture

## Overview

The AiSE Reloaded Canvas Synchronization System provides real-time, multi-user collaboration across three synchronized canvases (Chat, Text, Graph) with sub-50ms latency. The system uses WebSocket-based communication, operational transform for conflict resolution, and optimistic updates for immediate user feedback.

## System Architecture

### High-Level Design

```
┌──────────────────────────────────────────────────────────────┐
│                     Client Application                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Chat Canvas │  │ Text Canvas │  │Graph Canvas │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                 │                 │                │
│         └─────────────────┴─────────────────┘                │
│                          │                                   │
│                 ┌────────▼────────┐                          │
│                 │  Sync Engine    │                          │
│                 ├─────────────────┤                          │
│                 │ State Manager   │                          │
│                 │ Diff Algorithm  │                          │
│                 │ OT Transform    │                          │
│                 │ Optimistic Mgr  │                          │
│                 │ Presence Mgr    │                          │
│                 └────────┬────────┘                          │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │   WebSocket     │
                  └────────┬────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                     Server / Backend                          │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐         │
│  │   Neo4j     │  │ Validation   │  │   Session   │         │
│  │  Database   │  │   Agent      │  │  Manager    │         │
│  └─────────────┘  └──────────────┘  └─────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Canvas Sync Engine (`canvas-sync-engine.ts`)

**Purpose**: Central orchestrator for real-time synchronization

**Key Responsibilities**:
- WebSocket connection management
- Message routing and handling
- Operation batching and throttling
- Event emission for UI updates
- Performance monitoring

**Performance Optimizations**:
- Operation batching (default 50ms interval)
- Automatic reconnection with exponential backoff
- Heartbeat monitoring (30s interval)
- Message compression (when enabled)

**API**:
```typescript
class CanvasSyncEngine {
  connect(url: string): Promise<void>
  disconnect(): void
  applyLocalOperation(operation: Operation): void
  updateCursor(canvasType, elementId?, x?, y?): void
  getState(): CanvasState
  getPresenceList(): UserPresence[]
  getMetrics(): SyncMetrics
}
```

**Events**:
- `connected` - WebSocket connection established
- `disconnected` - WebSocket connection lost
- `state:initialized` - Initial state received
- `state:updated` - State updated from server
- `operation:applied` - Local operation applied
- `operation:confirmed` - Operation acknowledged by server
- `operation:rejected` - Operation rejected, rollback triggered
- `presence:update` - User presence changed
- `error` - Error occurred

### 2. Diff Algorithm (`diff-algorithm.ts`)

**Purpose**: Compute minimal state differences for efficient network transmission

**Algorithm**:
1. Shallow reference equality check (structural sharing)
2. Deep comparison only when references differ
3. Path-based diff generation
4. Diff optimization (merge consecutive updates)

**Performance**:
- Target: <50ms for typical changes
- Uses Map for O(1) lookups during array diffing
- Avoids full JSON serialization until necessary
- Estimates payload size for compression decisions

**Diff Types**:
- `add` - New element added
- `update` - Existing element modified
- `delete` - Element removed
- `move` - Position/order changed
- `batch` - Multiple changes combined

**Example**:
```typescript
const result = diffAlgorithm.computeDiff(oldState, newState);
// result = {
//   diffs: [
//     { type: 'update', canvasType: 'chat', path: ['chat', 'messages', '0', 'content'], ... }
//   ],
//   hasChanges: true,
//   affectedCanvases: ['chat'],
//   estimatedSize: 245
// }
```

### 3. Operational Transform (`operational-transform.ts`)

**Purpose**: Resolve conflicts from concurrent multi-user editing

**Strategies**:

#### Last-Write-Wins
- Simplest strategy
- Timestamp-based priority
- User ID for tie-breaking
- Best for: independent edits, viewport changes

#### Merge
- Attempts to combine compatible operations
- Text edits: three-way merge
- Position updates: averaged
- Filters: union of values
- Best for: collaborative editing

#### Priority-Based
- Operation type hierarchy:
  1. `delete` (priority 10)
  2. `add` (priority 8)
  3. `update` (priority 6)
  4. `edit_message` (priority 5)
  5. `move` (priority 4)
  6. `select` (priority 2)
  7. `filter`, `layout` (priority 1)
- Best for: mixed operation types

**Transformation Rules**:
```typescript
transform(op1, op2) → { transformed, priority: 'keep'|'discard'|'merge' }

// Example: Concurrent node moves
op1 = move(node1, {x:100, y:100})  // user-1, t=1000
op2 = move(node1, {x:200, y:200})  // user-2, t=1100

// With 'merge' strategy:
result = move(node1, {x:150, y:150})  // averaged
```

### 4. State Manager (`state-manager.ts`)

**Purpose**: Manage canvas state with history and persistence

**Features**:
- **State Snapshots**: Automatic versioning (max 50 snapshots)
- **History**: Time-travel debugging and rollback
- **Persistence**: localStorage backup (24-hour retention)
- **Validation**: Checksum-based integrity verification
- **Import/Export**: JSON serialization

**Snapshot Strategy**:
- Create snapshot on every state update
- Cleanup old snapshots (>1 hour retention)
- Keep minimum 5 recent snapshots
- Checksums for tamper detection

**API**:
```typescript
class StateManager {
  getState(): CanvasState
  setState(newState, createSnapshot = true): void
  getCanvasState(canvasType): any
  setCanvasState(canvasType, state): void
  getSnapshot(version): StateSnapshot
  restoreSnapshot(version): boolean
  exportState(): string
  importState(json): boolean
}
```

### 5. Optimistic Update Manager (`optimistic-update-manager.ts`)

**Purpose**: Apply updates immediately with automatic rollback on failure

**Flow**:
```
User Action
    ↓
Apply Optimistically (instant UI feedback)
    ↓
Send to Server
    ↓
┌───────────┬────────────┐
│           │            │
Confirmed   Rejected     Timeout (3s)
│           │            │
Keep        Rollback     Rollback
```

**Rollback Triggers**:
- Server rejection (validation failed)
- Conflict resolution (operation discarded)
- Network timeout (3s default)
- Manual rollback

**Example**:
```typescript
// User drags node
const updateId = optimisticMgr.applyOptimistic(moveOperation);
// Node moves immediately in UI

// If server rejects:
optimisticMgr.rollbackOperation(updateId, {
  reason: 'validation_failed',
  error: 'Invalid position'
});
// Node returns to original position
```

### 6. Presence Manager (`presence-manager.ts`)

**Purpose**: Track user activity and cursor positions

**Tracked Data**:
- Current canvas (chat/text/graph)
- Cursor position (x, y)
- Active element (if editing)
- Last seen timestamp
- Active/inactive status

**Inactivity Detection**:
- Heartbeat interval: 1s
- Inactivity timeout: 10s
- Auto-mark inactive users
- Remove after extended absence

**Use Cases**:
- Show user avatars on canvas
- Highlight elements being edited
- Prevent conflicting edits
- Show "User X is typing..."
- Display collaboration statistics

**API**:
```typescript
class PresenceManager {
  updateCursor(cursor: CursorPosition): void
  switchCanvas(canvasType: CanvasType): void
  getPresenceList(): UserPresence[]
  getUsersOnCanvas(canvasType): UserPresence[]
  getUsersViewingElement(elementId): UserPresence[]
}
```

## Data Flow

### Local Operation Flow

```
1. User Action (e.g., drag node)
   ↓
2. Create Operation object
   {
     id: 'op-123',
     type: 'move',
     canvasType: 'graph',
     path: ['graph', 'nodes', 'node-1', 'position'],
     payload: {x: 200, y: 150},
     timestamp: 1234567890,
     userId: 'user-1',
     version: 5
   }
   ↓
3. Apply Optimistically (if enabled)
   - Update local state immediately
   - Store operation in pending queue
   - Set timeout for auto-rollback
   ↓
4. Queue for Batching
   - Add to pendingOperations[]
   - Start batch timer (50ms)
   ↓
5. Batch Send (after interval or max size)
   - Send via WebSocket
   - Track sent operations
   ↓
6. Server Response
   ├─ ACK → Confirm optimistic update
   ├─ REJECT → Rollback to previous state
   └─ TIMEOUT → Rollback after 3s
```

### Remote Operation Flow

```
1. Receive WebSocket Message
   ↓
2. Parse and Validate
   ↓
3. Check for Conflicts
   - Compare with pending optimistic operations
   - Apply Operational Transform
   ↓
4. Resolve Conflicts
   ├─ keep → Apply remote operation
   ├─ discard → Ignore remote operation
   └─ merge → Combine operations
   ↓
5. Update State
   - Apply operation to state
   - Create snapshot
   ↓
6. Emit Events
   - operation:received
   - state:updated
   ↓
7. UI Re-renders
```

## WebSocket Protocol

### Message Types

#### State Messages
```typescript
// Initial state sync
STATE_INIT: {
  type: 'state:init',
  state: CanvasState,
  version: number,
  presenceList: UserPresence[],
  timestamp: number
}

// Incremental update
STATE_UPDATE: {
  type: 'state:update',
  diffs: Diff[],
  version: number,
  userId: string,
  timestamp: number
}
```

#### Operation Messages
```typescript
// Client → Server
OPERATION: {
  type: 'operation',
  operation: Operation,
  optimistic: boolean,
  timestamp: number
}

// Server → Client (success)
OPERATION_ACK: {
  type: 'operation:ack',
  operationId: string,
  newVersion: number,
  timestamp: number
}

// Server → Client (failure)
OPERATION_REJECT: {
  type: 'operation:reject',
  operationId: string,
  reason: string,
  rollback: RollbackInfo,
  timestamp: number
}
```

#### Presence Messages
```typescript
PRESENCE_UPDATE: {
  type: 'presence:update',
  presence: UserPresence,
  timestamp: number
}

PRESENCE_LIST: {
  type: 'presence:list',
  presences: UserPresence[],
  timestamp: number
}
```

#### Control Messages
```typescript
PING / PONG: {
  type: 'ping' | 'pong',
  timestamp: number
}

LOCK_REQUEST: {
  type: 'lock:request',
  resourceId: string,
  userId: string,
  timeout: number
}
```

## Performance Characteristics

### Latency Targets

| Operation | Target | Typical | Notes |
|-----------|--------|---------|-------|
| Diff Computation | <50ms | 5-15ms | 100 nodes, 50 messages |
| OT Transform | <10ms | 1-3ms | 2 operations |
| State Update | <20ms | 5-10ms | Local state |
| Optimistic Apply | <5ms | 1-2ms | Instant feedback |
| WebSocket Send | <30ms | 10-20ms | LAN connection |
| Round-trip ACK | <100ms | 40-80ms | LAN connection |

### Scalability

| Metric | Limit | Notes |
|--------|-------|-------|
| Concurrent Users | 10 | Per session target |
| Canvas Elements | 1000 | Nodes + messages + rows |
| Operation Batch Size | 10 | Max per batch |
| Pending Operations | 50 | Before backpressure |
| Snapshots | 50 | Rolling history |
| Snapshot Retention | 1 hour | Auto-cleanup |

### Memory Usage

| Component | Typical | Max |
|-----------|---------|-----|
| State Manager | 5 MB | 20 MB |
| Optimistic Updates | 1 MB | 5 MB |
| Presence Data | 500 KB | 2 MB |
| Message Buffers | 2 MB | 10 MB |
| **Total** | **~9 MB** | **~37 MB** |

## Multi-User Coordination

### Pessimistic Locking

For ontology-critical operations (validation, relationship changes):

```typescript
// Request exclusive lock
ws.send({
  type: 'lock:request',
  resourceId: 'validation-engine',
  timeout: 5000
});

// Wait for lock
await lockAcquired;

// Perform critical operation
await validateOntology();

// Release lock
ws.send({ type: 'lock:released', resourceId: 'validation-engine' });
```

### Optimistic Concurrency

For UI operations (move, filter, select):

```typescript
// Apply immediately
syncEngine.applyLocalOperation(operation);

// UI updates instantly

// Server validates in background
// Auto-rollback if rejected
```

### Conflict Resolution Matrix

| Operation 1 | Operation 2 | Strategy | Result |
|-------------|-------------|----------|--------|
| move(node) | move(node) | merge | averaged position |
| edit(msg) | edit(msg) | merge | combined text |
| delete(row) | update(row) | priority | delete wins |
| add(node) | add(node) | LWW | later timestamp wins |
| filter(A) | filter(B) | merge | union of filters |
| select(X) | select(Y) | independent | both kept |

## Error Handling

### Connection Errors

```typescript
// Auto-reconnect with exponential backoff
reconnectInterval = baseInterval * Math.pow(2, attemptNumber)

// Max 5 attempts
if (attempts >= 5) {
  emit('reconnect:failed');
  showOfflineMode();
}
```

### Validation Errors

```typescript
// Server rejects operation
{
  type: 'operation:reject',
  reason: 'Violates ontology rule: function_io',
  operationId: 'op-123'
}

// Client rolls back
optimisticMgr.rollbackOperation('op-123', {
  reason: 'validation_failed',
  error: 'Function must have ≥1 input and output'
});

// Show user-friendly error
showToast('Cannot apply change: Function requires input and output flows');
```

### Network Errors

- **Timeout**: Rollback optimistic update after 3s
- **Disconnect**: Queue operations, retry on reconnect
- **Partial Failure**: Request full state sync

## Testing Strategy

### Unit Tests

- Diff algorithm correctness
- OT transformation rules
- State manager operations
- Optimistic update/rollback
- Presence tracking

### Integration Tests

- WebSocket message flow
- Multi-component interaction
- Event propagation
- Error handling

### Multi-User Scenarios

- Concurrent editing conflicts
- Presence tracking accuracy
- Operation ordering
- Rollback correctness

### Performance Tests

- Sub-50ms diff computation
- Large state handling (1000+ elements)
- 10 concurrent users
- Batch processing efficiency

## Configuration

### Sync Config Options

```typescript
{
  // Performance
  batchInterval: 50,        // ms - operation batching
  maxBatchSize: 10,         // operations per batch
  diffThreshold: 1024,      // bytes - full state vs diff

  // Conflict resolution
  conflictStrategy: 'operational-transform' | 'last-write-wins' | 'crdt',
  lockTimeout: 5000,        // ms - pessimistic lock

  // Optimistic updates
  enableOptimistic: true,
  optimisticTimeout: 3000,  // ms - auto-rollback

  // WebSocket
  reconnectInterval: 2000,  // ms - base interval
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000, // ms

  // Presence
  presenceUpdateInterval: 1000,  // ms
  presenceTimeout: 10000,        // ms

  // Validation
  validateBeforeSend: true,
  validateAfterReceive: true
}
```

## Future Enhancements

### Planned Features

1. **CRDT Support**: Conflict-free replicated data types for automatic merging
2. **Compression**: gzip/brotli for large state updates
3. **Offline Mode**: Local-first with sync on reconnect
4. **Undo/Redo**: Operation-based history with OT
5. **Collaborative Cursors**: Real-time cursor tracking
6. **Audio/Video**: WebRTC for voice/video communication
7. **Annotations**: Collaborative comments on elements
8. **Change Highlighting**: Visual indicators for recent changes

### Performance Improvements

1. **Web Workers**: Offload diff/OT computation
2. **IndexedDB**: Persistent storage for large states
3. **Binary Protocol**: MessagePack/Protobuf instead of JSON
4. **Delta Encoding**: Send only changed bytes
5. **Streaming**: Incremental state updates

## References

- [Operational Transformation (OT)](https://en.wikipedia.org/wiki/Operational_transformation)
- [CRDT: Conflict-free Replicated Data Types](https://crdt.tech/)
- [WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [Optimistic UI Updates](https://www.apollographql.com/docs/react/performance/optimistic-ui/)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Author**: Canvas Synchronization Engineer
