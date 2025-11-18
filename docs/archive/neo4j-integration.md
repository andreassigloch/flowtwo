# Neo4j Integration Guide - AiSE Reloaded

## Overview

This document describes the complete Neo4j database integration for AiSE Reloaded's Ontology V3, including schema setup, TypeScript client usage, and validation rules.

## Architecture

### Components

1. **neo4j-schema.cypher** - Complete database schema with constraints and indexes
2. **neo4j-client.ts** - Type-safe TypeScript client for database operations
3. **validators.ts** - 12 validation rules as queryable functions
4. **seed-data.cypher** - Example data demonstrating proper ontology usage

### Ontology V3 Structure

#### Node Types (10 total)

| Type | Description | Required Properties |
|------|-------------|---------------------|
| SYS | System containing other systems/use cases | uuid, Name, Descr |
| ACTOR | External entity interacting with functions | uuid, Name, Descr |
| UC | Use case organizing functions | uuid, Name, Descr |
| FCHAIN | Function chain (sequence of related functions) | uuid, Name, Descr |
| FUNC | Specific capability or action | uuid, Name, Descr |
| FLOW | Data flow contract between functions/actors | uuid, Name, Descr, Type*, Pattern*, Validation* |
| REQ | Requirement specifying constraints | uuid, Name, Descr |
| TEST | Verification/validation test | uuid, Name, Descr |
| MOD | Module containing functions | uuid, Name, Descr |
| SCHEMA | Global data structure definition | uuid, Name, Descr, Struct |

*Optional properties

#### Relationship Types (6 total)

| Type | Description | Valid Connections |
|------|-------------|-------------------|
| compose | Composition/nesting | SYS→SYS, SYS→UC, UC→UC, UC→ACTOR, FCHAIN→ACTOR, UC→FCHAIN, FCHAIN→FUNC, FCHAIN→FLOW, SYS→MOD |
| io | Input/Output connections | FUNC↔FLOW, ACTOR↔FLOW |
| satisfy | Specification relationships | SYS→REQ, REQ→REQ, UC→REQ, FUNC→REQ |
| verify | Testing relationships | TEST→TEST, REQ→TEST |
| allocate | Function-to-module allocation | MOD→FUNC |
| relation | Generic relationships | *→* (any to any), SCHEMA→FUNC, FLOW→SCHEMA |

## Installation & Setup

### Prerequisites

```bash
# Install Neo4j Community Edition 5.x
# Download from: https://neo4j.com/download-center/

# Or use Docker
docker run \
  --name neo4j-aise \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5-community
```

### Install Dependencies

```bash
# Install Neo4j driver for Node.js
npm install neo4j-driver uuid

# Install TypeScript types
npm install --save-dev @types/uuid
```

### Initialize Database Schema

```bash
# Using cypher-shell
cypher-shell -u neo4j -p password < src/database/neo4j-schema.cypher

# Or using Neo4j Browser
# Navigate to http://localhost:7474
# Copy and paste contents of neo4j-schema.cypher
```

### Load Seed Data (Optional)

```bash
# Load example data
cypher-shell -u neo4j -p password < src/database/seed-data.cypher
```

## Usage

### Basic Client Operations

```typescript
import Neo4jClient from './database/neo4j-client';

// Initialize client
const client = new Neo4jClient(
  'bolt://localhost:7687',
  'neo4j',
  'password',
  'neo4j'
);

// Test connection
const isConnected = await client.testConnection();
console.log('Connected:', isConnected);

// Create a node
const newSystem = await client.createNode({
  type: 'SYS',
  properties: {
    Name: 'MyNewSystem',
    Descr: 'Description of my system'
  }
});

// Get node by UUID
const node = await client.getNodeByUuid(newSystem.uuid);

// Update node
await client.updateNode(node.uuid, {
  Descr: 'Updated description'
});

// Search nodes
const results = await client.searchNodesByName('MyNew', 'SYS');

// Create relationship
const relationship = await client.createRelationship({
  type: 'compose',
  source: parentSystem.uuid,
  target: childSystem.uuid
});

// Get node relationships
const relationships = await client.getNodeRelationships(
  node.uuid,
  'both' // 'incoming', 'outgoing', or 'both'
);

// Delete node (and all relationships)
await client.deleteNode(node.uuid);

// Close connection
await client.close();
```

### Advanced Operations

