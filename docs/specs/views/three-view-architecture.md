# Three-View Architecture Model

**Version:** 1.0.0
**Author:** andreas@siglochconsulting
**Date:** 2025-11-21

## Overview

Das Drei-View-Modell strukturiert Systemmodelle in drei komplementäre Perspektiven, die zusammen ein vollständiges Bild liefern.

## VIEW 1: Wirkketten-Architektur (FCHAIN)

**Zweck:** Zeigt WIE Kundenfunktionen realisiert werden.

### Struktur

```
UC -cp-> FCHAIN -cp-> FUNC (Sequenz)
         └─ io-Edges: FUNC -io-> FLOW -io-> FUNC (Datenfluss)
```

### Elemente

| Element | Rolle |
|---------|-------|
| UC | Use Case - Was will der Nutzer erreichen? |
| FCHAIN | Function Chain - Welche Schritte realisieren den UC? |
| FUNC | Function - Einzelner Verarbeitungsschritt |
| FLOW | Data Flow - Daten zwischen Schritten |

### Fragen die diese Sicht beantwortet

- Welche Schritte durchläuft ein User Request?
- In welcher Reihenfolge werden Funktionen aufgerufen?
- Welche Daten fließen zwischen den Schritten?

### Beispiel

```
DefineSystemViaChat.UC
 └─ UserRequestToGraphUpdate.FCHAIN
     ├─ HandleUserInput.FUNC
     │   └─ -io-> UserMessage.FLOW
     ├─ BuildSystemPrompt.FUNC
     ├─ ProcessRequest.FUNC
     │   └─ -io-> LLMResponse.FLOW
     ├─ ParseResponse.FUNC
     ├─ ApplyDiff.FUNC
     └─ BroadcastUpdate.FUNC
```

---

## VIEW 2: Logical Architecture (FUNC-Hierarchie)

**Zweck:** Zeigt WAS das System kann - logische Funktionsblöcke.

### Struktur

```
SYS -cp-> FUNC(Bundle) -cp-> FUNC(Leaf)
          └─ FUNC -io-> FLOW -io-> FUNC (Schnittstellen zwischen Bundles)
```

### Elemente

| Element | Rolle |
|---------|-------|
| FUNC(Bundle) | Top-Level Funktionsgruppe mit definierten Schnittstellen |
| FUNC(Leaf) | Einzelne Capability innerhalb eines Bundles |
| FLOW | Contract - definiert Input/Output zwischen Bundles |

### Fragen die diese Sicht beantwortet

- Welche logischen Funktionsgruppen existieren?
- Was sind die Schnittstellen zwischen Komponenten?
- Welche Contracts müssen eingehalten werden?

### Beispiel

```
GraphEngine.SYS
 ├─ LLMEngine.FUNC (Bundle)
 │   ├─ ProcessRequest.FUNC
 │   ├─ BuildSystemPrompt.FUNC
 │   └─ ParseResponse.FUNC
 │
 ├─ Canvas.FUNC (Bundle)
 │   ├─ ApplyDiff.FUNC
 │   ├─ LoadGraph.FUNC
 │   └─ BroadcastUpdate.FUNC
 │
 └─ Schnittstelle: LLMEngine.FUNC -io-> LLMResponse.FLOW -io-> Canvas.FUNC
```

---

## VIEW 3: Physical View (MOD ↔ FUNC)

**Zweck:** Zeigt WO Code implementiert ist - Verzeichnis/Datei-Struktur.

### Struktur

```
SYS -cp-> MOD(Dir) -cp-> MOD(File)
                    └─ -alc-> FUNC (Allokation)
MOD -rel-> MOD (Import-Abhängigkeiten)
```

### Elemente

| Element | Rolle |
|---------|-------|
| MOD(Dir) | Verzeichnis im Dateisystem |
| MOD(File) | Einzelne Quellcode-Datei |
| -alc-> | Allocate-Edge: welche FUNC in welchem MOD |
| -rel-> | Relation-Edge: Import-Abhängigkeiten |

### Fragen die diese Sicht beantwortet

- In welcher Datei ist eine Funktion implementiert?
- Welche Module hängen voneinander ab?
- Wie ist der Code organisiert?

### Beispiel

```
GraphEngine.MOD (src/)
 ├─ LLMEngine.MOD (src/llm-engine/)
 │   ├─ LLMEngineImpl.MOD (llm-engine.ts)
 │   │   └─ -alc-> ProcessRequest.FUNC
 │   │   └─ -alc-> StreamTokens.FUNC
 │   ├─ PromptBuilder.MOD (prompt-builder.ts)
 │   │   └─ -alc-> BuildSystemPrompt.FUNC
 │   └─ ResponseParser.MOD (response-parser.ts)
 │       └─ -alc-> ParseResponse.FUNC
 │
 └─ Import: LLMEngineImpl.MOD -rel-> PromptBuilder.MOD
```

---

## Zusammenspiel der Views

```
┌─────────────────────────────────────────────────────────────┐
│  VIEW 1: Wirkketten                                         │
│  UC ─cp─> FCHAIN ─cp─> FUNC ─io─> FLOW ─io─> FUNC          │
│  "Wie wird eine Kundenfunktion realisiert?"                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ FUNC werden referenziert
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  VIEW 2: Logical Architecture                               │
│  SYS ─cp─> FUNC(Bundle) ─cp─> FUNC(Leaf)                   │
│            └─ ─io─> FLOW ─io─> (andere Bundles)            │
│  "Was kann das System? Welche Contracts?"                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ FUNC werden allokiert
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  VIEW 3: Physical View                                      │
│  SYS ─cp─> MOD(Dir) ─cp─> MOD(File) ─alc─> FUNC            │
│                     └─ ─rel─> MOD (Imports)                 │
│  "Wo ist der Code? Welche Abhängigkeiten?"                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Regeln und Constraints

### 1. Contract Enforcement

- FUNC(Bundle) mit FLOW-Kindern definieren Schnittstellen
- io-Edges dürfen Contract-Grenzen nicht verletzen
- Interne FUNC kommunizieren nur über definierte FLOWs nach außen

### 2. Traceability

| Von | Nach | Edge | Bedeutung |
|-----|------|------|-----------|
| UC | FCHAIN | compose | Funktionale Zerlegung |
| FCHAIN | FUNC | compose | Schritte der Wirkkette |
| MOD | FUNC | allocate | Physische Zuordnung |
| FUNC | REQ | satisfy | Anforderungserfüllung |

### 3. Hygiene-Regel

- **Ideal:** 1:1 Mapping zwischen FUNC(Bundle) und MOD(Dir)
- **Erlaubt:** Mehrere Leaf-FUNCs in einem MOD(File)
- **Vermeiden:** Eine FUNC über mehrere MODs verteilt

---

## Edge-Typen pro View

| View | Primäre Edges | Sekundäre Edges |
|------|---------------|-----------------|
| Wirkketten | compose (UC→FCHAIN→FUNC), io (FUNC→FLOW) | - |
| Logical | compose (FUNC→FUNC), io (Bundle→FLOW→Bundle) | satisfy (FUNC→REQ) |
| Physical | compose (MOD→MOD), allocate (MOD→FUNC) | relation (MOD→MOD imports) |
