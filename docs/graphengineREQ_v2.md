# Anforderungspräzisierung: Multi-Level Graph-Layout-System für Systems Engineering

## 0. Ontologie-Integration & Architektur-Grundlagen

### 0.1 Basis-Metamodell

**Node-Typen (aus ontology_schema.json v3.0.0):**
- **SYS**: System (kann andere Systeme oder Use Cases enthalten)
- **UC**: Use Case (organisiert Funktionen)
- **ACTOR**: Externe Entität (interagiert mit Funktionen)
- **FCHAIN**: Function Chain (Sequenz zusammenhängender Funktionen)
- **FUNC**: Funktion (spezifische Fähigkeit/Aktion)
- **FLOW**: Data Flow Contract (Schnittstellen-Definition zwischen Funktionen)
- **REQ**: Requirement (Spezifikation von Anforderungen)
- **TEST**: Verifikation/Validierung
- **MOD**: Modul (physische Realisierung, enthält Funktionen)
- **SCHEMA**: Globale Datenstruktur-Definition

**Relationship-Typen:**
- **compose**: Komposition (hierarchisch, nesting)
- **io**: Input/Output-Verbindung (über FLOW-Nodes)
- **satisfy**: Requirements-Spezifikation
- **verify**: Test-Beziehung
- **allocate**: Funktions-Zuordnung zu Modulen
- **relation**: Generische Beziehung

### 0.2 FLOW-Node als Port-Definition

**Architektur-Konzept:**
```
FUNC --io--> FLOW  ≙  Output-Port mit FLOW-Typ-Definition
FLOW --io--> FUNC  ≙  Input-Port mit FLOW-Typ-Definition
```

**Visualisierungs-Mapping:**
- **FLOW-Node**: Nicht als separates Symbol gerendert
- **io-Relationship**: Als Port am Funktionsblock dargestellt
- **Port-Label**: FLOW.Name
- **Port-Attribute**: FLOW.Type (sync/async/stream/batch), Pattern, Validation
- **Edge zwischen Ports**: Direkte visuelle Verbindung (ohne FLOW-Node-Symbol dazwischen)

**Vorteile:**
- Wiederverwendbare Port-Definitionen (mehrere FUNC nutzen selbe FLOW-Definition)
- Contract-First Design (Schnittstelle ist explizites Element)
- Type-Safety (Matching zwischen Output- und Input-Port garantiert)

**Port-Extraktion aus Graph:**
```
Für jeden FUNC-Node:
  Input-Ports  = {FLOW-Nodes mit (FLOW --io--> FUNC)}
  Output-Ports = {FLOW-Nodes mit (FUNC --io--> FLOW)}
```

### 0.3 View-spezifisches Layout-Konzept

**Filter-Pipeline:**
```
Gesamtgraph (alle Nodes/Edges aus Neo4j)
    ↓
Layout-Filter (welche Struktur für Algorithmus?)
    ↓
Render-Filter (was wird gezeichnet?)
    ↓
Layout-Algorithmus
    ↓
Darstellung (Canvas/SVG)
```

**View-Definition Struktur:**
```json
{
  "viewType": "FunctionalFlow | Hierarchy | Requirements | Allocation",
  "layoutConfig": {
    "includeNodeTypes": ["UC", "FUNC", "ACTOR"],
    "includeRelTypes": ["compose", "io"],
    "algorithm": "orthogonal | tree | layered",
    "containerNodes": ["UC", "FCHAIN"]
  },
  "renderConfig": {
    "showNodes": ["UC", "FUNC", "ACTOR"],
    "showEdges": ["io"],
    "hideEdges": ["compose"],
    "portRendering": "fromFlowNodes"
  }
}
```

**Beispiel-Views:**

| View-Typ | Layout-Nodes | Layout-Edges | Render-Edges | Algorithmus |
|----------|--------------|--------------|--------------|-------------|
| **Hierarchy** | SYS, UC, MOD | compose | - (implicit) | Reingold-Tilford |
| **FunctionalFlow** | UC, FUNC, ACTOR | compose, io | io only | Orthogonal + Containment |
| **Requirements** | REQ, FUNC, TEST | satisfy, verify | satisfy, verify | Sugiyama (layered) |
| **Allocation** | MOD, FUNC | allocate, compose | allocate | Nested Boxes |

**Rationale:**
- Layout-Filter bestimmt Graphstruktur für Algorithmus
- Render-Filter bestimmt Sichtbarkeit (z.B. compose-Edges durch Boxes implizit)
- Trennung erlaubt Hierarchie + Netzwerk ohne Layout-Konflikte

### 0.4 Serialisierung & Transport

**Format E Integration:**
- Token-effiziente Serialisierung (74% Reduktion vs. JSON)
- Semantic IDs: `ParseInput.FUNC.001` statt UUIDs
- View-Context mitgeliefert für Filter-Rekonstruktion
- Layout-State als optionale Attribute: `[x:100,y:200,zoom:L2]`

