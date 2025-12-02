# CR-024: Multi-Agent Architecture System

**Type:** Feature
**Status:** Completed
**Priority:** HIGH
**Target Phase:** Phase 2 (Logical Architecture)
**Created:** 2025-11-27
**Completed:** 2025-11-27

## Problem / Use Case

### Aktueller Zustand
1. **Keine spezialisierten Agenten**: Der LLM wird als generischer Assistent verwendet, ohne rollenspezifische Prompts
2. **Keine automatische Validierung**: Architektur-Fehler (z.B. FormatESerialization als Top-Level FUNC) werden erst durch manuelles User-Review entdeckt
3. **AgentDB nicht genutzt für Agenten-Kommunikation**: Episodic Memory existiert, wird aber nicht für Agenten-Koordination verwendet
4. **Fehlende INCOSE/SysML 2.0 Konformitätsprüfung**: Keine automatische Prüfung gegen Standards

### Probleme aus dem Chat-Review (2025-11-27)
| Problem | Symptom | Ursache |
|---------|---------|---------|
| Falsche Hierarchie | FormatESerialization als Top-Level FUNC | Keine Unterscheidung Datenformat ↔ Funktion |
| Protokoll als Funktion | WebSocketSync.FN.007 | Vermischung Infrastruktur/Logik |
| Fehlende Layer-Trennung | Keine FLOW→SCHEMA relations | 3-Layer-Modell nicht bekannt |
| Manuelle Korrektur nötig | User muss Fehler finden | Keine automatische Validierung |

## Requirements

### Funktionale Anforderungen
- **FR-024.1**: Implementierung von 4 spezialisierten Agenten-Rollen (INCOSE-konform)
- **FR-024.2**: Decision Tree für automatische Node-Typ-Klassifikation
- **FR-024.3**: Automatische Validierung gegen Ontology Rules nach Generierung
- **FR-024.4**: Strukturiertes Review mit INCOSE/SysML 2.0 Konformitätsprüfung
- **FR-024.5**: AgentDB-basierte Kommunikation zwischen Agenten
- **FR-024.6**: Guided Correction Flow mit User-Feedback-Integration

### Nicht-funktionale Anforderungen
- **NFR-024.1**: Validierung muss < 500ms pro Graph-Änderung dauern
- **NFR-024.2**: Agenten-Koordination über AgentDB ohne zusätzliche Infrastruktur
- **NFR-024.3**: Transparente Agenten-Aktivität im LOG sichtbar

## Architecture / Solution Approach

### 4 Agenten-Rollen (INCOSE-konform)

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM ENGINEER (User)                   │
│  • Gibt Anforderungen ein                                   │
│  • Beantwortet Review-Fragen                                │
│  • Bestätigt/korrigiert Vorschläge                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              REQUIREMENTS ENGINEER AGENT                    │
│  • Extrahiert REQ aus User-Input                            │
│  • Erstellt UC-Hierarchie                                   │
│  • Validiert REQ-Vollständigkeit                            │
│  AgentID: requirements-engineer                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 SYSTEM ARCHITECT AGENT                      │
│  • Generiert FUNC/FLOW/SCHEMA Struktur                      │
│  • Wendet Decision Tree für Node-Typen an                   │
│  • Prüft Miller's Law (5-9 Blöcke)                          │
│  • Erstellt 3-Layer Interface Model                         │
│  AgentID: system-architect                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               ARCHITECTURE REVIEWER AGENT                   │
│  • Prüft INCOSE/SysML 2.0 Konformität                       │
│  • Identifiziert Misclassifications                         │
│  • Generiert strukturierte Review-Fragen                    │
│  • Schlägt Korrekturen vor                                  │
│  AgentID: architecture-reviewer                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               FUNCTIONAL ANALYST AGENT                      │
│  • Erstellt FCHAIN für Use Cases                            │
│  • Definiert ACTOR-Grenzen                                  │
│  • Verbindet FUNC via FLOW                                  │
│  AgentID: functional-analyst                                │
└─────────────────────────────────────────────────────────────┘
```

### AgentDB-basierte Kommunikation

```typescript
// Erweiterung der AgentDB Types
interface AgentMessage {
  fromAgent: string;           // z.B. 'system-architect'
  toAgent: string;             // z.B. 'architecture-reviewer'
  messageType: 'handoff' | 'review-request' | 'validation-result' | 'correction';
  payload: {
    graphSnapshot: string;     // Format-E des aktuellen Graphen
    context: string;           // Was wurde getan
    openQuestions?: string[];  // Offene Fragen an nächsten Agenten
  };
  timestamp: number;
}

