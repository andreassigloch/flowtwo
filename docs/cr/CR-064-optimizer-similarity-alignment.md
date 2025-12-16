# CR-064: Optimizer Similarity Alignment

**Type:** Bug Fix / Enhancement
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2025-12-16
**Author:** andreas@siglochconsulting

## Problem / Use Case

`/analyze` und `/optimize` verwenden **unterschiedliche Similarity-Berechnungen**:

| Command | Methode | Ergebnis |
|---------|---------|----------|
| `/analyze` | Embedding-basiert (SimilarityScorer) | 77% Ähnlichkeit |
| `/optimize` | Jaccard + Heuristiken | < 70% (unter Threshold) |

**Konsequenz:** `/analyze` zeigt Merge-Kandidaten, aber `/optimize` findet sie nicht und kann MERGE nicht anwenden.

**Beispiel aus Praxis:**
```
/analyze zeigt:
  🔍 DistributeToTeam ↔ DistributePRD (77% similar)

/optimize sagt:
  No changes from optimizer (already optimal)
```

## Root Cause

1. **`/analyze`** verwendet `SimilarityScorer` mit:
   - Embedding-Vektoren aus AgentDB
   - Cosine Similarity
   - Konfigurierbare Thresholds aus ontology-rules.json

2. **`/optimize`** verwendet `calculateFuncSimilarity()` mit:
   - Jaccard-Index auf Wort-Tokens (35%)
   - Action Verb Matching (25%)
   - Flow Structure Heuristik (25%)
   - REQ Overlap (10%)
   - Hierarchy Position (5%)

Diese Methoden liefern **unterschiedliche Scores** für dieselben Node-Paare.

## Requirements

### Functional Requirements
- FR-1: Optimizer soll dieselbe Similarity wie `/analyze` verwenden
- FR-2: Merge-Kandidaten aus `/analyze` müssen in `/optimize` als Violations erscheinen
- FR-3: Embedding-basierte Similarity für FUNC und SCHEMA

### Non-Functional Requirements
- NFR-1: Optimizer Performance < 5s für 100 Nodes
- NFR-2: Keine Regression bei bestehenden Optimizer-Funktionen

## Architecture / Solution Approach

### Option A: Optimizer erhält Violations von `/analyze`

```typescript
// validation-commands.ts
const analysisResult = await evaluator.evaluateAll();
const violations = mapAnalysisToOptimizerViolations(analysisResult);
const result = violationGuidedSearch(arch, config, callbacks, violations);
```

**Vorteile:**
- Einheitliche Violation-Quelle
- Kein doppelter Embedding-Call

**Nachteile:**
- Kopplung zwischen Commands
- Optimizer wird abhängig von Evaluator

### Option B: Optimizer nutzt SimilarityScorer direkt

```typescript
// violation-guided-search.ts
import { SimilarityScorer } from '../validation/similarity-scorer.js';

async function detectFuncSimilarityViolations(arch, agentDB): Promise<Violation[]> {
  const scorer = new SimilarityScorer(agentDB);
  const matches = await scorer.findAllSimilarityMatches(nodeData, 0.70);
  return matches.map(m => ({
    ruleId: m.score >= 0.85 ? 'func_near_duplicate' : 'func_merge_candidate',
    severity: m.score >= 0.85 ? 'hard' : 'soft',
    affectedNodes: [m.nodeA.id, m.nodeB.id],
    message: `${m.nodeA.label} / ${m.nodeB.label} (${(m.score * 100).toFixed(0)}% similar)`,
    suggestedOperator: 'MERGE'
  }));
}
```

**Vorteile:**
- Direkte Integration
- Konsistente Scores

**Nachteile:**
- Erfordert async Optimizer (aktuell sync)
- Doppelte Embedding-Calls wenn beides läuft

### Option C: Violations als Parameter (empfohlen)

```typescript
// handleOptimizeCommand
const analysisResult = await evaluator.evaluateAll();
const externalViolations = analysisResult.similarityMatches.map(m => ({
  ruleId: m.score >= 0.85 ? 'func_near_duplicate' : 'func_merge_candidate',
  // ...
}));

const result = violationGuidedSearch(arch, config, callbacks, externalViolations);
```

Im Optimizer:
```typescript
function violationGuidedSearch(
  initialArch: Architecture,
  config: SearchConfig,
  callbacks: SearchCallbacks,
  externalViolations?: Violation[]  // NEU
): SearchResult {
  // ...
  const violations = [
    ...detectViolations(state.currentBest.architecture),
    ...(externalViolations ?? [])
  ];
}
```

**Vorteile:**
- Minimale Code-Änderung
- Optimizer bleibt sync
- Klare Separation of Concerns

## Implementation Plan

### Phase 1: Parameter-Erweiterung (30min)
1. `violationGuidedSearch()` um `externalViolations?` Parameter erweitern
2. Violations mergen statt nur interne nutzen

### Phase 2: Integration in /optimize (30min)
1. `/optimize` führt erst `/analyze` (silent) aus
2. SimilarityMatches → Violations konvertieren
3. An Optimizer übergeben

### Phase 3: Test + Cleanup (30min)
1. Unit Test: MERGE wird bei 77% Similarity versucht
2. E2E Test: `/analyze` → `/optimize` Flow
3. Alte Jaccard-Similarity in Optimizer entfernen (optional)

## Files to Modify

| File | Changes |
|------|---------|
| `src/llm-engine/optimizer/violation-guided-search.ts` | Add `externalViolations` parameter |
| `src/terminal-ui/commands/validation-commands.ts` | Pass similarity violations to optimizer |

## Acceptance Criteria

- [ ] `/optimize` erkennt dieselben Merge-Kandidaten wie `/analyze`
- [ ] MERGE-Operator wird bei 77% Similarity versucht
- [ ] Score-Verbesserung nach MERGE messbar
- [ ] Bestehende Tests passieren

## Estimated Effort

**Total: 1.5h**

## References

- Related: CR-049 (Optimizer Realignment)
- `/analyze` Similarity: `src/llm-engine/validation/similarity-scorer.ts`
- `/optimize` Similarity: `src/llm-engine/optimizer/violation-guided-search.ts:275-333`
