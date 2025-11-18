# AiSE Reloaded - Operation Processing & Ordering

**Version**: 1.1.0
**Date**: November 2025
**Purpose**: Definiert wie LLM-Antworten verarbeitet, gechunked und auf Canvas verteilt werden

---

## 1. Das Problem: Operation Dependencies

### 1.1 Warum Chunking notwendig ist

**Szenario:**
```
User: "Das System hat einen Customer, der Bestellungen aufgibt"

LLM generiert:
1. CREATE ACTOR:Customer
2. CREATE UC:PlaceOrder
3. CREATE RELATIONSHIP (Customer)-[:io]->(PlaceOrder)
```

**Problem:** Operation 3 kann erst ausgeführt werden, wenn 1 und 2 abgeschlossen sind!

---

## 2. Operation Processing Pipeline

### 2.1 Architectural Overview

```
┌─────────────────────────────────────────────────────────┐
│  USER INPUT: "Customer gibt Bestellung auf"            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  AI ASSISTANT (LLM)                                     │
│  - Extrahiert Entities (ACTOR:Customer, UC:PlaceOrder) │
│  - Generiert Operations                                 │
│  - Bestimmt Dependencies                                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼ Operations mit Dependencies
┌─────────────────────────────────────────────────────────┐
│  ★ OPERATION CHUNKER & ORDERER ★                       │
│                                                          │
│  Chunk 1: [CREATE Customer, CREATE PlaceOrder]          │
│           ↓ (parallel, keine Dependencies)              │
│                                                          │
│  Wait: UUIDs von Chunk 1 zurück                         │
│           ↓                                              │
│                                                          │
│  Chunk 2: [CREATE io-Relationship]                      │
│           ↓ (needs UUIDs from Chunk 1)                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├──────────────────┬─────────────────────┐
                 ▼                  ▼                     ▼
      ┌──────────────────┐ ┌──────────────┐  ┌─────────────────┐
      │  CHAT CANVAS     │ │ TEXT CANVAS  │  │  GRAPH CANVAS   │
      │                  │ │              │  │                 │
      │  Shows:          │ │  Shows:      │  │  Shows:         │
      │  "Ich habe       │ │  New rows:   │  │  New nodes:     │
      │   Customer und   │ │  - Customer  │  │  ○ Customer     │
      │   PlaceOrder     │ │  - PlaceOrder│  │  ○ PlaceOrder   │
      │   erstellt"      │ │              │  │  Edge: Customer→│
      └──────────────────┘ └──────────────┘  └─────────────────┘
```

---

## 3. Operation Chunking Algorithm

### 3.1 Dependency Graph Construction

**Input:** List of operations from LLM

```typescript
type Operation = {
  id: string;               // "op-001"
  type: 'create' | 'update' | 'delete';
  nodeType?: string;
  tempId?: string;          // Temporary ID (before UUID assigned)
  data: any;
  relationships?: {
    type: string;
    sourceTempId: string;   // References tempId
    targetTempId: string;
  }[];
  dependsOn?: string[];     // IDs of operations this depends on
};
```

**Algorithm:**
```python
def chunk_operations(operations: List[Operation]) -> List[Chunk]:
    """
    Splits operations into executable chunks based on dependencies.

    Rules:
    1. Node creations without dependencies → Chunk 0
    2. Relationships → Chunk N (after nodes exist)
    3. Updates → Chunk after target exists
    4. Deletes → Last chunk (after no more references)
    """

    # Build dependency graph
    dep_graph = build_dependency_graph(operations)

    # Topological sort
    chunks = []
    processed = set()

    while len(processed) < len(operations):
        # Find operations with no unresolved dependencies
        ready = [op for op in operations
                 if op.id not in processed
                 and all(dep in processed for dep in op.dependsOn)]

        if not ready:
            raise CyclicDependencyError()

        chunks.append(Chunk(operations=ready))
        processed.update(op.id for op in ready)

    return chunks
```

### 3.2 Example: Multi-Operation Response

