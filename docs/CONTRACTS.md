# AiSE Reloaded - Interface Contracts

**Version**: 1.0.0
**Date**: November 2025
**Purpose**: Definiert alle Schnittstellen zwischen Modulen verbindlich

---

## 1. Frontend ↔ AI Assistant

### 1.1 POST /api/assistant/chat

**Purpose**: Sende Benutzer-Nachricht an AI, erhalte Response.

**Request**:
```typescript
{
  sessionId: string;        // Room/Session Identifier
  userId: string;           // User Identifier
  message: string;          // User's message in natural language
  context?: {
    currentCanvas: 'chat' | 'text' | 'graph';
    selectedNodes?: string[];  // UUIDs of selected nodes
    viewState?: {             // Current view context
      filters?: any;
      zoom?: number;
    };
  };
  stream?: boolean;         // true for streaming response (default: true)
}
```

**Response** (Streaming via WebSocket):
```typescript
// Message type: 'ai-response-chunk'
{
  type: 'ai-response-chunk';
  sessionId: string;
  messageId: string;        // Unique ID for this response
  chunk: string;            // Token(s) of the response
  isComplete: boolean;      // true for last chunk
  operations?: Operation[]; // Ontology operations (in last chunk)
}

// Operation type
type Operation = {
  type: 'create' | 'update' | 'delete';
  nodeType: 'SYS' | 'ACTOR' | 'UC' | 'FCHAIN' | 'FUNC' | 'FLOW' | 'REQ' | 'TEST' | 'MOD' | 'SCHEMA';
  data: {
    uuid?: string;          // For update/delete
    Name: string;
    Descr: string;
    [key: string]: any;     // Type-specific properties
  };
  relationships?: {
    type: 'compose' | 'io' | 'satisfy' | 'verify' | 'allocate' | 'relation';
    sourceUuid: string;
    targetUuid: string;
  }[];
};
```

**Error Response**:
```typescript
{
  type: 'ai-error';
  error: {
    code: 'RATE_LIMIT' | 'LLM_ERROR' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
    message: string;
    retryAfter?: number;    // Seconds until retry allowed
  };
}
```

**Contract Rules**:
- ✅ MUST stream responses token-by-token (default)
- ✅ MUST include operations in final chunk
- ✅ MUST validate operations before sending
- ✅ MUST handle context window overflow gracefully
- ✅ Response time: <500ms to first token
- ✅ Token latency: <50ms between tokens

---

### 1.2 POST /api/assistant/derive

**Purpose**: Trigger automatic derivation of elements.

**Request**:
```typescript
{
  sessionId: string;
  derivationType: 'functions' | 'tests' | 'flows' | 'modules';
  sourceNodeUuid: string;   // UUID of source node (UC, REQ, FUNC, etc.)
  options?: {
    autoApply?: boolean;    // Auto-apply without confirmation (default: false)
    pattern?: string;       // Specific derivation pattern to use
  };
}
```

**Response**:
```typescript
{
  success: boolean;
  derivedElements: {
    nodes: {
      uuid: string;
      type: string;
      Name: string;
      Descr: string;
      confidence: number;   // 0-1, AI's confidence in this derivation
    }[];
    relationships: {
      type: string;
      sourceUuid: string;
      targetUuid: string;
    }[];
  };
  reasoning: string;        // AI's explanation of derivation
  suggestedFollowUp?: string; // Next suggested question/action
}
```

**Contract Rules**:
- ✅ MUST validate all derived elements before returning
- ✅ MUST provide reasoning for traceability
- ✅ Response time: <3s for typical derivation
- ✅ Confidence threshold: >0.7 for auto-apply

---

### 1.3 GET /api/assistant/context

**Purpose**: Retrieve current conversation context.

**Request**:
```typescript
{
  sessionId: string;
  limit?: number;           // Max messages to return (default: 50)
}
```

**Response**:
```typescript
{
  sessionId: string;
  messages: {
    id: string;
    timestamp: string;      // ISO 8601
    role: 'user' | 'assistant';
    content: string;
    operations?: Operation[]; // If this message created/modified nodes
  }[];
  summary?: string;         // AI-generated summary of conversation
  currentFocus?: string;    // What the conversation is currently about
}
```

