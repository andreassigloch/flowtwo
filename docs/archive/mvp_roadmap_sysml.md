# MVP Roadmap & SysML 2.0 Mapping

**Version:** 1.0  
**Datum:** 2025-11-14  
**Zweck:** Minimum Viable Product Definition und SysML 2.0 Kompatibilität

---

## 1. MVP-Komponenten (Minimal funktionsfähig)

### 1.1 Backend (Graph-Daten & Layout)

**Status: ✅ = Vorhanden, ⚠️ = Teilweise, ❌ = Fehlt**

| Komponente | Status | Details | Priorität |
|------------|--------|---------|-----------|
| **Neo4j Datenbank** | ✅ | Graph-Speicherung mit Ontologie v3.0.0 | P0 |
| **Ontologie-Validierung** | ⚠️ | Rules vorhanden, Enforcement fehlt | P1 |
| **Format E Serializer** | ✅ | Vorhanden (PromptCompacting) | P0 |
| **Format E Parser** | ⚠️ | Nur Basic, Diff-Parsing fehlt | P2 |
| **View-Filter Engine** | ❌ | Layout/Render-Filter Logik fehlt | P0 |
| **Port-Extraktion** | ❌ | FLOW→Port Transformation fehlt | P0 |
| **Layout-Algorithmus (1)** | ❌ | Mindestens Reingold-Tilford | P0 |
| **Layout-Algorithmus (2-4)** | ❌ | Sugiyama, Orthogonal, Nested | P1 |
| **REST API** | ⚠️ | Basic vorhanden, View-Endpoints fehlen | P0 |

### 1.2 Frontend (Visualisierung)

| Komponente | Status | Details | Priorität |
|------------|--------|---------|-----------|
| **Graph-Canvas** | ⚠️ | Basic vorhanden, View-Switch fehlt | P0 |
| **Node-Rendering** | ⚠️ | Standard-Shapes, Zoom-Levels fehlen | P0 |
| **Port-Darstellung** | ❌ | FLOW als Ports fehlt komplett | P0 |
| **Edge-Routing** | ⚠️ | Basic Lines, Orthogonal fehlt | P1 |
| **Container-Rendering** | ❌ | Nested Boxes fehlen | P0 |
| **Zoom/Pan** | ⚠️ | Basic vorhanden | P1 |
| **Expand/Collapse** | ❌ | Progressive Disclosure fehlt | P1 |
| **View-Selector** | ❌ | Dropdown für Views fehlt | P0 |
| **Style-Engine** | ❌ | rendering_ontology.json Anwendung fehlt | P0 |

### 1.3 Daten & Konfiguration

| Komponente | Status | Details | Priorität |
|------------|--------|---------|-----------|
| **ontology_schema.json** | ✅ | Version 3.0.0 vorhanden | P0 |
| **rendering_ontology.json** | ❌ | Muss erstellt werden | P0 |
| **Views (JSON)** | ❌ | 5 Standard-Views fehlen | P0 |
| **Layout-Algorithmen** | ❌ | Keine Implementierung | P0 |
| **Beispiel-Graphen** | ⚠️ | Alter Format, Konvertierung nötig | P1 |

---

## 2. MVP Scope Definition

### Phase 0: Setup (1 Woche)
**Ziel:** Infrastruktur & Definitionen

✅ **Erledigt:**
- ontology_schema.json
- Format E Spec (Dokumentation)
- Requirements (graphengineREQ_v2.md)
- Definitions (graphengineeringdef.md)

❌ **Zu tun:**
- rendering_ontology.json erstellen
- 5 View-Definitionen als JSON
- Beispiel-Graph konvertieren (UrbanMobilityVehicle)

### Phase 1: Minimal Backend (2 Wochen)
**Ziel:** View-Filter + 1 Layout-Algorithmus

**Must-Have:**
1. View-Filter Engine
   - `apply_view_filter(graph, view_config)` 
   - Layout-Node-Filter
   - Render-Node-Filter
