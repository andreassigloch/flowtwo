# AiSE Reloaded - Requirements & Implementation Status

**Version**: 1.0.0
**Status**: ~75% Complete (Alpha-Ready)
**Last Updated**: 2025-11-12

Erstelle eine Anwendung zur professionellen Strukturierung von komplexen Aufgabenstellungen (Systeme) auf Basis der Methoden des Systems Engineering und Requirements Engineerings. Zielgruppe sind Ungeschulte Product Owner, Projekt Leiter, von Software bis Mechanik, Projektmitarbeiter und Führungskräfte als Datennutzer.

---

## Workspace & Multi-Tenancy Requirements

### WS1: Workspace as Access Control Boundary
**Description**: Workspace defines who can access which systems and data

**Requirements**:
- [x] Each workspace has unique UUID
- [ ] Users can be assigned to workspaces with roles (owner, admin, editor, viewer)
- [ ] All data operations require valid workspaceId in context
- [ ] Neo4j queries must filter by workspaceId for access control

**Test Cases**:
- [ ] E2E: User cannot access nodes from other workspace
- [ ] E2E: Admin can invite users to workspace
- [ ] Unit: ContextManager.checkAccess() validates workspace permissions

### WS2: System as Graph Query Root
**Description**: System (top SYS node) serves as root for graph traversal

**Requirements**:
- [x] Each top-level SYS node has unique UUID
- [ ] Graph queries start from SYS node and traverse downward
- [ ] One workspace can contain multiple systems

**Test Cases**:
- [ ] E2E: Create multiple systems in one workspace
- [ ] E2E: Switch between systems in same workspace
- [ ] Unit: Graph queries correctly scoped by systemId

### WS3: Context Management
**Description**: Every operation carries workspaceId + systemId context

**Requirements**:
- [ ] RequestContext includes both workspaceId and systemId (both REQUIRED)
- [ ] ContextManager validates access before operations
- [ ] All Neo4j nodes have workspaceId and systemId properties
- [ ] WebSocket rooms scoped by workspaceId

**Test Cases**:
- [ ] Unit: ContextManager.getContext() validates both IDs
- [ ] E2E: Operations fail without valid context
- [ ] Integration: Neo4j queries use composite workspace+system filter

**Critical Distinction**:
- **workspaceId**: Access control boundary (permissions, team collaboration)
  - Answers: "Can this user access this data?"
- **systemId**: Graph query root (top SYS node for traversal)
  - Answers: "Which SYS graph are we querying?"

Both are needed for different purposes and are NOT interchangeable.

---

## LLM Streaming & Progressive Execution Requirements

### STREAM1: Immediate Execution Model
**Description**: LLM operations execute progressively as they're generated, not buffered until end-of-stream

**Requirements**:
- [ ] Each `<operations>` block executes IMMEDIATELY upon detection during streaming
- [ ] NO buffering of operations until stream completes
- [ ] Text chunks broadcast to Chat Canvas in real-time
- [ ] Operation execution runs in parallel with text streaming
- [ ] User sees progressive results (nodes appear as LLM creates them)

**Test Cases**:
- [ ] E2E: User sees first node appear before LLM finishes streaming
- [ ] E2E: Multiple operation blocks execute independently
- [ ] Unit: OperationParser.detectCompleteBlock() identifies `</operations>` tag
- [ ] Integration: Parse → Validate → Execute cycle completes <100ms per block

### STREAM2: Cross-Block References
**Description**: Later operation blocks can reference nodes created in earlier blocks within same stream

**Requirements**:
- [ ] Block #2 can reference nodes created in Block #1 (by name or UUID)
- [ ] Canvas state updated after each block execution
- [ ] Database Adapter resolves cross-block references
- [ ] Technical validation checks both canvas state AND previous blocks

**Test Cases**:
- [ ] E2E: Block #2 creates relationship to node from Block #1
- [ ] Unit: ReferenceResolver finds nodes from previous blocks
- [ ] Integration: Canvas state reflects all executed blocks

**Rationale**: Progressive feedback gives user confidence that LLM is building their system step-by-step.

### STREAM3: Canvas State as LLM Context
**Description**: Current Graph + Text Canvas content is ALWAYS provided as LLM input context

**Requirements**:
- [ ] Every LLM call includes serialized canvas state
- [ ] LLM can reference existing nodes by name or UUID
- [ ] Canvas state serialization is token-efficient (compressed format)
- [ ] Large graphs (>100 nodes) use hierarchical summary

**Test Cases**:
- [ ] E2E: LLM references existing node without re-creating it
- [ ] Unit: CanvasStateSerializer generates compressed format
- [ ] Integration: Canvas state updates propagate to next LLM call

