# CR-065: Agent Routing Implementation

**Type:** Feature
**Status:** Planned
**Priority:** HIGH
**Created:** 2025-12-16
**Author:** andreas@siglochconsulting

## Problem / Use Case

Das Agent-Routing in `agent-config.json` (Zeile 206-234) wird nicht aktiv ausgewertet. Der Code nutzt `default: "requirements-engineer"` für alle User-Inputs.

**Beobachtung aus Chat-Session:**
```
User: "erstelle die top level funktionen für die funktionale architektur"
Log:  🤖 Processing with requirements-engineer...
```

Obwohl "funktionale architektur" eindeutig Phase 2 (system-architect) ist, wird requirements-engineer verwendet.

**Weitere Beispiele:**
- "funktionale dekomposition" → requirements-engineer (sollte: system-architect)
- "Module Allocation" → requirements-engineer (sollte: system-architect)
- "physische Architektur" → requirements-engineer (sollte: system-architect)

## Requirements

### Functional Requirements

- FR-1: Agent-Routing basierend auf Keywords in User-Input
- FR-2: Phase-basiertes Routing (Graph-Zustand analysieren)
- FR-3: Explicit Agent-Wechsel bei Phase-Gate-Übergang
- FR-4: Logging welcher Agent gewählt wurde und warum

### Non-Functional Requirements

- NFR-1: Routing-Entscheidung < 50ms
- NFR-2: Keine false positives bei ambigen Keywords

## Architecture / Solution Approach

### Option A: Keyword-basiertes Routing (empfohlen)

```typescript
// src/llm-engine/agent-router.ts

interface RoutingRule {
  keywords: string[];
  agent: string;
  priority: number;
}

const ROUTING_RULES: RoutingRule[] = [
  // Phase 2: Functional Architecture
  { keywords: ['funktionale architektur', 'functional architecture', 'top-level func', 'func decomposition'],
    agent: 'system-architect', priority: 10 },
  { keywords: ['fchain', 'activity', 'sequence', 'workflow'],
    agent: 'functional-analyst', priority: 10 },

  // Phase 3: Physical Architecture
  { keywords: ['modul', 'mod', 'allocation', 'physical', 'physische'],
    agent: 'system-architect', priority: 10 },

  // Phase 4: Verification
  { keywords: ['test', 'verification', 'verify'],
    agent: 'verification-engineer', priority: 10 },

  // Review/Validation
  { keywords: ['review', 'check', 'validate', 'analyze'],
    agent: 'architecture-reviewer', priority: 5 },
];

function routeToAgent(userInput: string, graphState: GraphState): string {
  const normalizedInput = userInput.toLowerCase();

  // 1. Keyword matching
  for (const rule of ROUTING_RULES.sort((a, b) => b.priority - a.priority)) {
    if (rule.keywords.some(kw => normalizedInput.includes(kw))) {
      return rule.agent;
    }
  }

  // 2. Phase-based fallback
  const phase = detectPhase(graphState);
  return PHASE_DEFAULT_AGENTS[phase] ?? 'requirements-engineer';
}
```

### Option B: LLM-basiertes Routing

LLM entscheidet welcher Agent zuständig ist. Teurer, aber flexibler.

### Option C: Hybrid (empfohlen für später)

Keywords für eindeutige Fälle, LLM für ambige.

## Implementation Plan

### Phase 1: Keyword-Router (1h)

1. `src/llm-engine/agent-router.ts` erstellen
2. Routing-Regeln aus `agent-config.json` extrahieren
3. `routeToAgent()` implementieren

### Phase 2: Integration (30min)

1. `chat-interface.ts` oder `response-distributor.ts` anpassen
2. Router vor LLM-Call aufrufen
3. Agent-Wahl loggen

### Phase 3: Phase-Detection (30min)

1. Graph analysieren: SYS+UC vorhanden? → Phase 2
2. FUNC vorhanden? → Phase 2/3
3. MOD vorhanden? → Phase 3/4

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/llm-engine/agent-router.ts` | CREATE | Routing-Logik |
| `src/llm-engine/response-distributor.ts` | MODIFY | Router integrieren |
| `settings/agent-config.json` | MODIFY | Routing-Regeln erweitern |

## Prompt-Optimierungen (parallel)

### requirements-engineer.md - Scope Limitation hinzufügen

```markdown
## Scope Limitation (NEU)

You handle ONLY Phase 1 (Requirements) work:
- SYS, UC, REQ, ACTOR creation
- satisfy edges UC→REQ
- FCHAIN creation for UC scenarios

**DEFER to other agents for:**

| User mentions | Defer to | Why |
|---------------|----------|-----|
| "funktionale architektur", "FUNC decomposition" | system-architect | Phase 2 |
| "Top-Level Funktionen", "System Functions" | system-architect | Phase 2 |
| "MOD", "Module", "allocation" | system-architect | Phase 3 |
| "TEST", "verification" | verification-engineer | Phase 4 |

When you detect these keywords, respond:
"Diese Aufgabe gehört zum system-architect. Ich übergebe."
```

### system-architect.md - Activation Keywords hinzufügen

```markdown
## Activation Keywords (NEU)

Activate this agent when user mentions:
- "logische architektur", "funktionale architektur", "functional architecture"
- "Top-Level Funktionen", "System Functions", "Primary Functions"
- "FUNC decomposition", "function hierarchy"
- "Module", "MOD", "allocation", "physical architecture", "physische Architektur"
- "volatility", "3-layer model", "SCHEMA"
- "Miller's Law", "5-9 children"
```

### Alle Prompts - Response Guidelines hinzufügen

```markdown
## Response Guidelines (NEU)

1. **Brevity**: Confirm changes in 2-3 sentences max
2. **No unsolicited summaries**: Status overviews only when explicitly requested
3. **Next step prompt**: End with "Nächster Schritt?" or similar
4. **No repeated architecture diagrams**: Show structure max once per session

❌ DON'T:
"Die funktionale Architektur ist jetzt vollständig mit 7 Top-Level-Funktionen..."
[500 words of status]

✅ DO:
"✓ 7 Top-Level-Funktionen erstellt, 52 Detail-Funktionen allokiert. Nächster Schritt?"
```

## Acceptance Criteria

- [ ] "funktionale architektur" routet zu system-architect
- [ ] "Module Allocation" routet zu system-architect
- [ ] "TEST erstellen" routet zu verification-engineer
- [ ] Log zeigt gewählten Agent mit Begründung
- [ ] Prompt-Updates in allen Agent-Prompts integriert
- [ ] Response-Länge reduziert (max 200 Wörter für Bestätigungen)

## Estimated Effort

**Total: 2-3h**
- Keyword-Router: 1h
- Integration: 30min
- Phase-Detection: 30min
- Prompt-Updates: 30min
- Tests: 30min

## References

- [agent-config.json](../../settings/agent-config.json) - Routing-Regeln (nicht implementiert)
- [requirements-engineer.md](../../settings/prompts/requirements-engineer.md)
- [system-architect.md](../../settings/prompts/system-architect.md)
- [docs/review_method.md](../review_method.md) - Session-Analyse