2. Port-Extraktion
   - `extract_ports(graph, func_node_id)`
   - FLOW→Port Transformation
3. Reingold-Tilford Layout
   - Tree-Layout für Hierarchie-View
   - Top-Down Orientation
4. REST API Endpoints
   - `POST /api/layout/compute` (view_id, graph_data)
   - `GET /api/views` (list available views)
   - `GET /api/views/{id}` (get view config)

**API Beispiel:**
```http
POST /api/layout/compute
{
  "viewId": "hierarchy",
  "graphData": {...},  // Format E oder JSON
  "options": {
    "orientation": "top-down"
  }
}

Response:
{
  "positions": {
    "UrbanMobilityVehicle.SY.001": {"x": 500, "y": 0},
    "AccessMobilityDashboard.UC.001": {"x": 300, "y": 150}
  },
  "bounds": {"width": 1000, "height": 600},
  "viewContext": "hierarchy"
}
```

### Phase 2: Minimal Frontend (2 Wochen)
**Ziel:** 1 View visuell darstellen

**Must-Have:**
1. Node-Rendering nach rendering_ontology.json
   - Shapes (rectangle, ellipse, etc.)
   - Stereotypen (UML-konform)
   - Zoom-Level L2 (Standard)
2. Container-Rendering
   - Nested Boxes für compose-Beziehungen
   - Padding & Auto-Size
3. Port-Darstellung
   - Kleine Kreise an FUNC-Nodes
   - Labels optional
4. View-Selector
   - Dropdown mit 1 View: "System Hierarchy"
   - View-Switch löst Layout-Neuberechnung aus
5. Canvas-Integration
   - SVG oder Canvas Rendering
   - Pan/Zoom Basic

### Phase 3: Multi-View (1 Woche)
**Ziel:** Alle 5 Views funktionsfähig

**Must-Have:**
1. Weitere Layout-Algorithmen
   - Sugiyama (für Requirements-View)
   - Orthogonal (für Functional-Flow-View)
2. Edge-Routing
   - Orthogonal für Functional-Flow
   - Polyline für Requirements
3. View-Definitionen aktiv
   - Alle 5 Views als JSON
   - View-Switch funktioniert

### Phase 4: Interaktivität (1 Woche)
**Ziel:** Expand/Collapse, Zoom-Levels

**Must-Have:**
1. Expand/Collapse
   - Click auf Container-Node
   - Progressive Disclosure
   - Layout-Update via Diff-Format
2. Zoom-Levels
   - L1 (Compact) ↔ L2 (Standard) ↔ L3 (Detailed)
   - Context-abhängig per Node-Typ

**Total MVP: 7 Wochen**

---

## 3. SysML 2.0 Diagramm-Mapping

### 3.1 Package Diagram ↔ System Hierarchy View

**SysML 2.0 Konzept:**
```sysml
package UrbanMobilityVehicle {
    package NavigationSystem { ... }
    package EnergyManagement { ... }
}
```

**Unser Mapping:**
- SysML `package` → Ontologie `SYS`
- Nested packages → `compose` Beziehungen
- View: `hierarchy.json`
- Layout: Reingold-Tilford (Tree)

**Visualisierung:**
- Packages als Rounded Rectangles
- Stereotype: «system»
- Nested Boxes für Containment

### 3.2 Use Case Diagram ↔ Use Case Scenario View

**SysML 2.0 Konzept:**
```sysml
use case NavigateUrbanEnvironment {
    actor UrbanDriver;
    actor UrbanInfrastructure;
}
```

**Unser Mapping:**
- SysML `use case` → Ontologie `UC`
- SysML `actor` → Ontologie `ACTOR`
- Actor associations → Compose-Beziehungen (in UC)
- View: `use-case-diagram.json`
- Layout: Radial (UC-zentriert)

**Visualisierung:**
- UC als Ellipse (UML-konform)
- Actors als Stick-Figures
- Boundary-Lines zwischen Actor-UC
- System-Boundary als gestricheltes Rechteck