**Details siehe:** `CR_PromptCompactingIntegration_2025-11-02.md`

### 0.5 Format E Diff-Extension für Incremental Updates

**Zweck:** Effiziente Übertragung von Graph-Änderungen ohne kompletten Re-Export

**Syntax:**
```
<operations>
## Nodes
+ NodeName|Type|SemanticID|Descr [attributes]
- SemanticID

## Edges
+ SourceID -type-> TargetID
- SourceID -type-> TargetID
</operations>
```

**Operationen:**
- `+` = Hinzufügen (Add)
- `-` = Entfernen (Remove)
- Änderung = `-` alte Version + `+` neue Version

**Vollständiges Beispiel:**
```
<operations>
<base_snapshot>ManageFleet.UC.001@v42</base_snapshot>
<view_context>FunctionalFlow</view_context>

## Nodes
+ ValidateOrder|FUNC|ValidateOrder.FN.001|Validates customer order data [x:250,y:200,zoom:L2]
+ ProcessPayment|FUNC|ProcessPayment.FN.002|Processes payment transaction [x:450,y:200,zoom:L2]
+ PaymentData|FLOW|PaymentData.FL.005|Payment information structure
- ObsoleteFunc.FN.003
- OptimizeRoutes.FN.001|Old route optimization
+ OptimizeRoutes.FN.001|Enhanced route optimization with real-time traffic [x:300,y:200,zoom:L2]

## Edges
+ ValidateOrder.FN.001 -cp-> ProcessPayment.FN.002
+ ValidateOrder.FN.001 -io-> PaymentData.FL.005
+ PaymentData.FL.005 -io-> ProcessPayment.FN.002
+ ProcessPayment.FN.002 -satisfy-> SecurityReq.RQ.001
- ObsoleteFunc.FN.003 -cp-> ProcessPayment.FN.002
</operations>
```

**Use Cases:**

| Szenario | Operation | Beispiel |
|----------|-----------|----------|
| **Expand UC-Node** | + Children | User expandiert UC → FCHAINs + FUNCs werden hinzugefügt |
| **Collapse UC-Node** | - Children | User collapsed UC → FCHAINs + FUNCs werden entfernt |
| **Add Requirement** | + Node + Edge | LLM generiert neues REQ → satisfy-Edge zu FUNC |
| **Refactor Function** | - Old + New | FUNC wird ersetzt → alte entfernen, neue hinzufügen |
| **Update Description** | - Old + New | Descr ändern → alte Version weg, neue Version hinzu |
| **Reconnect Flow** | - Edge + Edge | FLOW-Ziel ändern → alte Edge weg, neue Edge |

**Serialisierung (Python):**
```python
def serialize_diff(base_graph, updated_graph, base_version):
    """Erstellt Diff zwischen zwei Graph-Zuständen"""
    diff = {
        'base_snapshot': f"{base_graph.root_id}@v{base_version}",
        'added_nodes': [],
        'removed_nodes': [],
        'added_edges': [],
        'removed_edges': []
    }
    
    # Node-Diffs
    base_ids = {n.semanticId for n in base_graph.nodes}
    updated_ids = {n.semanticId for n in updated_graph.nodes}
    
    # Neue Nodes
    for node_id in updated_ids - base_ids:
        node = updated_graph.get_node(node_id)
        diff['added_nodes'].append({
            'Name': node.Name,
            'type': node.type,
            'semanticId': node.semanticId,
            'Descr': node.Descr,
            'attributes': node.presentation
        })
    
    # Gelöschte Nodes
    for node_id in base_ids - updated_ids:
        diff['removed_nodes'].append(node_id)
    
    # Geänderte Nodes (als - alte + neue)
    for node_id in base_ids & updated_ids:
        base_node = base_graph.get_node(node_id)
        updated_node = updated_graph.get_node(node_id)
        
        # Prüfe ob Node sich geändert hat
        if (base_node.Descr != updated_node.Descr or 
            base_node.Name != updated_node.Name or
            base_node.presentation != updated_node.presentation):
            
            # Alte Version entfernen
            diff['removed_nodes'].append({
                'semanticId': node_id,
                'old_version': True,
                'data': base_node
            })
            # Neue Version hinzufügen
            diff['added_nodes'].append({
                'Name': updated_node.Name,
                'type': updated_node.type,
                'semanticId': updated_node.semanticId,
                'Descr': updated_node.Descr,
                'attributes': updated_node.presentation
            })
    
    # Edge-Diffs (analog)
    # ...
    
    return format_e_diff_serialize(diff)

def format_e_diff_serialize(diff):
    """Konvertiert Diff-Struktur zu Format E Diff-Syntax"""
    lines = ["<operations>"]
    lines.append(f"<base_snapshot>{diff['base_snapshot']}</base_snapshot>")
    
    if diff['added_nodes'] or diff['removed_nodes']:
        lines.append("\n## Nodes")
        
        # Erst Entfernungen (alte Versionen)
        for item in diff['removed_nodes']:
            if isinstance(item, dict) and item.get('old_version'):
                # Alte Version mit Daten für Kontext
                node = item['data']
                lines.append(f"- {node.semanticId}|{node.Descr}")
            else:
                # Einfaches Löschen
                lines.append(f"- {item}")
        
        # Dann Hinzufügungen (inkl. neue Versionen)
        for node in diff['added_nodes']:
            attrs = format_attributes(node.get('attributes', {}))
            lines.append(
                f"+ {node['Name']}|{node['type']}|{node['semanticId']}|"
                f"{node['Descr']} {attrs}"
            )
    
    if diff['added_edges'] or diff['removed_edges']:
        lines.append("\n## Edges")
        for edge_id in diff['removed_edges']:
            lines.append(f"- {edge_id}")
        for edge in diff['added_edges']:
            lines.append(f"+ {edge['source']} -{edge['type']}-> {edge['target']}")
    
    lines.append("</operations>")
    return '\n'.join(lines)
```