**Contract Rules**:
- ✅ MUST return messages in chronological order
- ✅ MUST include all operations for audit trail
- ✅ Response time: <200ms

---

## 2. Frontend ↔ Canvas Sync Engine

### 2.1 applyOperation()

**Purpose**: Apply a local operation to state.

**Signature**:
```typescript
applyOperation(operation: CanvasOperation): Promise<void>

type CanvasOperation = {
  id: string;               // Unique operation ID
  userId: string;           // Who initiated this
  timestamp: number;        // Unix timestamp (ms)
  type: 'insert' | 'update' | 'delete' | 'move';
  canvasType: 'chat' | 'text' | 'graph';
  path: string[];           // Path to affected element (e.g., ['graph', 'nodes', 'node-123'])
  payload: any;             // Operation-specific data
  optimistic?: boolean;     // Is this an optimistic update?
};
```

**Contract Rules**:
- ✅ MUST apply optimistically for local user
- ✅ MUST broadcast to WebSocket immediately
- ✅ MUST revert if server rejects (timeout: 3s)
- ✅ MUST handle conflicts via Operational Transform

---

### 2.2 computeDiff()

**Purpose**: Compute minimal changes between states.

**Signature**:
```typescript
computeDiff(oldState: CanvasState, newState: CanvasState): Diff

type Diff = {
  changes: {
    type: 'add' | 'modify' | 'remove';
    path: string[];
    oldValue?: any;
    newValue?: any;
  }[];
  metadata: {
    totalChanges: number;
    affectedCanvases: ('chat' | 'text' | 'graph')[];
  };
};
```

**Contract Rules**:
- ✅ MUST complete in <50ms
- ✅ MUST include only minimal changes (not full state)
- ✅ MUST handle deep object comparisons

---

### 2.3 resolveConflict()

**Purpose**: Resolve concurrent edit conflicts.

**Signature**:
```typescript
resolveConflict(
  localOp: CanvasOperation,
  remoteOp: CanvasOperation,
  strategy: 'last-write-wins' | 'merge' | 'priority'
): CanvasOperation

// Returns the resolved operation to apply
```

**Contract Rules**:
- ✅ MUST preserve user intent when possible
- ✅ MUST log conflicts for debugging
- ✅ Default strategy: 'merge' for compatible ops, 'last-write-wins' otherwise

---

## 3. Canvas Sync Engine ↔ WebSocket Server

### 3.1 WebSocket Message: canvas-update

**Direction**: Bidirectional

**Format**:
```typescript
{
  type: 'canvas-update';
  sessionId: string;
  userId: string;
  operation: CanvasOperation; // See 2.1
  sequenceNumber: number;     // For ordering and loss detection
}
```

**Contract Rules**:
- ✅ MUST include sequence number for reliable delivery
- ✅ MUST broadcast to all users in session (except sender)
- ✅ Latency target: <15ms

---

### 3.2 WebSocket Message: sync-request

**Direction**: Client → Server

**Purpose**: Request full state resync (after disconnect).

**Format**:
```typescript
{
  type: 'sync-request';
  sessionId: string;
  userId: string;
  lastSeenSequence?: number; // Resume from this point
}
```

**Response** (sync-response):
```typescript
{
  type: 'sync-response';
  sessionId: string;
  state: CanvasState;         // Full current state
  sequenceNumber: number;     // Current sequence
  missedOperations?: CanvasOperation[]; // If resuming
}
```

**Contract Rules**:
- ✅ MUST send complete state if lastSeenSequence is too old (>1000 ops)
- ✅ MUST send only missed operations if recent

---

## 4. WebSocket Server ↔ Backend API

### 4.1 POST /api/nodes (via REST)