**LLM Output:**
```json
{
  "response": "Ich habe das System mit Customer und PlaceOrder erstellt.",
  "operations": [
    {
      "id": "op-001",
      "type": "create",
      "nodeType": "ACTOR",
      "tempId": "temp-customer",
      "data": {"Name": "Customer", "Descr": "Customer placing orders"},
      "dependsOn": []
    },
    {
      "id": "op-002",
      "type": "create",
      "nodeType": "UC",
      "tempId": "temp-placeorder",
      "data": {"Name": "PlaceOrder", "Descr": "Place an order"},
      "dependsOn": []
    },
    {
      "id": "op-003",
      "type": "create",
      "nodeType": "FLOW",
      "tempId": "temp-orderrequest",
      "data": {"Name": "OrderRequest", "Descr": "Order data from customer"},
      "dependsOn": []
    },
    {
      "id": "op-004",
      "type": "create-relationship",
      "relType": "io",
      "sourceTempId": "temp-customer",
      "targetTempId": "temp-orderrequest",
      "dependsOn": ["op-001", "op-003"]  // Needs both nodes!
    },
    {
      "id": "op-005",
      "type": "create-relationship",
      "relType": "io",
      "sourceTempId": "temp-orderrequest",
      "targetTempId": "temp-placeorder",
      "dependsOn": ["op-002", "op-003"]
    }
  ]
}
```

**Chunking Result:**
```
Chunk 0: [op-001, op-002, op-003]  // All nodes (no dependencies)
  ↓ Execute in parallel
  ↓ Wait for UUIDs

Chunk 1: [op-004, op-005]          // Relationships (depend on nodes)
  ↓ Execute with real UUIDs
```

---

## 4. Canvas Distribution Logic

### 4.1 Who Does What?

**Component: Response Distributor**
**Location:** `/src/backend/services/response-distributor.ts`

**Responsibilities:**
1. Parse LLM response
2. Extract operations
3. Chunk operations by dependencies
4. Execute chunks sequentially
5. Distribute updates to Canvas Sync Engine
6. Map updates to appropriate canvas

```typescript
class ResponseDistributor {
  async processLLMResponse(response: LLMResponse): Promise<void> {
    // 1. Parse response
    const { textResponse, operations } = this.parseLLMResponse(response);

    // 2. Chunk operations
    const chunks = this.chunkOperations(operations);

    // 3. Execute chunks sequentially
    const results = [];
    for (const chunk of chunks) {
      const chunkResults = await this.executeChunk(chunk, results);
      results.push(...chunkResults);
    }

    // 4. Distribute to canvases
    await this.distributeToCanvases({
      chat: textResponse,
      operations: results
    });
  }

  private async executeChunk(
    chunk: OperationChunk,
    previousResults: ExecutionResult[]
  ): Promise<ExecutionResult[]> {
    // Resolve tempIds to real UUIDs
    const resolvedOps = this.resolveTempIds(chunk.operations, previousResults);

    // Execute all operations in chunk (parallel if possible)
    const results = await Promise.all(
      resolvedOps.map(op => this.executeOperation(op))
    );

    return results;
  }

  private async distributeToCanvases(update: CanvasUpdate): Promise<void> {
    // Chat Canvas: Show text response
    await this.canvasSyncEngine.updateCanvas('chat', {
      type: 'message',
      content: update.chat,
      sender: 'assistant'
    });

    // Text Canvas: Add rows for new nodes
    const newNodes = update.operations.filter(op => op.type === 'create');
    for (const node of newNodes) {
      await this.canvasSyncEngine.updateCanvas('text', {
        type: 'row-add',
        table: node.nodeType,
        data: node.result
      });
    }

    // Graph Canvas: Add nodes and edges
    for (const op of update.operations) {
      if (op.type === 'create' && op.nodeType) {
        await this.canvasSyncEngine.updateCanvas('graph', {
          type: 'node-add',
          node: op.result
        });
      } else if (op.type === 'create-relationship') {
        await this.canvasSyncEngine.updateCanvas('graph', {
          type: 'edge-add',
          edge: op.result
        });
      }
    }
  }
}
```

