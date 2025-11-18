# Module Communication Contracts

**Autor:** andreas@siglochconsulting.de

Klare Definition der Datenaustausch-Schnittstellen zwischen LLM, Database und Frontend.

## Grundprinzip

**Ein Format für alle Module** - keine Transformationen, keine Duplikate.

Alle drei Module (LLM, Database, Frontend) verwenden die **exakt gleichen Datenstrukturen** aus [data-contracts.ts](../../src/types/contracts/data-contracts.ts).

## Canvas-Verbindung

**Wichtig:** Die drei Canvases sind wie folgt verbunden:

```
Chat Canvas (Message mit sessionId)
    ↓ operations[]
Operations (enthält tempId/uuid)
    ↓ Execution
Nodes/Relationships (in Database)
    ↓ Query all
Text/Graph Canvas (zeigt ALLE Nodes)
```

**Verbindung über `Message.operations[]`:**

1. User chattet in Chat Canvas → `Message` mit `sessionId`
2. LLM generiert `Operations[]` → attached to `Message`
3. Operations werden ausgeführt → `Nodes`/`Relationships` erstellt
4. Neue Nodes werden in Text/Graph Canvas angezeigt

**Aktuell:** Text/Graph Canvas zeigen ALLE Nodes, unabhängig von Chat-Session.

**Wenn Filterung nach Session gewünscht:**

Option A - `sessionId` in Node:
```typescript
interface Node {
  uuid: string;
  sessionId?: string; // Optional: Welche Session hat diesen Node erstellt
  // ...
}
```

Option B - Separate Mapping (empfohlen):
```typescript
// In Message speichern, welche Nodes erstellt wurden
interface Message {
  // ...
  createdNodes?: string[]; // UUIDs der in dieser Message erstellten Nodes
}
```

So kann man filtern: "Zeige nur Nodes aus Chat-Session X"

## Core Data Structures

### Node

```typescript
interface Node {
  uuid: string;
  type: NodeType;
  Name: string;
  Descr: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  createdBy: string;
  version: number;
  // Type-specific optional fields
  Type?: string;
  Pattern?: string;
  Validation?: string;
  Struct?: string;
}
```

**Verwendet von:**
- Database: Speichert und lädt Nodes
- LLM: Erzeugt Nodes in Operations
- Frontend: Zeigt Nodes in allen Canvases (Chat, Text, Graph)

### Relationship

```typescript
interface Relationship {
  uuid: string;
  type: RelationshipType;
  source: string; // UUID
  target: string; // UUID
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

**Verwendet von:**
- Database: Speichert und lädt Relationships
- LLM: Erzeugt Relationships in Operations
- Frontend: Zeigt Relationships als Edges in Graph Canvas

### Operation

```typescript
interface Operation {
  id: string; // op-001, op-002, etc.
  type: 'create' | 'update' | 'delete' | 'create-relationship' | 'delete-relationship';

  // Node operations
  nodeType?: NodeType;
  tempId?: string; // temp-{name}
  uuid?: string;
  data?: { Name: string; Descr: string; [key: string]: any };

  // Relationship operations
  relType?: RelationshipType;
  sourceUuid?: string;
  targetUuid?: string;
  sourceTempId?: string;
  targetTempId?: string;

  dependsOn: string[]; // Dependency management
}
```

**Verwendet von:**
- LLM: Generiert Operations aus User-Input
- Database: Führt Operations aus
- Frontend: Zeigt Operations in Chat (optional)

## Canvas-spezifische Verwendung

### Chat Canvas
**Verwendet:**
- `Message` (Anzeige von Chat-Verlauf)
- `StreamChunk` (Streaming LLM Response)

**Zeigt NICHT direkt:**
- Nodes/Relationships (nur indirekt via Operations in Message)

### Text Canvas
**Verwendet:**
- `Node` (als Table Rows)
- `Relationship` (als Related-To Spalte)
- `Operation` (für CRUD)

**Zeigt NICHT:**
- Messages (Chat-Verlauf ist separiert)

### Graph Canvas
**Verwendet:**
- `Node` (als Graph Nodes)
- `Relationship` (als Graph Edges)
- `Operation` (für CRUD)

**Zeigt NICHT:**
- Messages (Chat-Verlauf ist separiert)

## Datenfluss zwischen Modulen

### 1. User → Frontend → LLM

```typescript
// User sendet Nachricht
const message: Message = {
  id: 'msg-123',
  sessionId: 'session-1',
  role: 'user',
  content: 'Erstelle System OrderSystem',
  timestamp: '2025-01-12T10:00:00Z',
  status: 'sent',
  userId: 'user-1',
  userName: 'Andreas'
};
```

### 2. LLM → Frontend (Streaming)

```typescript
// LLM streamt Antwort in Chunks
const chunk1: StreamChunk = {
  messageId: 'msg-124',
  chunk: 'Ich erstelle das System...',
  isComplete: false
};