**Request**:
```typescript
{
  type: 'SYS' | 'ACTOR' | 'UC' | 'FCHAIN' | 'FUNC' | 'FLOW' | 'REQ' | 'TEST' | 'MOD' | 'SCHEMA';
  properties: {
    Name: string;             // Required, PascalCase, max 25 chars
    Descr: string;            // Required
    // Type-specific:
    Type?: string;            // For FLOW
    Pattern?: string;         // For FLOW
    Struct?: string;          // For SCHEMA (JSON)
  };
  metadata?: {
    createdBy: 'user' | 'ai'; // How was this node created
    confidence?: number;      // If AI-created
    source?: string;          // Message/conversation that led to creation
  };
}
```

**Response**:
```typescript
{
  success: boolean;
  node: {
    uuid: string;             // Server-generated
    type: string;
    properties: {...};
    createdAt: string;        // ISO 8601
  };
  validationResult: {
    isValid: boolean;
    violations: {
      ruleId: string;
      message: string;
      severity: 'error' | 'warning';
    }[];
  };
}
```

**Contract Rules**:
- ✅ MUST validate against Ontology V3 rules before creating
- ✅ MUST generate UUID server-side
- ✅ MUST return validation even if creation succeeds (for warnings)
- ✅ Response time: <100ms

---

### 4.2 POST /api/relationships

**Request**:
```typescript
{
  type: 'compose' | 'io' | 'satisfy' | 'verify' | 'allocate' | 'relation';
  sourceUuid: string;
  targetUuid: string;
  properties?: {             // Optional relationship properties
    [key: string]: any;
  };
}
```

**Response**:
```typescript
{
  success: boolean;
  relationship: {
    uuid: string;
    type: string;
    sourceUuid: string;
    targetUuid: string;
    createdAt: string;
  };
  validationResult: {
    isValid: boolean;
    violations: Violation[];
  };
}
```

**Contract Rules**:
- ✅ MUST validate valid_connections from ontology_schema.json
- ✅ MUST check both nodes exist before creating relationship
- ✅ Example validation: FUNC-FLOW io relationship is valid ✓
- ✅ Example rejection: SYS-TEST compose relationship is invalid ✗

---

## 5. Backend API ↔ Neo4j Database

### 5.1 Node Creation (Cypher)

**Contract**:
```cypher
// Create node with validation
CREATE (n:{NodeType} {
  uuid: $uuid,               // MUST be unique (constraint)
  Name: $name,               // MUST be PascalCase, max 25 chars
  Descr: $descr,             // MUST not be empty
  createdAt: datetime(),     // MUST be set server-side
  createdBy: $createdBy,     // 'user' or 'ai'
  // Type-specific properties
})
RETURN n
```

**Contract Rules**:
- ✅ MUST use parameterized queries (prevent injection)
- ✅ MUST check constraints before creation
- ✅ MUST return created node with all properties
- ✅ Query time: <10ms (with indexes)

---

### 5.2 Validation Query (Rule 3: Function Requirements)

**Contract**:
```cypher
// Find functions without requirements
MATCH (f:FUNC)
WHERE NOT (f)-[:satisfy]->(:REQ)
RETURN f.uuid as uuid, f.Name as name
```

**Contract Rules**:
- ✅ MUST return all violations
- ✅ MUST be idempotent (safe to run multiple times)
- ✅ Query time: <100ms for 1000 nodes

---

### 5.3 Derivation Query (UC → Functions)

**Contract**:
```cypher
// Get use case for derivation
MATCH (uc:UC {uuid: $ucUuid})
OPTIONAL MATCH (uc)-[:compose]->(existing:FUNC)
RETURN uc.Name, uc.Descr, collect(existing.Name) as existingFunctions
```

**Response to AI**:
```typescript
{
  ucName: string;
  ucDescr: string;
  existingFunctions: string[]; // Already derived functions
}
```

**Contract Rules**:
- ✅ MUST include existing functions to avoid duplicates
- ✅ AI must use this info to derive only missing functions

---

## 6. AI Assistant Internal Contracts

### 6.1 System Prompt Template

**Contract**:
```typescript
const SYSTEM_PROMPT = `You are an expert Systems Engineering assistant following INCOSE and ISO 29148 standards.