---

## 5. TempId → UUID Resolution

### 5.1 The Mapping Problem

**Before Execution:**
```json
{
  "sourceTempId": "temp-customer",
  "targetTempId": "temp-orderrequest"
}
```

**After Chunk 0 Execution:**
```typescript
const idMap = {
  "temp-customer": "550e8400-e29b-41d4-a716-446655440000",
  "temp-orderrequest": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
};
```

**Resolution in Chunk 1:**
```json
{
  "sourceUuid": "550e8400-e29b-41d4-a716-446655440000",
  "targetUuid": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

### 5.2 Resolution Algorithm

```typescript
class TempIdResolver {
  private idMap: Map<string, string> = new Map();

  registerResult(tempId: string, uuid: string): void {
    this.idMap.set(tempId, uuid);
  }

  resolve(operation: Operation): Operation {
    const resolved = { ...operation };

    // Resolve node references
    if (operation.relationships) {
      resolved.relationships = operation.relationships.map(rel => ({
        ...rel,
        sourceUuid: this.idMap.get(rel.sourceTempId)!,
        targetUuid: this.idMap.get(rel.targetTempId)!
      }));
    }

    return resolved;
  }
}
```

---

## 6. Prompt Compression Integration

### 6.1 Format E with Semantic IDs

**Based on:** CR_PromptCompactingIntegration (74.2% token reduction)

**Input to LLM (Format E):**
```
## Graph Data Format

Graph data is provided in **Format E (Compact)** using semantic IDs for token efficiency.

**Notation:**
- Nodes: Name|Type|SemanticID
- Edges: SourceID -relType-> TargetID

## Nodes
CargoManagement|SYS|CargoManagement.SY.001
ManageFleet|UC|ManageFleet.UC.001
OptimizeRoutes|FUNC|OptimizeRoutes.FN.001
Customer|ACTOR|Customer.AC.001
OrderRequest|FLOW|OrderRequest.FL.001

## Edges
CargoManagement.SY.001 -cp-> ManageFleet.UC.001
ManageFleet.UC.001 -cp-> OptimizeRoutes.FN.001
Customer.AC.001 -io-> OrderRequest.FL.001
OrderRequest.FL.001 -io-> OptimizeRoutes.FN.001
```

**LLM Response (with Semantic IDs):**
```json
{
  "response": "Ich habe die Funktion ProcessPayment hinzugefügt.",
  "operations": [
    {
      "type": "create",
      "nodeType": "FUNC",
      "data": {
        "semanticId": "ProcessPayment.FN.002",  // LLM generates next ID
        "Name": "ProcessPayment",
        "Descr": "Process customer payment"
      }
    },
    {
      "type": "create-relationship",
      "relType": "compose",
      "sourceSemanticId": "ManageFleet.UC.001",  // References existing
      "targetSemanticId": "ProcessPayment.FN.002"
    }
  ]
}
```

**Backend Processing:**
```typescript
// 1. Map semantic IDs back to UUIDs
const uuidMap = context.semanticIdToUuidMap;

// 2. Resolve operations
const resolvedOps = operations.map(op => {
  if (op.sourceSemanticId) {
    op.sourceUuid = uuidMap.get(op.sourceSemanticId);
  }
  if (op.targetSemanticId) {
    op.targetUuid = uuidMap.get(op.targetSemanticId);
  }
  return op;
});

