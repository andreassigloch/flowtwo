# CR-059: VariantPool für komplexe LLM-Anfragen

**Type:** Feature
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2024-12-16

## Problem / Use Case

Der `VariantPool` wurde für isolierte Graph-Experimente implementiert, wird aber **nur konzeptionell** genutzt. Der `/optimize` Befehl verwendet eine eigene interne Variant-Struktur, nicht den VariantPool.

**Aktueller Zustand:**
- VariantPool: Vollständig implementiert mit Memory-Tiers (HOT/WARM/COLD)
- `/optimize`: Nutzt `violationGuidedSearch()` mit eigener Kopierlogik
- LLM-Anfragen: Operationen werden direkt auf Hauptgraph angewendet

**Risiko ohne VariantPool:**
- Komplexe LLM-Anfragen ("Leite alle Testfälle ab") können Graph beschädigen
- Kein Undo bei Validierungsfehlern
- Keine A/B-Testing Möglichkeit für verschiedene LLM-Antworten

### Existierende Implementierung:

| Methode | Datei | Status |
|---------|-------|--------|
| createVariant() | [variant-pool.ts:108](../../src/llm-engine/agentdb/variant-pool.ts#L108) | Implementiert, nie aufgerufen |
| applyToVariant() | variant-pool.ts:172 | Implementiert, nie aufgerufen |
| promoteVariant() | variant-pool.ts:214 | Implementiert, nie aufgerufen |
| compareVariants() | variant-pool.ts:261 | Implementiert, nie aufgerufen |
| Memory Tiers | variant-pool.ts:67-105 | HOT/WARM/COLD implementiert |

## Requirements

### Functional
- FR-059.1: Bei "komplexen" Anfragen: Variant erstellen statt Hauptgraph ändern
- FR-059.2: Validierung auf Variant durchführen
- FR-059.3: Bei Erfolg (Reward >= 0.7): Variant promoten
- FR-059.4: Bei Fehler: Variant verwerfen, Retry mit Feedback möglich
- FR-059.5: Optional: 2-3 Varianten parallel generieren, beste wählen

### Trigger-Kriterien für "komplexe Anfrage"
- Task enthält "alle", "derive", "generiere", "refactor"
- Erwartete Änderungen > 5 Nodes/Edges (heuristisch)
- Vorherige ähnliche Anfrage hatte Reward < 0.7

### Non-Functional
- NFR-059.1: Variant-Erstellung < 50ms (Copy-on-Write)
- NFR-059.2: Max 3 HOT Variants gleichzeitig
- NFR-059.3: Automatische Komprimierung zu WARM/COLD

## Architecture / Solution Approach

### Datenfluss mit VariantPool:

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
                                               + Retry mit Feedback
```

### Komplexitäts-Heuristik:

```typescript
function isComplexTask(message: string, graphSize: number): boolean {
  const complexKeywords = ['alle', 'all', 'derive', 'generier', 'refactor', 'reorganize'];
  const hasComplexKeyword = complexKeywords.some(k => message.toLowerCase().includes(k));

  const largeGraph = graphSize > 20;

  return hasComplexKeyword || largeGraph;
}
```

### Integration in session-manager.ts:

```typescript
// Vor LLM-Request
const useVariant = isComplexTask(message, currentState.nodes.size);
let variantId: string | null = null;

if (useVariant) {
  variantId = this.agentDB.createVariant(this.config.systemId, currentState);
  this.log(`🧪 Variant created for complex task: ${variantId}`);
}

// Nach LLM-Response, vor applyDiff
if (variantId && response.operations) {
  // Erst auf Variant anwenden
  const diff = this.parser.parseDiff(response.operations, ...);
  this.agentDB.applyToVariant(variantId, diff);

  // Validieren
  const variantState = this.agentDB.getVariant(variantId);
  const validationResult = this.evaluator.evaluate(variantState);

  if (validationResult.reward >= 0.7) {
    this.agentDB.promoteVariant(variantId);
    this.log(`✅ Variant promoted (reward: ${validationResult.reward})`);
  } else {
    this.agentDB.discardVariant(variantId);
    this.log(`⚠️ Variant discarded (reward: ${validationResult.reward})`);
    // Optional: Retry mit Feedback
  }
} else {
  // Direkt auf Hauptgraph (einfache Anfragen)
  await this.graphCanvas.applyDiff(diff);
}
```

## Implementation Plan

### Phase 1: Komplexitäts-Erkennung (30min)
- [ ] `isComplexTask()` Funktion implementieren
- [ ] Logging für Entscheidung

### Phase 2: Variant-Integration (2h)
- [ ] Variant erstellen bei komplexen Tasks
- [ ] Operations auf Variant anwenden statt Hauptgraph
- [ ] Validierung auf Variant durchführen

### Phase 3: Promotion/Discard (1h)
- [ ] Bei Erfolg: promoteVariant() + Hauptgraph aktualisieren
- [ ] Bei Fehler: discardVariant() + optional Retry-Flow

### Phase 4: Testing (1h)
- [ ] Unit-Test: isComplexTask() Heuristik
- [ ] Integration-Test: Variant-Lifecycle
- [ ] E2E-Test: "Derive all testcases" → Variant → Promote

## Acceptance Criteria

- [ ] Komplexe Tasks werden über Variant abgewickelt
- [ ] Log zeigt Variant-Lifecycle: create → apply → validate → promote/discard
- [ ] Fehlerhafte Operationen beschädigen Hauptgraph nicht
- [ ] `/status` zeigt aktive Variants

## Test-Szenario (in einem Chat testbar)

```bash
# 1. Graph mit Requirements laden
/load fixtures/requirements-graph.formatE

# 2. Komplexe Anfrage (triggert Variant)
"Derive testcases for all safety requirements"
# → Log: "🧪 Variant created: var-001"
# → Log: "📊 Validating variant..."
# → Log: "✅ Variant promoted (reward: 0.85)" ODER
# → Log: "⚠️ Variant discarded (reward: 0.45)"

# 3. Status prüfen
/status
# → "Variants: 1 active (HOT tier)"

# 4. Einfache Anfrage (kein Variant)
"Add a comment to SYS node"
# → Direkt auf Hauptgraph, kein Variant-Log

# 5. Vergleich bei Fehler
"Add invalid edge type XYZ"
# → Variant wird verworfen
# → Hauptgraph unverändert
```

## Estimated Effort

**Total: 4-5 hours**

## Dependencies

- VariantPool bereits implementiert
- UnifiedRuleEvaluator für Validierung
- CR-057 (ContextManager) optional aber empfohlen

## Relation zu /optimize

Der `/optimize` Befehl könnte zukünftig den VariantPool nutzen statt eigener Kopierlogik. Dies ist aber ein separater Refactoring-Schritt und nicht Teil dieses CRs.

## References

- [variant-pool.ts](../../src/llm-engine/agentdb/variant-pool.ts)
- [CR-038 Phase 6](../archive/CR-038-clean-architecture-refactor.md) - Original-Design
- [validation-commands.ts:275](../../src/terminal-ui/commands/validation-commands.ts#L275) - /optimize Implementation