**Parsing (Anwendung des Diff):**
```python
def apply_diff(base_graph, diff_string):
    """Wendet Format E Diff auf Graph an"""
    operations = parse_diff_operations(diff_string)
    
    # WICHTIG: Reihenfolge beachten!
    # 1. Erst Nodes entfernen
    for node_id in operations['removed_nodes']:
        base_graph.remove_node(node_id)
    
    # 2. Dann Nodes hinzufügen (inkl. geänderte Versionen)
    for op in operations['added_nodes']:
        base_graph.add_node(
            type=op['type'],
            Name=op['Name'],
            semanticId=op['semanticId'],
            Descr=op['Descr'],
            **op.get('attributes', {})
        )
    
    # 3. Edges entfernen
    for edge in operations['removed_edges']:
        base_graph.remove_edge(edge['source'], edge['target'], edge['type'])
    
    # 4. Edges hinzufügen
    for edge in operations['added_edges']:
        base_graph.add_edge(
            source=edge['source'],
            target=edge['target'],
            type=edge['type']
        )
    
    return base_graph
```

**Token-Effizienz:**

| Szenario | Full Graph | Diff | Reduktion |
|----------|------------|------|-----------|
| Expand 5 Nodes | 4,812 tokens | ~120 tokens | **97.5%** |
| Update 1 Property | 4,812 tokens | ~15 tokens | **99.7%** |
| Add 10 + Remove 5 | 4,812 tokens | ~300 tokens | **93.8%** |

**Integration mit Views:**
- Diff enthält `<view_context>` für konsistente Filter-Anwendung
- Layout-State-Updates als Attribute: `[x:300,y:250,zoom:L3]`
- Automatische Port-Extraktion nach Diff-Anwendung

**Versionierung:**
- `<base_snapshot>` referenziert Ausgangszustand
- Optional: Snapshot-Cache im Backend für Rollback
- Konflikterkennung bei concurrent edits

---

## 1. Hierarchische Strukturdarstellung

**Anforderungen:**

**1.1 Layout-Modi für Hierarchien**
- **Tree Layout** - Reingold-Tilford für klassische Baumstrukturen mit klarer Parent-Child-Beziehung
- **Organizational Chart** - Horizontal/vertikal mit optimierter Sibling-Anordnung
- **Nested Containment** - Treemap/Nested Boxes für räumliche Hierarchie-Visualisierung
- **Layered Hierarchical** - Sugiyama-basiert für DAGs mit Multi-Parent-Beziehungen

**1.2 Navigation & Interaktion**
- **Progressive Disclosure** - Expand/Collapse einzelner Knoten oder Subtrees
- **Semantic Zoom** - Level-of-Detail: Icon → Symbol+Label → Detailansicht
- **Breadcrumb Navigation** - Pfadverfolgung durch Hierarchie-Ebenen
- **Focus+Context** - Lokale Detailansicht mit globalem Hierarchie-Kontext
- **Transient Expansion** - Temporäre Expansion ohne permanente Layout-Änderung

**1.3 Hierarchie-Erhaltung**
- **Layout Stability** - Minimale Position-Änderung bei Expand/Collapse (Mental Map)
- **Consistent Orientation** - Einheitliche Flussrichtung pro Hierarchie-Ebene
- **Level Alignment** - Gleiche Hierarchie-Ebene = gleiche Y-Koordinate (bei Top-Down)

## 2. Funktionsnetzwerk-Darstellung

**Anforderungen:**