### 3.3 Internal Block Diagram (IBD) ↔ Functional Flow View

**SysML 2.0 Konzept:**
```sysml
part def DashboardSystem {
    part receiveInput : Function;
    part displayInfo : Function;
    
    interface port inputPort : UserInput;
    interface port outputPort : DisplayData;
    
    connect receiveInput.output to displayInfo.input;
}
```

**Unser Mapping:**
- SysML `part def` → Ontologie `FCHAIN` (Container)
- SysML `part` (Function) → Ontologie `FUNC`
- SysML `interface port` → Ontologie `FLOW` (als Port)
- SysML `connect` → Ontologie `io` edge
- View: `functional-flow.json`
- Layout: Orthogonal + Nested Containment

**Visualisierung:**
- FCHAIN als Swimlane/Container
- FUNC als Rechtecke mit «function»
- FLOW nicht als Node, sondern als Ports an FUNC
- Connections als orthogonale Linien zwischen Ports

**Port-Mapping:**
```
SysML: interface port inputPort : UserInput
↓
Ontologie: 
  FLOW-Node: {Name: "UserInput", Type: "sync"}
  io-Edge: FLOW --io--> FUNC (= Input-Port)
↓
Rendering:
  Port am FUNC-Node (links)
  Label: "UserInput"
```

### 3.4 Block Definition Diagram (BDD) ↔ Allocation View

**SysML 2.0 Konzept:**
```sysml
part def PowertrainModule {
    part optimizeEnergy : Function;
    part maintainSpeed : Function;
}
```

**Unser Mapping:**
- SysML `part def` (physical) → Ontologie `MOD`
- Allocated functions → `allocate` Beziehungen
- View: `allocation.json`
- Layout: Nested Containment (Treemap)

**Visualisierung:**
- MOD als Component-Rectangles
- FUNC innerhalb MOD als allocated functions
- allocate-Edges optional sichtbar

### 3.5 Requirement Diagram ↔ Requirements Traceability View

**SysML 2.0 Konzept:**
```sysml
requirement SystemAnalysis {
    id = "REQ-001";
    text = "System boundaries...";
}

satisfy SystemAnalysis by NavigateUrbanEnvironment;
```

**Unser Mapping:**
- SysML `requirement` → Ontologie `REQ`
- SysML `satisfy` → Ontologie `satisfy` edge
- SysML `verify` → Ontologie `verify` edge
- View: `requirements.json`
- Layout: Sugiyama (Layered)

**Visualisierung:**
- REQ als Rectangles mit «requirement»
- satisfy/verify als dashed arrows
- Layer-basiert: SYS → UC → FUNC → REQ → TEST

### 3.6 Activity Diagram ↔ (Zukünftig: Process Flow View)

**SysML 2.0 Konzept:**
```sysml
action calculateRoute {
    in destination : Location;
    out route : Path;
}
```

**Unser Mapping (noch nicht implementiert):**
- SysML `action` → Potentielle Erweiterung: `ACTION` Node-Typ
- Control flow → Potentielle Erweiterung: `control` Edge-Typ
- Aktuell: FCHAIN + FUNC + io-Edges als Ersatz

**Empfehlung für MVP:**
- FCHAIN als vereinfachtes Activity Diagram
- io-Edges für Datenfluss
- Keine Control-Flow-Logik (kein if/loop)

### 3.7 Sequence Diagram ↔ (Nicht im MVP)

**Später:** Zeitliche Abfolge von Messages zwischen Komponenten

---

## 4. SysML 2.0 Stereotype-Mapping

### 4.1 Standard-Stereotypen

