# System Decomposition Rules

## Grundprinzipien

1. **Ein System** als Wurzelknoten – alles darunter sind Funktionen, Module oder Actors
1. **Funktionale Sicht ist primär** – Wirkketten, Schnittstellen, Abstraktionen
1. **Physische Sicht ist sekundär** – Lieferumfänge, Domänen, Realisierung
1. **Keine parallelen Hierarchien** – eine Struktur mit Facetten/Attributen

-----

## Strukturelemente

|Element     |Zweck                                |Verbindungen                 |
|------------|-------------------------------------|-----------------------------|
|**System**  |Wurzel, Spezifikationsgrenze         |—                            |
|**UseCase** |Außensicht: was wird gefordert       |Actor → System               |
|**Funktion**|Innensicht: Verhalten, Transformation|Funktion ↔ Funktion          |
|**Modul**   |Physische Realisierung               |Funktion → Modul (Allokation)|
|**Actor**   |Externe Schnittstelle                |Funktion ↔ Actor             |

-----

## Entscheidungsbaum: Nesting vs. Subsystem

```
Muss ich die internen Zusammenhänge spezifizieren?
│
├── JA → Nested Functions
│        (volle Gestaltungshoheit, interne Wirkketten modellieren)
│
└── NEIN → Subsystem (System-of-Systems)
          (nur Integration, Black Box, externe Schnittstellen)
```

### Kriterien für Nested Functions

- Du baust/spezifizierst die Interna
- Du definierst interne Datenflüsse
- Du musst reinzoomen um zu spezifizieren

### Kriterien für Subsystem

- Zugekauft, fremdes Team, existierendes System
- Nur Aggregation der Außenschnittstellen
- Keine Einsicht/Kontrolle über Interna nötig

-----

## Entscheidungsbaum: Subsystem-Bildung

```
Lohnt sich ein separates Subsystem?
│
├── Eigenständig spezifizierbar/testbar? ──────── JA ─┐
├── Wenige externe, viele interne Verbindungen? ─ JA ─┤
├── Anderer Lieferant/Team? ─────────────────────  JA ─┼→ SUBSYSTEM
├── Andere Technologiedomäne? ─────────────────── JA ─┤
├── Anderer Lebenszyklus? ─────────────────────── JA ─┘
│
└── Alles NEIN → Nested Functions ausreichend
```

**Faustregel:** Subsystem lohnt sich, wenn die Schnittstelle einfacher ist als die Interna.

-----

## Actor vs. Subsystem

**Kernunterscheidung nach Perspektive:**

|Perspektive             |Sicht            |Element      |Bedeutung                                           |
|------------------------|-----------------|-------------|----------------------------------------------------|
|**Von innen nach außen**|Systemgrenze     |**Actor**    |Was mein System sieht – Schnittstelle, kein Einblick|
|**Von oben nach unten** |SoS-Dekomposition|**Subsystem**|Was das Muttersystem sieht – integrierbarer Baustein|

**Regel:** Ein Subsystem wird zum Actor, sobald du es von einem Nachbarsystem aus betrachtest.

-----

## Actor-Typen

|Typ                |Beschreibung                                               |Aggregation                                 |
|-------------------|-----------------------------------------------------------|--------------------------------------------|
|**Schwestersystem**|Subsystem im gleichen Muttersystem – aus meiner Sicht Actor|Wird auf Mutterebene als Subsystem aufgelöst|
|**Externes System**|Cloud Service, Fremdsystem, außerhalb SoS-Grenze           |Bleibt extern                               |
|**Echter Akteur**  |Mensch, Organisation, Umwelt                               |Bleibt extern                               |

**Regel:** Actor = alles außerhalb deiner Spezifikationshoheit, das Funktionen triggert oder getriggert wird.

Die Unterscheidung (Schwester/Extern/Mensch) ist ein **Attribut**, keine separate Struktur.

-----

## Verbindungsregeln

1. **Funktionale Verbindungen** nur zwischen Funktionen (nicht zwischen Systemen/Subsystemen direkt)
1. **System-zu-System-Kanten** nur als abgeleitete Aggregation (berechnete View)
1. **Allokation** verbindet Funktionen mit Modulen
1. **Physische Schnittstellen** verbinden Module untereinander

-----

## Aggregation im System-of-Systems

```
Muttersystem
├── Subsystem A (dein System)
│   └── Actors → Schnittstellen nach außen
├── Subsystem B (Schwestersystem)
│   └── Actors → Schnittstellen nach außen
└── Aggregierte Verbindungen
    └── A.Actor ←→ B.Actor (intern aufgelöst)
```

Das Muttersystem aggregiert die Actor-Verbindungen seiner Kinder als interne Systemverbindungen.

