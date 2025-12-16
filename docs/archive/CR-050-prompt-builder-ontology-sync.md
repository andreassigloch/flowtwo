# CR-050: Prompt Builder Ontology Synchronization

**Type:** Bug Fix / Optimization
**Status:** Completed
**Priority:** HIGH
**Created:** 2025-12-14
**Author:** andreas@siglochconsulting

## Problem

Der hardcoded Prompt in `prompt-builder.ts` ist **nicht synchron** mit `settings/ontology-rules.json`:

1. **Fehlende FCHAIN Composition Rules:**
   - Prompt (Zeile 131): `UC→FCHAIN, FCHAIN→FUNC, FUNC→FUNC`
   - Ontology: `FCHAIN→ACTOR, FCHAIN→FUNC, FCHAIN→FLOW`
   - **Ergebnis:** LLM komponiert ACTORs nicht in FCHAINs

2. **Redundanz:** ~500 Tokens doppelt (Ontology + Methodology sections)

3. **Fehlende Nesting-Info:** Welche Edges sind hierarchisch (`compose`, `satisfy`, `allocate`)

## Root Cause

LLM ignoriert spezifische Ontology-Regeln weil:
- Hardcoded Prompt ist veraltet/unvollständig
- LLM-Basiswissen (allgemeines SE) überschreibt fehlende Kontextinfo
- Keine Single Source of Truth für Prompt-Ontology

## Requirements

### Functional
- FR-1: FCHAIN→ACTOR, FCHAIN→FUNC, FCHAIN→FLOW in compose edges
- FR-2: Nesting edge types explizit: `compose`, `satisfy`, `allocate`
- FR-3: Redundanz zwischen Ontology und Methodology eliminieren
- FR-4: Korrekte UC→FCHAIN Komposition

### Non-Functional
- NFR-1: Token-Budget neutral oder reduziert (max +100 Tokens)
- NFR-2: Keine Änderung an ontology-rules.json nötig

## Solution Approach

### Option 1: Minimaler Fix (empfohlen)
~30 Minuten, +50 Tokens

1. Zeile 131 korrigieren: FCHAIN→ACTOR, FCHAIN→FLOW hinzufügen
2. Nesting-Info hinzufügen (~3 Zeilen)
3. Redundanz in Methodology streichen (~400 Tokens sparen)

**Netto:** -350 Tokens

### Option 2: Dynamischer Import
~2 Stunden, +750 Tokens

Relevante Sections aus ontology-rules.json zur Laufzeit laden.
Mehr Aufwand, höhere Token-Kosten.

## Implementation Plan

### Phase 1: Fix compose edges (5 min)
Datei: `src/llm-engine/prompt-builder.ts`

Zeile 131 ändern von:
```
Valid: SYS→SYS, SYS→UC, SYS→FUNC, UC→FCHAIN, FCHAIN→FUNC, FUNC→FUNC, MOD→FUNC
```
zu:
```
Valid: SYS→SYS, SYS→UC, SYS→FUNC, UC→UC, UC→FCHAIN, FCHAIN→ACTOR, FCHAIN→FUNC, FCHAIN→FLOW, FUNC→FUNC, MOD→MOD
```

### Phase 2: Add nesting info (5 min)
Nach Edge Types Section hinzufügen:
```
## Nesting (Hierarchical) Edge Types
compose, satisfy, allocate - these create parent-child relationships
io, verify, relation - these are cross-references (no nesting)
```

### Phase 3: Remove redundancy in Methodology (15 min)
Aus `buildMethodologySection()` entfernen:
- SYS→SYS Kriterien (bereits in Ontology Zeile 133)
- io-flow-io Pattern (bereits in Ontology Zeilen 137-147)
- Format E Beispiel (bereits in Ontology Zeilen 161-183)
- Subsystem Tabelle (bereits in Ontology)

### Phase 4: Verify (5 min)
- Unit Test: Token count vorher/nachher
- E2E Test: FCHAIN mit ACTOR erstellen

## Acceptance Criteria

- [x] FCHAIN→ACTOR in compose edges dokumentiert
- [x] Nesting edges explizit aufgelistet
- [x] Token count: 1.333 (vorher ~1.887) → **-554 Tokens**
- [ ] E2E: `/load` + FCHAIN-Erstellung komponiert ACTORs korrekt (manuelle Validierung)

## Files to Modify

- `src/llm-engine/prompt-builder.ts` (Zeilen 131, 190-288)

## Estimated Effort

30 Minuten

## References

- [settings/ontology-rules.json](../../settings/ontology-rules.json) - Lines 95-100, 195-199
- Conversation: "actors are not shown as part of the fchain"
