# CR-061: Proaktive Risiko-Warnungen (Level 6)

**Type:** Feature
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2024-12-16
**Maturity Level:** 6 - Vorhersagen

## Problem / Use Case

Level 6 (Vorhersagen) erfordert **proaktive Warnungen und Risiko-Prognosen**. Aktuell:

- Background-Validator **loggt** Violations, aber **warnt LLM nicht** vor nächster Anfrage
- Keine Consequence-Chain-Analyse ("wenn X bricht, dann auch Y")
- Keine Schwellwert-basierte Früherkennung

### Aktueller Zustand:

```
User → LLM → Operation → Validation → "5 Violations!" (zu spät!)
```

### Zielzustand:

```
User → [Proaktive Warnung: "3 kritische Risiken erkannt"] → LLM → bessere Operation
```

## Requirements

### Functional Requirements
- FR-061.1: Vor LLM-Request prüfen ob kritische Risiken im Graph bestehen
- FR-061.2: Bei Reward < 0.5 automatisch Warnung in Prompt injizieren
- FR-061.3: Consequence-Chain-Analyse für io-Kanten (Kaskadenfehler)
- FR-061.4: Merge-Candidates dem LLM als Vorschläge zeigen

### Non-Functional Requirements
- NFR-061.1: Proaktive Prüfung < 50ms (nutzt gecachte Validation)
- NFR-061.2: Max 200 zusätzliche Tokens für Warnungen

## Architecture / Solution Approach

### Proaktive Warnung vor LLM-Request

```typescript
// In session-manager.ts vor LLM-Call
const currentValidation = this.agentDB.getCachedValidation();

if (currentValidation?.rewardScore < 0.5) {
  const topViolations = currentValidation.violations
    .filter(v => v.severity === 'error')
    .slice(0, 3);

  systemPrompt += '\n⚠️ CRITICAL RISKS IN CURRENT GRAPH:\n';
  for (const v of topViolations) {
    systemPrompt += `- ${v.rule}: ${v.message}\n`;
    systemPrompt += `  Suggestion: ${v.suggestion}\n`;
  }
}
```

### Consequence-Chain-Analyse

Wenn io_circular_chain erkannt:
- Alle betroffenen FLOWs identifizieren
- Nachbar-FUNCs als "Risiko-behaftet" markieren
- LLM informieren: "Diese 5 Nodes sind Teil einer fehlerhaften Kette"

### Merge-Candidates als Vorschläge

```typescript
// Nach Similarity-Analyse
const mergeCandidates = validationResult.violations
  .filter(v => v.rule === 'func_merge_candidate');

if (mergeCandidates.length > 0) {
  systemPrompt += '\n💡 OPTIMIZATION OPPORTUNITIES:\n';
  for (const mc of mergeCandidates.slice(0, 3)) {
    systemPrompt += `- ${mc.affectedNodes.join(' + ')} could be merged (${mc.details.similarity}% similar)\n`;
  }
}
```

## Implementation Plan

### Phase 1: Schwellwert-Warnungen (1h)
- [ ] Validation-Cache in AgentDB verfügbar machen
- [ ] Bei Score < 0.5: Top-3 Violations in Prompt

### Phase 2: Consequence-Chains (2h)
- [ ] io-Edge Graph-Traversierung für Kaskadeneffekte
- [ ] Betroffene Nodes aggregieren
- [ ] Warnung formatieren

### Phase 3: Optimization-Suggestions (1h)
- [ ] Merge-Candidates in Prompt-Format
- [ ] Max 3 Vorschläge

## Acceptance Criteria

- [ ] Bei Reward < 0.5 erscheint Warnung im Prompt
- [ ] Kaskadenfehler werden als zusammenhängend erkannt
- [ ] Merge-Vorschläge werden dem LLM präsentiert
- [ ] Log zeigt: "⚠️ Proactive: 3 risks injected into prompt"

## Test-Szenario

```bash
# 1. Graph mit bekannten Violations laden
/load fixtures/graph-with-violations.formatE

# 2. Beliebige Anfrage stellen
"Add a new function"

# 3. Erwartung im Log:
"⚠️ Proactive warnings: 2 critical, 1 optimization"
"📝 Prompt extended with risk context (150 tokens)"

# 4. LLM-Output sollte Warnungen berücksichtigen
```

## Estimated Effort

**Total: 4-5 hours**

## Dependencies

- CR-058 (Self-Learning) für Episode-Context-Infrastruktur
- Validation-Cache in AgentDB

## References

- [background-validator.ts](../../src/llm-engine/validation/background-validator.ts)
- [unified-rule-evaluator.ts](../../src/llm-engine/validation/unified-rule-evaluator.ts)