-----

## INCOSE Compliance

Dieses Regelwerk ist eine **pragmatische Profilierung** des INCOSE Systems Engineering Handbook.

**Konform mit INCOSE:**

- Funktionale Sicht als primäre Dekomposition
- Trennung Funktion vs. physische Realisierung (Modul)
- Allokation Funktion → Modul
- System-of-Systems Aggregation
- Actors als externe Interface-Partner

**Vereinfachungen gegenüber INCOSE:**

|INCOSE Standard                                     |Dieses Modell                                 |Begründung                        |
|----------------------------------------------------|----------------------------------------------|----------------------------------|
|Logical + Physical Architecture als separate Sichten|Eine Struktur mit Attributen                  |Vermeidet redundante Hierarchien  |
|“Logical Element” als eigener Typ                   |Nested Functions                              |Gleiche Funktion, weniger Konzepte|
|Actor nur im UseCase-Kontext                        |Actor als generelle Systemgrenze              |Konsistente Außensicht            |
|Subsystem = struktureller Teil                      |Subsystem = Integration ohne Gestaltungshoheit|Schärfere Entscheidungsregel      |

**Referenz:** INCOSE Systems Engineering Handbook, 5th Edition – “Tailor the processes to meet the needs of the project.”

-----

## Optimierungsregeln

### Strukturübersicht

```
Funktionale Sicht:    System → Function → Function
Physische Sicht:      System → Module → Module
Wirkkette:            Actor → Function(s) → Actor
```

### Optimierungsziele

|Ziel                          |Regel                                                                |Begründung                                           |
|------------------------------|---------------------------------------------------------------------|-----------------------------------------------------|
|**Allokations-Kohärenz**      |Je höher die Übereinstimmung Funktion ↔ Modul, desto besser          |Reduziert Cross-Cutting, vereinfacht Test und Wartung|
|**Kopplung minimieren**       |Je weniger funktionale Verbindungen zwischen Funktionen, desto besser|Loose Coupling, unabhängige Entwicklung              |
|**Schnittstellen-Homogenität**|Je weniger unterschiedliche Verbindungsformate, desto besser         |Reduziert Integrationsaufwand                        |

### Trade-offs

```
Schnittstellen-Komplexität
│
├── Wenige Verbindungen, komplexe Daten
│   → Einfache Topologie, schwierige Datenverträge
│
└── Viele Verbindungen, einfache Daten
    → Komplexe Topologie, triviale Datenverträge
```

**Faustregel:** Minimiere das Produkt aus Anzahl Verbindungen × Datenformat-Varianten.

### Qualitätsindikatoren

> **Hinweis:** Diese Werte sind Richtwerte aus Software Engineering Literatur. Sie dienen als Ausgangspunkt und sollten projektspezifisch kalibriert werden.

|Indikator                  |Richtwert |Quelle                                                                                          |
|---------------------------|----------|------------------------------------------------------------------------------------------------|
|Fan-out pro Funktion/Klasse|≤7        |McConnell, Code Complete (2004): “High fan-out (more than about seven) indicates overly complex”|
|LCOM4 (Kohäsion)           |=1 optimal|Chidamber & Kemerer (1994): LCOM4=1 bedeutet eine Verantwortlichkeit                            |
|Cyclomatic Complexity      |≤10       |Industrie-Standard, McCabe (1976)                                                               |
|Instabilität (I)           |0–1 Skala |Fenton & Melton: I = Fan-out / (Fan-in + Fan-out), näher 0 = stabiler                           |

**Allgemeine Prinzipien (recherchiert):**

- **High Fan-in, Low Fan-out** ist das Ideal (Card & Glass 1990, Basili et al. 1996)
- **Kohäsion und Kopplung** korrelieren: hohe Kohäsion → loose Coupling (Constantine & Yourdon 1979)
- **INCOSE** gibt keine konkreten Schwellwerte vor – bewusst domänenunabhängig

**Projektspezifische Kalibrierung empfohlen:**

1. Eigene Systemdaten analysieren (z.B. Neo4j-Graph-Metriken)
1. Korrelation mit Integrationsproblemen suchen
1. Eigene Schwellwerte aus Erfahrung ableiten

### Entscheidungsbaum: Allokation optimieren

```
Funktion verteilt auf mehrere Module?
│
├── JA → Prüfen: Lässt sich Funktion splitten?
│        ├── JA → Splitten, sauber allokieren
│        └── NEIN → Cross-Cutting akzeptieren, Schnittstelle definieren
│
└── NEIN → Optimal
```

```
Modul enthält viele unzusammenhängende Funktionen?
│
├── JA → Prüfen: Modul aufteilen oder Funktionen umgruppieren
│
└── NEIN → Optimal
```