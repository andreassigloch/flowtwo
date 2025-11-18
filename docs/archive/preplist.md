# Test-Preparation Checklist

**Version:** 1.0  
**Datum:** 2025-11-14  
**Zweck:** Vollständige Liste aller Test-Artefakte vor Code-Implementierung

---

## 1. Test-Daten (Graph-Fixtures)

### 1.1 Minimal-Graphen ✅ Kritisch

**Verzeichnis:** `test-fixtures/minimal-graphs/`

- [ ] `minimal-hierarchy.json` - SYS → UC → MOD (3 Nodes, 2 compose)
- [ ] `minimal-functional-flow.json` - UC → FCHAIN → FUNC + FLOW (5 Nodes, io-Kette)
- [ ] `minimal-requirements.json` - REQ → FUNC → TEST (3 Nodes, satisfy + verify)
- [ ] `minimal-allocation.json` - MOD → FUNC (2 Nodes, 1 allocate)
- [ ] `minimal-usecase.json` - UC + 2 ACTOR (3 Nodes, 2 compose)

**Pro Datei:**
- Nodes: 2-5 Stück, minimal für View-Typ
- Relationships: Nur essenzielle Edges
- Semantic IDs: Korrekt formatiert
- Valide gegen ontology_schema.json

### 1.2 Edge-Case Graphen ✅ Kritisch

**Verzeichnis:** `test-fixtures/edge-cases/`

- [ ] `empty-graph.json` - 0 Nodes (sollte Error oder leeren Output)
- [ ] `single-node.json` - 1 isolierter Node
- [ ] `circular-compose.json` - Zyklus in compose (sollte Error)
- [ ] `missing-ports.json` - FUNC ohne Input/Output (Rule-Violation)
- [ ] `invalid-connection.json` - UC -io-> REQ (ungültige Verbindung)
- [ ] `deep-nesting.json` - 10 Ebenen Hierarchie (Performance-Test)
- [ ] `wide-tree.json` - 1 Root, 50 Children (Performance-Test)
- [ ] `duplicate-semantic-ids.json` - Gleiche Semantic ID 2x (sollte Error)

### 1.3 Format E Beispiele ⚠️ Wichtig

**Verzeichnis:** `test-fixtures/format-e/`