```typescript
// Get all descendants via compose relationships
const descendants = await client.getDescendants(systemUuid, 10);

// Get path between two nodes
const path = await client.getPath(sourceUuid, targetUuid);

// Get functional flow components
const flow = await client.getFunctionalFlow(fchainUuid);
console.log(flow.actors, flow.functions, flow.flows);

// Get database statistics
const stats = await client.getStatistics();
console.log('Total nodes:', stats.nodeCount);
console.log('By type:', stats.nodeTypeBreakdown);

// Execute raw Cypher query
const records = await client.executeQuery(
  'MATCH (n:FUNC)-[:satisfy]->(r:REQ) RETURN n, r LIMIT 10'
);
```

### Transaction Support

```typescript
// Execute multiple operations in a transaction
await client.executeTransaction(async (tx) => {
  // All operations in this block are atomic
  await tx.run(
    'CREATE (n:FUNC {uuid: $uuid, Name: $name, Descr: $descr})',
    { uuid: 'func-123', name: 'MyFunc', descr: 'Description' }
  );

  await tx.run(
    'CREATE (n:REQ {uuid: $uuid, Name: $name, Descr: $descr})',
    { uuid: 'req-123', name: 'MyReq', descr: 'Requirement' }
  );

  await tx.run(
    'MATCH (f:FUNC {uuid: $fUuid}), (r:REQ {uuid: $rUuid}) CREATE (f)-[:satisfy]->(r)',
    { fUuid: 'func-123', rUuid: 'req-123' }
  );
});
```

## Validation

### Running Validators

```typescript
import { OntologyValidator } from './database/validators';

const validator = new OntologyValidator(client);

// Run all validation rules
const report = await validator.validateAll();
console.log('Valid:', report.isValid);
console.log('Total violations:', report.totalViolations);
console.log('By rule:', report.violationsByRule);

// Inspect specific violations
for (const result of report.results) {
  if (!result.isValid) {
    console.log(`\nRule: ${result.ruleId}`);
    for (const violation of result.violations) {
      console.log(`  - ${violation.message}`);
      console.log(`    Node: ${violation.nodeName} (${violation.nodeUuid})`);
    }
  }
}

// Validate specific node
const nodeViolations = await validator.validateNode('func-001');
console.log('Node violations:', nodeViolations);

// Get validation statistics
const stats = await validator.getValidationStatistics();
console.log('Valid nodes:', stats.validNodes);
console.log('Invalid nodes:', stats.invalidNodes);
console.log('Common violations:', stats.mostCommonViolations);
```

### Individual Validation Rules

```typescript
// Rule 1: Naming conventions
const namingResult = await validator.validateNaming();

// Rule 2: No isolated nodes
const isolationResult = await validator.validateIsolation();

// Rule 3: Functions have requirements
const funcReqResult = await validator.validateFunctionRequirements();

// Rule 4: Functions have I/O via FLOW nodes
const funcIOResult = await validator.validateFunctionIO();

// Rule 5: FLOW nodes have incoming/outgoing connections
const flowConnResult = await validator.validateFlowConnectivity();

// Rule 6: Functional flows have Actor input/output + Functions
const funcFlowResult = await validator.validateFunctionalFlow();

// Rule 7: FCHAIN elements are connected via io relationships
const fchainResult = await validator.validateFChainConnectivity();

// Rule 8: Cycles have exit paths
const cyclesResult = await validator.validateFlowCycles();

// Rule 9: Functions allocated to exactly one MOD
const allocResult = await validator.validateFunctionAllocation();

// Rule 10: Requirements have tests
const reqVerifyResult = await validator.validateRequirementsVerification();

// Rule 11: Leaf use cases have actors
const leafUCResult = await validator.validateLeafUseCaseActor();

// Rule 12: Data structures reference SCHEMA nodes
const schemaResult = await validator.validateSchemaUsage();
```

## 12 Validation Rules

### Rule 1: Naming Conventions
All names must start with uppercase letter (PascalCase) and not exceed 25 characters.

**Example Violations:**
- `lowercase` ❌ (must start with uppercase)
- `ThisIsAVeryLongNameExceeding25Chars` ❌ (exceeds 25 characters)
- `ValidName` ✅

### Rule 2: No Isolation
All elements must have at least one relationship to another element.

**Example:**
```cypher
// Violation: Isolated node
CREATE (n:FUNC {uuid: '...', Name: 'IsolatedFunc', Descr: '...'})

// Valid: Node has relationships
CREATE (n:FUNC {...})-[:satisfy]->(r:REQ {...})
```

### Rule 3: Function Requirements
Every FUNC node must have at least one satisfy relationship to a REQ node.