Your role:
1. Guide users through SE methodology step-by-step
2. Ask intelligent questions to elicit requirements
3. Automatically build Ontology V3 structure in background
4. Derive elements automatically (UC→Functions, REQ→Tests)
5. Validate against 12 ontology rules
6. Explain SE concepts in simple terms

Ontology V3 Rules:
${ontologyRules}

Current Context:
- User expertise: ${userExpertise}
- Current system: ${systemContext}
- Last 5 messages: ${recentMessages}

Response Format:
1. Natural conversational response to user
2. JSON operations block (if creating/modifying ontology)

Example:
"Ich habe die Funktion 'ValidateOrder' zur Use Case 'PlaceOrder' hinzugefügt."

<operations>
[
  {
    "type": "create",
    "nodeType": "FUNC",
    "data": {"Name": "ValidateOrder", "Descr": "..."},
    "relationships": [{"type": "compose", "sourceUuid": "uc-123", "targetUuid": "new-uuid"}]
  }
]
</operations>
`;
```

**Contract Rules**:
- ✅ MUST always include ontology rules in system prompt
- ✅ MUST include recent context (last 5-10 messages)
- ✅ MUST use JSON for operations (parseable)
- ✅ MUST validate JSON before sending to backend

---

### 6.2 NLP → Ontology Extraction

**Input** (User message):
```
"Das System soll Bestellungen vom Kunden entgegennehmen und validieren."
```

**AI Processing**:
```typescript
{
  intent: 'define-functionality',
  entities: [
    {
      type: 'ACTOR',
      text: 'Kunden',
      normalized: 'Customer'
    },
    {
      type: 'FUNC',
      text: 'entgegennehmen',
      normalized: 'ReceiveOrder'
    },
    {
      type: 'FUNC',
      text: 'validieren',
      normalized: 'ValidateOrder'
    }
  ],
  relationships: [
    {
      type: 'io',
      from: 'Customer',
      to: 'ReceiveOrder'
    },
    {
      type: 'compose',
      from: 'ReceiveOrder',
      to: 'ValidateOrder',
      reasoning: 'Sequential process'
    }
  ]
}
```

**Output** (Operations):
```typescript
[
  {
    type: 'create',
    nodeType: 'ACTOR',
    data: {Name: 'Customer', Descr: 'Customer placing orders'}
  },
  {
    type: 'create',
    nodeType: 'FUNC',
    data: {Name: 'ReceiveOrder', Descr: 'Receive order from customer'}
  },
  {
    type: 'create',
    nodeType: 'FUNC',
    data: {Name: 'ValidateOrder', Descr: 'Validate received order'}
  }
  // + relationships
]
```

**Contract Rules**:
- ✅ MUST normalize entity names to PascalCase
- ✅ MUST infer reasonable descriptions if not explicit
- ✅ MUST respect ontology constraints (e.g., valid relationships)
- ✅ MUST NOT hallucinate - only extract what's mentioned or clearly implied

---

## 7. Error Handling Contracts

### 7.1 Validation Error Response

**Any API Endpoint**:
```typescript
{
  success: false;
  error: {
    type: 'VALIDATION_ERROR';
    violations: [
      {
        ruleId: 'naming';           // From ontology_schema.json rules
        message: 'Name must be PascalCase and max 25 characters';
        nodeUuid?: string;
        field: 'Name';
        currentValue: 'invalidName123';
        suggestedFix: 'InvalidName';
      }
    ];
  };
}
```

**Contract Rules**:
- ✅ MUST include ruleId for client to identify violation
- ✅ MUST provide suggestedFix when possible
- ✅ HTTP Status: 400 Bad Request

---

### 7.2 AI Error Response

```typescript
{
  success: false;
  error: {
    type: 'AI_ERROR';
    subtype: 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'PROVIDER_ERROR';
    message: string;
    retryable: boolean;
    retryAfter?: number;          // Seconds
    fallbackProvider?: string;    // If available
  };
}
```

**Contract Rules**:
- ✅ MUST indicate if retryable
- ✅ MUST provide retryAfter for rate limits
- ✅ HTTP Status: 503 Service Unavailable (retryable) or 500 (not retryable)

---