**2.1 Schaltplan-ähnliches Layout**
- **Orthogonal Routing** - Rechtwinklige Verbindungen, Manhattan-Distanz
- **Port-basierte Konnektivität** - Explizite Ein-/Ausgänge (analog SysML Ports)
- **Dataflow Optimization** - Links→Rechts oder Top→Bottom Hauptfluss
- **Crossing Minimization** - Heuristiken zur Kreuzungsreduktion
- **Bus-Routing** - Gemeinsame Routing-Pfade für zusammengehörige Signale

**2.2 Nested Functionality (Compound Graphs)**
- **Hierarchical Nesting** - Funktionsblöcke enthalten Sub-Funktionen
- **Boundary Ports** - Ports am Container-Rand für hierarchische Verbindungen
- **Collapse Modes**:
  - **Black-Box** - Nur externe Ports sichtbar, Innenleben verborgen
  - **Gray-Box** - Reduzierte Darstellung mit Haupt-Komponenten
  - **White-Box** - Vollständige interne Struktur sichtbar

**2.3 Layout-Constraints**
- **Pin Fixierung** - Wichtige Knoten/Ports an festen Positionen
- **Alignment Constraints** - Horizontal/vertikal ausgerichtete Element-Gruppen
- **Symmetrie-Erhaltung** - Spiegelungen für symmetrische Strukturen
- **Aspect Ratio Control** - Optimale Breite-zu-Höhe-Verhältnisse

## 3. Meta-Knoten-Architektur

**Konzept:**

**3.1 Kompositions-Modell (integriert mit Ontologie)**
```
MetaNode := {
  Core: {
    type: SYS|UC|FUNC|ACTOR|FCHAIN|REQ|TEST|MOD|SCHEMA
    uuid: UUID4 (Neo4j)
    semanticId: "ParseInput.FUNC.001" (Transport)
    Name: string (max 25 chars, PascalCase)
    Descr: string
  }
  Ports: {
    inputs: Set<FLOW-Node>   // via (FLOW --io--> FUNC)
    outputs: Set<FLOW-Node>  // via (FUNC --io--> FLOW)
  }
  Content: {
    requirements: Set<REQ>    // via satisfy
    tests: Set<TEST>          // via verify
    schemas: Set<SCHEMA>      // via relation
  }
  Presentation: {
    zoomLevel: L0|L1|L2|L3|L4
    collapsed: boolean
    viewContext: ViewDefinition
  }
  Children: Set<MetaNode>     // via compose
}
```

**3.2 Darstellungs-Varianten**

| Zoom-Level | Darstellung | Inhalt |
|------------|-------------|---------|
| **L0 - Icon** | Kleines Symbol | Nur Typ-Icon (SYS, UC, FUNC, etc.) |
| **L1 - Compact** | Symbol + Label | Name (max 10 chars) + Status |
| **L2 - Standard** | SysML Block | Stereotyp, Full Name, Port-Labels |
| **L3 - Detailed** | Erweiterte Box | + Requirements-IDs, Test-Status |
| **L4 - Expanded** | Nested Content | Vollständige interne Struktur (Children visible) |

**3.3 Port-Extraktion aus Ontologie**

**Algorithmus:**
```python
def extract_ports(func_node, graph):
    """Extrahiert Ports aus io-Relationships zu FLOW-Nodes"""
    
    input_ports = []
    output_ports = []
    
    for edge in graph.edges(type='io'):
        if edge.target == func_node.id:
            # FLOW --io--> FUNC = Input-Port
            flow_node = graph.node(edge.source)
            input_ports.append({
                'id': flow_node.semanticId,
                'label': flow_node.Name,
                'type': flow_node.Type,        # sync/async/stream
                'position': 'left',
                'flowDef': flow_node
            })
        
        elif edge.source == func_node.id:
            # FUNC --io--> FLOW = Output-Port
            flow_node = graph.node(edge.target)
            output_ports.append({
                'id': flow_node.semanticId,
                'label': flow_node.Name,
                'type': flow_node.Type,
                'position': 'right',
                'flowDef': flow_node
            })
    
    return input_ports, output_ports
```

**3.4 Typ-spezifische Visualisierung**

**SYS-Knoten (System):**
- **Core**: Rechteck mit abgerundeten Ecken, «system» Stereotyp
- **Ports**: Keine (System-Boundary)
- **Content**: Requirements (via satisfy), Sub-Systems/UCs (via compose)
- **Presentation**: Container mit Nested Elements

**UC-Knoten (Use Case):**
- **Core**: Oval (UML-konform)
- **Ports**: Actor-Verbindungen (als spezielle Edge, nicht Port)
- **Content**: Requirements, FCHAINs (via compose)
- **Presentation**: Collapsed = Oval, Expanded = Container mit FCHAINs

**FCHAIN-Knoten (Function Chain):**
- **Core**: Swimlane oder gestrichelter Container
- **Ports**: Actor-Verbindungen an Start/Ende
- **Content**: FUNCs + FLOWs (via compose), Actors
- **Presentation**: Horizontaler Flow-Container

