# CR-058: Self-Learning Aktivierung (ReflexionMemory + SkillLibrary)

**Type:** Feature / Integration
**Status:** Completed
**Priority:** HIGH
**Created:** 2024-12-16

## Problem / Use Case

ReflexionMemory und SkillLibrary wurden vollständig implementiert, aber **nie in den LLM-Flow integriert**. Der Feedback-Loop ist offen:

```
AKTUELL:
  Request → LLM → Operations → Validation → Episode speichern → STOP
                                                    ↓
                                           [Daten werden NIE gelesen]

FEHLEND:
  Request → [Lessons laden] → [Patterns laden] → Prompt anreichern → LLM
                                                                      ↓
                                           Operations → Validation → Episode + Pattern speichern
```

### Existierende aber ungenutzte Implementierungen:

| Komponente | Datei | Status |
|------------|-------|--------|
| ReflexionMemory | [reflexion-memory.ts](../../src/llm-engine/agentdb/reflexion-memory.ts) | Instanziiert, nie abgefragt |
| SkillLibrary | [skill-library.ts](../../src/llm-engine/agentdb/skill-library.ts) | Instanziiert, 0 Aufrufe |
| storeEpisode() | [session-manager.ts:620](../../src/session-manager.ts#L620) | Wird aufgerufen |
| loadEpisodeContext() | reflexion-memory.ts:174 | Nie aufgerufen |
| findApplicablePatterns() | skill-library.ts:122 | Nie aufgerufen |
| recordSuccess() | skill-library.ts:62 | Nie aufgerufen |

### Auswirkungen:
- Agent wiederholt gleiche Fehler innerhalb einer Session
- Erfolgreiche Patterns werden nicht wiederverwendet
- Keine Adaption an Graph-spezifische Muster

## Requirements

### Functional
- FR-058.1: Vor LLM-Request: Episode-Kontext (Lessons, Patterns) laden
- FR-058.2: Kontext in System-Prompt injizieren
- FR-058.3: Nach erfolgreicher Operation: Pattern in SkillLibrary speichern
- FR-058.4: Bei Fehler: Lesson aus Critique generieren

### Non-Functional
- NFR-058.1: Max 500 zusätzliche Tokens für Learning-Kontext
- NFR-058.2: Latenz < 5ms für lokale Lookups
- NFR-058.3: Keine Regression bei erstem Request (leere Memory)

## Architecture / Solution Approach

### Integration in session-manager.ts

**VOR LLM-Request (~Zeile 545):**
```typescript
// Learning-Kontext laden
const episodeContext = this.reflexionMemory.loadEpisodeContext(selectedAgent, message);
const contextStr = this.reflexionMemory.formatContextForPrompt(episodeContext);

const patterns = this.skillLibrary.findApplicablePatterns(message, {
  phase: sessionContext.currentPhase
});

// Prompt anreichern
let learningContext = '';
if (contextStr) {
  learningContext += '\n## Lessons from Past Attempts\n' + contextStr;
}
if (patterns.length > 0) {
  learningContext += '\n## Similar Successful Patterns\n';
  for (const match of patterns.slice(0, 3)) {
    learningContext += `- "${match.pattern.task}" (${(match.similarity*100).toFixed(0)}% match)\n`;
  }
}
```

**NACH erfolgreicher Operation (~Zeile 620):**
```typescript
// In storeEpisode() erweitern
if (episode.success && response.operations) {
  this.skillLibrary.recordSuccess(
    message,
    response.operations,
    {
      phase: sessionContext.currentPhase,
      nodeTypes: extractNodeTypes(response.operations),
      edgeTypes: extractEdgeTypes(response.operations)
    },
    episode.reward
  );
}
```

### Prompt-Injection Format

```
## Lessons from Past Attempts
⚠️ Previous attempt for similar task had issues:
- Missing bidirectional io edges between FLOW nodes
- Review question: Did you verify io-chain connectivity?

## Similar Successful Patterns
- "Add FUNC to FCHAIN" (85% match) - Reward: 0.92
- "Create io edges for data flow" (72% match) - Reward: 0.88
```

## Implementation Plan

### Phase 1: Kontext-Laden (1h)
- [x] `session-manager.ts`: loadEpisodeContext() vor LLM-Request
- [x] `session-manager.ts`: findApplicablePatterns() aufrufen
- [x] Learning-Kontext in Prompt injizieren

### Phase 2: Pattern-Recording (1h)
- [x] Nach erfolgreicher Operation: recordSuccess() aufrufen
- [x] Node/Edge-Types aus Operations extrahieren
- [x] Phase-Kontext mitgeben

### Phase 3: Testing (1h)
- [x] Unit-Test: Kontext wird bei 2. Request geladen
- [x] Integration-Test: Pattern wird nach Erfolg gespeichert
- [x] E2E: Fehler führt zu Lesson im nächsten Request

## Acceptance Criteria

- [x] `loadEpisodeContext()` wird bei jedem LLM-Request aufgerufen
- [x] `findApplicablePatterns()` wird bei jedem LLM-Request aufgerufen
- [x] Bei Reward >= 0.7: Pattern wird via `recordSuccess()` gespeichert
- [x] Log zeigt: "📚 Learning context: 2 lessons, 1 pattern"
- [x] Bestehende E2E-Tests grün

## Test-Szenario (in einem Chat testbar)

```bash
# 1. Erste Anfrage (erzeugt Episode)
"Add a FUNC node called Calculator to the system"
# → Episode gespeichert mit reward

# 2. Zweite ähnliche Anfrage
"Add a FUNC node called Validator to the system"
# → Log zeigt: "📚 Learning: 1 pattern loaded (85% match)"
# → Prompt enthält Pattern-Hinweis

# 3. Anfrage mit bekanntem Fehlertyp
"Add an io edge from Flow1 to Func1"
# Falls vorherige Episode Fehler hatte:
# → Log zeigt: "⚠️ Learning: 1 lesson loaded"
# → Prompt enthält Warnung

# 4. Verifikation
/status
# → "Learning: 3 episodes, 2 patterns stored"
```

## Estimated Effort

**Total: 3-4 hours**

## Dependencies

- ReflexionMemory bereits implementiert
- SkillLibrary bereits implementiert
- Episode-Storage funktioniert (CR-054)

## References

- [reflexion-memory.ts](../../src/llm-engine/agentdb/reflexion-memory.ts)
- [skill-library.ts](../../src/llm-engine/agentdb/skill-library.ts)
- [CR-054](CR-054-preventive-prompt-instructions.md) - Episode Reward Fix
- [CR-038 Phase 7](../archive/CR-038-clean-architecture-refactor.md) - Original-Design
