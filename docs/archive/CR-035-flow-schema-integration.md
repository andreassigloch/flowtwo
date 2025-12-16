# CR-035: FLOW Schema Integration for Port Extraction

**Type:** Feature
**Status:** Planned
**Priority:** LOW
**Created:** 2025-12-08
**Author:** andreas@siglochconsulting

## Problem / Use Case

The `PortExtractor` extracts FLOW properties via regex from the `descr` field:

**Location:** [port-extractor.ts:108](../../src/graph-engine/port-extractor.ts#L108)
```typescript
// TODO: Extract from flowNode.properties when schema is defined
return {
  dataType: flowNode.descr?.match(/Type:\s*(\w+)/)?.[1],
  pattern: flowNode.descr?.match(/Pattern:\s*(.+)/)?.[1],
  validation: flowNode.descr?.match(/Validation:\s*(.+)/)?.[1],
};
```

The ontology defines a proper 3-layer model for FLOW nodes:
- **Layer 1 (Semantik):** in `descr` - what the data means
- **Layer 2 (Datenformat):** via `relation→SCHEMA` (DataSchema) - structure
- **Layer 3 (Protokoll):** via `relation→SCHEMA` (ProtocolSchema) - transport

The regex approach bypasses this architecture.

## Requirements

### Functional Requirements
- FR-1: Extract FLOW data type from linked SCHEMA node (Layer 2)
- FR-2: Extract FLOW protocol from linked ProtocolSchema (Layer 3)
- FR-3: Keep `descr` for semantic meaning (Layer 1) - no change
- FR-4: Graceful fallback when SCHEMA relation missing

### Non-Functional Requirements
- NFR-1: No performance regression (cache SCHEMA lookups)
- NFR-2: Backward compatible with existing graphs lacking SCHEMA relations

## Architecture / Solution Approach

### Ontology-Defined Model

From `ontology-rules.json`:
```json
"FLOW": {
  "requiredRelations": ["relation→SCHEMA (DataSchema)"],
  "optionalRelations": ["relation→SCHEMA (ProtocolSchema)"]
}

"SCHEMA": {
  "requiredProperties": ["uuid", "type", "name", "descr", "struct"],
  "categories": {
    "DataSchema": "Data structure/format (SysML Interface Block)",
    "ProtocolSchema": "Transport behavior (SysML Flow Specification)"
  }
}
```

### Port Extraction Flow

```
FLOW node
  ├── descr → semantic meaning (Layer 1)
  ├── relation→DataSchema → struct JSON → data type, fields (Layer 2)
  └── relation→ProtocolSchema → struct JSON → protocol, encoding (Layer 3)
```

### Implementation Approach

```typescript
extractFlowProperties(flowNode: Node, edges: Edge[], nodes: Map<string, Node>) {
  // Layer 1: Semantic from descr (keep existing)
  const semantic = flowNode.descr;

  // Layer 2: Data format from SCHEMA relation
  const dataSchema = this.findRelatedSchema(flowNode, edges, nodes, 'DataSchema');
  const dataType = dataSchema?.struct ? JSON.parse(dataSchema.struct) : null;

  // Layer 3: Protocol from SCHEMA relation
  const protocolSchema = this.findRelatedSchema(flowNode, edges, nodes, 'ProtocolSchema');
  const protocol = protocolSchema?.struct ? JSON.parse(protocolSchema.struct) : null;

  return { semantic, dataType, protocol };
}
```

## Implementation Plan

### Phase 1: SCHEMA Lookup Helper (2-3 hours)
- Add `findRelatedSchema()` to PortExtractor
- Query via AgentDB edges (not Neo4j)
- Handle missing relations gracefully

### Phase 2: Update extractFlowProperties (2-3 hours)
- Replace regex with SCHEMA-based extraction
- Parse `struct` JSON from SCHEMA nodes
- Return structured port metadata

### Phase 3: View Integration (1-2 hours)
- Update dataflow views to use new port data
- Display schema-derived type info
- Handle backward compatibility

### Phase 4: Validation Rule (1 hour)
- `flow_data_schema` rule already exists in ontology
- Ensure warning shown when SCHEMA relation missing

## Acceptance Criteria

- [ ] Port data type extracted from DataSchema.struct
- [ ] Port protocol extracted from ProtocolSchema.struct
- [ ] Fallback to `null` when SCHEMA relation missing
- [ ] Existing graphs without SCHEMA still render
- [ ] `flow_data_schema` validation warns on missing relation

## Dependencies

- CR-032: AgentDB for edge/node queries
- ontology-rules.json: FLOW and SCHEMA definitions
- Existing SCHEMA nodes in test graphs

## Estimated Effort

Total: 6-9 hours (1 day)

## References

- FLOW definition: [ontology-rules.json:101-116](../../settings/ontology-rules.json#L101-L116)
- SCHEMA definition: [ontology-rules.json:160-179](../../settings/ontology-rules.json#L160-L179)
- flow_data_schema rule: [ontology-rules.json:399-406](../../settings/ontology-rules.json#L399-L406)