**FUNC-Knoten (Funktion):**
- **Core**: Rechteck mit «function» Stereotyp
- **Ports**: 
  - Input Ports (links) - aus (FLOW --io--> FUNC)
  - Output Ports (rechts) - aus (FUNC --io--> FLOW)
  - Port-Labels = FLOW.Name
- **Content**: Requirements (satisfy), allocated MOD (via allocate)
- **Presentation**: 
  - Black-Box = nur Ports sichtbar
  - White-Box = Sub-Functions sichtbar

**FLOW-Knoten (Data Flow):**
- **Darstellung**: NICHT als eigener Node gerendert
- **Verwendung**: Als Port-Definition für FUNC-Nodes
- **Visualisierung**: Edge-Label oder Port-Tooltip mit Type/Pattern-Info

**ACTOR-Knoten:**
- **Core**: Strichmännchen (UML) oder Icon
- **Ports**: FLOW-Verbindungen (als Input/Output zur Function Chain)
- **Content**: Keine
- **Presentation**: Boundary-Element außerhalb Container

**REQ-Knoten (Requirement):**
- **Core**: Rechteck mit «requirement» Stereotyp
- **Ports**: Keine
- **Content**: Tests (via verify), Parent-REQ (via satisfy)
- **Presentation**: Text-Box mit REQ-ID + Descr

**MOD-Knoten (Modul):**
- **Core**: Rechteck mit «module» Stereotyp
- **Ports**: Physische Interfaces
- **Content**: Allocated Functions (via allocate)
- **Presentation**: Package/Component-Darstellung

**TEST-Knoten:**
- **Core**: Rechteck mit «test» Stereotyp
- **Ports**: Keine
- **Content**: Verified REQs (via verify)
- **Presentation**: Test-Case-Box mit Status-Indikator

**SCHEMA-Knoten:**
- **Core**: Datenbank-Symbol oder Struktur-Icon
- **Ports**: Keine
- **Content**: JSON-Definition (Struct-Property)
- **Presentation**: Code-Block oder Schema-Diagram

## 4. Layout-Engine Anforderungen

**4.1 Multi-Algorithmus-Unterstützung**
- **Adaptive Layout Selection** - Automatische Wahl basierend auf Graph-Eigenschaften
- **Hierarchisch**: Reingold-Tilford, Sugiyama für verschiedene Strukturen
- **Netzwerk**: Force-Directed (Exploration), Orthogonal (technische Präzision)
- **Hybrid-Modi**: Hierarchie + Netzwerk kombiniert (z.B. Hierarchie-Backbone mit Querverbindungen)

**4.2 Incremental Layout**
- **Lokale Updates** - Nur betroffene Bereiche neu berechnen bei Expand/Collapse
- **Animation** - Smooth Transitions zwischen Layout-Zuständen
- **Layout Caching** - Gespeicherte Positionen für Collapsed Subtrees

**4.3 Constraint-Solver Integration**
- **Soft Constraints** - Ästhetische Präferenzen (symmetry, alignment)
- **Hard Constraints** - Zwingende Bedingungen (port locations, boundaries)
- **Optimization Goals** - Multi-Objective: Kreuzungen, Kantenlänge, Kompaktheit, Lesbarkeit

## 5. Technische Implementierungs-Empfehlungen

**5.1 Graph-Modell**
- **Compound Graph** - Native Unterstützung für Nested Nodes
- **Port Graph** - Explizite Port-Definitionen statt Node-to-Node Edges
- **Attributed Graph** - Meta-Daten für Layout-Hints, Presentation-Rules

**5.2 Geeignete Frameworks**
- **yFiles** (kommerziell) - Vollständige Unterstützung für Compound Graphs, Ports, Incremental Layout
- **ELK.js** - Open Source, hierarchisches Layout mit Ports
- **Cytoscape.js + Extensions** - Compound Nodes Extension, Custom Layout Adapter
- **Eigene Implementierung** - Basierend auf Reingold-Tilford + Sugiyama + Constraint-Solver

**5.3 Datenformat**

**Format E (Transport/LLM-Serialisierung):**
```
## View-Context
Type: FunctionalFlow
Filter: UC,FUNC,ACTOR nodes | compose,io edges

## Nodes
CargoManagement|SYS|CargoManagement.SY.001
ManageFleet|UC|ManageFleet.UC.001
OptimizeRoutes|FUNC|OptimizeRoutes.FN.001 [x:300,y:200,zoom:L2]
RouteData|FLOW|RouteData.FL.001
Driver|ACTOR|Driver.AC.001

## Edges
CargoManagement.SY.001 -cp-> ManageFleet.UC.001
ManageFleet.UC.001 -cp-> OptimizeRoutes.FN.001
OptimizeRoutes.FN.001 -io-> RouteData.FL.001
RouteData.FL.001 -io-> NextFunction.FN.002
```

