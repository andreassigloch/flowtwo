# GraphEngine Chat Session Review - Methodenanalyse

**Datum:** 2025-12-16
**Session:** PRD Creation System Modellierung
**Autor:** andreas@siglochconsulting

## Session-Übersicht

| Metrik | Wert |
|--------|------|
| Nodes | 71 → 121 (+50) |
| Edges | 174 → 354 (+180) |
| Commits | 4 |
| Validierungsfehler am Ende | 6 (davon 2 kritisch durch `/optimize`) |

## 1. Was gut funktioniert hat

1. **Iterative Modellierung:** User baut schrittweise Use Case → FCHAIN → Funktionale Dekomposition → Module Allocation auf
2. **Validation-Driven Development:** `/analyze` zeigt Probleme, User korrigiert (z.B. fehlender Output-Actor für Archive FCHAIN)
3. **Pre-Apply Validation funktioniert:** Bidirektionale io-Edge wurde korrekt blockiert, LLM hat automatisch korrigiert
4. **Zwei-Sichten-Konzept verstanden:** User erkennt, dass FCHAIN-Sicht und Top-Level-FUNC-Sicht komplementär sind

## 2. Identifizierte Probleme

### 2.1 CR-064 sichtbar: Similarity Misalignment

`/analyze` zeigt "77% similar" Merge-Kandidaten, aber `/optimize` wendet MERGE nicht an.

Nach `/optimize` erscheinen **neue** Violations:
- Bidirektionale io-Edges
- Circular io-chains
- `/optimize` hat `AnalyzeTimelineImpact+AnalyzeScopeImpact` mit fehlerhaften io-Edges erzeugt

### 2.2 Optimizer-Ergebnis nicht optimal

| Metrik | Wert | Problem |
|--------|------|---------|
| Score | 0.622 | Sollte höher sein nach Optimierung |
| ontology_conformance | 0.00 | Kritisch niedrig |
| Änderungen | 28 adds + 28 deletes | Viele Änderungen, aber neue Violations |

### 2.3 Agent-Routing fehlt

Log zeigt **nur requirements-engineer** - obwohl User angefragt hat:
- "funktionale architektur" → sollte system-architect triggern
- "Module Allocation" → sollte system-architect triggern
- "funktionale dekomposition" → sollte system-architect triggern

### 2.4 LLM-Antworten zu lang

- Viele Architektur-Übersichten wiederholt
- "Status: Vollständige System-Architektur" mehrfach erklärt
- User wollte nur kurze Bestätigung

### 2.5 Merge-Kandidaten nicht adressiert

`/analyze` zeigt wiederholt:
- DistributeToTeam ↔ DistributePRD (77%)
- ValidateImplementation ↔ ValidateRequirements (78%)

User hat diese nie aktiv behandelt, `/optimize` sollte diese finden und vorschlagen.

## 3. CR-Priorisierung

| Priorität | CR | Problem | Impact |
|-----------|-----|---------|--------|
| **CRITICAL** | CR-064 | `/analyze` und `/optimize` nutzen unterschiedliche Similarity | Optimizer erzeugt fehlerhafte Merges |
| **HIGH** | CR-065 | Agent-Routing nicht implementiert | Falscher Agent für Architektur-Aufgaben |
| **HIGH** | CR-066 | Inkonsistente Terminologie | Verwirrung bei Architektur-Begriffen |
| **HIGH** | CR-036 | Kein `/architect` Command | User muss manuell zwischen Phasen wechseln |
| **MEDIUM** | CR-057 | ContextManager nicht integriert | Token-Verschwendung bei großen Graphen |

## 4. Prompt-Optimierungen

### 4.1 Agent-Routing implementieren

**Problem:** Das Routing in `agent-config.json` wird nicht aktiv ausgewertet. Der Code nutzt `default: "requirements-engineer"` für alles.

**Lösung:** Explicit keywords triggern andere Agents:
- "funktionale architektur" → system-architect
- "FCHAIN" / "activity" → functional-analyst
- "MOD" / "allocation" → system-architect
- "TEST" / "verification" → verification-engineer

### 4.2 Scope Limitation für requirements-engineer

```markdown
## Scope Limitation
You handle ONLY Phase 1 work:
- SYS, UC, REQ, ACTOR creation
- satisfy edges UC→REQ

For these requests, DEFER to other agents:
- "funktionale architektur" → system-architect
- "FCHAIN" / "activity" → functional-analyst
- "MOD" / "allocation" → system-architect
```

### 4.3 Response-Länge reduzieren

```markdown
## Response Guidelines
- Status summaries: Only when explicitly requested
- Architecture overviews: Max 1 per session, not after every operation
- Default: Confirm changes in 2-3 sentences, then ask "Nächster Schritt?"
```

## 5. Terminologie-Inkonsistenzen

### 5.1 Architektur-Begriffe

| Begriff im Chat | Bedeutung | Korrekt nach INCOSE/SysML |
|-----------------|-----------|---------------------------|
| "logische architektur" | FUNC-Hierarchie | **Functional Architecture** |
| "funktionale architektur" | Top-Level FUNCs | = Functional Architecture (gleich!) |
| "physische architektur" | MOD allocation | **Physical Architecture** ✅ |
| "prozess-architektur" | FCHAINs | **Behavioral Architecture** |

### 5.2 Empfohlene Terminologie

```
Functional Architecture (Funktionale Architektur)
├── System Functions (Top-Level, 5-9 nach Miller's Law)
├── Function Decomposition (FUNC -cp-> FUNC)
└── Leaf Functions (atomare Funktionen)

Behavioral Architecture (Verhaltensarchitektur)
├── Activity Sequences (FCHAIN)
├── Data Flows (FLOW)
└── Actor Interactions (ACTOR -io-> FLOW)

Physical Architecture (Physische Architektur)
├── Modules (MOD)
├── Allocation (FUNC -alc-> MOD)
└── Deployment Units
```

### 5.3 Phase-Namen (INCOSE-konform)

| Aktuell | INCOSE-Standard |
|---------|-----------------|
| phase1_requirements | **SRR** (System Requirements Review) |
| phase2_logical | **PDR** (Preliminary Design Review) |
| phase3_physical | **CDR** (Critical Design Review) |
| phase4_verification | **TRR** (Test Readiness Review) |

## 6. Konkrete Empfehlungen

### Sofort umsetzen

1. **CR-064:** Similarity Alignment zwischen `/analyze` und `/optimize`
2. **CR-065:** Agent-Routing implementieren
3. **CR-066:** Terminologie standardisieren

### Prompt-Updates

1. `requirements-engineer.md`: Scope Limitation hinzufügen
2. `system-architect.md`: Activation Keywords hinzufügen
3. Alle Prompts: Response Guidelines für kürzere Antworten

### Nächster Schritt für User

Nach fehlerhaften `/optimize`-Änderungen: `/restore` ausführen, dann manuell Merge-Kandidaten behandeln.

## 7. Referenzen

- [CR-064: Optimizer Similarity Alignment](cr/CR-064-optimizer-similarity-alignment.md)
- [CR-065: Agent Routing Implementation](cr/CR-065-agent-routing-implementation.md)
- [CR-066: Terminology Standardization](cr/CR-066-terminology-standardization.md)
- [Agent Config](../settings/agent-config.json)
- [Requirements Engineer Prompt](../settings/prompts/requirements-engineer.md)
- [System Architect Prompt](../settings/prompts/system-architect.md)