- [ ] `valid-basic.txt` - Korrektes Format E (3-5 Nodes)
- [ ] `valid-with-attributes.txt` - Mit [x:100,y:200,zoom:L2] Attributen
- [ ] `valid-diff.txt` - Diff-Format mit +/- Operations
- [ ] `invalid-syntax.txt` - Fehlerhafte Syntax (kein ## Header)
- [ ] `invalid-operator.txt` - Falscher Operator (-xy->)
- [ ] `invalid-semantic-id.txt` - Falsche ID (z.B. Test.FN.1 statt .001)

---

## 2. Expected Outputs (Golden Files)

### 2.1 Layout-Ergebnisse ✅ Kritisch

**Verzeichnis:** `test-fixtures/expected-layouts/`

- [ ] `minimal-hierarchy-layout.json` - Positions + Bounds für Reingold-Tilford
- [ ] `minimal-functional-flow-layout.json` - Positions + Bounds für Orthogonal
- [ ] `minimal-requirements-layout.json` - Positions + Bounds für Sugiyama
- [ ] `minimal-allocation-layout.json` - Positions + Bounds für Nested
- [ ] `minimal-usecase-layout.json` - Positions + Bounds für Radial

**Format pro Datei:**
```json
{
  "positions": {
    "NodeID": {"x": 100, "y": 200}
  },
  "bounds": {"width": 1000, "height": 500},
  "viewContext": "hierarchy",
  "algorithm": "reingold-tilford"
}
```

### 2.2 Port-Extraktion ✅ Kritisch

**Verzeichnis:** `test-fixtures/expected-ports/`

- [ ] `minimal-functional-flow-ports.json` - Erwartete Ports für alle FUNC-Nodes
- [ ] `dashboard-operation-ports.json` - Ports für DashboardOperation Beispiel

**Format:**
```json
{
  "FuncID": {
    "inputs": [{"id": "FlowID", "label": "Name", "type": "sync", "position": "left"}],
    "outputs": [{"id": "FlowID", "label": "Name", "type": "sync", "position": "right"}]
  }
}
```

### 2.3 View-Filter Ergebnisse ✅ Kritisch

**Verzeichnis:** `test-fixtures/expected-filtered/`

- [ ] `minimal-hierarchy-filtered.json` - Nur SYS/UC/MOD, nur compose
- [ ] `minimal-functional-flow-filtered.json` - Ohne FLOW-Nodes, mit Ports
- [ ] `minimal-requirements-filtered.json` - SYS/UC/FUNC/REQ/TEST, satisfy/verify
- [ ] `minimal-allocation-filtered.json` - MOD/FUNC, allocate
- [ ] `minimal-usecase-filtered.json` - UC/ACTOR, compose

**Format:**
```json
{
  "nodes": [...],
  "relationships": [...],
  "filterApplied": "hierarchy",
  "originalNodeCount": 10,
  "filteredNodeCount": 3
}
```

---

## 3. Validierungs-Schemas

### 3.1 JSON-Schemas ✅ Kritisch

**Verzeichnis:** `test-fixtures/schemas/`

- [ ] `graph-schema.json` - Validiert Graph-JSON (nodes + relationships)
- [ ] `view-config-schema.json` - Validiert View-Definition JSONs
- [ ] `layout-result-schema.json` - Validiert Layout-Output Struktur
- [ ] `rendering-ontology-schema.json` - Validiert rendering_ontology.json

**Basis:** JSON Schema Draft-07

### 3.2 Ontologie-Rules als Code ✅ Kritisch

**Datei:** `test-fixtures/validation-rules/ontology_rules.py`

- [ ] `function_io` - FUNC muss Input + Output haben
- [ ] `fchain_connectivity` - FCHAIN-Elemente via io verbunden
- [ ] `leaf_usecase_actor` - Leaf UC muss ACTOR haben
- [ ] `isolation` - Keine isolierten Nodes (außer SYS Root)
- [ ] `valid_connections` - Nur erlaubte Edge-Typen zwischen Node-Typen

**Format:** Executable Python mit Lambda-Checks

---

## 4. Test-Utilities

### 4.1 Graph-Generator ⚠️ Wichtig

**Datei:** `test-utils/graph_generator.py`

- [ ] `generate_test_graph()` - Funktion für synthetische Graphen
  - Parameter: node_types, edge_types, num_nodes, structure
  - Strukturen: linear, tree, dag, mesh
  - Ausgabe: Valides Graph-JSON

### 4.2 Assertion-Helpers ✅ Kritisch

**Datei:** `test-utils/assertions.py`

- [ ] `assert_valid_semantic_ids(graph)` - Regex-Check aller IDs
- [ ] `assert_no_isolated_nodes(graph)` - Isolation-Rule
- [ ] `assert_layout_bounds(layout, max_width, max_height)` - Position-Grenzen
- [ ] `assert_no_overlaps(layout, min_distance)` - Node-Überlappungen
- [ ] `assert_valid_ports(ports)` - Port-Struktur korrekt
- [ ] `assert_view_filter_complete(filtered)` - Alle Filter angewendet

### 4.3 Diff-Generator 🔵 Optional

**Datei:** `test-utils/diff_generator.py`

- [ ] `generate_diff(base_graph, operations)` - Erzeugt Diff-Struktur
- [ ] `serialize_to_format_e_diff(operations)` - Format E Diff-String

---

## 5. Integrations-Test Szenarien

### 5.1 End-to-End Tests ✅ Kritisch

**Verzeichnis:** `test-scenarios/e2e/`

- [ ] `scenario_hierarchy_view.py`
  - Load graph → Filter → Layout → Validate
  - Check root position, tree structure
  
- [ ] `scenario_functional_flow.py`
  - Load graph → Extract ports → Layout → Validate
  - Check port positions (left/right)
  - Check orthogonal routing

- [ ] `scenario_requirements_view.py` 🔵 Optional
  - Load graph → Filter → Layered layout → Validate
  - Check layer assignment

**Pro Szenario:**
- Setup: Load test data
- Execute: Filter → Port-Extract → Layout
- Assert: Structure, bounds, positions
- Teardown: Clean up

### 5.2 Performance Tests 🔵 Optional

**Datei:** `test-scenarios/performance/performance_tests.py`

- [ ] `test_large_graph_layout_performance()` - 1000 Nodes unter 5s
- [ ] `test_format_e_serialization_performance()` - 200 Nodes unter 10ms
- [ ] `test_port_extraction_performance()` - 100 FUNC-Nodes unter 1s
- [ ] `test_view_filter_performance()` - 500 Nodes unter 2s

---

## 6. Mock-Daten für Frontend

### 6.1 Rendering-Ontologie Samples ⚠️ Wichtig

**Verzeichnis:** `test-fixtures/rendering-samples/`

- [ ] `func-node-samples.json` - FUNC in allen Zoom-Levels (L0-L4)
- [ ] `uc-node-samples.json` - UC mit Ellipse + Container-Modus
- [ ] `actor-node-samples.json` - Stick-Figure Rendering
- [ ] `req-node-samples.json` - REQ mit Stereotype

**Format:**
```json
{
  "L0": {"svg": "...", "width": 24, "height": 24},
  "L1": {"svg": "...", "width": 80, "height": 40},
  "L2": {"svg": "...", "ports": [...]}
}
```

### 6.2 Layout-Snapshots 🔵 Optional

**Verzeichnis:** `test-fixtures/layout-snapshots/`

- [ ] `hierarchy-view-snapshot.png` - Visual Regression Reference
- [ ] `functional-flow-snapshot.png`
- [ ] `requirements-view-snapshot.png`

**Tool:** Playwright für Screenshot-Generation

---

## 7. Konfiguration & Dokumentation

### 7.1 Test-Config ✅ Kritisch

**Datei:** `pytest.ini`

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    --verbose
    --cov=src
    --cov-report=html
    --cov-report=term
    --cov-fail-under=80
```

**Datei:** `requirements-test.txt`

```
pytest==7.4.3
pytest-cov==4.1.0
pytest-watch==4.2.0
pytest-benchmark==4.0.0
pytest-xdist==3.5.0
jsonschema==4.20.0
hypothesis==6.92.1
rich==13.7.0
```

### 7.2 Lokale Test-Runner Scripts ⚠️ Wichtig

**Datei:** `scripts/run-tests.sh`

- [ ] Bash-Script für kompletten Test-Durchlauf
- [ ] Separates Script pro Test-Suite
- [ ] Coverage-Report lokal als HTML
- [ ] Performance-Benchmarks als JSON

**Datei:** `scripts/test-watch.sh`

- [ ] Watch-Mode für kontinuierliches Testing während Entwicklung
- [ ] Auto-Run bei File-Änderungen

**Beispiel-Implementierung:**

**scripts/run-tests.sh:**
```bash
#!/bin/bash
# Kompletter Test-Durchlauf für LLM-Agenten

echo "🧪 Running Full Test Suite..."

# Unit Tests
echo "📦 Unit Tests..."
pytest tests/unit -v --cov=src --cov-report=html --cov-report=term

# Integration Tests
echo "🔗 Integration Tests..."
pytest tests/integration -v

# E2E Tests
echo "🌐 E2E Tests..."
pytest tests/e2e -v

# Performance Tests
echo "⚡ Performance Tests..."
pytest tests/performance --benchmark-only --benchmark-json=benchmark-results.json

# Coverage Summary
echo "📊 Coverage Summary:"
coverage report --skip-covered

# Generate HTML Report
echo "📄 HTML Report: htmlcov/index.html"
```

**scripts/test-watch.sh:**
```bash
#!/bin/bash
# Watch-Mode für Development

echo "👀 Watching for changes..."
pytest-watch tests/ src/ --onpass="echo '✅ Tests passed'" --onfail="echo '❌ Tests failed'"
```

**scripts/test-specific.sh:**
```bash
#!/bin/bash
# Run specific test suite

case "$1" in
  unit)
    pytest tests/unit -v
    ;;
  integration)
    pytest tests/integration -v
    ;;
  e2e)
    pytest tests/e2e -v
    ;;
  performance)
    pytest tests/performance --benchmark-only
    ;;
  *)
    echo "Usage: ./test-specific.sh [unit|integration|e2e|performance]"
    ;;