**Example:**
```cypher
// Valid
CREATE (f:FUNC {...})-[:satisfy]->(r:REQ {...})
```

### Rule 4: Function I/O
Every FUNC must have:
- At least one incoming io relationship from a FLOW node
- At least one outgoing io relationship to a FLOW node

**Example:**
```cypher
// Valid
CREATE (flow1:FLOW {...})-[:io]->(f:FUNC {...})-[:io]->(flow2:FLOW {...})
```

### Rule 5: FLOW Node Connectivity
Every FLOW node must have:
- At least one incoming io relationship
- At least one outgoing io relationship

**Example:**
```cypher
// Valid
CREATE (source)-[:io]->(flow:FLOW)-[:io]->(target)
```

### Rule 6: Functional Flow
A functional flow must have:
- An ACTOR as input
- An ACTOR as output
- At least one FUNC
- All connected through FLOW nodes via io relationships

**Example:**
```cypher
// Valid
CREATE (actor1:ACTOR)-[:io]->(flow1:FLOW)-[:io]->(func:FUNC)-[:io]->(flow2:FLOW)-[:io]->(actor2:ACTOR)
```

### Rule 7: FCHAIN Connectivity
All elements within a FCHAIN must be connected through io relationships via FLOW nodes.

**Example:**
```cypher
// Valid
CREATE (fchain:FCHAIN)-[:compose]->(func1:FUNC)
CREATE (fchain)-[:compose]->(flow:FLOW)
CREATE (fchain)-[:compose]->(func2:FUNC)
CREATE (func1)-[:io]->(flow)-[:io]->(func2)
```

### Rule 8: Flow Cycles
io relationships may form cycles, but each cycle must have at least one exit path to an ACTOR.

**Example:**
```cypher
// Valid: Cycle with exit
CREATE (f1:FUNC)-[:io]->(flow1:FLOW)-[:io]->(f2:FUNC)-[:io]->(flow2:FLOW)-[:io]->(f1)
CREATE (f2)-[:io]->(exitFlow:FLOW)-[:io]->(actor:ACTOR)
```

### Rule 9: Function Allocation
Each FUNC must be allocated to exactly one MOD via allocate relationship.

**Example:**
```cypher
// Valid
CREATE (mod:MOD)-[:allocate]->(func:FUNC)

// Violation: Not allocated or allocated to multiple MODs
```

### Rule 10: Requirements Verification
Each REQ must have at least one verify relationship to a TEST node.

**Example:**
```cypher
// Valid
CREATE (req:REQ)-[:verify]->(test:TEST)
```

### Rule 11: Leaf Use Case Actor
A leaf use case (UC with no child UCs) must have at least one composed ACTOR.

**Example:**
```cypher
// Valid
CREATE (uc:UC)-[:compose]->(actor:ACTOR)
WHERE NOT (uc)-[:compose]->(:UC)
```

### Rule 12: Schema Usage
Data structures outside modules should be defined by SCHEMA nodes via relation relationships.

**Example:**
```cypher
// Valid
CREATE (flow:FLOW)-[:relation]->(schema:SCHEMA)
```

## Query Patterns

### Find All Functions Without Requirements
```cypher
MATCH (func:FUNC)
WHERE NOT (func)-[:satisfy]->(req:REQ)
RETURN func.Name, func.uuid
```

### Get Complete Functional Flow
```cypher
MATCH (actor1:ACTOR)-[:io*]->(func:FUNC)-[:io*]->(actor2:ACTOR)
WHERE actor1 <> actor2
RETURN actor1, func, actor2
```

### Find Orphaned Nodes
```cypher
MATCH (n)
WHERE NOT (n)-[]-()
RETURN labels(n)[0] as Type, n.Name, n.uuid
```

### Get Requirement Traceability
```cypher
MATCH path = (sys:SYS)-[:compose*]->(uc:UC)-[:compose*]->(fchain:FCHAIN)-[:compose]->(func:FUNC)-[:satisfy]->(req:REQ)-[:verify]->(test:TEST)
RETURN path
```

### Get Module Function Allocation
```cypher
MATCH (mod:MOD)-[:allocate]->(func:FUNC)
RETURN mod.Name as Module, collect(func.Name) as Functions
```

### Find Circular Dependencies
```cypher
MATCH path = (n)-[:io*2..10]->(n)
RETURN DISTINCT n.Name, length(path) as CycleLength
```

## Performance Optimization