| SysML 2.0 Stereotype | Ontologie Node-Typ | Rendering Symbol |
|----------------------|--------------------| -----------------|
| `«system»` | SYS | Rounded Rectangle |
| `«requirement»` | REQ | Rectangle |
| `«function»` | FUNC | Rectangle |
| `«module»` / `«block»` | MOD | Component Rectangle |
| `«test»` / `«testCase»` | TEST | Rectangle |
| (keine) UC | UC | Ellipse (UML-konform) |
| (keine) ACTOR | ACTOR | Stick Figure |

### 4.2 Port-Stereotypen (SysML 2.0 erweitert)

| SysML 2.0 Port Type | FLOW.Type | Icon/Style |
|---------------------|-----------|------------|
| `flow port` | sync | Solid circle |
| `proxy port` | async | Dashed circle |
| (stream) | stream | Double circle |
| (batch) | batch | Square |

### 4.3 Relationship-Stereotypen

| SysML 2.0 Relationship | Ontologie Edge | Rendering |
|------------------------|----------------|-----------|
| Composition (black diamond) | compose | Implizit (Nested Boxes) |
| `«satisfy»` | satisfy | Dashed arrow, open triangle |
| `«verify»` | verify | Dashed arrow, open triangle |
| `«allocate»` | allocate | Solid arrow, filled diamond |
| Connector (IBD) | io | Solid arrow, filled triangle |

---

## 5. MVP Feature-Matrix

### 5.1 Diagramm-Unterstützung im MVP

| SysML 2.0 Diagramm | Unterstützung | View-Name | Priorität |
|--------------------|---------------|-----------|-----------|
| **Package Diagram** | ✅ Full | System Hierarchy | P0 |
| **Use Case Diagram** | ✅ Full | Use Case Scenario | P0 |
| **Internal Block Diagram** | ✅ Full | Functional Flow | P0 |
| **Block Definition Diagram** | ✅ Full | Allocation | P1 |
| **Requirement Diagram** | ✅ Full | Requirements Traceability | P1 |
| **Activity Diagram** | ⚠️ Partial | (via FCHAIN) | P2 |
| **Sequence Diagram** | ❌ None | (Zukunft) | P3 |
| **Parametric Diagram** | ❌ None | (Zukunft) | P3 |

### 5.2 SysML 2.0 Konzepte im MVP

| Konzept | Unterstützung | Details |
|---------|---------------|---------|
| **Parts & Composition** | ✅ Full | Via compose edges + Nesting |
| **Ports & Interfaces** | ✅ Full | Via FLOW nodes as ports |
| **Flows & Connectors** | ✅ Full | Via io edges |
| **Requirements** | ✅ Full | Via REQ nodes + satisfy/verify |
| **Allocation** | ✅ Full | Via allocate edges |
| **Generalization** | ❌ None | Nicht in Ontologie v3.0.0 |
| **Dependencies** | ⚠️ Partial | Via relation edges (generic) |
| **Constraints** | ❌ None | Nicht im MVP |
| **Parameters** | ❌ None | Nicht im MVP |

---

## 6. Implementierungs-Priorisierung

### Kritischer Pfad (Must-Have für MVP):

```
Phase 0: Setup (1W)
    ├─ rendering_ontology.json
    ├─ 5 View-JSONs
    └─ Graph-Konvertierung
        ↓
Phase 1: Backend (2W)
    ├─ View-Filter Engine
    ├─ Port-Extraktion
    ├─ Reingold-Tilford
    └─ REST API
        ↓
Phase 2: Frontend (2W)
    ├─ Node-Rendering (L2)
    ├─ Container-Rendering
    ├─ Port-Darstellung
    └─ View-Selector
        ↓
Phase 3: Multi-View (1W)
    ├─ Sugiyama
    ├─ Orthogonal
    └─ 5 Views aktiv
        ↓
Phase 4: Interaktivität (1W)
    ├─ Expand/Collapse
    └─ Zoom-Levels

= 7 Wochen MVP
```

### Nice-to-Have (Post-MVP):

