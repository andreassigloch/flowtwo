# CR-044: Optimize Workflow with Diff Preview and /restore Command

**Type:** Feature Enhancement
**Status:** Completed
**Priority:** HIGH
**Created:** 2025-01-11
**Completed:** 2025-12-11

## Problem / Use Case

Der `/optimize` Command berechnet Architektur-Verbesserungen, aber:
1. Zeigt keine Details der Änderungen (nur Score + Operator-Name)
2. Wendet die Änderungen nicht an
3. User hat keinen Weg, Änderungen zu verwerfen (`/restore` fehlt)

**Gewünschter Workflow:**
```
/load graph.json          → captureBaseline()
[user arbeitet]           → Diff sichtbar im Graph-Viewer (+/-/~)
/commit                   → Baseline neu setzen

/analyze                  → Read-only: Zeigt Violations im Chat
/optimize                 → Wendet an + zeigt GLEICHZEITIG:
                            - Chat: Erklärt Änderungen
                            - Graph-Viewer: Diff (+/-/~)
/commit                   → Änderungen behalten
/restore                  → Änderungen verwerfen (zurück zu Baseline)
```

## Requirements

### Functional Requirements

**FR-1: /restore Command**
- Rollback aller Änderungen seit letztem `/commit` oder `/load`
- Entspricht `git restore .` Semantik
- Lädt Baseline zurück in AgentDB
- Aktualisiert Graph-Viewer (Diff wird leer)

**FR-2: /optimize Output verbessern**
- Chat zeigt konkrete Änderungen:
  - Neue Nodes (z.B. "+MOD_HighVol")
  - Gelöschte Nodes
  - Verschobene Edges (z.B. "FUNC.A: MOD.Core → MOD_HighVol")
  - Neue Edges (z.B. "+io: FUNC.A → FUNC.B")
- Graph-Viewer zeigt Diff gleichzeitig (via notifyGraphUpdate)

**FR-3: /optimize wendet Änderungen an**
- `bestVariant.architecture` wird auf AgentDB übertragen
- ChangeTracker erkennt Diff zur Baseline
- User entscheidet danach: `/commit` oder `/restore`

**FR-4: /analyze bleibt read-only**
- Zeigt Violations und Suggestions
- Wendet nichts an
- Hinweis: "Use /optimize to apply fixes"

### Non-Functional Requirements

**NFR-1:** Keine neuen Dependencies
**NFR-2:** Konsistent mit Git-Terminologie (restore, commit, status)

## Architecture / Solution Approach

### 1. /restore Command (session-commands.ts)

```
handleRestoreCommand(ctx):
  1. Check hasBaseline() - sonst Warnung
  2. Lade Baseline-State zurück in AgentDB
  3. notifyGraphUpdate() - Graph-Viewer aktualisiert
  4. Chat: "Restored to last commit (X nodes, Y edges)"
```

**ChangeTracker Erweiterung:**
- Neue Methode: `getBaselineState(): { nodes, edges }` oder
- AgentDB: `restoreFromBaseline()`

### 2. /optimize Output (validation-commands.ts)

Nach `violationGuidedSearch()`:
```
1. Vergleiche bestVariant.architecture mit currentState
2. Berechne Diff:
   - addedNodes = nodes in bestVariant but not in current
   - deletedNodes = nodes in current but not in bestVariant
   - modifiedEdges = edges with changed source/target
3. Zeige im Chat:
   "Optimization applied:
    +2 nodes: MOD_HighVol, MOD_Core_B
    ~5 edges: FUNC allocations changed
    -0 nodes

    Use /commit to save, /restore to discard"
4. Übertrage bestVariant auf AgentDB
5. notifyGraphUpdate() - Diff erscheint im Graph-Viewer
```

### 3. Datenfluss

```
                    ┌─────────────────┐
                    │   ChangeTracker │
                    │   (Baseline)    │
                    └────────┬────────┘
                             │ captureBaseline()
                             │ restoreBaseline()
                             ▼
┌──────────┐  optimize  ┌─────────────┐  notify  ┌──────────────┐
│ Optimizer │ ────────► │   AgentDB   │ ───────► │ Graph-Viewer │
│ (Search)  │           │   (State)   │          │ (Diff +/-/~) │
└──────────┘            └─────────────┘          └──────────────┘
                             │
                             │ /commit: captureBaseline()
                             │ /restore: restoreBaseline()
                             ▼
                    ┌─────────────────┐
                    │     Neo4j       │
                    │  (Cold Storage) │
                    └─────────────────┘
```

## Implementation Plan

### Phase 1: /restore Command (2h)
- [x] ChangeTracker: `getBaselineState()` Methode
- [x] AgentDB: `restoreFromBaseline()` Methode
- [x] session-commands.ts: `handleRestoreCommand()`
- [x] chat-interface.ts: Route `/restore`
- [x] Unit Tests

### Phase 2: /optimize Änderungen anwenden (2h)
- [x] validation-commands.ts: Nach Search → AgentDB aktualisieren
- [x] Konvertierung: Optimizer `Architecture` → AgentDB `Node/Edge`
- [x] notifyGraphUpdate() aufrufen

### Phase 3: /optimize Chat-Output (2h)
- [x] Diff berechnen (vorher/nachher)
- [x] Formatierte Ausgabe im Chat
- [x] Hinweis auf /commit und /restore

### Phase 4: E2E Tests (1h)
- [x] Test: /optimize → Diff sichtbar → /restore → Diff leer
- [x] Test: /optimize → /commit → Baseline aktualisiert

## Acceptance Criteria

- [x] `/restore` setzt Graph auf Baseline zurück
- [x] `/optimize` wendet Änderungen an UND zeigt Details im Chat
- [x] Graph-Viewer zeigt Diff nach `/optimize`
- [x] `/commit` nach `/optimize` setzt neue Baseline
- [x] `/restore` nach `/optimize` verwirft Änderungen
- [x] Alle bestehenden Tests passieren
- [x] E2E Test TEST-E2E-OPT-1 passiert

## Requirements Traceability

| Requirement | Use Case | E2E Test |
|-------------|----------|----------|
| FR-1.5 `/restore` | UC-SESSION-1 | TEST-E2E-OPT-1 |
| FR-8.4 `/optimize` workflow | UC-OPT-1 | TEST-E2E-OPT-1 |

## Dependencies

- CR-033: Git-like Diff/Change Tracking (✅ done)
- CR-038: Clean Architecture (✅ done - AgentDB als Single Source of Truth)

## Estimated Effort

Total: 7-8 Stunden

## References

- [ChangeTracker](../../src/llm-engine/agentdb/change-tracker.ts)
- [validation-commands.ts](../../src/terminal-ui/commands/validation-commands.ts)
- [session-commands.ts](../../src/terminal-ui/commands/session-commands.ts)
- Git restore: `git restore .` - Discard all changes in working directory
