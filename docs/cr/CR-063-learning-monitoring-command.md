# CR-063: Learning Monitoring Command (`/learning`)

**Type:** Feature
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2024-12-16
**Depends on:** CR-058 (Self-Learning Aktivierung)

## Problem / Use Case

Nach CR-058 sammelt das System Learning-Daten (Episodes, Patterns), aber es gibt keine Möglichkeit die Verbesserung zu messen oder zu visualisieren.

**Fehlend:**
1. Kein Command um Learning-Statistiken anzuzeigen
2. SkillLibrary nur in-memory (verloren bei Neustart)
3. Keine Trend-Visualisierung über Zeit

## Requirements

### Functional
- FR-063.1: `/learning` Command zeigt Learning-Statistiken
- FR-063.2: Agent-Performance mit Trend-Indikator (↗ ↘ →)
- FR-063.3: Pattern-Statistiken (Anzahl, Success-Rate, Top-Patterns)
- FR-063.4: Session-übergreifende Persistenz der SkillLibrary

### Non-Functional
- NFR-063.1: Statistik-Abfrage < 50ms
- NFR-063.2: Keine neue Datenbank-Tabelle (nutzt AgentDB)

## Architecture / Solution Approach

### `/learning` Command Output

```
📚 Learning Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Episodes:     12 total (8 successful, 4 failed)
Patterns:     5 stored (avg success rate: 87%)

Agent Performance:
  system-architect:  0.82 avg reward ↗ improving
  graph-builder:     0.71 avg reward → stable
  validator:         0.65 avg reward ↘ declining

Recent Trend (last 10 requests):
  ████████░░ 80% success rate

Top Patterns:
  1. "Add FUNC node" - 92% match, used 4x
  2. "Create io edges" - 88% match, used 2x
```

### Komponenten

1. **`/learning` Command Handler** in `src/terminal-ui/commands/`
2. **`getLearningStats()` in SessionManager** - Aggregiert Daten
3. **SkillLibrary Persistenz** - Export/Import bei Session-Start/Ende

### Datenquellen

| Metrik | Quelle | Methode |
|--------|--------|---------|
| Episode-Statistik | AgentDB | `agentDB.getEpisodeStats()` (neu) |
| Agent-Effectiveness | ReflexionMemory | `getAgentEffectiveness()` (existiert) |
| Pattern-Stats | SkillLibrary | `getStats()` (existiert) |
| Trend | Episodes | Berechnet aus letzten N Episodes |

## Implementation Plan

### Phase 1: Command Handler (1h)
- [ ] `learning-command.ts` erstellen
- [ ] In command-registry registrieren
- [ ] `SessionManager.getLearningStats()` implementieren

### Phase 2: AgentDB Episode Stats (30min)
- [ ] `getEpisodeStats()` in UnifiedAgentDBService
- [ ] Aggregiert: total, successful, failed, by-agent

### Phase 3: SkillLibrary Persistenz (1h)
- [ ] `exportPatterns()` bei Session-Ende (shutdown)
- [ ] `importPatterns()` bei Session-Start
- [ ] Speicherort: `~/.graphengine/skill-library.json`

### Phase 4: Testing (30min)
- [ ] Unit-Test: Stats-Aggregation
- [ ] E2E: `/learning` zeigt korrekte Daten

## Acceptance Criteria

- [ ] `/learning` zeigt Episode-Statistiken
- [ ] Agent-Performance mit Trend-Indikator
- [ ] Top-Patterns werden angezeigt
- [ ] SkillLibrary überlebt Neustart
- [ ] Bestehende E2E-Tests grün

## Estimated Effort

**Total: 3-4 hours**

## References

- [CR-058](CR-058-self-learning-activation.md) - Self-Learning Aktivierung
- [reflexion-memory.ts](../../src/llm-engine/agentdb/reflexion-memory.ts)
- [skill-library.ts](../../src/llm-engine/agentdb/skill-library.ts)
