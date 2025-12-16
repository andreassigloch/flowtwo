# CR-066: Terminology Standardization

**Type:** Documentation / Enhancement
**Status:** Planned
**Priority:** HIGH
**Created:** 2025-12-16
**Author:** andreas@siglochconsulting

## Problem / Use Case

Inkonsistente Terminologie in Chat-Sessions, Prompts und Dokumentation führt zu Verwirrung:

**Beobachtete Inkonsistenzen:**

| Begriff im Chat | Verwendung | Problem |
|-----------------|------------|---------|
| "logische architektur" | FUNC-Hierarchie | Unklar ob = "funktionale architektur" |
| "funktionale architektur" | Top-Level FUNCs | Synonym zu "logische"? |
| "prozess-architektur" | FCHAINs | Kein INCOSE-Standard-Begriff |
| "Detail-Funktionen" | Leaf FUNCs | Ad-hoc Begriff |
| "Top-Level Funktionen" | System FUNCs | Ad-hoc Begriff |

**Konsequenz:** User und LLM verwenden Begriffe unterschiedlich, was zu Missverständnissen führt.

## Requirements

### Functional Requirements

- FR-1: Einheitliche Terminologie in allen Prompts
- FR-2: Mapping-Tabelle German ↔ English ↔ INCOSE
- FR-3: Begriffe in UI/CLI konsistent verwenden
- FR-4: Deprecated Terms dokumentieren

### Non-Functional Requirements

- NFR-1: Rückwärtskompatibel (alte Begriffe werden verstanden)
- NFR-2: INCOSE/SysML 2.0 konform

## Architecture / Solution Approach

