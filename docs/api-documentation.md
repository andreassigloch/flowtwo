# AiSE Reloaded - Backend API Documentation

## Overview

The AiSE Reloaded backend provides a RESTful API and WebSocket server for managing ontology-based systems engineering models with real-time multi-user collaboration.

**Base URL:** `http://localhost:3000`
**WebSocket URL:** `ws://localhost:3000/ws`

**Version:** 1.0.0

## Table of Contents

- [Authentication](#authentication)
- [Node Endpoints](#node-endpoints)
- [Relationship Endpoints](#relationship-endpoints)
- [Validation Endpoints](#validation-endpoints)
- [Audit Endpoints](#audit-endpoints)
- [Statistics Endpoints](#statistics-endpoints)
- [WebSocket API](#websocket-api)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Authentication

Currently, the API does not require authentication. User identification is handled through the `userId` field in requests and WebSocket connections.

**Future Enhancement:** JWT-based authentication will be added for production use.

---

## Node Endpoints

### Get All Nodes

**Endpoint:** `GET /api/nodes`

**Description:** Retrieve all ontology nodes from the database.

**Response:**
```json
{
  "success": true,
  "count": 42,
  "data": [
    {
      "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "SYS",
      "properties": {
        "Name": "MainSystem",
        "Descr": "The main system description"
      },
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "createdBy": "user123",
      "version": 1
    }
  ]
}
```

**Performance:** <50ms typical response time

---

### Get Nodes by Type

**Endpoint:** `GET /api/nodes/type/:type`

**Path Parameters:**
- `type` (string, required): Node type - one of: `SYS`, `ACTOR`, `UC`, `FCHAIN`, `FUNC`, `FLOW`, `REQ`, `TEST`, `MOD`, `SCHEMA`

**Example:** `GET /api/nodes/type/FUNC`

**Response:**
```json
{
  "success": true,
  "type": "FUNC",
  "count": 12,
  "data": [...]
}
```

---

### Get Node by UUID

**Endpoint:** `GET /api/nodes/:uuid`

**Path Parameters:**
- `uuid` (string, required): Node UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "uuid": "...",
    "type": "FUNC",
    "properties": {...}
  }
}
```

**Error Response (404):**
```json
{
  "error": "Node not found",
  "details": "Node with UUID ... does not exist"
}
```

---

### Get Node Relationships

**Endpoint:** `GET /api/nodes/:uuid/relationships`

**Description:** Get all relationships connected to a specific node.

**Response:**
```json
{
  "success": true,
  "nodeId": "...",
  "count": 5,
  "data": [
    {
      "uuid": "...",
      "type": "compose",
      "source": "...",
      "target": "...",
      "createdAt": "...",
      "createdBy": "..."
    }
  ]
}
```

---

### Validate Node

**Endpoint:** `GET /api/nodes/:uuid/validate`

**Description:** Validate a specific node against ontology rules.

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [
      {
        "rule": "naming",
        "message": "Node name should be PascalCase: 'myNode'",
        "nodeId": "...",
        "severity": "warning"
      }
    ]
  }
}
```

---

### Create Node

**Endpoint:** `POST /api/nodes`

**Request Body:**
```json
{
  "type": "FUNC",
  "properties": {
    "Name": "ProcessData",
    "Descr": "Process incoming data stream"
  },
  "roomId": "optional-room-uuid"
}
```

**FLOW Node Example:**
```json
{
  "type": "FLOW",
  "properties": {
    "Name": "DataFlow",
    "Descr": "Data flow between components",
    "Type": "async",
    "Pattern": "publish-subscribe",
    "Validation": "strict"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "uuid": "newly-created-uuid",
    "type": "FUNC",
    "properties": {...},
    "createdAt": "...",
    "version": 1
  },
  "validation": {
    "valid": false,
    "errors": [
      {
        "rule": "isolation",
        "message": "Node 'ProcessData' has no relationships (isolated)",
        "nodeId": "...",
        "severity": "error"
      }
    ],
    "warnings": []
  }
}
```

**Validation Rules:**
- Name: Max 25 characters, PascalCase
- Descr: Required
- Type-specific properties based on node type

**Performance:** <100ms typical

---

### Update Node

**Endpoint:** `PUT /api/nodes/:uuid`

**Request Body:**
```json
{
  "properties": {
    "Name": "ProcessDataV2",
    "Descr": "Updated description"
  },
  "roomId": "optional-room-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uuid": "...",
    "version": 2,
    "updatedAt": "..."
  },
  "validation": {...}
}
```

**Performance:** <100ms typical

---

### Delete Node

**Endpoint:** `DELETE /api/nodes/:uuid`

**Response:**
```json
{
  "success": true,
  "message": "Node ... deleted successfully"
}
```

**Note:** Deleting a node also deletes all its relationships (CASCADE).

---

## Relationship Endpoints

### Get All Relationships

**Endpoint:** `GET /api/relationships`

**Response:**
```json
{
  "success": true,
  "count": 87,
  "data": [
    {
      "uuid": "...",
      "type": "compose",
      "source": "source-node-uuid",
      "target": "target-node-uuid",
      "properties": {},
      "createdAt": "...",
      "createdBy": "..."
    }
  ]
}
```

---

### Get Relationship by UUID

**Endpoint:** `GET /api/relationships/:uuid`

---

### Validate Relationship

**Endpoint:** `GET /api/relationships/:uuid/validate`

**Description:** Validate a specific relationship against ontology rules.

---

### Create Relationship

**Endpoint:** `POST /api/relationships`

**Request Body:**
```json
{
  "type": "compose",
  "source": "source-node-uuid",
  "target": "target-node-uuid",
  "properties": {},
  "roomId": "optional-room-uuid"
}
```

**Relationship Types:**
- `compose`: Composition/nesting
- `io`: Input/Output connections via FLOW nodes
- `satisfy`: Requirements specification
- `verify`: Testing relationships
- `allocate`: Function-to-module allocation
- `relation`: Generic relationships

**Valid Connections:**
See ontology_schema.json for complete list of valid source/target combinations.

**Response (201):**
```json
{
  "success": true,
  "data": {
    "uuid": "...",
    "type": "compose",
    "source": "...",
    "target": "..."
  },
  "validation": {...}
}
```

---

### Delete Relationship

**Endpoint:** `DELETE /api/relationships/:uuid`

---

## Validation Endpoints

### Validate Entire Graph

**Endpoint:** `GET /api/validation/graph`

**Description:** Perform comprehensive validation of the entire ontology graph.

**Response:**
```json
{
  "success": true,
  "duration": 1234,
  "data": {
    "valid": false,
    "errors": [
      {
        "rule": "function_requirements",
        "message": "Function 'ProcessData' must have at least one requirement",
        "nodeId": "...",
        "severity": "error"
      }
    ],
    "warnings": [...]
  }
}
```

**Performance:** <2s for graphs with <1000 nodes

**Validation Rules:**
- `naming`: Max 25 chars, PascalCase
- `isolation`: No isolated nodes
- `function_requirements`: Functions must have requirements
- `function_io`: Functions must have input/output via FLOW
- `flow_node_connectivity`: FLOW nodes need incoming/outgoing connections
- `functional_flow`: Complete Actor->Function->Actor flows
- `fchain_connectivity`: All FCHAIN elements connected
- `flow_cycles`: Cycles must have exit paths
- `function_allocation`: Functions allocated to exactly one module
- `requirements_verification`: Requirements must have tests
- `leaf_usecase_actor`: Leaf use cases must have actors

---

### Check Specific Rule

**Endpoint:** `GET /api/validation/rules/:ruleId`

**Path Parameters:**
- `ruleId` (string): Rule identifier (see list above)

**Example:** `GET /api/validation/rules/function_requirements`

---

### Derive Test Cases

**Endpoint:** `POST /api/validation/derive-tests`

**Description:** Automatically derive test cases from requirements and use cases.

**Request Body:**
```json
{
  "requirementIds": ["req-uuid-1", "req-uuid-2"],
  "useCaseIds": ["uc-uuid-1"]
}
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "uuid": "test-...",
      "name": "TestProcessData",
      "description": "Verify data processing functionality",
      "requirementId": "req-uuid-1",
      "functionIds": ["func-uuid-1", "func-uuid-2"],
      "testSteps": [
        {
          "order": 1,
          "action": "Execute ProcessData",
          "expectedResult": "Data is processed correctly",
          "functionId": "func-uuid-1"
        }
      ],
      "confidence": 0.9
    }
  ]
}
```

**Confidence Score:**
- 0.3: Minimal information
- 0.6: Single function
- 0.8: Two functions
- 0.9: Three or more functions

**Performance:** <500ms for 10 requirements

---

### Get Test Coverage

**Endpoint:** `GET /api/validation/coverage`

**Description:** Calculate test coverage statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "requirements": {
      "total": 45,
      "covered": 38,
      "coverage": 84.44
    },
    "functions": {
      "total": 67,
      "covered": 62,
      "coverage": 92.54
    },
    "tests": {
      "total": 38
    }
  }
}
```

---

## Audit Endpoints

### Get Audit Logs

**Endpoint:** `GET /api/audit`

**Query Parameters:**
- `limit` (number, optional): Max number of entries (default: 100)
- `entityType` (string, optional): Filter by 'node' or 'relationship'
- `entityId` (string, optional): Filter by specific entity UUID
- `userId` (string, optional): Filter by user ID

**Example:** `GET /api/audit?limit=50&entityType=node&userId=user123`

**Response:**
```json
{
  "success": true,
  "count": 50,
  "data": [
    {
      "id": "audit-uuid",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "userId": "user123",
      "operation": "POST /api/nodes",
      "entityType": "node",
      "entityId": "node-uuid",
      "before": null,
      "after": {...},
      "success": true,
      "duration": 45,
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    }
  ]
}
```

---

### Get Audit Statistics

**Endpoint:** `GET /api/audit/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOperations": 1234,
    "successfulOperations": 1190,
    "failedOperations": 44,
    "avgDuration": 78.5,
    "operationCounts": {
      "POST /api/nodes": 234,
      "PUT /api/nodes/:uuid": 156,
      "DELETE /api/nodes/:uuid": 12
    }
  }
}
```

---

## Statistics Endpoints

### WebSocket Statistics

**Endpoint:** `GET /api/stats/websocket`

**Response:**
```json
{
  "success": true,
  "data": {
    "connections": 5,
    "totalRooms": 2,
    "totalConnections": 5,
    "rooms": [
      {
        "id": "room-uuid",
        "name": "Project Alpha",
        "userCount": 3,
        "version": 45
      }
    ]
  }
}
```

---

### Database Statistics

**Endpoint:** `GET /api/stats/database`

**Response:**
```json
{
  "success": true,
  "data": {
    "nodes": {
      "total": 234,
      "byType": {
        "SYS": 5,
        "UC": 12,
        "FUNC": 89,
        "REQ": 67,
        "TEST": 61
      }
    },
    "relationships": {
      "total": 456,
      "byType": {
        "compose": 123,
        "io": 234,
        "satisfy": 89,
        "verify": 10
      }
    }
  }
}
```

---

## WebSocket API

### Connection

**URL:** `ws://localhost:3000/ws`

**Initial Connection Response:**
```json
{
  "type": "ack",
  "payload": {
    "clientId": "unique-client-id",
    "message": "Connected to AiSE Reloaded WebSocket server"
  },
  "timestamp": 1234567890
}
```

---

### Join Room

**Message Type:** `join-room`

**Client -> Server:**
```json
{
  "type": "join-room",
  "payload": {
    "roomId": "room-uuid",
    "userId": "user123",
    "username": "John Doe"
  },
  "timestamp": 1234567890,
  "messageId": "msg-uuid"
}
```

**Server -> Client (ACK):**
```json
{
  "type": "ack",
  "payload": {
    "action": "joined-room",
    "roomId": "room-uuid",
    "room": {
      "id": "room-uuid",
      "name": "Project Alpha",
      "users": [
        {
          "userId": "user123",
          "username": "John Doe",
          "color": "#FF6B6B",
          "joinedAt": "...",
          "lastActivity": "..."
        }
      ],
      "version": 45
    },
    "state": {
      "nodes": [...],
      "relationships": [...],
      "version": 45
    }
  },
  "timestamp": 1234567890,
  "messageId": "msg-uuid"
}
```

**Broadcast to Other Users:**
```json
{
  "type": "user-joined",
  "payload": {
    "userId": "user123",
    "username": "John Doe",
    "user": {...}
  },
  "timestamp": 1234567890
}
```

---

### Leave Room

**Message Type:** `leave-room`

**Client -> Server:**
```json
{
  "type": "leave-room",
  "payload": {},
  "timestamp": 1234567890
}
```

---

### Canvas Update

**Message Type:** `canvas-update`

**Client -> Server:**
```json
{
  "type": "canvas-update",
  "payload": {
    "id": "update-uuid",
    "type": "node-created",
    "timestamp": 1234567890,
    "userId": "user123",
    "roomId": "room-uuid",
    "data": {
      "node": {...}
    },
    "version": 46
  },
  "timestamp": 1234567890,
  "roomId": "room-uuid"
}
```

**Canvas Update Types:**
- `node-created`
- `node-updated`
- `node-deleted`
- `relationship-created`
- `relationship-updated`
- `relationship-deleted`
- `bulk-update`

**Server -> All Clients in Room:**
```json
{
  "type": "canvas-update",
  "payload": {...},
  "timestamp": 1234567890,
  "userId": "user123"
}
```

---

### Operational Transform

**Message Type:** `operation`

**Client -> Server:**
```json
{
  "type": "operation",
  "payload": {
    "id": "op-uuid",
    "type": "update",
    "path": "/nodes/node-uuid/properties/Name",
    "value": "NewName",
    "oldValue": "OldName",
    "timestamp": 1234567890,
    "userId": "user123",
    "version": 47
  },
  "timestamp": 1234567890
}
```

**Operation Types:**
- `insert`: Create new entity
- `update`: Modify existing entity
- `delete`: Remove entity

**Conflict Resolution:**
- Same path operations are transformed
- Later timestamp wins for updates
- Delete always wins over update
- First operation wins for deletes

---

### Sync Request

**Message Type:** `sync-request`

**Client -> Server:**
```json
{
  "type": "sync-request",
  "payload": {},
  "timestamp": 1234567890
}
```

**Server -> Client:**
```json
{
  "type": "sync-response",
  "payload": {
    "roomId": "room-uuid",
    "state": {
      "nodes": [...],
      "relationships": [...],
      "version": 47
    },
    "users": [...]
  },
  "timestamp": 1234567890
}
```

---

### Error Messages

**Server -> Client:**
```json
{
  "type": "error",
  "payload": {
    "error": "Error message",
    "details": {...}
  },
  "timestamp": 1234567890,
  "messageId": "original-msg-uuid"
}
```

---

### Keepalive

**Protocol:** WebSocket ping/pong

- Server sends ping every 30 seconds
- Client must respond with pong
- Inactive clients (no pong for 30s) are disconnected
- Inactive users (no activity for 5 minutes) are removed from rooms

---

## Error Handling

### Standard Error Response

```json
{
  "error": "Error message",
  "details": "Additional information or validation errors"
}
```

### HTTP Status Codes

- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Validation error
- `404 Not Found`: Resource not found
- `409 Conflict`: Operational transform conflict
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `501 Not Implemented`: Feature not yet implemented

### Validation Errors

```json
{
  "error": "Validation failed",
  "details": [
    "Name must be PascalCase",
    "Descr is required"
  ]
}
```

### Ontology Validation Errors

```json
{
  "error": "Ontology validation failed",
  "details": {
    "violations": [
      {
        "rule": "function_requirements",
        "message": "Function must have at least one requirement",
        "nodeId": "...",
        "severity": "error"
      }
    ]
  }
}
```

---

## Rate Limiting

### Limits

**General API:** 100 requests per minute per IP
**Write Operations:** 50 requests per minute per IP
**Validation Endpoints:** 200 requests per minute per IP

### Headers

Rate limit information is included in response headers:

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded Response

**Status:** `429 Too Many Requests`

```json
{
  "error": "Too many requests",
  "details": "Maximum 100 requests per 60 seconds allowed"
}
```

---

## Performance Targets

- **REST API:** <100ms response time for most operations
- **Canvas Sync:** <50ms for WebSocket message delivery
- **Graph Validation:** <2s for graphs with <1000 nodes
- **Test Derivation:** <500ms for 10 requirements
- **WebSocket Latency:** <100ms round-trip

---

## Multi-User Coordination

### Concurrent Users

- **Maximum:** 10 concurrent users per room
- **Conflict Resolution:** Operational Transform (OT)
- **Locking:** Optimistic (no locks, conflicts resolved via OT)

### State Synchronization

1. Client joins room → receives full state
2. Client makes change → broadcasts update
3. All clients receive update → apply to local state
4. Conflicts detected → OT resolves automatically

### Version Management

- Each operation increments version number
- Clients track version to detect out-of-sync state
- Sync request available to re-sync at any time

---

## Example Workflows

### Creating a Complete Function

```bash
# 1. Create function node
POST /api/nodes
{
  "type": "FUNC",
  "properties": {
    "Name": "ProcessData",
    "Descr": "Process incoming data"
  }
}

# 2. Create requirement
POST /api/nodes
{
  "type": "REQ",
  "properties": {
    "Name": "DataProcessingReq",
    "Descr": "System shall process data within 100ms"
  }
}

# 3. Link function to requirement
POST /api/relationships
{
  "type": "satisfy",
  "source": "function-uuid",
  "target": "requirement-uuid"
}

# 4. Create module
POST /api/nodes
{
  "type": "MOD",
  "properties": {
    "Name": "DataModule",
    "Descr": "Data processing module"
  }
}

# 5. Allocate function to module
POST /api/relationships
{
  "type": "allocate",
  "source": "module-uuid",
  "target": "function-uuid"
}

# 6. Create FLOW nodes for input/output
POST /api/nodes
{
  "type": "FLOW",
  "properties": {
    "Name": "InputData",
    "Descr": "Input data stream",
    "Type": "async"
  }
}

# 7. Connect FLOW to function (input)
POST /api/relationships
{
  "type": "io",
  "source": "input-flow-uuid",
  "target": "function-uuid"
}

# 8. Create output FLOW and connect
# ...

# 9. Validate
GET /api/nodes/{function-uuid}/validate
```

---

## Development Setup

### Environment Variables

Create `.env` file:

```bash
PORT=3000
NODE_ENV=development

NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

LOG_LEVEL=info
LOG_FILE=logs/aise-backend.log

MAX_CONCURRENT_USERS=10
```

### Running the Server

```bash
# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run validation tests
npm run test:validation

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## Support

For issues, questions, or feature requests, please contact the development team.

**Version:** 1.0.0
**Last Updated:** 2024-01-01