// 3. Execute with real UUIDs
await executeOperations(resolvedOps);
```

### 6.2 Semantic ID Generation

**Pattern:** `{Name}.{TypeAbbrev}.{Counter}`

**Type Abbreviations:**
```typescript
const TYPE_ABBREV = {
  'SYS': 'SY',
  'ACTOR': 'AC',
  'UC': 'UC',
  'FCHAIN': 'FC',
  'FUNC': 'FN',
  'FLOW': 'FL',
  'REQ': 'RQ',
  'TEST': 'TS',
  'MOD': 'MD',
  'SCHEMA': 'SC'
};
```

**Examples:**
- `ParseInput.FN.001` - Function
- `Customer.AC.001` - Actor
- `OrderData.FL.001` - Flow
- `ValidateInput.RQ.001` - Requirement

### 6.3 Compacting Context Management

```typescript
interface CompactingContext {
  // Bidirectional mapping
  semanticIdToUuid: Map<string, string>;
  uuidToSemanticId: Map<string, string>;

  // Counter per type
  counters: {
    [nodeType: string]: number;
  };

  // Statistics
  stats: {
    originalTokens: number;
    compactedTokens: number;
    reductionPercent: number;
  };
}
```

### 6.4 Token Savings

**200-node system:**
- Before (JSON): 18,616 tokens
- After (Format E): 4,812 tokens
- **Reduction: 74.2%**
- **Cost savings: $0.05/query**
- **Annual savings (10k queries): $497**

---

## 7. Error Handling in Chunking

### 7.1 Cyclic Dependencies

**Detection:**
```typescript
if (chunks.length === 0 && remainingOps.length > 0) {
  throw new CyclicDependencyError({
    operations: remainingOps,
    message: "Cyclic dependency detected in operations"
  });
}
```

**LLM Feedback:**
```
❌ Error: Cannot create operations - cyclic dependency detected.

The LLM tried to create:
- Node A depends on Node B
- Node B depends on Node A

This is impossible. Please regenerate without circular dependencies.
```

### 7.2 Missing Dependencies

**Detection:**
```typescript
const missingDeps = operation.dependsOn.filter(
  depId => !resolvedIds.has(depId)
);