### Indexes
All node types have indexes on:
- `uuid` (unique constraint)
- `Name` (range index)
- `Descr` (full-text search)

### Query Optimization Tips

1. **Always use UUID for lookups**
   ```cypher
   // Fast
   MATCH (n {uuid: $uuid})

   // Slower
   MATCH (n) WHERE n.Name = $name
   ```

2. **Limit relationship depth**
   ```cypher
   // Use bounded path length
   MATCH (n)-[:compose*1..3]->(m)
   ```

3. **Use PROFILE for query analysis**
   ```cypher
   PROFILE MATCH (n:FUNC)-[:satisfy]->(r:REQ) RETURN n, r
   ```

4. **Batch operations in transactions**
   ```typescript
   await client.executeTransaction(async (tx) => {
     for (const item of largeDataset) {
       await tx.run('CREATE ...', item);
     }
   });
   ```

## Error Handling

```typescript
try {
  const node = await client.createNode({
    type: 'FUNC',
    properties: { Name: 'MyFunc', Descr: 'Description' }
  });
} catch (error) {
  if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
    console.error('Constraint violation:', error.message);
  } else if (error.code === 'Neo.ClientError.Statement.SyntaxError') {
    console.error('Invalid Cypher syntax:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Integration with Claude-Flow

### Memory Store Pattern

```typescript
// Store validation results in ReasoningBank
import { ReasoningBank } from 'claude-flow';

const reasoningBank = new ReasoningBank('aise-reloaded');

const validationReport = await validator.validateAll();
await reasoningBank.store('validation', {
  timestamp: validationReport.timestamp,
  result: validationReport
});

// Retrieve validation history
const history = await reasoningBank.retrieve('validation');
```

### AgentDB Vector Search

```typescript
// Store requirement descriptions for semantic search
import { AgentDB } from 'claude-flow';

const agentDB = new AgentDB('aise-reloaded');

// Index all requirements
const requirements = await client.getNodesByType('REQ');
for (const req of requirements) {
  await agentDB.store({
    id: req.uuid,
    text: `${req.properties.Name}: ${req.properties.Descr}`,
    metadata: { type: 'REQ', uuid: req.uuid }
  });
}

// Semantic search
const results = await agentDB.search('payment security requirements', 5);
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Neo4jClient from './neo4j-client';

describe('Neo4j Client', () => {
  let client: Neo4jClient;

  beforeAll(async () => {
    client = new Neo4jClient();
    await client.testConnection();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should create a node', async () => {
    const node = await client.createNode({
      type: 'FUNC',
      properties: { Name: 'TestFunc', Descr: 'Test' }
    });
    expect(node.uuid).toBeDefined();
    expect(node.type).toBe('FUNC');
  });

  it('should validate naming conventions', async () => {
    const validator = new OntologyValidator(client);
    const result = await validator.validateNaming();
    expect(result.isValid).toBe(true);
  });
});
```

## Troubleshooting

### Connection Issues

```bash
# Check Neo4j is running
docker ps | grep neo4j

# Check logs
docker logs neo4j-aise

# Test connection
cypher-shell -u neo4j -p password "RETURN 1"
```

### Constraint Violations

```cypher
// Check existing constraints
SHOW CONSTRAINTS;

// Drop constraint if needed
DROP CONSTRAINT constraint_name;

// Recreate from neo4j-schema.cypher
```

### Performance Issues

```cypher
// Check index usage
SHOW INDEXES;

// Rebuild indexes
DROP INDEX index_name;
CREATE INDEX index_name ...;

// Analyze query performance
PROFILE MATCH ...;
```

## Best Practices

1. **Always validate before commit** - Run validators before persisting changes
2. **Use transactions for multi-step operations** - Ensure atomicity
3. **Implement optimistic locking** - Use versioning for concurrent updates
4. **Cache validation results** - Store in ReasoningBank for audit trail
5. **Monitor database statistics** - Track node/relationship counts over time
6. **Regular backups** - Schedule Neo4j backup procedures
7. **Use UUIDs consistently** - Never expose internal Neo4j IDs
8. **Validate relationship types** - Check valid_connections before creating relationships

## References

- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
- [Neo4j JavaScript Driver](https://neo4j.com/docs/javascript-manual/current/)
- [Ontology V3 Schema](../ontology_schema.json)
- [Systems Engineering Standards (ISO 29148, INCOSE)](https://www.incose.org/)

## Support

For issues or questions:
1. Check Neo4j logs
2. Run validation report
3. Review this documentation
4. Consult ontology_schema.json for rules clarification