### Standardisierte Architektur-Views

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCOSE Architecture Views                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Requirements View (Anforderungssicht)                          │
│  ├── Node Types: SYS, UC, REQ, ACTOR                           │
│  ├── Purpose: What the system must do                          │
│  └── Phase: SRR (System Requirements Review)                   │
│                                                                 │
│  Functional View (Funktionale Sicht)                            │
│  ├── Node Types: FUNC hierarchy                                │
│  ├── Purpose: How capabilities decompose                       │
│  ├── Subviews:                                                 │
│  │   ├── System Functions (Top-Level, 5-9 per Miller's Law)   │
│  │   ├── Function Decomposition (FUNC -cp-> FUNC)             │
│  │   └── Leaf Functions (atomic, no children)                 │
│  └── Phase: PDR (Preliminary Design Review)                    │
│                                                                 │
│  Behavioral View (Verhaltenssicht)                              │
│  ├── Node Types: FCHAIN, FLOW, ACTOR interactions              │
│  ├── Purpose: How activities flow (Activity Diagrams)          │
│  └── Phase: PDR (Preliminary Design Review)                    │
│                                                                 │
│  Physical View (Physische Sicht)                                │
│  ├── Node Types: MOD, allocation edges                         │
│  ├── Purpose: How functions allocate to modules                │
│  └── Phase: CDR (Critical Design Review)                       │
│                                                                 │
│  Verification View (Verifikationssicht)                         │
│  ├── Node Types: TEST, verify edges                            │
│  ├── Purpose: How requirements are verified                    │
│  └── Phase: TRR (Test Readiness Review)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Terminologie-Mapping

| Deprecated (vermeiden) | Standard (verwenden) | INCOSE Term | German |
|------------------------|----------------------|-------------|--------|
| "logische Architektur" | Functional View | Functional Architecture | Funktionale Sicht |
| "funktionale Architektur" | Functional View | Functional Architecture | Funktionale Sicht |
| "prozess-architektur" | Behavioral View | Behavioral Architecture | Verhaltenssicht |
| "Detail-Funktionen" | Leaf Functions | Leaf Functions | Blatt-Funktionen |
| "Top-Level Funktionen" | System Functions | System Functions | System-Funktionen |
| "Sub-Funktionen" | Child Functions | Decomposed Functions | Kind-Funktionen |
| "Haupt-Funktionen" | Primary Functions | Primary Functions | Primäre Funktionen |

### Phase-Namen (INCOSE-konform)

| Aktuell in Code | INCOSE Standard | Beschreibung |
|-----------------|-----------------|--------------|
| phase1_requirements | **SRR** | System Requirements Review |
| phase2_logical | **PDR** | Preliminary Design Review |
| phase3_physical | **CDR** | Critical Design Review |
| phase4_verification | **TRR** | Test Readiness Review |

### Node-Type Terminology

| Node Type | Correct Term | Incorrect Terms |
|-----------|--------------|-----------------|
| FUNC | Function | "Funktion", "Capability", "Feature" |
| FCHAIN | Function Chain | "Activity Chain", "Process Chain", "Workflow" |
| FLOW | Data Flow | "Interface", "Connection", "Link" |
| MOD | Module | "Component", "Package", "Service" |
| REQ | Requirement | "Anforderung", "Spec", "Constraint" |
| UC | Use Case | "User Story", "Feature", "Scenario" |

## Implementation Plan

### Phase 1: Prompt-Updates (1h)

Alle Prompts in `settings/prompts/` aktualisieren:

1. **requirements-engineer.md**: Terminologie-Sektion hinzufügen
2. **system-architect.md**: Terminologie-Sektion hinzufügen
3. **functional-analyst.md**: Terminologie-Sektion hinzufügen

### Phase 2: Config-Updates (30min)

1. `agent-config.json`: Phase-Namen auf INCOSE umstellen
2. `ontology-rules.json`: Konsistente Begriffe in Messages

### Phase 3: Documentation (30min)

1. `docs/architecture.md`: Terminology-Sektion hinzufügen
2. `docs/review_method.md`: Referenz auf Terminologie

### Phase 4: UI/CLI (optional, 1h)

1. `/help` output mit korrekten Begriffen
2. `/status` zeigt Phase mit INCOSE-Namen (SRR, PDR, CDR, TRR)

## Files to Modify

| File | Changes |
|------|---------|
| `settings/prompts/requirements-engineer.md` | Terminologie-Sektion |
| `settings/prompts/system-architect.md` | Terminologie-Sektion |
| `settings/prompts/functional-analyst.md` | Terminologie-Sektion |
| `settings/agent-config.json` | Phase-Namen |
| `docs/architecture.md` | Terminology Reference |

## Prompt-Änderungen (Detail)

### Neue Sektion für alle Prompts

```markdown
## Terminology (INCOSE/SysML 2.0 Compliant)

### Architecture Views
| View | Purpose | Node Types | Phase |
|------|---------|------------|-------|
| Requirements View | What system must do | SYS, UC, REQ, ACTOR | SRR |
| Functional View | How capabilities decompose | FUNC hierarchy | PDR |
| Behavioral View | How activities flow | FCHAIN, FLOW | PDR |
| Physical View | How functions allocate | MOD, allocation | CDR |
| Verification View | How requirements verified | TEST, verify | TRR |

### Standard Terms (USE THESE)
- **System Functions**: Top-level FUNC (5-9 per Miller's Law)
- **Leaf Functions**: Atomic FUNC without children
- **Function Chain**: FCHAIN = Activity Diagram implementation
- **Data Flow**: FLOW connecting FUNC/ACTOR

### Deprecated Terms (AVOID)
- ❌ "logische Architektur" → ✅ "Functional View"
- ❌ "Detail-Funktionen" → ✅ "Leaf Functions"
- ❌ "Top-Level Funktionen" → ✅ "System Functions"
- ❌ "prozess-architektur" → ✅ "Behavioral View"
```

### Response-Beispiele

```markdown
## Response Examples

### When user says "logische Architektur":
"Ich verstehe Sie meinen die **Functional View** (FUNC-Hierarchie).
Soll ich System Functions (Top-Level) oder Leaf Functions erstellen?"

### When user says "erstelle Top-Level Funktionen":
"Ich erstelle **System Functions** für die Functional View.
Diese werden direkt unter SYS mit compose-Edges verknüpft."

### When user asks about "Phase 2":
"Phase 2 entspricht dem **PDR (Preliminary Design Review)**.
Deliverables: System Functions (5-9), FCHAIN pro UC, FLOW mit SCHEMA."
```

## Acceptance Criteria

- [ ] Alle Prompts haben Terminology-Sektion
- [ ] "Functional View" wird konsistent verwendet (nicht "logische/funktionale Architektur")
- [ ] Phase-Namen als INCOSE-Abkürzungen (SRR, PDR, CDR, TRR)
- [ ] LLM antwortet mit korrekten Begriffen
- [ ] Deprecated Terms werden erkannt und übersetzt
- [ ] Dokumentation referenziert einheitliche Terminologie

## Estimated Effort

**Total: 2-3h**
- Prompt-Updates: 1h
- Config-Updates: 30min
- Documentation: 30min
- Testing: 30min

## References

- [INCOSE Systems Engineering Handbook](https://www.incose.org/products-and-publications/se-handbook)
- [SysML 2.0 Specification](https://www.omgsysml.org/)
- [docs/architecture.md](../architecture.md)
- [docs/review_method.md](../review_method.md)
- [CR-065: Agent Routing](CR-065-agent-routing-implementation.md) - Related (uses same terminology)