## 8. WebSocket Message Types (Complete List)

### 8.1 Client → Server

| Type | Purpose | Payload |
|------|---------|---------|
| `join-room` | Join collaboration session | `{sessionId, userId, userName}` |
| `leave-room` | Leave session | `{sessionId, userId}` |
| `canvas-update` | Send operation | `{operation, sequenceNumber}` |
| `sync-request` | Request state sync | `{lastSeenSequence?}` |
| `cursor-move` | Update cursor position | `{canvasType, position}` |
| `ai-message` | Send message to AI | Same as POST /api/assistant/chat |

### 8.2 Server → Client

| Type | Purpose | Payload |
|------|---------|---------|
| `room-joined` | Confirm room join | `{sessionId, userId, participants[]}` |
| `user-joined` | Another user joined | `{userId, userName}` |
| `user-left` | User left | `{userId}` |
| `canvas-update` | Broadcast operation | `{userId, operation, sequenceNumber}` |
| `sync-response` | Full state sync | `{state, sequenceNumber, missedOperations?}` |
| `presence-update` | User presence change | `{userId, canvasType, cursor?, activity}` |
| `ai-response-chunk` | AI streaming response | `{chunk, isComplete, operations?}` |
| `ai-error` | AI error occurred | `{error}` |
| `validation-update` | Validation result | `{validationResult}` |

**Contract Rules**:
- ✅ MUST include message type in every message
- ✅ MUST include sessionId for routing
- ✅ MUST handle unknown message types gracefully (ignore, log)

---

## 9. Performance Contracts

### 9.1 Response Time SLAs

| Endpoint/Operation | Target | Max Acceptable | Current |
|-------------------|--------|----------------|---------|
| POST /api/assistant/chat (first token) | <500ms | 1s | ~200ms ✓ |
| POST /api/assistant/chat (streaming) | <50ms/token | 100ms | ~20ms ✓ |
| POST /api/nodes | <100ms | 200ms | ~50ms ✓ |
| GET /api/validation/graph | <2s (1000 nodes) | 5s | <2s ✓ |
| WebSocket message delivery | <50ms | 100ms | 5-15ms ✓ |
| Canvas diff computation | <50ms | 100ms | 5-15ms ✓ |
| Operational Transform | <10ms | 50ms | 1-3ms ✓ |

**Contract Rules**:
- ✅ MUST log all operations exceeding target
- ✅ MUST alert if max acceptable is exceeded
- ✅ MUST implement circuit breaker for repeated failures

---

## 10. Data Consistency Contracts

### 10.1 Eventual Consistency Guarantee

**Scenario**: User creates node in Chat Canvas

```
T0: User types "Create function X"
T1: Frontend applies optimistic update (Chat Canvas shows immediately)
T2: WebSocket sends to server
T3: Server creates in Neo4j
T4: Server broadcasts to all clients
T5: All canvases updated (Text, Graph show new function)
```

**Contract**:
- ✅ T1-T5 MUST complete within 500ms under normal conditions
- ✅ If T3 fails (validation error), T1 MUST be rolled back within 3s
- ✅ All users MUST see consistent state by T5

### 10.2 Conflict Resolution Contract

**Scenario**: Two users edit same node simultaneously

```
User A: Update Node.Name = "FunctionA"
User B: Update Node.Name = "FunctionB"
```

**Resolution Strategy** (from Canvas Sync Engine):
1. **Merge** (if compatible fields): Both changes applied
2. **Last-Write-Wins** (if same field): Timestamp decides
3. **Manual** (if critical conflict): Show conflict UI

**Contract**:
- ✅ MUST preserve at least one user's change
- ✅ MUST notify both users of conflict resolution
- ✅ MUST log conflict for debugging

---

## 11. Audit & Compliance Contracts

### 11.1 Audit Log Format

**Every state-changing operation MUST be logged**:

```typescript
{
  timestamp: string;          // ISO 8601 with milliseconds
  sessionId: string;
  userId: string;
  operation: string;          // 'create', 'update', 'delete', 'derive'
  nodeType?: string;
  nodeUuid?: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  source: 'user' | 'ai';      // Who initiated
  aiConfidence?: number;      // If AI-initiated
  validationResult?: {
    isValid: boolean;
    violations: Violation[];
  };
}
```