**Vorteile:**
- 74% Token-Reduktion vs. JSON
- Semantic IDs lesbar
- Optional Layout-State als Attribute
- View-Context für Filter-Rekonstruktion

**JSON (Backend/Frontend-intern):**
```json
{
  "nodes": [
    {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "type": "UC",
      "Name": "ManageFleet",
      "Descr": "Manage fleet operations",
      "semanticId": "ManageFleet.UC.001",
      "presentation": {
        "x": 200,
        "y": 150,
        "collapsed": false,
        "zoom": "L2"
      }
    },
    {
      "uuid": "6fa459ea-ee8a-3ca4-894e-db77e160355e",
      "type": "FUNC",
      "Name": "OptimizeRoutes",
      "Descr": "Calculate optimal routes",
      "semanticId": "OptimizeRoutes.FN.001",
      "presentation": {
        "x": 400,
        "y": 200,
        "collapsed": false,
        "zoom": "L2"
      }
    },
    {
      "uuid": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "type": "FLOW",
      "Name": "RouteData",
      "Descr": "Route calculation results",
      "Type": "async",
      "Pattern": "publish-subscribe",
      "semanticId": "RouteData.FL.001"
    }
  ],
  "relationships": [
    {
      "uuid": "rel-001",
      "type": "compose",
      "source": "ManageFleet.UC.001",
      "target": "OptimizeRoutes.FN.001"
    },
    {
      "uuid": "rel-002",
      "type": "io",
      "source": "OptimizeRoutes.FN.001",
      "target": "RouteData.FL.001"
    }
  ],
  "view": {
    "type": "FunctionalFlow",
    "layoutConfig": {
      "includeNodeTypes": ["UC", "FUNC", "ACTOR"],
      "includeRelTypes": ["compose", "io"],
      "algorithm": "orthogonal",
      "containerNodes": ["UC", "FCHAIN"]
    },
    "renderConfig": {
      "showNodes": ["UC", "FUNC", "ACTOR"],
      "showEdges": ["io"],
      "hideEdges": ["compose"],
      "portRendering": "fromFlowNodes"
    }
  }
}
```

**Port-Extraktion Beispiel:**
```javascript
// Backend extrahiert Ports vor Rendering
const func = graph.getNode("OptimizeRoutes.FN.001");

const inputPorts = graph.getEdges()
  .filter(e => e.type === 'io' && e.target === func.uuid)
  .map(e => {
    const flowNode = graph.getNode(e.source);
    return {
      id: flowNode.semanticId,
      label: flowNode.Name,
      type: flowNode.Type,      // sync/async/stream
      position: 'left'
    };
  });

const outputPorts = graph.getEdges()
  .filter(e => e.type === 'io' && e.source === func.uuid)
  .map(e => {
    const flowNode = graph.getNode(e.target);
    return {
      id: flowNode.semanticId,
      label: flowNode.Name,
      type: flowNode.Type,
      position: 'right'
    };
  });

// Rendering: FLOW-Nodes nicht als separate Symbole,
// sondern als Ports am FUNC-Block
```

**Format E Diff (Incremental Update):**
```
<operations>
<base_snapshot>ManageFleet.UC.001@v42</base_snapshot>
<view_context>FunctionalFlow</view_context>

## Nodes
+ ValidateOrder|FUNC|ValidateOrder.FN.001|Validates customer order data [x:250,y:200]
+ PaymentData|FLOW|PaymentData.FL.005|Payment information structure
- OptimizeRoutes.FN.001|Calculate optimal routes
+ OptimizeRoutes.FN.001|Enhanced route optimization with real-time traffic [x:300,y:200]

## Edges
+ ManageFleet.UC.001 -cp-> ValidateOrder.FN.001
+ ValidateOrder.FN.001 -io-> PaymentData.FL.005
+ PaymentData.FL.005 -io-> ProcessPayment.FN.002
</operations>
```

**JSON Diff (Alternative für komplexe Updates):**
```json
{
  "operation": "diff",
  "baseSnapshot": "ManageFleet.UC.001@v42",
  "viewContext": "FunctionalFlow",
  "changes": {
    "addedNodes": [
      {
        "uuid": "new-func-001",
        "type": "FUNC",
        "Name": "ValidateOrder",
        "semanticId": "ValidateOrder.FN.001",
        "presentation": {"x": 250, "y": 200}
      }
    ],
    "removedNodes": [
      "ObsoleteFunc.FN.003",
      {
        "semanticId": "OptimizeRoutes.FN.001",
        "oldVersion": true,
        "Descr": "Calculate optimal routes"
      }
    ],
    "addedEdges": [
      {
        "type": "compose",
        "source": "ManageFleet.UC.001",
        "target": "ValidateOrder.FN.001"
      }
    ]
  }
}
```

## 6. Ergänzende Anforderungen

**6.1 Multi-View-Unterstützung**