if (missingDeps.length > 0) {
  throw new MissingDependencyError({
    operation: operation.id,
    missingDeps
  });
}
```

### 7.3 Chunk Execution Failure

**Strategy:** Rollback entire chunk

```typescript
async executeChunkWithRollback(chunk: OperationChunk): Promise<Result> {
  const createdUuids: string[] = [];

  try {
    for (const op of chunk.operations) {
      const result = await this.executeOperation(op);
      createdUuids.push(result.uuid);
    }
    return { success: true, uuids: createdUuids };

  } catch (error) {
    // Rollback all created nodes
    for (const uuid of createdUuids) {
      await this.neo4jClient.deleteNode(uuid);
    }
    throw new ChunkExecutionError({ chunk, error });
  }
}
```

---

## 8. Canvas-Specific Update Formats

### 8.1 Chat Canvas Update

```typescript
type ChatCanvasUpdate = {
  type: 'message';
  sender: 'user' | 'assistant';
  content: string;              // Full text response
  timestamp: string;
  metadata?: {
    operationsExecuted: number;
    nodesCreated: number;
    relationshipsCreated: number;
  };
};
```

### 8.2 Text Canvas Update

```typescript
type TextCanvasUpdate = {
  type: 'row-add' | 'row-update' | 'row-delete';
  table: 'SYS' | 'ACTOR' | 'UC' | 'FUNC' | 'FLOW' | 'REQ' | 'TEST' | 'MOD' | 'SCHEMA';
  data: {
    uuid: string;
    Name: string;
    Descr: string;
    [key: string]: any;         // Type-specific fields
  };
  validationStatus?: {
    isValid: boolean;
    violations: Violation[];
  };
};
```

### 8.3 Graph Canvas Update

```typescript
type GraphCanvasUpdate = {
  type: 'node-add' | 'edge-add' | 'node-update' | 'edge-delete';
  node?: {
    uuid: string;
    type: string;
    Name: string;
    position?: { x: number; y: number };
  };
  edge?: {
    uuid: string;
    type: string;
    sourceUuid: string;
    targetUuid: string;
  };
};
```

---

## 9. Performance Considerations

### 9.1 Chunking Overhead

**Typical Operation:**
- Dependency analysis: <5ms
- Chunking: <2ms
- TempId resolution: <1ms per operation
- **Total overhead: <10ms** (negligible vs API calls)

### 9.2 Parallel Execution Within Chunks

**Strategy:**
```typescript
async executeChunk(chunk: OperationChunk): Promise<Result[]> {
  // All operations in chunk can run in parallel (no inter-dependencies)
  const results = await Promise.all(
    chunk.operations.map(op => this.executeOperation(op))
  );
  return results;
}
```

**Benefit:** 5-10 node creations in ~100ms (vs ~500ms sequential)

### 9.3 Streaming Updates

**Problem:** User sees nothing during multi-chunk execution (could be 3-5 seconds)

**Solution:** Stream partial results after each chunk

```typescript
async processLLMResponseWithStreaming(response: LLMResponse): Promise<void> {
  const chunks = this.chunkOperations(response.operations);

  // Stream text response immediately
  await this.streamToChat(response.textResponse);

  // Execute chunks and stream after each
  for (let i = 0; i < chunks.length; i++) {
    const results = await this.executeChunk(chunks[i]);

    // Stream update to canvases
    await this.streamToCanvas({
      progress: `Chunk ${i+1}/${chunks.length}`,
      results
    });
  }
}
```

---

## 10. Testing Strategy

### 10.1 Chunking Tests

```typescript
describe('OperationChunker', () => {
  it('should create single chunk for independent operations', () => {
    const ops = [
      { id: 'op-1', type: 'create', nodeType: 'FUNC', dependsOn: [] },
      { id: 'op-2', type: 'create', nodeType: 'REQ', dependsOn: [] }
    ];

    const chunks = chunkOperations(ops);
    expect(chunks.length).toBe(1);
    expect(chunks[0].operations.length).toBe(2);
  });

  it('should create two chunks for dependent operations', () => {
    const ops = [
      { id: 'op-1', type: 'create', nodeType: 'FUNC', dependsOn: [] },
      { id: 'op-2', type: 'create-relationship', dependsOn: ['op-1'] }
    ];

    const chunks = chunkOperations(ops);
    expect(chunks.length).toBe(2);
    expect(chunks[0].operations[0].id).toBe('op-1');
    expect(chunks[1].operations[0].id).toBe('op-2');
  });

  it('should detect cyclic dependencies', () => {
    const ops = [
      { id: 'op-1', dependsOn: ['op-2'] },
      { id: 'op-2', dependsOn: ['op-1'] }
    ];

    expect(() => chunkOperations(ops)).toThrow(CyclicDependencyError);
  });
});
```

### 10.2 Integration Tests

```typescript
describe('ResponseDistributor', () => {
  it('should distribute LLM response to all canvases', async () => {
    const llmResponse = {
      textResponse: "Ich habe Customer erstellt",
      operations: [
        { type: 'create', nodeType: 'ACTOR', data: {...} }
      ]
    };

    await responseDistributor.processLLMResponse(llmResponse);

    // Verify Chat Canvas received text
    expect(chatCanvas.messages).toContainEqual(
      expect.objectContaining({ content: "Ich habe Customer erstellt" })
    );

    // Verify Text Canvas received row
    expect(textCanvas.tables.ACTOR).toHaveLength(1);

    // Verify Graph Canvas received node
    expect(graphCanvas.nodes).toHaveLength(1);
  });
});
```

---

## 11. Example: Complete Flow

### Scenario: User creates System with Use Case

**User Input:**
```
"Ich möchte ein Bestellsystem mit dem Use Case 'Bestellung aufgeben' erstellen"
```

**LLM Response (Format E Input):**
```json
{
  "textResponse": "Ich habe das System 'OrderSystem' mit dem Use Case 'PlaceOrder' erstellt und sie verbunden.",
  "operations": [
    {
      "id": "op-001",
      "type": "create",
      "nodeType": "SYS",
      "tempId": "temp-ordersystem",
      "data": {
        "Name": "OrderSystem",
        "Descr": "System for order management"
      },
      "dependsOn": []
    },
    {
      "id": "op-002",
      "type": "create",
      "nodeType": "UC",
      "tempId": "temp-placeorder",
      "data": {
        "Name": "PlaceOrder",
        "Descr": "Customer places an order"
      },
      "dependsOn": []
    },
    {
      "id": "op-003",
      "type": "create-relationship",
      "relType": "compose",
      "sourceTempId": "temp-ordersystem",
      "targetTempId": "temp-placeorder",
      "dependsOn": ["op-001", "op-002"]
    }
  ]
}
```

**Processing:**

**Step 1: Chunking**
```
Chunk 0: [op-001, op-002]  // Nodes
Chunk 1: [op-003]          // Relationship
```

**Step 2: Execute Chunk 0 (Parallel)**
```
POST /api/nodes { type: "SYS", ... }  → UUID: "uuid-sys-123"
POST /api/nodes { type: "UC", ... }   → UUID: "uuid-uc-456"
```

**Step 3: Resolve TempIds**
```
idMap = {
  "temp-ordersystem": "uuid-sys-123",
  "temp-placeorder": "uuid-uc-456"
}
```

**Step 4: Execute Chunk 1**
```
POST /api/relationships {
  type: "compose",
  sourceUuid: "uuid-sys-123",
  targetUuid: "uuid-uc-456"
}
```

**Step 5: Distribute to Canvases**

```typescript
// Chat Canvas
{
  type: 'message',
  sender: 'assistant',
  content: "Ich habe das System 'OrderSystem'..."
}