esac
```

**scripts/validate-fixtures.sh:**
```bash
#!/bin/bash
# Validiere alle Test-Fixtures gegen Schemas

echo "🔍 Validating Test Fixtures..."

for file in test-fixtures/minimal-graphs/*.json; do
  echo "Checking $(basename $file)..."
  python -m jsonschema -i "$file" test-fixtures/schemas/graph-schema.json
done

echo "✅ All fixtures valid"
```

**Nach Erstellung:**
```bash
chmod +x scripts/*.sh
```

### 7.3 Test-Dokumentation ⚠️ Wichtig

**Datei:** `tests/README.md`

- [ ] Test-Struktur Übersicht
- [ ] How to run tests
- [ ] How to add new fixtures
- [ ] Coverage-Ziele

---

## Prioritäten-Übersicht

### ✅ Kritisch (P0) - Vor Code-Start

**Muss vorhanden sein:**

1. **5 Minimal-Graphen** (Abschnitt 1.1)
2. **5 Expected-Layout JSONs** (Abschnitt 2.1)
3. **2 Port-Extraktion Expected** (Abschnitt 2.2)
4. **5 View-Filter Expected** (Abschnitt 2.3)
5. **4 JSON-Schemas** (Abschnitt 3.1)
6. **Ontologie-Rules Code** (Abschnitt 3.2)
7. **6 Assertion-Helpers** (Abschnitt 4.2)
8. **2 E2E-Szenarien** (Abschnitt 5.1)
9. **Test-Config** (pytest.ini, requirements-test.txt)

**Geschätzter Aufwand:** 2 Tage

### ⚠️ Wichtig (P1) - Parallel zu Code

**Sollte vorhanden sein:**

10. **8 Edge-Case Graphen** (Abschnitt 1.2)
11. **6 Format E Beispiele** (Abschnitt 1.3)
12. **Graph-Generator** (Abschnitt 4.1)
13. **Rendering-Samples** (Abschnitt 6.1)
14. **Lokale Test-Runner Scripts** (Abschnitt 7.2)
15. **Test-Dokumentation** (Abschnitt 7.3)

**Geschätzter Aufwand:** 1 Tag

### 🔵 Optional (P2) - Post-MVP

**Nice-to-Have:**

16. **Diff-Generator** (Abschnitt 4.3)
17. **3. E2E-Szenario** (Requirements-View)
18. **Performance-Tests** (Abschnitt 5.2)
19. **Layout-Snapshots** (Abschnitt 6.2)

**Geschätzter Aufwand:** 1 Tag

---

## Checkliste: Vor Code-Start

### Phase 0: Test-Infrastruktur (2-3 Tage)

**Tag 1: Minimal-Daten**
- [ ] Erstelle 5 Minimal-Graphen (JSON)
- [ ] Erstelle 8 Edge-Case Graphen (JSON)
- [ ] Validiere alle Graphen gegen ontology_schema.json

**Tag 2: Expected Outputs**
- [ ] Berechne Expected Layouts (manuell oder via Tool)
- [ ] Erstelle Expected Port-Extractions (JSON)
- [ ] Erstelle Expected View-Filters (JSON)

**Tag 3: Validation & Utils**
- [ ] Schreibe 4 JSON-Schemas
- [ ] Implementiere ontology_rules.py
- [ ] Implementiere assertions.py
- [ ] Schreibe 2 E2E-Test-Skeletons (ohne Implementation)
- [ ] Setup pytest.ini + requirements-test.txt
- [ ] Erstelle Test-Runner Scripts (run-tests.sh, test-watch.sh, etc.)
- [ ] Teste alle Scripts lokal

### Phase 1: Code-Entwicklung (mit Tests)

**Backend:**
- [ ] TDD: Port-Extraction (Test → Code → Refactor)
- [ ] TDD: View-Filter (Test → Code → Refactor)
- [ ] TDD: Layout-Algorithm (Test → Code → Refactor)

**Frontend:**
- [ ] Component-Tests: Node-Renderer
- [ ] Component-Tests: Port-Renderer
- [ ] Integration-Tests: View-Selector

### Phase 2: Integration & Performance

- [ ] E2E-Tests ausführbar
- [ ] Performance-Benchmarks bei Bedarf
- [ ] Visual Regression Tests bei Bedarf

---

## Tools & Dependencies

### Python:
- `pytest` - Test-Framework
- `pytest-cov` - Coverage-Reports (HTML + Terminal)
- `pytest-benchmark` - Performance-Messung
- `pytest-watch` - Auto-Run bei Änderungen
- `jsonschema` - JSON-Validierung
- `hypothesis` - Property-based Testing (optional)

### Frontend:
- `jest` + `@testing-library/react` - Component-Tests
- `vitest` - Schnellere Alternative zu Jest
- `playwright` - E2E + Visual Regression (lokal)

### Lokale Tools:
- `watch` / `entr` - File-Watcher für Auto-Testing
- `jq` - JSON-Manipulation in Scripts
- `pygments` - Syntax-Highlighting für Test-Output
- `rich` (Python) - Schöne Terminal-Outputs

### LLM-Agenten Integration:
- **Claude Code**: Direkter Zugriff auf pytest via Terminal
- **Cursor**: Test-Runner in IDE integriert
- **Scripts**: Einfache Bash/Python-Scripts für Batch-Testing

---

## Erfolgs-Kriterien

**Test-Coverage:**
- Backend Core: ≥90%
- Frontend Components: ≥85%
- Utils: ≥95%

**Performance:**
- Layout 1000 Nodes: <5s
- Port-Extraction 100 FUNC: <1s
- Format E Serialization 200 Nodes: <10ms

**Quality:**
- 0 Failing Tests
- Alle Fixtures validieren gegen Schemas
- E2E-Tests für 2+ Views funktionsfähig

---

## Nächster Schritt

Nach Fertigstellung dieser Checkliste:

1. ✅ Alle P0-Items erstellt
2. ✅ Tests laufen (wenn auch leer/skipped)
3. ✅ pytest funktioniert
4. → **Start Code-Implementierung mit TDD**

**Hinweis:** Diese Liste ist lebendes Dokument - bei Bedarf ergänzen!

---

## LLM-Agenten Workflow

### Für Claude Code / Cursor / Ähnliche:

**Typischer TDD-Zyklus:**

1. **Agent liest Test:**
   ```bash
   cat tests/unit/test_port_extraction.py
   ```

2. **Agent führt Test aus (sollte fehlschlagen):**
   ```bash
   pytest tests/unit/test_port_extraction.py -v
   ```

3. **Agent implementiert Code:**
   ```python
   # src/port_extractor.py
   def extract_ports(graph, func_node_id):
       # Implementation...
   ```

4. **Agent führt Test erneut aus (sollte bestehen):**
   ```bash
   pytest tests/unit/test_port_extraction.py -v
   ```

5. **Agent prüft Coverage:**
   ```bash
   pytest tests/unit/test_port_extraction.py --cov=src.port_extractor --cov-report=term
   ```

6. **Agent refactored bei Bedarf**

**Batch-Testing für mehrere Module:**
```bash
# Agent startet Watch-Mode
./scripts/test-watch.sh

# Agent arbeitet an Code
# Tests laufen automatisch bei jeder Änderung
```

**Fixture-Validation vor Test-Run:**
```bash
# Agent validiert alle Fixtures
./scripts/validate-fixtures.sh
```

**Performance-Check:**
```bash
# Agent misst Performance nach Implementation
pytest tests/performance --benchmark-only --benchmark-json=benchmark.json
python -c "import json; print(json.load(open('benchmark.json'))['benchmarks'][0]['stats']['mean'])"
```

### Kommandos für schnelles Feedback:

```bash
# Nur fehlgeschlagene Tests
pytest --lf -v

# Nur Tests die match pattern
pytest -k "port_extraction" -v

# Mit detailliertem Output
pytest -vv --tb=short

# Stop bei erstem Fehler
pytest -x

# Parallel (schneller)
pytest -n auto
```

### LLM-Agent Best Practices:

1. **Immer Fixtures zuerst validieren**
2. **Red-Green-Refactor einhalten**
3. **Coverage > 80% anstreben**
4. **Performance-Tests bei großen Änderungen**
5. **HTML-Report für Detail-Analyse nutzen**
