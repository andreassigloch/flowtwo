# CR-062: Selbstanpassende Regel-Schwellwerte (Level 7)

**Type:** Feature
**Status:** Planned
**Priority:** LOW
**Created:** 2024-12-16
**Maturity Level:** 7 - Lernende Systeme

## Problem / Use Case

Level 7 (Lernende Systeme) erfordert **selbstanpassende Regeln**. Aktuell:

- Alle Schwellwerte sind **statisch** in `ontology-rules.json`
- `successThreshold: 0.7` ändert sich nie
- `millers_law.min/max: [5, 9]` passt sich nicht an Graph-Kontext an
- Keine Analyse welche Regeln zu streng oder zu lasch sind

### Aktueller Zustand:

```json
"successThreshold": 0.7  // statisch für immer
"millers_law": { "min": 5, "max": 9 }  // nie angepasst
```

### Zielzustand:

```
System analysiert: "millers_law wurde 50x verletzt, davon 40x ignoriert"
→ Automatische Anpassung: millers_law.max = 11 (oder Warnung an Admin)
```

## Requirements

### Functional Requirements
- FR-062.1: Violation-Frequenz pro Regel tracken
- FR-062.2: "Ignored" vs "Fixed" Ratio berechnen
- FR-062.3: Bei hoher Ignore-Rate: Schwellwert anpassen oder Severity senken
- FR-062.4: Admin-Dashboard für Regel-Effektivität

### Non-Functional Requirements
- NFR-062.1: Anpassungen erst nach >100 Datenpunkten
- NFR-062.2: Max ±20% Änderung pro Anpassungszyklus
- NFR-062.3: Änderungen revertierbar (Audit-Trail)

## Architecture / Solution Approach

### Violation-Tracking erweitern

```typescript
interface RuleMetrics {
  ruleId: string;
  totalViolations: number;
  fixedCount: number;       // Violation verschwand nach LLM-Response
  ignoredCount: number;     // Violation blieb bestehen
  falsePositiveRate: number; // ignoredCount / totalViolations
  lastAdjustment: Date;
}
```

### Anpassungs-Algorithmus

```typescript
function shouldAdjustRule(metrics: RuleMetrics): Adjustment | null {
  if (metrics.totalViolations < 100) return null; // Zu wenig Daten

  const falsePositiveRate = metrics.ignoredCount / metrics.totalViolations;

  if (falsePositiveRate > 0.7) {
    // 70% werden ignoriert → Regel zu streng
    return {
      action: 'relax',
      suggestion: `Erhöhe Schwellwert um 10% oder senke Severity`
    };
  }

  if (falsePositiveRate < 0.1 && metrics.fixedCount < 10) {
    // Regel triggert nie und wird nie gefixt → möglicherweise obsolet
    return {
      action: 'review',
      suggestion: `Regel überprüfen: Nur ${metrics.totalViolations} Treffer`
    };
  }

  return null;
}
```

### Persistierung

- RuleMetrics in AgentDB speichern (neue Collection)
- Export für Cross-Session-Lernen
- Optional: Neo4j für langfristige Analyse

## Implementation Plan

### Phase 1: Metrics-Tracking (2h)
- [ ] RuleMetrics Datenstruktur
- [ ] Tracking bei jeder Validation
- [ ] "Fixed" Detection: Violation in t1 → nicht in t2

### Phase 2: Analyse-Dashboard (2h)
- [ ] `/rule-stats` Kommando
- [ ] Top-10 häufigste Violations
- [ ] False-Positive-Raten

### Phase 3: Auto-Adjustment (3h)
- [ ] Anpassungs-Algorithmus
- [ ] Änderungs-Vorschläge (nicht auto-apply!)
- [ ] Admin-Bestätigung für Änderungen

### Phase 4: Feedback-Loop (2h)
- [ ] Nach Anpassung: Beobachtungsperiode
- [ ] Revert wenn Qualität sinkt

## Acceptance Criteria

- [ ] Violation-Frequenz wird pro Regel getrackt
- [ ] `/rule-stats` zeigt Effektivitäts-Metriken
- [ ] System schlägt Anpassungen vor (keine Auto-Apply)
- [ ] Änderungen sind auditierbar

## Test-Szenario

```bash
# 1. 100+ Sessions mit Violations simulieren
# 2. Statistik abrufen
/rule-stats

# Erwartete Ausgabe:
Rule Effectiveness Report:
┌────────────────────┬──────────┬───────┬─────────┬────────────┐
│ Rule               │ Triggers │ Fixed │ Ignored │ FP-Rate    │
├────────────────────┼──────────┼───────┼─────────┼────────────┤
│ millers_law        │ 150      │ 12    │ 138     │ 92% ⚠️     │
│ io_bidirectional   │ 45       │ 43    │ 2       │ 4% ✅      │
│ func_merge_cand    │ 80       │ 5     │ 75      │ 94% ⚠️     │
└────────────────────┴──────────┴───────┴─────────┴────────────┘

Suggestions:
- millers_law: Consider raising max from 9 to 11
- func_merge_cand: Consider lowering severity to "info"
```

## Estimated Effort

**Total: 8-10 hours**

## Dependencies

- CR-058 (Self-Learning) muss aktiv sein
- Ausreichend Daten (>100 Violations pro Regel)

## Future Extensions

- Cross-Project-Learning (Regeln von anderen Projekten lernen)
- A/B-Testing für Regel-Varianten
- ML-basierte Threshold-Optimierung

## References

- [ontology-rules.json](../../settings/ontology-rules.json) - Aktuelle Regeln
- [unified-rule-evaluator.ts](../../src/llm-engine/validation/unified-rule-evaluator.ts)
