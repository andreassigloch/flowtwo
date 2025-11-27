# AGENTEN-BASIERTES SYSTEMS ENGINEERING FRAMEWORK

## Ontology Mapping (v3.0.5)

| SE Concept | Ontology Node | Relationship |
|------------|---------------|--------------|
| System | SYS | compose → SYS, UC, MOD, FUNC (v3.0.5) |
| Use Case | UC | compose → UC, FCHAIN; satisfy → REQ |
| Requirement | REQ | satisfy (nested); verify → TEST |
| Module/Block | MOD | compose → MOD; allocate → FUNC |
| Function Chain | FCHAIN | compose → ACTOR, FUNC, FLOW |
| Function | FUNC | compose → FUNC; satisfy → REQ; **io ↔ FLOW** (top-level blocks MUST connect via FLOW) |
| Data Flow | FLOW | io ↔ FUNC, ACTOR; relation → SCHEMA |
| Actor | ACTOR | io ↔ FLOW (within FCHAIN only) |
| Test | TEST | verify ← REQ |
| Schema | SCHEMA | relation → FUNC, FLOW |

---

## ROLLEN

- **REQUIREMENTS ENGINEER**: Stakeholder Needs → SYS, UC, REQ nodes
- **SYSTEM ARCHITECT**: MOD hierarchy (5-9 blocks per Miller's Law), SCHEMA definitions
- **FUNCTIONAL ANALYST**: FCHAIN, FUNC, FLOW, ACTOR with io connections
- **SYSTEM ENGINEER** (Lead): Traceability (satisfy, allocate, verify), Konsistenz-Checks

---

## PHASEN & BASELINES

```
PHASE 1: SYSTEM REQUIREMENTS
├─ SYS node (top-level system)
├─ UC hierarchy (compose edges)
├─ REQ nodes with satisfy edges from UC
├─ NFR requirements at SYS level
└─ ✓ BASELINE: SYS → UC → REQ graph

PHASE 2: LOGICAL ARCHITECTURE
├─ Top-Level FUNC nodes (5-9 per Miller's Law)
│   └─ SYS -compose-> FUNC (logical blocks, v3.0.4)
├─ FLOW nodes connecting top-level FUNCs via io edges
├─ SCHEMA nodes for interface contracts (FLOW→SCHEMA)
├─ Top-Level FUNC -satisfy-> REQ edges (NFR traceability)
├─ Optional: FUNC -compose-> FUNC (nested decomposition)
│   └─ Detailed functions nested under top-level blocks
├─ Use-Case FCHAINs (Activity Diagrams for each leaf UC)
│   └─ Contains ACTOR, detailed FUNC, FLOW with io chains
└─ ✓ BASELINE: Logical Architecture Document

PHASE 3: PHYSICAL ARCHITECTURE (Implementation)
├─ MOD hierarchy (5-9 top-level modules)
│   └─ Often 1:1 with top-level FUNC, but not required
├─ SYS -compose-> MOD edges
├─ MOD -allocate-> FUNC edges (function allocation)
│   └─ Maps nested detailed functions to modules
├─ Allocation Matrix: which MOD implements which FUNC
└─ ✓ BASELINE: MOD + Allocation Graph

PHASE 4: INTEGRATION & VERIFICATION
├─ TEST nodes for each REQ
├─ REQ -verify-> TEST edges
├─ Traceability validation (all rules)
├─ Full path: REQ ← FUNC ← MOD + REQ → TEST
└─ ✓ BASELINE: Verified complete graph
```

---

## ONTOLOGY RULES (QUALITY GATES)

### Phase 1 → 2 (Requirements Complete)
- [ ] All REQ nodes have semantic IDs (Name.REQ.NNN)
- [ ] UC -satisfy-> REQ edges exist for all functional requirements
- [ ] SYS -satisfy-> REQ edges exist for all NFRs

### Phase 2 → 3 (Logical Architecture Complete)
- [ ] **5-9 top-level FUNC nodes** (Miller's Law for logical blocks)
- [ ] Top-level FUNC connected via FLOW with io edges
- [ ] **function_requirements**: Every FUNC -satisfy-> ≥1 REQ (at least NFRs)
- [ ] Optional: FUNC -compose-> FUNC for nested decomposition
- [ ] **function_io**: Every detailed FUNC has io input AND output via FLOW
- [ ] **flow_node_connectivity**: Every FLOW has io incoming AND outgoing
- [ ] **functional_flow**: Every FCHAIN has ACTOR→...→ACTOR path
- [ ] **fchain_connectivity**: All elements within FCHAIN connected via io
- [ ] All SCHEMA nodes have Struct property (JSON pseudo-code)

### Phase 3 → 4 (Physical Architecture Complete)
- [ ] **5-9 top-level MOD nodes** (Miller's Law: `assert 5 <= MOD.count <= 9`)
- [ ] **function_allocation**: Every FUNC -allocate<- exactly one MOD
- [ ] No orphan MOD nodes (each must have compose or allocate edges)
- [ ] Allocation Matrix complete (all FUNC mapped to MOD)

### Phase 4 → HANDOFF (Verification Complete)
- [ ] **requirements_verification**: Every REQ -verify-> ≥1 TEST
- [ ] **isolation**: All nodes have at least one edge
- [ ] **naming**: All names PascalCase, max 25 chars
- [ ] No orphan nodes (100% traceability)
- [ ] Full traceability: REQ ← FUNC ← MOD + REQ → TEST

---

## AUTOMATISIERTE KONSISTENZ-CHECKS (Cypher)

```cypher
// CHECK 1: Function Requirements Coverage
MATCH (f:FUNC) WHERE NOT (f)-[:satisfy]->(:REQ)
RETURN f.semanticId AS function_without_requirement

// CHECK 2: Function Allocation Coverage
MATCH (f:FUNC) WHERE NOT (:MOD)-[:allocate]->(f)
RETURN f.semanticId AS unallocated_function

// CHECK 3: Requirement Verification Coverage
MATCH (r:REQ) WHERE NOT (r)-[:verify]->(:TEST)
RETURN r.semanticId AS unverified_requirement

// CHECK 4: FLOW Connectivity
MATCH (fl:FLOW)
WHERE NOT ()-[:io]->(fl) OR NOT (fl)-[:io]->()
RETURN fl.semanticId AS disconnected_flow

// CHECK 5: Module Count (Miller's Law)
MATCH (s:SYS)-[:compose]->(m:MOD)
WITH s, count(m) AS mod_count
WHERE mod_count < 5 OR mod_count > 9
RETURN s.semanticId, mod_count AS violates_millers_law

// CHECK 6: FCHAIN Actor Boundaries
MATCH (fc:FCHAIN)-[:compose]->(a:ACTOR)
WITH fc, collect(a) AS actors
WHERE size(actors) < 2
RETURN fc.semanticId AS fchain_missing_actor_boundary
```

---

## HANDOFF ZU CODING AGENTS

### Per MOD Block Specification
```
BLOCK: [MOD.semanticId]
DESCRIPTION: [MOD.Descr]

ALLOCATED FUNCTIONS:
  - [FUNC.semanticId]: [FUNC.Descr]
    SATISFIES: [REQ.semanticId list]
    INPUT FLOWS: [FLOW.semanticId list]
    OUTPUT FLOWS: [FLOW.semanticId list]

SCHEMAS (Interface Contracts):
  - [SCHEMA.semanticId]: [SCHEMA.Struct]

DEPENDENCIES:
  - Via [FLOW.semanticId] → [other MOD.semanticId]
```

---

## EXAMPLE GRAPH

See `examples/agent-based-se-phases.txt` for complete Format E example demonstrating:
- SmartHome system with 3 use cases
- 7 modules (Miller's Law compliant)
- 2 function chains (Climate, Security)
- 10 functions with io flows
- 10 requirements with tests
- Full traceability (satisfy, allocate, verify edges)

---

## VEREINFACHUNGSVORSCHLÄGE

### 🎯 MINIMAL VIABLE FRAMEWORK (3 Phasen)

```
PHASE 1: REQUIREMENTS (SYS + UC + REQ)
├─ SYS with composed UC hierarchy
├─ REQ nodes with satisfy edges
└─ BASELINE: Requirements Graph

PHASE 2: LOGICAL ARCHITECTURE (FUNC + FLOW + FCHAIN)
├─ SYS -compose-> FUNC (v3.0.4: top-level logical functions)
├─ 5-9 Top-Level FUNC blocks directly under SYS (Miller's Law)
├─ FLOW + SCHEMA define interfaces between blocks
├─ Optional: nested FUNC under top-level (FUNC -cp-> FUNC)
├─ Use-Case FCHAINs with detailed FUNC/FLOW/ACTOR
├─ Top-Level FUNC -satisfy-> NFRs for traceability
└─ BASELINE: Logical Architecture Document

PHASE 3: PHYSICAL + VERIFICATION (MOD + TEST)
├─ 5-9 MOD blocks (implementation, often 1:1 with top-level FUNC)
├─ MOD -allocate-> FUNC (nested detailed functions)
├─ TEST nodes with REQ -verify-> TEST
└─ BASELINE: Complete Verified Graph
```

**Gate-Kriterien (minimal):**
- Phase 1 → 2: All UC have REQ, semantic IDs assigned
- Phase 2 → 3: 5-9 top-level FUNC under SYS, FCHAIN complete with ACTOR→...→ACTOR paths
- Phase 3 → Done: All detailed FUNC allocated to MOD, all REQ verified by TEST

---

## TOOL-SUPPORT

**GraphEngine Integration:**
```bash
# Import example graph
npm run import -- examples/agent-based-se-phases.txt

# Validate against ontology rules
npm run validate

# Export specific view
npm run export -- --view FunctionalFlow --fchain ClimateChain.FC.001
```

**Neo4j Queries for Traceability:**
```cypher
// Full REQ → FUNC → MOD traceability
MATCH path = (r:REQ)<-[:satisfy]-(f:FUNC)<-[:allocate]-(m:MOD)
RETURN path

// Requirement to Test coverage
MATCH path = (r:REQ)-[:verify]->(t:TEST)
RETURN r.semanticId, collect(t.semanticId) AS tests
```

---

## INCOSE-KONFORMITÄT

- **ISO/IEC/IEEE 15288:2023**: Technical Processes
- **INCOSE SE Handbook v4/v5**: Recursive/Iterative Application
- **A-SPICE Foundation**: SYS.2 → SYS.3 → SYS.4 Mapping

| A-SPICE Process | Ontology Mapping |
|-----------------|------------------|
| SYS.2 Requirements | SYS, UC, REQ nodes |
| SYS.3 Architecture | MOD, FCHAIN, FUNC, FLOW |
| SYS.4 Integration/Verification | TEST, verify edges |
| SYS.5 Qualification | Full traceability graph |

---

---

## 3-LAYER FLOW/SCHEMA MODEL (INCOSE/SysML 2.0 konform)

FLOW und SCHEMA Nodes bilden zusammen das Interface-System zwischen Top-Level FUNC Blöcken.
Die Trennung in 3 Layer entspricht SysML 2.0 Interface Blocks und Flow Specifications.

### Layer-Hierarchie

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: SEMANTIK (Was bedeutet der Datenfluss?)                │
│   → Beschrieben in FLOW.Descr                                   │
│   → Beispiel: "LLM-generated graph operations"                  │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: DATENFORMAT (Welche Struktur haben die Daten?)         │
│   → Definiert durch SCHEMA Node (Interface Block)               │
│   → Verbindung: FLOW -relation-> SCHEMA                         │
│   → Beispiel: FormatESchema.SC.003 mit Struct Property          │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: PROTOKOLL (Wie werden die Daten transportiert?)        │
│   → Definiert durch SCHEMA Node (Flow Specification)            │
│   → Verbindung: FLOW -relation-> SCHEMA                         │
│   → Beispiel: StreamingProtocol.SC.009                          │
└─────────────────────────────────────────────────────────────────┘
```

### SCHEMA Kategorien

| Kategorie | Zweck | SysML 2.0 Mapping | Beispiele |
|-----------|-------|-------------------|-----------|
| **Data Schema** | Datenstruktur/-format | Interface Block | FormatESchema, CanvasStateSchema |
| **Protocol Schema** | Transportverhalten | Flow Specification | StreamingProtocol, WebSocketProtocol |
| **Type Schema** | Typdefinitionen | Value Type | OntologyTypesSchema, ViewTypesSchema |

### FLOW Node Struktur

```
FLOW Node:
├─ Name: PascalCase (max 25 chars)
├─ Descr: Semantische Beschreibung (Layer 1)
├─ -relation-> DataSchema.SC.XXX (Layer 2 - Datenformat)
└─ -relation-> ProtocolSchema.SC.XXX (Layer 3 - Protokoll)
```

### Beispiel: LLMResponseFlow

```
LLMResponseFlow.FL.002
├─ Descr: "LLM-generated Format-E operations for graph modification"
├─ -relation-> FormatESchema.SC.003 (Datenformat: Format-E Struktur)
└─ -relation-> StreamingProtocol.SC.009 (Protokoll: Token-by-Token)
```

### Protocol Schema Properties

```json
{
  "Name": "StreamingProtocol",
  "Descr": "Token-by-token streaming with backpressure support",
  "Struct": {
    "type": "stream",
    "pattern": "producer-consumer",
    "backpressure": true,
    "retryLogic": "exponential-backoff",
    "timeout": "30s"
  }
}
```

### Verfügbare Protokoll-Typen

| Protocol Schema | Type | Pattern | Use Case |
|-----------------|------|---------|----------|
| StreamingProtocol | stream | producer-consumer | LLM Token Streaming |
| RequestResponse | sync | request-reply | Neo4j Queries |
| WebSocketProtocol | async | publish-subscribe | Multi-User Broadcast |
| BatchProtocol | batch | bulk-transfer | Persistence Operations |

### Validierungsregeln

- [ ] **flow_data_schema**: Jeder FLOW muss mindestens ein Data SCHEMA via relation haben
- [ ] **flow_protocol_schema**: Jeder inter-block FLOW sollte ein Protocol SCHEMA haben
- [ ] **schema_struct_property**: Jedes SCHEMA muss ein Struct Property mit JSON-Pseudocode haben

---

## ZUSAMMENFASSUNG

**Optimal für Coding Agents:**
1. **Klare Blockgrenzen** (5-9 MOD nodes, Miller's Law)
2. **Formale Interfaces** (SCHEMA nodes with Struct property)
3. **3-Layer Interface Model** (Semantik → Datenformat → Protokoll)
4. **Vollständige Traceability** (REQ → FUNC → MOD via satisfy/allocate)
5. **Automatisierte Gates** (Cypher validation queries)

**Ontology Enforcement:**
- All nodes require: uuid, type, Name, Descr
- All edges require: uuid, type, source, target
- FLOW nodes require: relation to Data SCHEMA
- SCHEMA nodes require: Struct property with JSON pseudo-code
- Relationship validity checked against ontology_schema.json