**System Hierarchy View:**
- Layout-Nodes: SYS, UC, MOD
- Layout-Edges: compose
- Render-Edges: - (implizit durch Nested Boxes)
- Algorithmus: Reingold-Tilford (Tree Layout)
- Zweck: Systemstruktur & Dekomposition

**Functional Flow View:**
- Layout-Nodes: UC (Container), FCHAIN (Container), FUNC, ACTOR, FLOW (für Ports)
- Layout-Edges: compose (Containment), io (Flow)
- Render-Edges: io only (compose implizit durch Boxes)
- Algorithmus: Orthogonal Routing + Nested Containment
- Zweck: Funktionsnetzwerk mit Datenfluss

**Requirements Traceability View:**
- Layout-Nodes: SYS, UC, FUNC, REQ, TEST
- Layout-Edges: satisfy, verify
- Render-Edges: satisfy, verify (beide explizit)
- Algorithmus: Sugiyama (Layered, DAG)
- Zweck: Requirements-Verfolgung durch Hierarchie

**Allocation View (Physical):**
- Layout-Nodes: MOD (Container), FUNC
- Layout-Edges: compose (MOD-Hierarchie), allocate (FUNC→MOD)
- Render-Edges: allocate (explizit), compose (implizit)
- Algorithmus: Nested Boxes + Tree
- Zweck: HW/SW-Zuordnung

**Use Case Scenario View:**
- Layout-Nodes: UC (Container), ACTOR, FCHAIN
- Layout-Edges: compose
- Render-Edges: Actor-Assoziationen (spezielle Darstellung)
- Algorithmus: UC-zentriertes Radial Layout
- Zweck: Use Case Diagramm (UML-konform)

**6.2 Filtering & Querying**
- **Type-based Filtering** - Nur bestimmte Node-Typen anzeigen (z.B. nur FUNC+REQ)
- **Traceability Highlighting** - Pfade zwischen Requirements und Implementation visualisieren
- **Dependency Analysis** - Upstream/Downstream Dependencies via io-Chains
- **Rule-based Validation** - Ontologie-Rules während Layout prüfen:
  - function_io: FUNC muss Input- und Output-Ports haben
  - fchain_connectivity: Alle Elemente in FCHAIN via io verbunden
  - functional_flow: Actor→FLOW→FUNC→...→FLOW→Actor Kette
  - leaf_usecase_actor: Leaf-UC muss mindestens einen ACTOR haben

**6.3 Export & Integration**
- **SysML 2.0 Compliance** - Kompatibilität mit SysML 2.0 Metamodell
- **Tool-Integration** - Import/Export zu Cameo, Enterprise Architect, Capella
- **Report Generation** - Automatische Dokumentation aus Graph-Struktur

---

## 7. Erforderliche Spezifikationsdokumente für Implementierung

Für die Implementierung des Graph-Layout-Systems sind folgende formale Spezifikationen erforderlich:

### 7.1 Basis-Ontologie (Schema-Definition)
**Dokument:** `ontology_schema.json`
**Status:** ✅ Existiert (Version 3.0.0)
**Inhalt:**
- Node-Typen (SYS, UC, FUNC, FLOW, REQ, TEST, MOD, ACTOR, FCHAIN, SCHEMA)
- Relationship-Typen (compose, io, satisfy, verify, allocate, relation)
- Required/Optional Properties pro Node-Typ
- Validierungs-Regeln (naming, isolation, function_io, etc.)
- Valid Connections Matrix

### 7.2 Rendering-Ontologie (Meta-Elemente)
**Dokument:** `rendering_ontology.json`
**Status:** ❌ Zu erstellen
**Inhalt:**
- Symbol-Definitionen pro Node-Typ (rectangle, ellipse, icon, etc.)
- Stereotyp-Darstellung (UML/SysML-konform)
- Port-Extraktion-Regeln (fromFlowNodes, explicit, etc.)
- Zoom-Level-Konfiguration (L0-L4) pro Typ
- Container-Fähigkeiten (canContain, isContainer)
- Styling-Defaults (colors, strokes, fonts)
- Content-Rendering (welche Properties/Relations anzeigen)

**Beispiel-Struktur:**
```json
{
  "nodeTypes": {
    "FUNC": {
      "symbol": "rectangle",
      "stereotype": "«function»",
      "portExtraction": "fromFlowNodes",
      "zoomLevels": {...},
      "canContain": ["FUNC"],
      "styling": {...}
    }
  }
}
```

### 7.3 Format E Spezifikation
**Dokument:** `format_e_spec.md`
**Status:** ❌ Zu erstellen (siehe graphengineeringdef.md)
**Inhalt:**
- Syntax-Definition (EBNF-Grammar)
- Serialisierungs-Regeln (Full Graph)
- Diff-Format Spezifikation (Incremental Updates)
- Parsing-Algorithmus (pseudocode)
- Token-Counting Methodik
- View-Context Integration
- Beispiele (valide/invalide Syntax)