**Storage**: Neo4j (as separate audit nodes) + optionally external log service

**Contract Rules**:
- ✅ MUST log before operation (intent)
- ✅ MUST log after operation (result)
- ✅ MUST be immutable (append-only)
- ✅ Retention: 365 days minimum

---

## 12. Versioning & Compatibility

### 12.1 API Versioning

**Current**: No version prefix (v1 implicit)

**Future**:
- `/api/v2/assistant/chat` for breaking changes
- Old endpoints maintained for 6 months after new version

**Contract**:
- ✅ MUST maintain backward compatibility within version
- ✅ MUST provide migration guide for breaking changes
- ✅ MUST support at least 2 versions concurrently

### 12.2 WebSocket Protocol Version

**Current**: Version 1 (implicit in message structure)

**Handshake**:
```typescript
// Client sends on connect
{
  type: 'protocol-version',
  version: 1
}

// Server responds
{
  type: 'protocol-accepted',
  version: 1
}
```

**Contract**:
- ✅ MUST negotiate version on connect
- ✅ MUST reject incompatible versions gracefully
- ✅ Client SHOULD fallback to HTTP polling if WebSocket incompatible

---

## 13. Testing Contracts

### 13.1 Contract Tests

**Each interface MUST have contract tests**:

```typescript
describe('POST /api/assistant/chat', () => {
  it('should conform to request contract', () => {
    const request = {
      sessionId: 'test-session',
      userId: 'user-123',
      message: 'Test message',
    };
    // Validate against JSON schema
    expect(request).toMatchSchema(ChatRequestSchema);
  });

  it('should conform to response contract', async () => {
    const response = await POST('/api/assistant/chat', request);
    expect(response).toMatchSchema(ChatResponseSchema);
    expect(response.type).toBe('ai-response-chunk');
  });
});
```

**Contract Rules**:
- ✅ MUST use JSON Schema or TypeScript types as contract definition
- ✅ MUST test both valid and invalid inputs
- ✅ MUST test error responses

---

## 14. Deprecation Policy

**When changing a contract**:

1. **Minor change** (add optional field):
   - ✅ Document in changelog
   - ✅ No version bump needed

2. **Breaking change** (remove field, change type):
   - ✅ Bump version
   - ✅ Maintain old version for 6 months
   - ✅ Add deprecation warnings 3 months before removal
   - ✅ Provide migration guide

**Deprecation Warning Format**:
```typescript
{
  warnings: [
    {
      type: 'DEPRECATION',
      message: 'Field "xyz" is deprecated and will be removed in v2.0',
      removeDate: '2026-05-01',
      migration: 'Use field "abc" instead'
    }
  ]
}
```

---

## Appendix A: Complete Type Definitions

See `/src/backend/types/index.ts` for complete TypeScript definitions of all contracts.

---

## Appendix B: Example Conversations

### B.1 Complete User Journey

```
User: "Ich möchte ein Bestellsystem erstellen"

AI: "Verstanden! Lass uns mit dem Hauptsystem beginnen.
     Wie soll das System heißen?"

<operations>
[{type: "create", nodeType: "SYS", data: {Name: "OrderSystem", ...}}]
</operations>

User: "OrderSystem"

AI: "Perfekt! Wer sind die Hauptakteure, die mit dem OrderSystem
     interagieren werden?"

User: "Kunden und Warehouse Mitarbeiter"

AI: "Gut! Ich habe zwei Akteure angelegt: Customer und WarehouseStaff.
     Welche Hauptfunktionen soll das System bieten?"

<operations>
[
  {type: "create", nodeType: "ACTOR", data: {Name: "Customer", ...}},
  {type: "create", nodeType: "ACTOR", data: {Name: "WarehouseStaff", ...}}
]
</operations>

... conversation continues, ontology builds automatically
```

---

**Contract Version**: 1.0.0
**Last Updated**: November 2025
**Status**: ✅ Active