const chunk2: StreamChunk = {
  messageId: 'msg-124',
  chunk: '',
  isComplete: true,
  operations: [
    {
      id: 'op-001',
      type: 'create',
      nodeType: 'SYS',
      tempId: 'temp-ordersystem',
      data: {
        Name: 'OrderSystem',
        Descr: 'System for order management'
      },
      dependsOn: []
    }
  ]
};
```

### 3. LLM → Database (Batch Execution)

```typescript
// LLM sendet Operations zur Ausführung
const operations: Operation[] = [
  { id: 'op-001', type: 'create', nodeType: 'SYS', ... },
  { id: 'op-002', type: 'create', nodeType: 'UC', ... },
  { id: 'op-003', type: 'create-relationship', relType: 'compose', ... }
];

// Database führt aus und returned Result
const result: BatchResult = {
  success: true,
  results: [
    { operationId: 'op-001', success: true, uuid: 'uuid-abc' },
    { operationId: 'op-002', success: true, uuid: 'uuid-def' },
    { operationId: 'op-003', success: true, uuid: 'uuid-ghi' }
  ],
  tempIdMapping: {
    'temp-ordersystem': 'uuid-abc',
    'temp-placeorder': 'uuid-def'
  },
  rollbackPerformed: false
};
```

### 4. Database → Frontend (WebSocket Sync)

```typescript
// Database benachrichtigt Frontend über neue Nodes
const node: Node = {
  uuid: 'uuid-abc',
  type: 'SYS',
  Name: 'OrderSystem',
  Descr: 'System for order management',
  createdAt: '2025-01-12T10:00:01Z',
  updatedAt: '2025-01-12T10:00:01Z',
  createdBy: 'user-1',
  version: 1
};

// Frontend updated alle Canvases:
// - Chat: Zeigt "OrderSystem created"
// - Text: Fügt Row hinzu
// - Graph: Fügt Node hinzu
```

## Modul-spezifische Verwendung

### LLM Module ([ai-assistant.service.ts](../../src/backend/ai-assistant/ai-assistant.service.ts))

**Input:**
- `Message` (User-Nachricht)

**Output:**
- `StreamChunk[]` (Text-Response)
- `Operation[]` (Graph-Modifikationen)

**Prozess:**
1. Parse User-Message
2. Generate LLM Response
3. Extract Operations aus Response
4. Resolve Semantic IDs → UUIDs/TempIDs
5. Return Operations zur Ausführung

### Database Module ([neo4j.service.ts](../../src/backend/services/neo4j.service.ts))

**Input:**
- `Operation[]` (CRUD-Befehle)

**Output:**
- `BatchResult` (Execution Result)
- `Node[]` (Query Results)
- `Relationship[]` (Query Results)

**Prozess:**
1. Validate Operations
2. Execute in dependency order
3. Resolve TempIDs → UUIDs
4. Return created/updated entities

### Frontend Module ([useChat.ts](../../src/frontend/hooks/useChat.ts), [useGraphCanvas.ts](../../src/frontend/hooks/useGraphCanvas.ts))

**Input:**
- `StreamChunk[]` (LLM Response)
- `Node[]` (Database Updates)
- `Relationship[]` (Database Updates)

**Output:**
- `Message` (User Input)
- UI State Updates

**Prozess:**
1. Display streaming LLM response in Chat Canvas
2. Apply operations to Text Canvas (table rows)
3. Apply operations to Graph Canvas (nodes/edges)
4. Show validation feedback

## WebSocket Events

### Frontend → Backend

```typescript
// User sendet Message
{ type: 'message', payload: Message }