### 7.4 View-Definitionen (JSON-Schema)
**Dokumente:** `views/*.json` (ein File pro View)
**Status:** ❌ Zu erstellen (siehe graphengineeringdef.md)
**Erforderliche Views:**
- `functional-flow.json` - Funktionsnetzwerk
- `hierarchy.json` - System-Hierarchie
- `requirements.json` - Traceability
- `allocation.json` - HW/SW-Zuordnung
- `use-case-diagram.json` - UML Use Case View

**Schema-Struktur:**
```json
{
  "id": "view-id",
  "name": "Display Name",
  "layoutConfig": {
    "includeNodeTypes": [],
    "includeRelTypes": [],
    "algorithm": "algorithmus-name",
    "parameters": {}
  },
  "renderConfig": {
    "showNodes": [],
    "hideNodes": [],
    "showEdges": [],
    "hideEdges": [],
    "portRendering": "mode"
  }
}
```

### 7.5 Layout-Algorithmen Spezifikation
**Dokument:** `layout_algorithms.md`
**Status:** ❌ Zu erstellen (siehe graphengineeringdef.md)
**Inhalt:**
- Algorithmus-Beschreibungen (Reingold-Tilford, Sugiyama, Orthogonal, etc.)
- Input/Output-Spezifikation
- Parameter-Definitionen mit Defaults
- Constraint-Handling
- Performance-Charakteristiken
- Anwendungsbereich pro Algorithmus

**Erforderliche Algorithmen:**
- `reingold-tilford` - Tree Layout für Hierarchien
- `sugiyama` - Layered Layout für DAGs
- `orthogonal` - Manhattan-Routing für Funktionsnetzwerke
- `nested-containment` - Treemap/Nested Boxes
- `radial` - UC-zentrierte Darstellung

### 7.6 Implementierungs-Leitfaden (Optional)
**Dokument:** `implementation_guide.md`
**Status:** ❌ Optional zu erstellen
**Inhalt:**
- Technologie-Stack Empfehlungen
- Framework-Mapping (ELK.js, Cytoscape.js, yFiles)
- API-Design (REST, GraphQL)
- Backend-Integration (Neo4j ↔ Layout Engine)
- Frontend-Integration (React, Canvas/SVG)
- Test-Strategie
- Performance-Optimierungen

### 7.7 Dokumenten-Abhängigkeiten

```
ontology_schema.json (Basis)
         ↓
         ├─→ rendering_ontology.json (verwendet Node-Typen)
         ├─→ format_e_spec.md (serialisiert Ontologie)
         └─→ views/*.json (filtern Node/Edge-Typen)
                 ↓
         layout_algorithms.md (nutzt View-Config)
                 ↓
         implementation_guide.md (integriert alles)
```

### 7.8 Dokumentations-Struktur

```
specs/
├── ontology_schema.json              # ✅ Existiert
├── rendering_ontology.json           # ❌ Neu
├── format_e_spec.md                  # ❌ Neu
├── layout_algorithms.md              # ❌ Neu
├── implementation_guide.md           # ❌ Optional
├── views/
│   ├── functional-flow.json          # ❌ Neu
│   ├── hierarchy.json                # ❌ Neu
│   ├── requirements.json             # ❌ Neu
│   ├── allocation.json               # ❌ Neu
│   └── use-case-diagram.json         # ❌ Neu
└── examples/
    ├── format_e_examples.md          # Valide/Invalide Beispiele
    └── view_examples/                # Screenshots/Mockups
```

**Referenz für Definitionen:** Siehe `graphengineeringdef.md` für konkrete Beispiele und Formate.

---

## Anhang: Algorithmen-Referenzen

### Hierarchische Layouts
- **Reingold-Tilford (1981)**: "Tidier Drawings of Trees", IEEE Trans. Software Eng.
- **Walker (1990)**: Generalisierung für m-äre Bäume
- **Buchheim et al. (2002)**: Lineare-Zeit-Optimierung
- **Sugiyama et al.**: Layer-basiertes Layout für DAGs

### Netzwerk-Layouts
- **Fruchterman-Reingold (1991)**: Force-directed Layout
- **Kamada-Kawai (1989)**: Spring Embedder mit idealen Distanzen
- **Davidson-Harel (1997)**: Crossing Minimization via Simulated Annealing
- **Orthogonal Layout**: Grid-basiert mit Manhattan-Routing

### Implementierungen
- **yFiles**: Kommerzielle Suite mit allen Algorithmen
- **ELK (Eclipse Layout Kernel)**: Open Source, Java + JavaScript Port
- **Cytoscape.js**: Open Source, fokussiert auf biologische Netzwerke
- **D3.js**: Flexible Visualisierungs-Bibliothek mit Force-Layout
- **Dagre**: Leichtgewichtig für gerichtete Graphen