**Rationale**: LLM must know what exists to avoid duplicate nodes and build on existing structure.

### STREAM4: Two-Phase Validation
**Description**: Technical validation (blocking) vs Semantic validation (non-blocking)

**Requirements**:
- [ ] **Technical Validation** (blocking):
  - Malformed syntax → reject operation, LLM must revise
  - Invalid references (UUID doesn't exist) → reject
  - Type errors → reject
- [ ] **Semantic Validation** (non-blocking):
  - Ontology rule violations → execute anyway, show report to user
  - Isolated nodes → execute anyway, user can fix later
  - Incomplete architecture → execute anyway, separate workflow

**Test Cases**:
- [ ] E2E: Malformed operation triggers LLM revision
- [ ] E2E: Ontology violation executes but shows validation report
- [ ] Unit: TechnicalValidator.validate() rejects invalid syntax
- [ ] Unit: SemanticValidator.validate() returns warnings, doesn't block

**Rationale**: Don't block LLM flow for semantic issues that can be fixed later. Only block for technical errors.

---

## Use Cases

### UC1: Geführte Strukturierung durch SE-Methodik
**Beschreibung**: Die Anwendung führt den Anwender durch alle notwendigen Schritte der Aufgaben-Strukturierung während sie im Hintergrund mit ihrer Kenntnis der Ontologie, der Methode und des Prozesses selbstständig die erforderlichen Datenstrukturen und Dokumentationen aufbaut.

**Status**: [x] IMPLEMENTIERT
**Priorität**: P1 (Kritisch)

**Implementierung**:
- [x] ConversationModerator führt durch SE-Phasen
- [x] AI Assistant baut Ontology V3 automatisch im Hintergrund auf
- [x] System Prompt enthält SE-Methodik (INCOSE/ISO 29148)
- [x] Kontextbewusste Dialog-Führung
- [x] Phasen-Erkennung (Requirements → Architektur → Design → Verifikation)

**Dateien**:
- `src/backend/ai-assistant/conversation-moderator.ts` (402 Zeilen)
- `src/backend/ai-assistant/ai-assistant.service.ts`

**Test Cases**:
- [x] Unit: ConversationModerator.generateQuestion() - SE-spezifische Fragen
- [x] Unit: ConversationModerator.detectPhase() - Phasen-Erkennung
- [x] Unit: OntologyExtractor.extractEntities() - Entity-Extraktion
- [ ] E2E: Komplette SE-Session (Benutzer erstellt vollständiges System) ⚠️ FEHLT

**Lücken**:
- ⚠️ **E2E-Test für kompletten Workflow fehlt** - Aufwand: 4-6 Stunden

---

### UC2: Automatische Vorschläge und Ableitungen
**Beschreibung**: Die Anwendung unterstützt mit geeigneten Vorschlägen, automatischen Ableitungen offensichtlicher Sachverhalte, z.B. Ableitung von Test Cases aus Use Cases oder einzelnen Anforderungen.

**Status**: [x] IMPLEMENTIERT
**Priorität**: P1 (Kritisch)

**Implementierung**:
- [x] UC → Functions Ableitung (uc-to-functions.ts, 299 Zeilen)
- [x] REQ → Test Cases Ableitung (req-to-tests.ts, 364 Zeilen)
- [x] FUNC → Data Flows Ableitung (func-to-flows.ts, 411 Zeilen)
- [x] Confidence Scoring (0-1) für alle Ableitungen
- [x] Dualer Ansatz: Regelbasiert + LLM-basiert
- [x] User Approval Workflow (autoApply: false by default)

**Dateien**:
- `src/backend/ai-assistant/auto-derivation.service.ts` (402 Zeilen)
- `src/backend/ai-assistant/derivation-rules.ts` (471 Zeilen)

**Test Cases**:
- [x] Unit: UCToFunctions.derive() - UC-Zerlegung
- [x] Unit: REQToTests.derive() - Testfall-Generierung
- [x] Unit: FUNCToFlows.derive() - Datenfluss-Ableitung
- [ ] E2E: Auto-Derivation Workflow (User genehmigt Ableitung) ⚠️ FEHLT

**Lücken**:
- ⚠️ **E2E-Test für Derivation-Workflow fehlt** - Aufwand: 2-3 Stunden

---

### UC3: Architektur-Analyse und Optimierung
**Beschreibung**: Die Anwendung analysiert die Architektur und generiert Optimierungsvorschläge oder bewertet Alternativen.

**Status**: [ ] TEILWEISE IMPLEMENTIERT ⚠️
**Priorität**: P2 (Wichtig)

**Implementierung**:
- [x] Basis-Analyse-Fähigkeit (LLM kann Graph analysieren)
- [ ] Systematische Optimierungsvorschläge ⚠️ NUR BASIC
- [ ] Alternativen-Bewertung ⚠️ NICHT IMPLEMENTIERT
- [ ] Architektur-Metriken/KPIs ⚠️ NICHT IMPLEMENTIERT

**Was funktioniert**:
- LLM kann Ontologie analysieren und Verbesserungen vorschlagen
- Validierungssystem identifiziert Regelverstöße

**Was fehlt**:
- Systematische Architektur-Muster-Erkennung
- Quantitative Metriken (Kopplung, Kohäsion, Komplexität)
- Vergleichs-Framework für Alternativen
- Anti-Pattern-Erkennung

**Test Cases**:
- [ ] Unit: ArchitectureAnalyzer.analyzePatterns() ⚠️ NICHT IMPLEMENTIERT
- [ ] Unit: ArchitectureAnalyzer.suggestOptimizations() ⚠️ NICHT IMPLEMENTIERT
- [ ] E2E: Architektur-Optimierung Workflow ⚠️ NICHT IMPLEMENTIERT

**Lücken**:
- ⚠️ **Systematische Architektur-Analyse fehlt** - Aufwand: 6-8 Stunden
- **Empfehlung**: Phase 2 Feature

---

## Anforderungen

### UI

#### Anforderung: Drei Canvas zur Kommunikation
**Beschreibung**: Die Kommunikation mit dem User erfolgt über drei Canvas.

**Status**: [x] IMPLEMENTIERT
**Priorität**: P1 (Kritisch)

**Implementierung**:
| Canvas | Status | Editierbarkeit LLM | Editierbarkeit User | Vollständigkeit |
|--------|--------|-------------------|---------------------|-----------------|
| Chat | [x] Implementiert | [x] Ja | [ ] **Nein** ⚠️ | 85% |
| Text | [x] Implementiert | [x] Ja | [ ] Teilweise ⚠️ | 80% |
| Graph | [x] Implementiert | [x] Ja | [ ] Teilweise ⚠️ | 75% |

**Dateien**:
- `src/frontend/components/ChatCanvas/` (4.500+ Zeilen)
- `src/frontend/components/TextCanvas/`
- `src/frontend/components/GraphCanvas/`

**Test Cases**:
- [x] E2E: chat-canvases.spec.ts:12 - AI-Nachricht ohne Operations-JSON
- [x] E2E: chat-canvases.spec.ts:34 - Text Canvas Updates
- [x] E2E: chat-canvases.spec.ts:72 - Graph Canvas Visualisierung
- [ ] E2E: Multi-User gleichzeitiges Editieren ⚠️ FEHLT

---

#### Anforderung: Chat Canvas - Editierbarer LLM Output
**Beschreibung**: Klassisches Chat-Bot Interface, nur dass hier neben dem Sprach/Text In/Output zum LLM Assistent auch der LLM Text Output direkt editierbar ist.

**Status**: [ ] **NICHT IMPLEMENTIERT** ⚠️ **KRITISCH**
**Priorität**: P1 (Kritisch)

**Implementiert**:
- [x] Klassisches Chatbot-Interface mit MessageList
- [x] Streaming Text Output (<50ms/token)
- [x] Nachrichten-Historie mit Timestamps
- [x] Typing-Indikatoren
- [x] Presence Awareness (Online-User)

**Fehlend**:
- [ ] **Direktes Editieren von LLM-Ausgaben** ⚠️ EXPLIZIT GEFORDERT
- [ ] Benutzer kann Assistant-Nachrichten nicht inline editieren
- [ ] Kein contentEditable Support für AI-Antworten

**Test Cases**:
- [x] E2E: chat-llm.spec.ts:25 - AI-Antwort empfangen
- [x] E2E: chat-llm.spec.ts:56 - Streaming AI-Antwort
- [x] E2E: chat-llm.spec.ts:182 - Formatierung der AI-Antwort
- [ ] E2E: Editieren von LLM-Output ⚠️ TEST FEHLT

**Lücken**:
- ⚠️ **KRITISCH: Editierbarer LLM Output fehlt komplett**
- **Impact**: HOCH - Explizit gefordertes Feature
- **Aufwand**: 2-3 Stunden
- **Implementierung**:
  ```typescript
  // ChatMessage.tsx
  <div
    contentEditable={message.role === 'assistant'}
    onBlur={(e) => handleEditMessage(message.id, e.currentTarget.textContent)}
  >
    {message.content}
  </div>
  ```

---

#### Anforderung: Chat History bei Interaktion mitgesendet
**Status**: [x] IMPLEMENTIERT
**Test Cases**:
- [x] Unit: ConversationModerator.getContext() - Historie-Abruf
- [x] Integration: Chat-Context wird an LLM gesendet

---

#### Anforderung: Text Canvas - Tabellarische Darstellung
**Beschreibung**: Textuelle Darstellung (Serialisierung) der generierten Daten in Form von Tabellen, analog zu einem klassischen Lastenheft.

**Status**: [x] IMPLEMENTIERT
**Priorität**: P1 (Kritisch)

**Implementiert**:
- [x] Tabellarische Ansicht aller Ontologie-Nodes
- [x] Filterung nach Node-Typ
- [x] Sortierung und Suche
- [x] Export zu CSV/Excel/PDF

**Teilweise**:
- [x] Benutzer kann ansehen und filtern
- [ ] Benutzer-Editierung nicht vollständig implementiert ⚠️
- [ ] Kein Inline-Editing von Zellen

**Test Cases**:
- [x] Unit: TextCanvas.render() - Tabellen-Rendering
- [x] Unit: TextCanvas.filter() - Filterung
- [ ] E2E: Inline-Editing in Text Canvas ⚠️ TEST FEHLT

**Lücken**:
- ⚠️ **Inline-Editing für Schlüsselfelder (Name, Descr) fehlt**
- **Impact**: MITTEL
- **Aufwand**: 1-2 Stunden

---

#### Anforderung: Graph Canvas - Graphische Darstellung mit Features
**Beschreibung**: Graphische Darstellung des Datenmodells zum Verständnis der Zusammenhänge. Muss alle Features zur Erkennbarkeit der Struktur beinhalten: Filtern von Elementen, Rollup von Hierarchien, "Schaltpläne" für Darstellung von Daten/Informationsflüssen.

**Status**: [ ] TEILWEISE IMPLEMENTIERT ⚠️
**Priorität**: P1 (Kritisch)

**Implementiert**:
- [x] Cytoscape.js Graph-Visualisierung
- [x] Mehrere Layout-Algorithmen (Force-Directed, Hierarchisch, Circular)
- [x] Node/Edge-Styling nach Typ
- [x] Klick/Drag-Interaktionen
- [x] Zoom und Pan

**Teilweise**:
- [x] Basis-Filterung (nach Node-Typ)
- [ ] Keine erweiterte Hierarchie-Rollup ⚠️
- [ ] Kein "Schaltplan"-Modus für Datenflüsse ⚠️

**Fehlend**:
- [ ] **Hierarchie-Rollup/Collapse** - Klick auf Node um Kinder zu kollabieren ⚠️ EXPLIZIT GEFORDERT
- [ ] **Datenfluss "Schaltplan"-Modus** - Zeige ACTOR→FLOW→FUNC→FLOW→ACTOR Ketten
- [ ] **Erweiterte Filter-UI** - Multi-Select, Filter-Kombinationen
- [ ] **Minimap** für große Graphen
- [ ] **Suche und Highlight**

**Test Cases**:
- [x] E2E: chat-graph.spec.ts:67 - System-Nodes von AI-Prompt
- [x] E2E: chat-graph.spec.ts:128 - Relationships zwischen Nodes
- [x] E2E: chat-graph.spec.ts:215 - Graph-Visualisierung
- [ ] E2E: Hierarchie-Rollup ⚠️ TEST FEHLT
- [ ] E2E: Datenfluss-Schaltplan ⚠️ TEST FEHLT

**Lücken**:
- ⚠️ **KRITISCH: Hierarchie-Rollup explizit gefordert, fehlt**
- **Impact**: HOCH - Explizit gefordertes Feature
- **Aufwand**: 4-6 Stunden

---

#### Anforderung: Multi-User Fähigkeit (max. 10 User)
**Status**: [x] IMPLEMENTIERT
**Priorität**: P1 (Kritisch)

**Implementiert**:
- [x] Raum-basierte WebSocket-Sessions
- [x] Presence Tracking (wer ist online)
- [x] Gleichzeitiges Editieren mit Operational Transform
- [x] Optimistic Updates mit Rollback
- [x] Max 10 User enforced in RoomManager

**Dateien**:
- `src/backend/websocket/room.manager.ts` (350 Zeilen)
- `src/backend/websocket/ot.service.ts` (280 Zeilen)

**Test Cases**:
- [x] Unit: RoomManager.joinRoom() - Raum beitreten
- [x] Unit: RoomManager.enforceLimit() - 10-User-Limit
- [x] Unit: OTService.transform() - Konflikt-Auflösung
- [ ] E2E: Multi-User gleichzeitiges Editieren ⚠️ TEST FEHLT

**Lücken**:
- ⚠️ **E2E-Test für Multi-User-Szenarien fehlt**
- **Aufwand**: 3-4 Stunden

---

### Auditing

#### Anforderung: Persistentes Logging
**Beschreibung**: Alle Chats, Validierungsergebnisse, Flows, Fehler werden persistent geloggt, um kontinuierliche Verbesserungen der Prompts, Validators, Responsiveness zu ermöglichen.

**Status**: [ ] TEILWEISE IMPLEMENTIERT ⚠️
**Priorität**: P1 (Kritisch für Produktion)

**Implementiert**:
- [x] Winston Logging im gesamten Codebase
- [x] Validierungsergebnisse geloggt
- [x] Error-Tracking

**Fehlend**:
- [ ] **Persistente Speicherung** - Aktuell nur Console/Files, nicht Datenbank ⚠️
- [ ] **Chat-History-Persistenz** - Aktuell nur In-Memory (Map<string, Message[]>) ⚠️
- [ ] **Validierungsergebnisse-Datenbank** - Nicht langfristig gespeichert
- [ ] **Flow-Execution-Traces** - Nicht persistiert

**Test Cases**:
- [x] Unit: Logger.logValidation() - Validierung loggen
- [x] Unit: Logger.logError() - Fehler loggen
- [ ] E2E: Chat-Persistenz nach Neustart ⚠️ FEHLT (chat.spec.ts:63 schlägt fehl)

**Lücken**:
- ⚠️ **KRITISCH: Chat-History geht bei Neustart verloren**
- **Impact**: HOCH für Produktion
- **Aufwand**: 3-4 Stunden
- **Implementierung**: Neo4j-basiertes Audit-Log
  ```cypher
  CREATE (:AuditLog {
    timestamp: datetime(),
    type: 'chat'|'validation'|'error',
    sessionId: string,
    userId: string,
    data: string  // JSON
  })
  ```

---

#### Anforderung: Prompt-Evaluierung & Performance-Dashboard
**Beschreibung**: Module zur Prompt-Evaluierung, Performance-Dashboard sind zu erstellen. Synergien zum E2E Testing nutzen.

**Status**: [ ] **NICHT IMPLEMENTIERT** ⚠️
**Priorität**: P3 (Optional für MVP, P1 für Produktion)

**Fehlend**:
- [ ] Prompt-Evaluierungs-Framework
- [ ] Performance-Metriken-Dashboard
- [ ] Response-Quality-Tracking
- [ ] Token-Usage-Analytics
- [ ] Latency-Monitoring-UI

**Test Cases**:
- [ ] Alle fehlen ⚠️

**Lücken**:
- **Impact**: NIEDRIG für MVP, HOCH für Produktion
- **Aufwand**: 8-10 Stunden
- **Empfehlung**: Phase 2 Feature

---

## Constraints

### Constraint: Echtzeit-Interaktion
**Beschreibung**: Die Interaktion User/Agent soll "in Echtzeit" erfolgen, daher alle Optimierungsmöglichkeiten intensiv prüfen.

**Status**: [x] TEILWEISE IMPLEMENTIERT
**Priorität**: P1 (Kritisch)

**Geforderte Optimierungen**:

#### Prompt Caching
**Status**: [ ] **NICHT IMPLEMENTIERT** ⚠️
**Impact**: MITTEL - Könnte 50-90% bei wiederholtem Context sparen
**Aufwand**: 1-2 Stunden

**Implementierung**:
```typescript
// Claude unterstützt Prompt Caching für wiederholten Context
{
  system: [
    {
      type: "text",
      text: ontologySchema,
      cache_control: { type: "ephemeral" }  // Cache diesen Teil
    }
  ]
}
```

**Test Cases**:
- [ ] Integration: PromptCache.hit() - Cache-Treffer ⚠️ FEHLT

---

#### Prompt Compression
**Status**: [x] IMPLEMENTIERT ✅
**Performance**: 74.2% Reduktion

**Implementierung**:
- [x] Format E Compressor (format-e-compressor.ts)
- [x] Graph-Serialisierung mit Kompression
- [x] Semantische ID-Generierung

**Test Cases**:
- [x] Unit: FormatECompressor.compress() - 74.2% Reduktion
- [x] Benchmark: 200-Node Graph <2s Response

---

#### Diff-Kommunikation
**Status**: [x] IMPLEMENTIERT ✅

**Implementierung**:
- [x] Diff-Algorithm (diff-algorithm.ts)
- [x] Minimale Änderungen berechnen (<50ms)

**Test Cases**:
- [x] Unit: DiffAlgorithm.computeDiff() - Performance <50ms

---

#### Streaming
**Status**: [x] IMPLEMENTIERT ✅

**Performance**:
- [x] Time to first token: <500ms (erreicht ~200ms)
- [x] Token streaming: <50ms/token (erreicht ~20ms)

**Test Cases**:
- [x] E2E: chat-llm.spec.ts:56 - Streaming in Echtzeit
- [x] Performance: <50ms/token erreicht

---

#### Prädiktives Erstellen von ableitbaren Elementen
**Status**: [x] IMPLEMENTIERT ✅

**Implementierung**:
- [x] UC → Functions (auto-derivation.service.ts)
- [x] REQ → Test Cases
- [x] FUNC → Data Flows

---

#### Optimistic Updates
**Status**: [x] IMPLEMENTIERT ✅

**Implementierung**:
- [x] Optimistic Update Manager (optimistic-update-manager.ts)
- [x] Sofortiges UI-Feedback
- [x] Rollback bei Server-Rejection (3s Timeout)

**Test Cases**:
- [x] Unit: OptimisticUpdateManager.apply() - Optimistic Update
- [x] Unit: OptimisticUpdateManager.rollback() - Rollback

---

#### Embeddings
**Status**: [ ] **NICHT IMPLEMENTIERT** ⚠️
**Priorität**: P3 (Optional)

**Verwendung**:
- Semantische Suche in Ontologie
- Ähnliche Node-Empfehlungen
- Duplikat-Erkennung

**Lücken**:
- **Impact**: NIEDRIG für MVP
- **Aufwand**: 4-6 Stunden
- **Empfehlung**: Phase 2

---

#### Asynchronous Agents
**Status**: [ ] TEILWEISE IMPLEMENTIERT ⚠️
**Infrastruktur vorhanden, nicht aktiv genutzt**

---

### Constraint: Ontology V3
**Beschreibung**: Die Ontology V3 ist die gesetzte Struktur für die Graph-Repräsentation des Systems.

**Status**: [x] **VOLLSTÄNDIG IMPLEMENTIERT** ✅
**Priorität**: P1 (Kritisch)

**Implementierung**:
- [x] Alle 10 Node-Typen (SYS, ACTOR, UC, FCHAIN, FUNC, FLOW, REQ, TEST, MOD, SCHEMA)
- [x] Alle 6 Relationship-Typen (compose, io, satisfy, verify, allocate, relation)
- [x] Alle 12 Validierungs-Regeln
- [x] Neo4j-Schema mit Constraints und Indexes

**Dateien**:
- `src/database/neo4j-schema.cypher` (247 Zeilen)
- `src/database/validators.ts` (715 Zeilen)
- `src/validation/rules/` (12 Regel-Dateien)

**Test Cases**:
- [x] Unit: 58 Validierungs-Tests bestanden
- [x] Integration: Neo4j-Schema-Constraints
- [x] E2E: chat-graph.spec.ts:162 - Komplexe Ontologie-Requests

---

### Constraint: Ontologie-Agnostisch
**Beschreibung**: Die Anwendung muss Ontologie-agnostisch ausgelegt sein, um andere Ontologien durch Tausch Config-Datei umsetzen zu können.

**Status**: [ ] TEILWEISE IMPLEMENTIERT ⚠️
**Priorität**: P3 (Optional für MVP)

**Implementiert**:
- [x] Ontology V3 Schema in JSON (ontology_schema.json)
- [x] Schema zur Laufzeit geladen
- [x] Validierungsregeln nutzen Schema

**Nicht vollständig agnostisch**:
- [ ] Einige hardcodierte Node-Typen im Code ⚠️
- [ ] Validatoren referenzieren spezifische Typen
- [ ] UI nimmt Ontology V3 Struktur an

**Test Cases**:
- [ ] Integration: Schema-Tausch-Test ⚠️ FEHLT

**Lücken**:
- **Impact**: NIEDRIG für MVP
- **Aufwand**: 4-6 Stunden
- **Empfehlung**: Refactoring in Phase 2 falls andere Ontologien benötigt

**Erforderliche Änderungen**:
```typescript
// Statt:
if (node.type === 'FUNC') { ... }

// Nutzen:
const funcType = ontologySchema.getTypeByName('Function');
if (node.type === funcType.id) { ... }
```

---

## Architecture Constraints

### Constraint: Neo4j 5.x Community
**Status**: [x] IMPLEMENTIERT ✅

**Implementierung**:
- [x] Neo4j 5.14 Community Edition
- [x] Docker-Compose Setup
- [x] Neo4j-Driver Integration

**Test Cases**:
- [x] Integration: Neo4j-Connection-Test
- [x] E2E: chat-graph.spec.ts - Node-Erstellung in Neo4j

---

### Constraint: Keep it Simple - Minimale Abhängigkeiten
**Status**: [x] IMPLEMENTIERT ✅

**Implementierung**:
- [x] Minimale Dependencies
  - Backend: Express, neo4j-driver, ws, TypeScript
  - Frontend: React, Cytoscape.js, Zustand
- [x] KEINE heavy Frameworks (kein Grafana, TinyMCE, GitHub Actions)

**Dependencies Count**:
- Produktion: 23 Dependencies (sehr schlank)
- Dev: 42 Dependencies (angemessen)

**Nachweis**: package.json zeigt minimalen, fokussierten Stack

---

## Test Coverage Matrix

| Kategorie | Anforderung | Unit | Integration | E2E | Status |
|-----------|-------------|------|-------------|-----|--------|
| **Use Cases** |
| UC1 | SE-Führung | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| UC2 | Auto-Derivation | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| UC3 | Architektur-Analyse | [ ] | [ ] | [ ] | [ ] Teilweise |
| **UI - Chat Canvas** |
| FR1.1 | Streaming | ✅ | ✅ | ✅ chat-llm:56 | [x] |
| FR1.2 | **Editierbarer Output** | ❌ | ❌ | ❌ | [ ] **KRITISCH** ⚠️ |
| FR1.3 | **Persistenz** | ✅ | ⚠️ | ⚠️ chat:63 | [ ] **KRITISCH** ⚠️ |
| FR1.4 | Multi-User | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| **UI - Text Canvas** |
| FR2.1 | Tabellarisch | ✅ | ✅ | ✅ canvases:34 | [x] |
| FR2.2 | **Inline-Editing** | ❌ | ❌ | ❌ | [ ] ⚠️ |
| FR2.3 | Export | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| **UI - Graph Canvas** |
| FR3.1 | Visualisierung | ✅ | ✅ | ✅ graph:215 | [x] |
| FR3.2 | Filterung | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| FR3.3 | **Hierarchie-Rollup** | ❌ | ❌ | ❌ | [ ] **KRITISCH** ⚠️ |
| FR3.4 | **Datenfluss-Schaltplan** | ❌ | ❌ | ❌ | [ ] ⚠️ |
| **Auditing** |
| A1 | Logging | ✅ | ✅ | [ ] | [x] Impl., DB fehlt |
| A2 | **Performance-Dashboard** | ❌ | ❌ | ❌ | [ ] Phase 2 |
| **Constraints** |
| C1 | **Prompt Caching** | ❌ | ❌ | ❌ | [ ] ⚠️ |
| C2 | Prompt Compression | ✅ | ✅ | ✅ | [x] 74.2% |
| C3 | Streaming | ✅ | ✅ | ✅ | [x] <50ms/token |
| C4 | Auto-Derivation | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| C5 | Optimistic Updates | ✅ | ✅ | [ ] | [x] Impl., Test fehlt |
| C6 | Ontology V3 | ✅ | ✅ | ✅ | [x] Vollständig |
| C7 | Neo4j 5.x | ✅ | ✅ | ✅ | [x] |

**Legende**:
- ✅ = Implementiert und getestet
- ⚠️ = Teilweise implementiert/getestet
- ❌ = Nicht implementiert
- [x] = Anforderung erfüllt
- [ ] = Anforderung offen

---

## Kritische Lücken (MUST FIX vor Beta)

### Priorität 1 (Kritisch - Explizit geforderte Features)

#### 1. ❌ Chat Canvas: Editierbarer LLM Output
- **Anforderung**: "LLM Text Output direkt editierbar"
- **Status**: Explizit gefordert, komplett fehlend
- **Impact**: HOCH
- **Aufwand**: 2-3 Stunden
- **Test**: E2E-Test benötigt

#### 2. ❌ Persistente Chat-History
- **Anforderung**: Audit-Log für alle Chats
- **Status**: Aktuell nur In-Memory
- **Impact**: HOCH - Datenverlust bei Neustart
- **Aufwand**: 3-4 Stunden
- **Test**: chat.spec.ts:63 schlägt fehl nach Neustart

#### 3. ❌ Graph Canvas: Hierarchie-Rollup
- **Anforderung**: "Rollup von Hierarchien"
- **Status**: Explizit gefordert, fehlt
- **Impact**: HOCH
- **Aufwand**: 4-6 Stunden
- **Test**: E2E-Test benötigt

#### 4. ❌ E2E-Tests für komplette Workflows
- **Anforderung**: Synergien zum E2E Testing nutzen
- **Status**: Nur Unit-Tests, keine vollständigen E2E-Workflows
- **Impact**: HOCH - Kein Beweis dass Gesamtsystem funktioniert
- **Aufwand**: 4-6 Stunden

---

### Priorität 2 (Wichtig - Optimierungen)

#### 5. ❌ Prompt Caching
- **Anforderung**: Explizit in Optimierungen gelistet
- **Status**: Nicht implementiert
- **Impact**: MITTEL - Könnte 50-90% Tokens sparen
- **Aufwand**: 1-2 Stunden

#### 6. ⚠️ Text Canvas: Inline-Editing
- **Anforderung**: "Alle drei Canvas sind interaktiv zu editieren"
- **Status**: View-Only
- **Impact**: MITTEL
- **Aufwand**: 1-2 Stunden

---

### Priorität 3 (Optional - Phase 2)

#### 7. ❌ Performance-Dashboard
- **Anforderung**: "Performance Dashboard sind zu erstellen"
- **Status**: Nicht implementiert
- **Impact**: NIEDRIG für MVP, HOCH für Produktion
- **Aufwand**: 8-10 Stunden

#### 8. ⚠️ UC3: Architektur-Analyse-Metriken
- **Anforderung**: "Analysiert Architektur und generiert Optimierungsvorschläge"
- **Status**: Nur Basis-Funktionalität
- **Impact**: MITTEL
- **Aufwand**: 6-8 Stunden

#### 9. ⚠️ Ontologie-Agnostisches Design
- **Anforderung**: "Andere Ontologien durch Tausch Config-Datei"
- **Status**: Teilweise, einige hardcodierte Typen
- **Impact**: NIEDRIG - Nur wenn andere Ontologien benötigt
- **Aufwand**: 4-6 Stunden

---

## Completion Status & Roadmap

### Aktueller Status
- **Gesamt-Vollständigkeit**: ~75%
- **Bereit für**: Alpha-Testing (mit bekannten Einschränkungen)
- **NICHT bereit für**: Public Beta, Produktion

### Phase 1: MVP-Fixes (1-2 Wochen)

**Woche 1** (~18-24 Stunden):
- [ ] Editierbarer Chat Canvas (2-3h)
- [ ] Persistente Chat-History (3-4h)
- [ ] Prompt Caching implementieren (1-2h)
- [ ] Text Canvas Inline-Editing (1-2h)
- [ ] E2E-Test-Suite erstellen (manuell) (4-6h)

**Woche 2**:
- [ ] Graph Canvas Hierarchie-Rollup (4-6h)
- [ ] Bugs aus E2E-Testing fixen
- [ ] Performance-Optimierung basierend auf Load-Tests
- [ ] Deployment-Dokumentation

**Ergebnis**: Feature-vollständiges MVP bereit für Alpha-Testing

---

### Phase 2: Produktionsreife (2-3 Wochen)

**Woche 3**:
- [ ] Performance-Dashboard
- [ ] Erweiterte Graph-Filterung
- [ ] Architektur-Analyse-Metriken
- [ ] Embeddings für semantische Suche

**Woche 4-5**:
- [ ] Automatisierte E2E-Tests (Playwright)
- [ ] Produktions-Monitoring
- [ ] Error-Tracking-Integration
- [ ] Benutzer-Dokumentation

**Ergebnis**: Produktionsreifes System

---

## Sofortiger Handlungsbedarf

**Nächste 2-3 Tage** (für Beta-Readiness):

1. **Editierbarer Chat Canvas** (2-3h) ⚠️ P1
2. **Persistente Chat-History** (3-4h) ⚠️ P1
3. **Manuelle E2E-Tests durchführen** (4-6h) ⚠️ P1
4. **Prompt Caching** (1-2h) ⚠️ P2

**Gesamt-Aufwand**: ~12-15 Stunden (1.5-2 Tage)

Nach diesen Fixes: ~90% MVP-Vollständigkeit erreicht ✅

---

## Fazit

**Fundament ist solide** (75% komplett), aber die fehlenden 25% enthalten kritische, explizit geforderte Features:

1. ⚠️ **Editierbarer LLM Output** - Explizit in Anforderungen
2. ⚠️ **Hierarchie-Rollup** - Explizit in Anforderungen
3. ⚠️ **Persistente Logs** - Explizit in Anforderungen
4. ⚠️ **Prompt Caching** - Explizit in Constraints

**Empfehlung**: Priorität 1 Items sofort umsetzen (2-3 Tage), dann umfassende E2E-Tests und Iteration basierend auf Findings.