interface AgentWorkItem {
  agentId: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  inputFrom?: string;          // Vorheriger Agent
  outputTo?: string;           // Nächster Agent
  validationErrors?: string[];
}
```

### Decision Tree für Node-Typ-Klassifikation

```
START: Neue Entität identifiziert
│
├─ Q1: Verarbeitet es aktiv Daten?
│   ├─ JA → Q1a: Ist es ein Top-Level Verarbeitungsblock?
│   │   ├─ JA → FUNC (Top-Level, 5-9 per Miller's Law)
│   │   └─ NEIN → Q1b: Teil welches Blocks?
│   │       └─ → FUNC (nested unter Parent-FUNC)
│   │
│   └─ NEIN → Q2
│
├─ Q2: Definiert es eine Datenstruktur oder Format?
│   ├─ JA → SCHEMA (DataSchema)
│   │   └─ Hinweis: NICHT als FUNC modellieren!
│   └─ NEIN → Q3
│
├─ Q3: Definiert es Transportverhalten?
│   ├─ JA → SCHEMA (ProtocolSchema)
│   │   └─ Hinweis: NICHT als FUNC modellieren!
│   └─ NEIN → Q4
│
├─ Q4: Transportiert es Daten zwischen Komponenten?
│   ├─ JA → FLOW
│   │   └─ Prüfe: relation zu DataSchema vorhanden?
│   └─ NEIN → Q5
│
├─ Q5: Ist es ein externer Kommunikationspartner?
│   ├─ JA (außerhalb System-Scope) → ACTOR
│   ├─ JA (innerhalb System-Scope) → FUNC (ClientManagement)
│   └─ NEIN → Q6
│
├─ Q6: Beschreibt es eine Anforderung?
│   ├─ JA → REQ
│   └─ NEIN → Q7
│
├─ Q7: Ist es ein Test/Verifikation?
│   ├─ JA → TEST
│   └─ NEIN → Q8
│
└─ Q8: Ist es eine physische/SW-Komponente?
    ├─ JA → MOD
    └─ NEIN → Weitere Analyse erforderlich
```

### Automatische Validierung (Cypher Queries)

```cypher
// V1: Top-Level FUNC darf kein Datenformat sein
MATCH (s:SYS)-[:compose]->(f:FUNC)
WHERE f.Name CONTAINS 'Serialization'
   OR f.Name CONTAINS 'Format'
   OR f.Name CONTAINS 'Protocol'
   OR f.Name CONTAINS 'Schema'
RETURN f.semanticId AS potential_misclassification,
       'Top-Level FUNC should not be a data format' AS issue

// V2: FLOW ohne Data SCHEMA relation
MATCH (fl:FLOW)
WHERE NOT (fl)-[:relation]->(:SCHEMA)
RETURN fl.semanticId AS flow_missing_schema,
       'FLOW missing Data SCHEMA relation (Layer 2)' AS issue

// V3: Infrastruktur als FUNC
MATCH (f:FUNC)
WHERE f.Name CONTAINS 'WebSocket'
   OR f.Name CONTAINS 'HTTP'
   OR f.Name CONTAINS 'TCP'
   OR f.Name CONTAINS 'Protocol'
RETURN f.semanticId AS infrastructure_as_function,
       'Infrastructure should not be a FUNC' AS issue

// V4: Miller's Law Verletzung
MATCH (s:SYS)-[:compose]->(f:FUNC)
WITH s, count(f) AS func_count
WHERE func_count < 5 OR func_count > 9
RETURN s.semanticId AS system,
       func_count AS count,
       'Violates Miller''s Law (5-9 blocks)' AS issue

// V5: Inter-block FLOW ohne Protocol SCHEMA
MATCH (f1:FUNC)-[:io]->(fl:FLOW)-[:io]->(f2:FUNC)
WHERE NOT (fl)-[:relation]->(:SCHEMA {category: 'protocol'})
  AND (f1)-[:compose*0..1]-(:SYS)
  AND (f2)-[:compose*0..1]-(:SYS)
RETURN fl.semanticId AS interblock_flow_missing_protocol,
       'Inter-block FLOW should have Protocol SCHEMA' AS issue

// V10: Nested SYS (Subsystems should be FUNC)
MATCH (parent:SYS)-[:compose]->(child:SYS)
RETURN child.semanticId AS nested_subsystem,
       'Subsystem should be FUNC, not SYS - use FUNC for logical architecture' AS issue
```

### Strukturierter Review-Prozess

```
PHASE 1: Hierarchie-Check (Architect → Reviewer)
├─ [ ] Top-Level FUNCs korrekt? (5-9, Miller's Law)
├─ [ ] Keine Datenformate als FUNCs?
├─ [ ] Keine Protokolle als FUNCs?
└─ [ ] Keine Infrastruktur als FUNCs?

PHASE 2: Interface-Check (3-Layer Model)
├─ [ ] Alle FLOWs haben Data SCHEMA relation?
├─ [ ] Inter-block FLOWs haben Protocol SCHEMA?
└─ [ ] FLOW.Descr beschreibt Semantik (Layer 1)?

PHASE 3: Traceability-Check
├─ [ ] FUNC→REQ satisfy vorhanden?
├─ [ ] MOD→FUNC allocate vollständig?
└─ [ ] REQ→TEST verify vorhanden?

PHASE 4: INCOSE/SysML 2.0 Konformität
├─ [ ] Interface Blocks korrekt modelliert?
├─ [ ] Flow Specifications vorhanden?
└─ [ ] Item Flows typisiert?
```

### Schema-Varianz-Optimierung

Der Architecture Reviewer Agent prüft auch Schema-Varianz und schlägt Konsolidierungen vor.

#### Prinzipien zur Schema-Reduktion

```
1. MERGE wenn:
   - Gleiche Domäne (z.B. alle FormatE-bezogenen Schemas)
   - Gleiche Lebensdauer (alle persistent ODER alle ephemeral)
   - Gleicher Owner (eine Function verantwortlich)

2. NICHT MERGE wenn:
   - Unterschiedliche Persistenz (CanvasState vs LayoutResult)
   - Unterschiedliche Verantwortlichkeiten
   - Verschiedene Lebensdauer
```

#### Durchgeführte Optimierung (2025-11-27)

```
Vorher (12 Schemas):                    Nachher (10 Schemas):
─────────────────────                   ─────────────────────
OntologyTypesSchema.SC.001  ─┐
FormatESchema.SC.003        ─┼─→ FormatETypes.SC.001 (merged)
FormatETransport.SC.008     ─┘

CanvasStateSchema.SC.002    ─→ CanvasStateSchema.SC.002 (keep)
ViewTypesSchema.SC.004      ─→ ViewTypesSchema.SC.004 (keep)
LayoutTypesSchema.SC.005    ─→ LayoutTypesSchema.SC.005 (keep)
  (Unterschiedliche Lebensdauer: persistent/preference/ephemeral)

LLMTypesSchema.SC.006       ─→ LLMTypesSchema.SC.006 (keep)
Neo4jTypesSchema.SC.007     ─→ Neo4jTypesSchema.SC.007 (keep)
PlainTextFormat.SC.010      ─→ PlainTextFormat.SC.010 (keep)

StreamingProtocol.SC.009    ─→ StreamingProtocol.SC.009 (keep)
RequestResponseProtocol.SC.011 ─→ RequestResponseProtocol.SC.011 (keep)
WebSocketProtocol.SC.012    ─→ WebSocketProtocol.SC.012 (keep)

Reduktion: 12 → 10 Schemas (17%)
```

#### Schema-Varianz-Validierung (Cypher)

```cypher
// V6: Redundante Schemas mit ähnlichen Namen
MATCH (s1:SCHEMA), (s2:SCHEMA)
WHERE s1.semanticId < s2.semanticId
  AND (s1.Name CONTAINS s2.Name OR s2.Name CONTAINS s1.Name)
RETURN s1.semanticId, s2.semanticId,
       'Potentially redundant schemas - consider merging' AS issue

// V7: Schema ohne FLOW-Referenz
MATCH (s:SCHEMA)
WHERE NOT (:FLOW)-[:relation]->(s)
  AND NOT (:FUNC)-[:relation]->(s)
RETURN s.semanticId AS orphan_schema,
       'Schema not referenced by any FLOW or FUNC' AS issue

// V8: Zu viele Schemas pro Domäne
MATCH (s:SCHEMA)
WITH split(s.Name, 'Schema')[0] AS domain, collect(s) AS schemas
WHERE size(schemas) > 3
RETURN domain, size(schemas) AS count,
       'Too many schemas in domain - consider consolidation' AS issue
```

#### Schema-Lebensdauer-Matrix

| Schema-Kategorie | Persistenz | Owner | Merge-Kandidat? |
|------------------|------------|-------|-----------------|
| FormatETypes | Ephemeral | Core | ✅ Bereits merged |
| CanvasStateSchema | Persistent | CanvasManagement | ❌ Nein (Datenhaltung) |
| ViewTypesSchema | User Pref | GraphVisualization | ❌ Nein (UI-Logik) |
| LayoutTypesSchema | Ephemeral | GraphVisualization | ❌ Nein (Berechnung) |
| LLMTypesSchema | Ephemeral | LLMIntegration | ❌ Nein (Integration) |
| Neo4jTypesSchema | Persistent | DataPersistence | ❌ Nein (Persistence) |
| Protocol Schemas | Ephemeral | Multiple | ⚠️ Prüfen |

### Guided Correction Flow

```
Reviewer entdeckt Fehler:
  "FormatESerialization ist als Top-Level FUNC modelliert"
     │
     ▼
Generiert strukturierte Frage an User:
  ┌─────────────────────────────────────────────────────────┐
  │ REVIEW: FormatESerialization.FN.006                     │
  │                                                         │
  │ Frage: Ist FormatESerialization...                      │
  │ (a) Eine aktive Verarbeitungsfunktion? → bleibt FUNC    │
  │ (b) Ein Datenformat/Schema? → wird SCHEMA               │
  │ (c) Teil einer anderen Funktion? → wird Subfunktion     │
  │                                                         │
  │ Kontext: Datenformate sollten als SCHEMA modelliert     │
  │ werden, da sie keine aktive Verarbeitung durchführen.   │
  │                                                         │
  │ INCOSE Referenz: SysML Interface Block                  │
  └─────────────────────────────────────────────────────────┘
     │
     ▼
User antwortet: "(b) Ein Datenformat"
     │
     ▼
Reviewer generiert Korrektur-Operations:
  <operations>
  - FormatESerialization.FN.006
  + FormatETransport|SCHEMA|FormatETransport.SC.008|...
  + LLMResponseFlow.FL.002 -rel-> FormatETransport.SC.008
  </operations>
```

## Implementation Plan

### Phase 1: Agent-Prompts und Decision Tree (4-6h) ✅ DONE
- [x] Spezialisierte System-Prompts für 4 Agenten-Rollen (agent-prompts.ts)
- [x] Decision Tree als Teil des Architect-Prompts (decision-tree.ts)
- [x] Validierungs-Queries als Teil des Reviewer-Prompts (validation-queries.ts)

### Phase 2: AgentDB-Erweiterung für Kommunikation (4-6h) ✅ DONE
- [x] AgentMessage Interface in types.ts
- [x] AgentCoordinator für Workflow-Orchestrierung (agent-coordinator.ts)
- [x] AgentWorkItem Tracking für Workflow-Status

### Phase 3: Validierungs-Integration (3-4h) ✅ DONE
- [x] Cypher Validation Queries V1-V9 implementieren (validation-queries.ts)
- [x] ArchitectureValidator für Format-E Validierung (architecture-validator.ts)
- [x] Validation-Results via AgentDBLogger sichtbar

### Phase 4: Review-Flow mit User-Interaction (3-4h) ✅ DONE
- [x] Strukturierte Review-Fragen generieren (review-flow.ts)
- [x] User-Response-Handling mit CorrectionProposal
- [x] Guided Correction Flow

### Phase 5: Integration in LLM-Engine (2-3h) ✅ DONE
- [x] MultiAgentProcessor für LLM-Integration (multi-agent-processor.ts)
- [x] Auto-Validierung nach jeder Graph-Änderung
- [x] Agent-Prompts und Decision Tree Integration
- [x] Review-Flow Integration mit User-Interaction

## Current Status
- [x] Agent-Prompts definiert (src/llm-engine/agents/agent-prompts.ts)
- [x] Decision Tree dokumentiert und implementiert (src/llm-engine/agents/decision-tree.ts)
- [x] AgentDB-Erweiterung implementiert (src/llm-engine/agents/agent-coordinator.ts)
- [x] Validierungs-Queries V1-V9 implementiert (src/llm-engine/agents/validation-queries.ts)
- [x] Format-E Validator implementiert (src/llm-engine/agents/architecture-validator.ts)
- [x] Review-Flow Manager implementiert (src/llm-engine/agents/review-flow.ts)
- [x] MultiAgentProcessor für LLM-Integration (src/llm-engine/multi-agent-processor.ts)
- [x] **102 Unit Tests geschrieben und bestanden**

## Implemented Files
```
src/llm-engine/
├── multi-agent-processor.ts    # Main LLM-Engine integration point
└── agents/
    ├── index.ts                    # Public exports
    ├── types.ts                    # Agent types and interfaces
    ├── agent-prompts.ts            # 4 specialized agent prompts
    ├── agent-coordinator.ts        # Workflow orchestration
    ├── decision-tree.ts            # Node type classification
    ├── validation-queries.ts       # Cypher V1-V9 queries
    ├── architecture-validator.ts   # Format-E validation
    └── review-flow.ts              # Guided correction flow

tests/unit/llm-engine/
├── multi-agent-processor.test.ts   # 24 tests
└── agents/
    ├── decision-tree.test.ts       # 27 tests
    ├── agent-coordinator.test.ts   # 17 tests
    ├── architecture-validator.test.ts # 17 tests
    └── review-flow.test.ts         # 17 tests
```

## Acceptance Criteria
- [x] 4 Agenten-Rollen definiert und im LOG sichtbar (AgentDBLogger.agentActivity)
- [x] Decision Tree verhindert Misclassifications (27 tests passing)
- [x] Automatische Validierung nach jeder Änderung (ArchitectureValidator)
- [x] AgentDB-basierte Kommunikation (AgentCoordinator mit AgentMessage)
- [x] Review-Fragen werden strukturiert an User gestellt (ReviewFlowManager)
- [x] INCOSE/SysML 2.0 Konformität wird geprüft (V1-V9 queries)
- [x] Schema-Varianz-Prüfung integriert (V6, V7, V8 Queries)
- [x] Integration in LLM-Engine für automatische Anwendung (MultiAgentProcessor)

## Dependencies
- AgentDB Service existiert (CR-019, CR-021)
- 3-Layer FLOW/SCHEMA Model dokumentiert (Ontology v3.0.6)
- Prompt Builder existiert (prompt-builder.ts)

## Estimated Effort
Total: 14-20 hours (2-3 days)

---

## CR Overlap Analysis

### Direkte Überschneidungen (werden in CR-024 integriert)

| CR | Überschneidung | Integration in CR-024 |
|----|---------------|----------------------|
| **CR-006** (Ontology Validation Advisor) | 12 Validierungsregeln, LLM-Explanations | → **Architecture Reviewer Agent** übernimmt Validierung |
| **CR-011** (SE Methodology Prompts) | Phase Recognition, INCOSE Prompts, Anti-Pattern Detection | → **Decision Tree** + **Review-Checkliste** |
| **CR-012** (Clarifying Questions) | Ambiguity Detection, Question Generation | → **Guided Correction Flow** mit strukturierten Fragen |

### Indirekte Abhängigkeiten (bleiben eigenständig)

| CR | Beziehung | Empfehlung |
|----|-----------|------------|
| **CR-005** (Auto-Derivation) | Nutzt Agenten für UC→FUNC, REQ→TEST | Bleibt eigenständig, Agenten liefern bessere Derivations |
| **CR-019** (AgentDB Episodic Memory) | Agent-Kommunikation nutzt AgentDB | CR-024 erweitert AgentDB um AgentMessage |
| **CR-021** (Graph in AgentDB) | Graph Snapshots für Agent-Context | Wird von Agenten genutzt |

### Konsolidierungsvorschlag

```
CR-006 (Validation Advisor) ─────────┐
CR-011 (SE Methodology Prompts) ─────┼──→ CR-024 (Multi-Agent System)
CR-012 (Clarifying Questions) ───────┘
                                          ↓
                              Implementiert als 4 Agenten:
                              • Requirements Engineer
                              • System Architect (Decision Tree)
                              • Architecture Reviewer (Validation)
                              • Functional Analyst
```

### Mapping: Alte CRs → CR-024 Agenten

#### CR-006 → Architecture Reviewer Agent

| CR-006 Feature | CR-024 Integration |
|----------------|-------------------|
| 12 Validierungsregeln | Cypher Validation Queries (V1-V8) |
| LLM-basierte Erklärungen | Review-Fragen mit INCOSE Kontext |
| Auto-Fix Suggestions | Guided Correction Flow |
| /validate Command | Agent generiert Validierung nach jeder Änderung |

#### CR-011 → System Architect Agent + Reviewer

| CR-011 Feature | CR-024 Integration |
|----------------|-------------------|
| Phase Recognition | Implizit durch Agent-Workflow (REQ→ARCH→REVIEW) |
| INCOSE/SysML 2.0 Prompts | Teil der Agent System-Prompts |
| Anti-Pattern Detection | Decision Tree verhindert Misclassifications |
| Next Step Suggestions | Reviewer schlägt Korrekturen vor |

#### CR-012 → Architecture Reviewer Agent

| CR-012 Feature | CR-024 Integration |
|----------------|-------------------|
| Ambiguity Detection | Reviewer erkennt unvollständige Modelle |
| Clarifying Questions | Strukturierte Review-Fragen an User |
| Clarification Storage | AgentDB speichert Agent-Kommunikation |
| Decision Logic | Guided Correction Flow |

### Empfehlung: Status-Änderung der alten CRs

```
CR-006: Planned → Superseded by CR-024 (Architecture Reviewer Agent)
CR-011: Planned → Superseded by CR-024 (Agent System-Prompts)
CR-012: Planned → Superseded by CR-024 (Guided Correction Flow)
```

---

## User Selection Context: TestQuery Integration

Die User-Selection enthält eine relevante Testfrage:

> "Are the flow connections and schemes from top level FUNC respected by their nested functions?"

### Neue Validierungsregel (V9)

```cypher
// V9: Nested FUNC muss FLOW des Parent respektieren
MATCH (parent:FUNC)-[:compose]->(child:FUNC)
MATCH (parent)-[:io]->(parentFlow:FLOW)
WHERE NOT (child)-[:io]->(:FLOW)-[:relation]->(:SCHEMA)<-[:relation]-(parentFlow)
RETURN child.semanticId AS nested_func,
       parent.semanticId AS parent_func,
       parentFlow.semanticId AS parent_flow,
       'Nested FUNC does not use parent FLOW schema' AS issue
```

Diese Regel prüft:
- Child-FUNCs müssen FLOWs mit gleichem SCHEMA wie Parent nutzen
- Sichert Schema-Konsistenz über Hierarchie-Ebenen
- Entspricht SysML 2.0 "Interface Block inheritance"

---

## References
- [INCOSE SE Handbook v5](https://sebokwiki.org/wiki/INCOSE_Systems_Engineering_Handbook)
- [SysML 2.0 Specification](https://www.omg.org/spec/SysML/)
- **docs/System Decomposition Rules.md** - Core rules for SYS vs FUNC decomposition
- docs/AGENTEN-BASIERTES SYSTEMS ENGINEERING .md
- docs/ontology_schema.json (v3.0.6)
- src/llm-engine/agentdb/agentdb-service.ts
- **Supersedes:** CR-006, CR-011, CR-012