// Text Canvas (2 updates)
{
  type: 'row-add',
  table: 'SYS',
  data: { uuid: "uuid-sys-123", Name: "OrderSystem", ... }
}
{
  type: 'row-add',
  table: 'UC',
  data: { uuid: "uuid-uc-456", Name: "PlaceOrder", ... }
}

// Graph Canvas (3 updates)
{
  type: 'node-add',
  node: { uuid: "uuid-sys-123", type: "SYS", Name: "OrderSystem" }
}
{
  type: 'node-add',
  node: { uuid: "uuid-uc-456", type: "UC", Name: "PlaceOrder" }
}
{
  type: 'edge-add',
  edge: { type: "compose", sourceUuid: "uuid-sys-123", targetUuid: "uuid-uc-456" }
}
```

**Step 6: WebSocket Broadcast**
```
All updates sent via WebSocket to all users in room
Other users see changes in real-time across all canvases
```

---

## 12. Summary

### Key Components

1. **Response Distributor** - Parses LLM response, manages distribution
2. **Operation Chunker** - Builds dependency graph, creates execution chunks
3. **TempId Resolver** - Maps temporary IDs to real UUIDs
4. **Canvas Sync Engine** - Distributes updates to appropriate canvas
5. **Format E Serializer** - Compresses graph for LLM (74.2% token reduction)

### Critical Rules

1. ✅ **Always chunk operations by dependencies**
2. ✅ **Execute chunks sequentially** (wait for UUIDs)
3. ✅ **Execute within chunks in parallel** (no inter-dependencies)
4. ✅ **Use Format E for LLM communication** (token savings)
5. ✅ **Resolve semantic IDs before DB operations**
6. ✅ **Distribute to all 3 canvases** (Chat, Text, Graph)
7. ✅ **Stream partial results** (don't wait for all chunks)
8. ✅ **Rollback failed chunks atomically**

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Dependency analysis | <5ms | Per response |
| Chunking | <2ms | Per response |
| TempId resolution | <1ms | Per operation |
| Chunk execution | <100ms | Parallel nodes |
| Canvas distribution | <20ms | WebSocket broadcast |
| **Total overhead** | **<10ms** | Negligible |

---

**Document Version:** 1.1.0
**Last Updated:** November 2025
**Related:** ARCHITECTURE.md, CONTRACTS.md
