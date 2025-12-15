---
name: "Neo4j Query"
description: "Execute Cypher queries against GraphEngine Neo4j database. Use when investigating graph data, debugging data issues, checking node/edge relationships, verifying Format E structures, or analyzing system models."
---

# Neo4j Query Skill

## What This Skill Does

Execute Cypher queries against the GraphEngine Neo4j database for:
- Investigating graph data structures
- Debugging data issues (missing edges, orphan nodes)
- Verifying Format E model integrity
- Analyzing FCHAIN dataflows and io-flow-io connections
- Checking node/edge counts and relationships

## Prerequisites

- Neo4j running locally (bolt://localhost:7687)
- Credentials from `.env`: `NEO4J_USER`, `NEO4J_PASSWORD`

## Quick Reference

### Connection
```bash
# From project root - read credentials
source .env
cypher-shell -u $NEO4J_USER -p $NEO4J_PASSWORD
```

Or use direct connection:
```bash
cypher-shell -u neo4j -p aise_password_2024
```

---

## Common Queries

### System Overview

```cypher
// Count all nodes by type
MATCH (n)
RETURN labels(n)[0] AS type, count(*) AS count
ORDER BY count DESC;

// Count all edges by type
MATCH ()-[r]->()
RETURN r.type AS type, count(*) AS count
ORDER BY count DESC;

// List all systems
MATCH (s:SYS)
RETURN s.semanticId, s.name, s.descr;
```

### FCHAIN Analysis (io-flow-io connections)

```cypher
// Find all FCHAINs with their composed children
MATCH (fchain:FCHAIN)<-[c:COMPOSE]-(parent)
OPTIONAL MATCH (fchain)-[comp:COMPOSE]->(child)
RETURN fchain.name AS fchain,
       parent.name AS parent,
       collect(DISTINCT {type: labels(child)[0], name: child.name}) AS children;

// Trace io-flow-io dataflow for a specific FCHAIN
MATCH (fchain:FCHAIN {name: "PRDCreationChain"})-[:COMPOSE]->(child)
WITH collect(child) AS children
UNWIND children AS c
OPTIONAL MATCH (c)-[:IO]->(flow:FLOW)-[:IO]->(target)
WHERE target IN children
RETURN c.name AS source, flow.name AS flowName, target.name AS target;

// Find FUNC→FLOW→FUNC connections within an FCHAIN
MATCH (fchain:FCHAIN)-[:COMPOSE]->(func1:FUNC),
      (fchain)-[:COMPOSE]->(flow:FLOW),
      (fchain)-[:COMPOSE]->(func2:FUNC),
      (func1)-[:IO]->(flow)-[:IO]->(func2)
RETURN fchain.name AS fchain,
       func1.name AS sourceFunc,
       flow.name AS flowName,
       func2.name AS targetFunc;
```

### Edge Type Queries

```cypher
// All edges stored with type as property (GraphEngine convention)
MATCH (a)-[r]->(b)
WHERE r.type IS NOT NULL
RETURN labels(a)[0] AS sourceType, r.type AS edgeType, labels(b)[0] AS targetType, count(*) AS count
ORDER BY count DESC;

// Find compose edges (hierarchical structure)
MATCH (parent)-[r {type: 'compose'}]->(child)
RETURN labels(parent)[0] AS parentType, parent.name AS parent,
       labels(child)[0] AS childType, child.name AS child
LIMIT 50;

// Find io edges (data flow)
MATCH (source)-[r {type: 'io'}]->(target)
RETURN labels(source)[0] AS sourceType, source.name AS source,
       labels(target)[0] AS targetType, target.name AS target
LIMIT 50;
```

### Data Integrity Checks

```cypher
// Find orphan nodes (no incoming or outgoing edges)
MATCH (n)
WHERE NOT (n)--()
RETURN labels(n)[0] AS type, n.semanticId, n.name;

// Find FLOW nodes without io connections
MATCH (f:FLOW)
WHERE NOT (f)-[:IO]-() AND NOT ()-[:IO]->(f)
RETURN f.semanticId, f.name AS orphanFlow;

// Find duplicate semanticIds (should be unique!)
MATCH (n)
WITH n.semanticId AS sid, count(*) AS cnt
WHERE cnt > 1
RETURN sid, cnt;

// Find missing compose edges (FUNC not under any parent)
MATCH (f:FUNC)
WHERE NOT ()-[:COMPOSE]->(f)
RETURN f.semanticId, f.name AS orphanFunc;
```

### Specific Node Queries

```cypher
// Get node by semanticId
MATCH (n {semanticId: 'your-semantic-id'})
RETURN n;

// Get node with all its edges
MATCH (n {semanticId: 'your-semantic-id'})-[r]-(connected)
RETURN n, r, connected;

// Search nodes by name pattern
MATCH (n)
WHERE n.name CONTAINS 'Create'
RETURN labels(n)[0] AS type, n.semanticId, n.name;
```

### Format E Structure Validation

```cypher
// Verify SYS→UC→FCHAIN→FUNC hierarchy
MATCH path = (s:SYS)-[:COMPOSE*1..4]->(leaf)
RETURN s.name AS system,
       [n IN nodes(path) | labels(n)[0] + ':' + n.name] AS hierarchy
LIMIT 20;

// Find ACTORs connected to FCHAINs
MATCH (fchain:FCHAIN)-[:COMPOSE]->(actor:ACTOR)
RETURN fchain.name AS fchain, collect(actor.name) AS actors;

// Verify FLOW composition (FLOWs should be under FCHAIN)
MATCH (flow:FLOW)
OPTIONAL MATCH (parent)-[:COMPOSE]->(flow)
RETURN flow.name,
       CASE WHEN parent IS NULL THEN 'ORPHAN' ELSE labels(parent)[0] + ':' + parent.name END AS parent;
```

---

## Batch Commands

### Clear All Data (DANGER!)
```cypher
// Delete everything - use with caution!
MATCH (n) DETACH DELETE n;
```

### Export to JSON (via cypher-shell)
```bash
cypher-shell -u neo4j -p aise_password_2024 \
  "MATCH (n) RETURN n" --format plain > nodes.txt
```

---

## Troubleshooting

### Connection Issues
```bash
# Check Neo4j is running
curl -I http://localhost:7474

# Check bolt port
nc -zv localhost 7687
```

### Query Performance
```cypher
// Profile a slow query
PROFILE MATCH (n)-[r*1..5]->(m) RETURN count(*);

// Explain query plan
EXPLAIN MATCH (n:FUNC)-[:IO]->(f:FLOW) RETURN n, f;
```

### Index Management
```cypher
// List indexes
SHOW INDEXES;

// Create index on semanticId (recommended)
CREATE INDEX node_semantic_id IF NOT EXISTS FOR (n:Node) ON (n.semanticId);
```

---

## Resources

- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
- [GraphEngine Format E Schema](docs/specs/format-e.schema.json)
- [CR-032 Unified Data Layer](docs/cr/CR-032-unified-data-layer.md)