// User editiert Message
{ type: 'edit', payload: { messageId: string, content: string } }

// Typing indicator
{ type: 'typing', payload: { isTyping: boolean } }
```

### Backend → Frontend

```typescript
// AI Response Chunk
{ type: 'ai-chunk', payload: StreamChunk }

// Operations executed
{ type: 'operations', payload: Operation[] }

// Database sync
{ type: 'sync', payload: { nodes: Node[], relationships: Relationship[] } }

// Error
{ type: 'error', payload: ErrorResponse }
```

## Error Handling

```typescript
interface ErrorResponse {
  code: string; // 'LLM_ERROR', 'DB_ERROR', etc.
  message: string;
  retryable: boolean;
  retryAfter?: number; // milliseconds
}
```

**Error-Codes:**
- `LLM_RATE_LIMIT` - Rate limit exceeded (retryable)
- `LLM_API_ERROR` - LLM API error (retryable)
- `DB_NODE_NOT_FOUND` - Node nicht gefunden (nicht retryable)
- `DB_CONSTRAINT_VIOLATION` - Constraint-Verletzung (nicht retryable)
- `VALIDATION_ERROR` - Validation failed (nicht retryable)

## Validation

```typescript
interface ValidationResult {
  valid: boolean;
  violations: Array<{
    ruleId: string; // 'naming-convention', 'invalid-connection', etc.
    severity: 'error' | 'warning';
    message: string;
    affectedElements: string[]; // UUIDs
  }>;
}
```

**Validation Points:**
1. **LLM → Operations**: Validate before execution
2. **Database → CRUD**: Validate constraints
3. **Frontend → User Input**: Real-time validation

## Best Practices

### 1. Keine Duplikate

❌ **Falsch:**
```typescript
// Database hat DatabaseNode
// Frontend hat FrontendNode
// → 2 verschiedene Formate, Transformations nötig
```

✅ **Richtig:**
```typescript
// Alle verwenden Node aus data-contracts.ts
import { Node } from '@types/contracts/data-contracts';
```

### 2. Atomic Batch Execution

```typescript
// Operations mit Dependencies
const ops: Operation[] = [
  { id: 'op-1', type: 'create', nodeType: 'SYS', dependsOn: [] },
  { id: 'op-2', type: 'create', nodeType: 'UC', dependsOn: [] },
  { id: 'op-3', type: 'create-relationship', dependsOn: ['op-1', 'op-2'] }
];

// Database führt aus: op-1 → op-2 → op-3
// Bei Fehler: Rollback aller Operations (atomic: true)
```

### 3. TempID Resolution

```typescript
// LLM verwendet TempIDs während Batch
const operation: Operation = {
  id: 'op-1',
  type: 'create-relationship',
  sourceTempId: 'temp-sys',
  targetTempId: 'temp-uc',
  dependsOn: ['op-create-sys', 'op-create-uc']
};

// Database resolved zu UUIDs
const result: BatchResult = {
  tempIdMapping: {
    'temp-sys': 'uuid-abc',
    'temp-uc': 'uuid-def'
  }
};
```

## Migration von bestehenden Types

Bestehende Type-Definitionen werden schrittweise migriert:

1. ✅ **Neue Contracts erstellt** ([data-contracts.ts](../../src/types/contracts/data-contracts.ts))
2. ⏳ **Module aktualisieren** auf neue Contracts
3. ⏳ **Alte Types entfernen** (duplicate definitions)
4. ⏳ **Tests aktualisieren**

## Zusammenfassung

- **Ein Format für alle** - `Node`, `Relationship`, `Operation`
- **Keine Transformationen** - Alle Module verwenden exakt gleiche Strukturen
- **Klare Schnittstellen** - Wer sendet was an wen
- **Atomic Operations** - Batch mit Dependencies
- **Unified Error Handling** - Standard-Format für alle Module

---

**Nächste Schritte:**
1. Bestehende Module auf neue Contracts umstellen
2. Tests für Contract-Compliance schreiben
3. Alte duplicate Type-Definitionen entfernen
