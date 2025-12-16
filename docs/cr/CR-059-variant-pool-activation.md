# CR-059: VariantPool Aktivierung (LLM + Optimizer)

**Type:** Feature / Refactoring
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2024-12-16
**Updated:** 2025-12-16
**Author:** andreas@siglochconsulting

## Problem / Use Case

Der `VariantPool` wurde in CR-038 Phase 6 vollständig implementiert, ist aber **DEAD CODE**:

| Methode | Status |
|---------|--------|
| `createVariant()` | Implementiert, nie aufgerufen |
| `applyToVariant()` | Implementiert, nie aufgerufen |
| `promoteVariant()` | Implementiert, nie aufgerufen |
| `compareVariants()` | Implementiert, nie aufgerufen |
| Memory Tiers (HOT/WARM/COLD) | Implementiert, nie genutzt |

### Aktueller Zustand:

1. **LLM-Chat:** Operationen werden direkt auf Hauptgraph angewendet
   - Risiko: Komplexe Anfragen können Graph beschädigen
   - Kein Undo bei Validierungsfehlern

2. **`/optimize`:** Eigene interne Kopierlogik statt VariantPool
   - Keine Memory-Tier-Nutzung
   - Keine Lifecycle-Verwaltung
   - Redundante Implementierung

## Requirements

### Functional (LLM-Chat)
- FR-1: Bei "komplexen" Anfragen: Variant erstellen statt Hauptgraph ändern
- FR-2: Validierung auf Variant durchführen
- FR-3: Bei Erfolg (Reward >= 0.7): Variant promoten
- FR-4: Bei Fehler: Variant verwerfen, Retry mit Feedback möglich

### Functional (/optimize)
- FR-5: `/optimize` nutzt VariantPool.createVariant() statt manuelle Kopie
- FR-6: Best Variant wird via promoteVariant() übernommen
- FR-7: Memory-Tier-Management aktiv (max 3 HOT, dann WARM)

### Trigger-Kriterien für "komplexe Anfrage"
- Task enthält "alle", "all", "derive", "generier", "refactor", "reorganize"
- Graph-Größe > 20 Nodes
- Vorherige ähnliche Anfrage hatte Reward < 0.7

### Non-Functional
- NFR-1: Variant-Erstellung < 50ms (Copy-on-Write)
- NFR-2: Max 3 HOT Variants gleichzeitig
- NFR-3: Keine Performance-Regression bei /optimize

## Architecture / Solution Approach

### Part A: LLM-Chat Integration (session-manager.ts)

```
User Message → isComplexTask() → YES → createVariant()
                   ↓                        ↓
                   NO                   LLM → Operations
                   ↓                        ↓
              Direkt auf               applyToVariant()
              Hauptgraph                    ↓
                                      validateVariant()
                                            ↓
                                    Reward >= 0.7?
                                      ↓         ↓
                                    YES        NO
                                      ↓         ↓
                              promoteVariant() discardVariant()
```

### Part B: /optimize Integration (validation-commands.ts)

```
/optimize → createVariant() → violationGuidedSearch(variant)
                                       ↓
                               Best result found?
                                 ↓         ↓
                               YES        NO
                                 ↓         ↓
                         promoteVariant() discardVariant()
```

## Implementation Plan

### Phase 1: Komplexitäts-Erkennung (30min)
- [ ] `isComplexTask()` Funktion in session-manager.ts
- [ ] Logging für Entscheidung

### Phase 2: LLM-Chat Variant-Integration (2h)
- [ ] Variant erstellen bei komplexen Tasks
- [ ] Operations auf Variant anwenden statt Hauptgraph
- [ ] Validierung auf Variant durchführen
- [ ] promoteVariant() bei Erfolg, discardVariant() bei Fehler

### Phase 3: /optimize Migration (1.5h)
- [ ] `handleOptimizeCommand`: Variant vor Search erstellen
- [ ] Search-Ergebnis auf Variant anwenden
- [ ] promoteVariant() bei Erfolg

### Phase 4: Memory-Tier-Nutzung (30min)
- [ ] Alte Variants automatisch zu WARM komprimieren
- [ ] Log Memory-Usage nach Optimization
- [ ] `/status` zeigt aktive Variants

### Phase 5: Testing (1.5h)
- [ ] Unit-Test: isComplexTask() Heuristik
- [ ] Unit-Test: Variant wird erstellt und promotet
- [ ] Integration-Test: Variant-Lifecycle
- [ ] E2E-Test: "Derive all testcases" → Variant → Promote
- [ ] E2E-Test: `/optimize` Ergebnis identisch vor/nach Migration

## Acceptance Criteria

- [ ] Komplexe LLM-Tasks werden über Variant abgewickelt
- [ ] `/optimize` nutzt VariantPool statt eigener Kopie
- [ ] Log zeigt Variant-Lifecycle: create → apply → validate → promote/discard
- [ ] Fehlerhafte Operationen beschädigen Hauptgraph nicht
- [ ] `/status` zeigt aktive Variants
- [ ] Memory-Tier-Management funktioniert

## Test-Szenario

```bash
# 1. Graph mit Requirements laden
/load fixtures/requirements-graph.formatE

# 2. Komplexe Anfrage (triggert Variant)
"Derive testcases for all safety requirements"
# → Log: "🧪 Variant created: var-001"
# → Log: "📊 Validating variant..."
# → Log: "✅ Variant promoted (reward: 0.85)"

# 3. Einfache Anfrage (kein Variant)
"Add a comment to SYS node"
# → Direkt auf Hauptgraph, kein Variant-Log

# 4. Optimize mit VariantPool
/optimize 30
# → Log: "🧪 Optimizer variant created: var-opt-001"
# → Log: "✅ Best variant promoted (score: 0.85)"
# → Log: "📊 VariantPool: 1 HOT, 1 WARM, 0 COLD"

# 5. Status prüfen
/status
# → "Variants: 2 active (1 HOT, 1 WARM)"
```

## Estimated Effort

**Total: 6-7 hours**

- Part A (LLM-Chat): 3-4h
- Part B (/optimize): 2-3h
- Testing: 1.5h (shared)

## Dependencies

- VariantPool bereits vollständig implementiert
- UnifiedRuleEvaluator für Validierung
- CR-057 (ContextManager) optional aber empfohlen

## Files to Modify

| File | Changes |
|------|---------|
| `src/session-manager.ts` | isComplexTask(), Variant-Integration |
| `src/terminal-ui/commands/validation-commands.ts` | /optimize VariantPool-Migration |
| `src/terminal-ui/commands/session-commands.ts` | /status Variant-Anzeige |

## References

- [variant-pool.ts](../../src/llm-engine/agentdb/variant-pool.ts)
- [CR-038 Phase 6](../archive/CR-038-clean-architecture-refactor.md) - Original-Design
- [validation-commands.ts:275](../../src/terminal-ui/commands/validation-commands.ts#L275) - /optimize Implementation

## Merged From

- CR-059 (original): VariantPool für komplexe LLM-Anfragen
- CR-060: /optimize auf VariantPool migrieren