- Diff-Format für Incremental Updates
- Format E Diff-Parser
- Animation bei Layout-Änderungen
- Multiple Zoom-Levels (L0-L4)
- Custom Views (User-definiert)
- Export zu SysML 2.0 Tools
- Activity Diagram View
- Schema-Visualization (JSON-Structs)

---

## 7. Technologie-Stack Empfehlung

### Backend:
- **Python 3.11+** (für Layout-Algorithmen)
- **Neo4j 5.x** (Graph-Datenbank)
- **FastAPI** (REST API)
- **Pydantic** (View-Config Validation)

### Frontend:
- **React 18+** (UI Framework)
- **TypeScript** (Type Safety)
- **D3.js** oder **Cytoscape.js** (Graph-Rendering)
- **Zustand** (State Management)

### Layout:
- **Eigene Implementierung** (Reingold-Tilford in Python)
- **ELK.js** (Optional: für Sugiyama)
- **Dagre** (Optional: für schnelles Prototyping)

### Alternative (weniger Aufwand):
- **yFiles** (Kommerziell, alle Algorithmen inkl.)
- Lizenzkosten vs. Entwicklungszeit abwägen

---

## 8. Risiken & Mitigations

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| Layout-Algorithmen komplex | High | Start mit Reingold-Tilford (einfach), ELK.js als Fallback |
| Port-Rendering Performance | Medium | Virtualisierung bei >100 Nodes |
| View-Switch langsam | Medium | Layout-Caching, Incremental Updates |
| FLOW→Port Conversion fehleranfällig | High | Umfangreiche Unit-Tests, Validierung |
| SysML 2.0 Compliance unklar | Low | Fokus auf Diagramm-Typen, nicht Metamodell-Vollständigkeit |

---

## 9. Deliverables für MVP

### Dokumentation:
- ✅ graphengineREQ_v2.md (Anforderungen)
- ✅ graphengineeringdef.md (Definitionen)
- ❌ MVP Implementation Guide (diese Datei)
- ❌ API Documentation (Swagger/OpenAPI)

### Code:
- ❌ Backend: View-Filter + Port-Extraction
- ❌ Backend: Layout-Algorithmen (mindestens 1)
- ❌ Backend: REST API
- ❌ Frontend: Graph-Renderer
- ❌ Frontend: View-Selector

### Daten:
- ✅ ontology_schema.json
- ❌ rendering_ontology.json
- ❌ 5 View-JSONs
- ❌ Konvertierter Beispiel-Graph (UrbanMobilityVehicle)

### Tests:
- ❌ Unit-Tests für Port-Extraction
- ❌ Integration-Tests für View-Filter
- ❌ E2E-Tests für 1 View (System Hierarchy)

---

## 10. Next Steps (Konkret)

**Woche 1 (Setup):**
1. rendering_ontology.json aus graphengineeringdef.md extrahieren → JSON-File
2. 5 View-Definitionen aus graphengineeringdef.md → JSON-Files
3. UrbanMobilityVehicle.json konvertieren:
   - flow edges → FLOW nodes + io edges
   - UUIDs → Semantic IDs
   - Format E Version erstellen

**Woche 2-3 (Backend Core):**
4. View-Filter Engine implementieren (Python)
5. Port-Extraction implementieren (Python)
6. Reingold-Tilford in Python
7. REST API mit FastAPI

**Woche 4-5 (Frontend Core):**
8. React-Komponente: GraphCanvas
9. Node-Renderer (rendering_ontology.json)
10. Container-Renderer (Nested Boxes)
11. View-Selector Dropdown

**Woche 6 (Multi-View):**
12. Sugiyama oder ELK.js Integration
13. Orthogonal Layout (oder Dagre)
14. Alle 5 Views funktional

**Woche 7 (Polish):**
15. Expand/Collapse Basic
16. Bug-Fixes
17. Demo vorbereiten

**Status nach 7 Wochen:** Funktionsfähiger MVP mit 5 Views, 1-3 Layout-Algorithmen, SysML 2.0 kompatibel für 5 Diagramm-Typen.
