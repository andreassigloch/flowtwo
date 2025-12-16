# CR-057: ContextManager Integration (Token-Optimierung)

**Type:** Performance / Refactoring
**Status:** Planned
**Priority:** HIGH
**Created:** 2024-12-16

## Problem / Use Case

Der `ContextManager` wurde in CR-038 Phase 8 vollständig implementiert, wird aber **nicht genutzt**. Aktuell wird der komplette Graph im Prompt an die LLM gesendet:

```
session-manager.ts:545
  const canvasState = this.parser.serializeGraph(currentState);  // KOMPLETTER GRAPH!
```

### Auswirkungen:
- **Token-Verschwendung:** Bei 50 Nodes/Edges ~5000 tokens, davon ~80% ungenutzt
- **Skalierungsproblem:** Graph mit 500+ Nodes wird unpraktikabel teuer
- **Redundanz:** `graph_query` Tool existiert parallel für gezielte Abfragen

### Existierende aber ungenutzte Implementierung:
- `src/llm-engine/context-manager.ts` - vollständig implementiert
- `src/session-manager.ts:153` - instanziiert als `this.contextManager`
- `src/session-manager.ts:272` - Getter `getContextManager()` vorhanden

## Requirements

### Functional
- FR-057.1: Task-Klassifikation nutzen für intelligentes Slicing
- FR-057.2: Nur relevante Subgraph-Nachbarschaft (Grad 2) im Prompt
- FR-057.3: `graph_query` Tool für on-demand Erweiterung beibehalten
- FR-057.4: Fallback auf Full Graph wenn Slice zu klein (<3 Nodes)

### Non-Functional
- NFR-057.1: Token-Reduktion um 50-70% bei typischen Anfragen
- NFR-057.2: Keine Latenz-Erhöhung (Slicing < 30ms lokal)
- NFR-057.3: Rückwärtskompatibel (gleiches Verhalten bei kleinen Graphen)

## Architecture / Solution Approach

### Datenfluss VORHER:
```
User Message → serializeGraph(FULL) → buildSystemPrompt → LLM
                     ↓
              5000 tokens (80% ungenutzt)
```

### Datenfluss NACHHER:
```
User Message → ContextManager.getContextForTask() → Slice → LLM
                     ↓                                 ↓
              classifyTask()                    1500 tokens
              sliceByMentions()                 (relevante Nachbarschaft)
              expandByDepth(2)
```

### Änderungen:

**1. session-manager.ts (~Zeile 545):**
```typescript
// ALT:
const canvasState = this.parser.serializeGraph(currentState);

// NEU:
const slice = this.contextManager.getContextForTask(message, currentState);
const canvasState = slice.nodes.size >= 3
  ? this.contextManager.serialize(slice)
  : this.parser.serializeGraph(currentState);  // Fallback
```

**2. Prompt-Header erweitern:**
```typescript
// In buildCanvasStateSection()
"## Current Graph Context (${slice.nodes.size} of ${total} nodes relevant)"
"Use graph_query tool if you need nodes not shown here."
```

## Implementation Plan

### Phase 1: Integration (1-2h)
- [ ] `session-manager.ts`: ContextManager-Aufruf vor LLM-Request
- [ ] Serialize-Methode für Slice-to-FormatE

### Phase 2: Prompt-Anpassung (30min)
- [ ] `prompt-builder.ts`: Header mit Slice-Info
- [ ] Hinweis auf `graph_query` für fehlenden Kontext

### Phase 3: Testing (1h)
- [ ] Unit-Test: Slice-Größe bei verschiedenen Task-Typen
- [ ] E2E-Test: "Derive testcase from REQ" nutzt nur REQ-Nachbarschaft
- [ ] Token-Metrik vorher/nachher loggen

## Acceptance Criteria

- [ ] ContextManager.getContextForTask() wird bei jedem LLM-Request aufgerufen
- [ ] Token-Reduktion messbar (Log-Output)
- [ ] Keine funktionale Regression (bestehende E2E-Tests grün)
- [ ] graph_query Tool funktioniert weiterhin für Erweiterung

## Test-Szenario (in einem Chat testbar)

```bash
# 1. Graph mit 30+ Nodes laden
/load fixtures/medium-graph.formatE

# 2. Fokussierte Anfrage stellen
"Add a testcase for REQ.Safety.001"

# 3. Erwartung: Log zeigt
"📊 Context slice: 8 of 35 nodes (task: derive-testcase)"
"📊 Token estimate: ~800 (vs ~3500 full graph)"

# 4. Ergebnis validieren
# - Testcase korrekt erstellt
# - Nur relevante REQs im Kontext waren
```

## Estimated Effort

**Total: 3-4 hours**

## Dependencies

- ContextManager bereits implementiert (CR-038 Phase 8)
- Keine externen Dependencies

## References

- [context-manager.ts](../../src/llm-engine/context-manager.ts) - Bestehende Implementierung
- [CR-038 Phase 8](../archive/CR-038-clean-architecture-refactor.md) - Original-Design
