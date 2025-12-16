# CR-060: /optimize auf VariantPool migrieren

**Type:** Refactoring
**Status:** Planned
**Priority:** LOW
**Created:** 2024-12-16

## Problem / Use Case

Der `/optimize` Befehl verwendet `violationGuidedSearch()` mit **eigener interner Variant-Struktur**, obwohl der `VariantPool` mit Memory-Tiers und Lifecycle-Management existiert.

### Aktueller Zustand (validation-commands.ts:275-340):

```typescript
// /optimize kopiert Graph MANUELL:
const currentState = ctx.graphCanvas.getState();
const arch = {
  nodes: Array.from(currentState.nodes.values()).map(n => ({...})),
  edges: Array.from(currentState.edges.values()).map(e => ({...})),
};

// violationGuidedSearch() hat EIGENE Variant-Logik:
// - Keine Memory-Tier-Management
// - Keine Komprimierung
// - Keine Vergleichsfunktionen
const result = violationGuidedSearch(arch, {...});
```

### Warum das suboptimal ist:

| Aspekt | Aktuelle Lösung | Mit VariantPool |
|--------|-----------------|-----------------|
| Memory Management | Keine Limits | HOT/WARM/COLD Tiers |
| Variant-Vergleich | Nicht möglich | `compareVariants()` |
| Lifecycle | Manual | Automatisch |
| Persistenz | Keine | Optional via Memory-Tiers |
| Integration | Isoliert | Einheitlich mit LLM-Flow |

## Requirements

### Functional
- FR-060.1: `/optimize` nutzt VariantPool.createVariant() statt manuelle Kopie
- FR-060.2: Jede Iteration erstellt neuen Variant via VariantPool
- FR-060.3: Best Variant wird via promoteVariant() übernommen
- FR-060.4: Memory-Tier-Management aktiv (max 3 HOT, dann WARM)

### Non-Functional
- NFR-060.1: Keine Performance-Regression
- NFR-060.2: Gleiche Optimierungsergebnisse (nur Infrastruktur-Wechsel)

## Architecture / Solution Approach

### Integration in violationGuidedSearch:

```typescript
// OPTION A: VariantPool als Parameter übergeben
export function violationGuidedSearch(
  initialArch: Architecture,
  config: SearchConfig,
  callbacks: SearchCallbacks,
  variantPool?: VariantPool  // NEU
): SearchResult {
  // Statt interne Kopie:
  const variantId = variantPool?.createVariant('optimizer', initialArch);

  // Bei jedem Mutations-Schritt:
  variantPool?.applyToVariant(variantId, mutationDiff);

  // Am Ende:
  if (bestVariant) {
    variantPool?.promoteVariant(bestVariantId);
  }
}
```

### ODER Integration in handleOptimizeCommand:

```typescript
// OPTION B: VariantPool auf Command-Ebene
export async function handleOptimizeCommand(args: string, ctx: CommandContext) {
  // Variant für Optimizer-Session erstellen
  const variantId = ctx.agentDB.createVariant(
    ctx.config.systemId,
    ctx.graphCanvas.getState()
  );

  // Search läuft auf Variant
  const result = violationGuidedSearch(
    ctx.agentDB.getVariant(variantId),
    { maxIterations }
  );

  // Best Result promoten
  if (result.improved) {
    ctx.agentDB.promoteVariant(variantId);
  } else {
    ctx.agentDB.discardVariant(variantId);
  }
}
```

**Empfehlung:** Option B ist einfacher zu implementieren und erfordert weniger Änderungen am Optimizer-Core.

## Implementation Plan

### Phase 1: VariantPool-Integration (1.5h)
- [ ] `handleOptimizeCommand`: Variant vor Search erstellen
- [ ] Search-Ergebnis auf Variant anwenden
- [ ] promoteVariant() bei Erfolg

### Phase 2: Memory-Tier-Nutzung (30min)
- [ ] Alte Variants automatisch zu WARM komprimieren
- [ ] Log Memory-Usage nach Optimization

### Phase 3: Cleanup (30min)
- [ ] Interne Kopierlogik in `violationGuidedSearch` optional machen
- [ ] Falls VariantPool übergeben: nutzen, sonst Fallback

### Phase 4: Testing (1h)
- [ ] Unit-Test: Variant wird erstellt und promotet
- [ ] E2E-Test: `/optimize` Ergebnis identisch vor/nach Migration
- [ ] Memory-Tier-Test: Alte Variants werden komprimiert

## Acceptance Criteria

- [ ] `/optimize` nutzt VariantPool statt eigener Kopie
- [ ] Memory-Usage wird geloggt
- [ ] Optimization-Ergebnisse identisch (gleiche Scores)
- [ ] Bestehende Tests grün

## Test-Szenario

```bash
# 1. Graph laden
/load fixtures/architecture.formatE

# 2. Optimize mit VariantPool
/optimize 30
# → Log: "🧪 Optimizer variant created: var-opt-001"
# → Log: "⚡ Iteration 30/30..."
# → Log: "✅ Best variant promoted (score: 0.85)"
# → Log: "📊 VariantPool: 1 HOT, 0 WARM, 0 COLD"

# 3. Nochmal optimieren
/optimize 30
# → Log: "📊 VariantPool: 1 HOT, 1 WARM, 0 COLD" (alter moved to WARM)
```

## Estimated Effort

**Total: 3-4 hours**

## Dependencies

- CR-059 (VariantPool für LLM) - Kann parallel implementiert werden
- VariantPool bereits vollständig implementiert

## Priority Note

**LOW Priority** weil:
- `/optimize` funktioniert aktuell korrekt
- Rein internes Refactoring ohne User-facing Änderung
- Wichtiger sind CR-057/058/059 für Self-Learning

Empfehlung: Nach CR-059 implementieren, da dann VariantPool bereits im LLM-Flow genutzt wird.

## References

- [variant-pool.ts](../../src/llm-engine/agentdb/variant-pool.ts)
- [validation-commands.ts:275](../../src/terminal-ui/commands/validation-commands.ts#L275) - Aktuelle /optimize Implementierung
- [violation-guided-search.ts](../../src/llm-engine/optimizer/violation-guided-search.ts) - Optimizer Core
