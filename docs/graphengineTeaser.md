# GraphEngine - KI-gestützte Systemmodellierung

## Das Konzept

GraphEngine demonstriert, wie **strukturierte Daten, Ontologien und KI** zusammenwirken können, um komplexe Planungsaufgaben zu unterstützen.

---

## Die drei Säulen

### 1. Ontologie als Wissensbasis

Eine formale Beschreibung, welche Elemente es gibt und wie sie zusammenhängen dürfen:

- **Knotentypen**: System, Anwendungsfall, Anforderung, Funktion, Modul, Test
- **Beziehungstypen**: erfüllt, enthält, verbindet, testet
- **Regeln**: "Jede Anforderung muss von mindestens einer Funktion erfüllt werden"

Die Ontologie definiert die Spielregeln - die KI hält sich daran.

### 2. Graph-Datenbank als Gedächtnis

Alle Informationen werden als **vernetzter Graph** gespeichert:

- Knoten = Dinge (Anforderungen, Funktionen, Module)
- Kanten = Beziehungen zwischen Dingen
- Eigenschaften = Details zu jedem Element

Der Graph macht Zusammenhänge sichtbar, die in Listen oder Tabellen untergehen.

### 3. KI als Assistent

Große Sprachmodelle (LLMs) übersetzen zwischen Mensch und Maschine:

- **Eingabe**: Natürliche Sprache → strukturierte Graph-Operationen
- **Prüfung**: Jede KI-Antwort wird gegen die Ontologie-Regeln validiert
- **Lernen**: Das System merkt sich, welche Aktionen zu guten Ergebnissen führten

---

## Was diesen Ansatz besonders macht

### Regelbasierte KI-Kontrolle

Die KI arbeitet nicht frei, sondern innerhalb definierter Grenzen:

```
Benutzer: "Füge eine Funktion hinzu"
     ↓
KI generiert Vorschlag
     ↓
Ontologie-Prüfung: Ist das erlaubt? Fehlt etwas?
     ↓
Nur valide Änderungen werden übernommen
```

Das verhindert typische KI-Halluzinationen bei strukturierten Daten.

### Automatische Qualitätssicherung

Das System prüft kontinuierlich gegen Industriestandards (INCOSE):

- Vollständigkeit (Sind alle Anforderungen abgedeckt?)
- Konsistenz (Gibt es Widersprüche?)
- Rückverfolgbarkeit (Was hängt wovon ab?)

### Lernfähigkeit

Nach jeder Interaktion:
1. Bewertung: War das Ergebnis gut?
2. Speicherung: Erfolgreiche Muster merken
3. Anpassung: Bei ähnlichen Aufgaben bessere Vorschläge

---

## Technische Bausteine

| Komponente | Funktion |
|------------|----------|
| **Format E** | Kompaktes Austauschformat für Graph-Änderungen |
| **AgentDB** | In-Memory-Datenschicht mit Versionierung |
| **Rule Evaluator** | Prüft Ontologie-Regeln in Echtzeit |
| **Variant Pool** | Testet KI-Vorschläge isoliert vor Übernahme |
| **Background Validator** | Kontinuierliche Qualitätsprüfung |

---

## Anwendungspotenzial

Der Ansatz "Ontologie + Graph + KI" ist übertragbar auf:

- **Produktentwicklung**: Anforderungen → Design → Komponenten
- **Prozessmodellierung**: Schritte → Abhängigkeiten → Ressourcen
- **Wissensmanagement**: Konzepte → Beziehungen → Schlussfolgerungen
- **Compliance**: Regeln → Prüfungen → Nachweise

---

## Status

**MVP** - Die Kernmechanismen funktionieren:
- Natürlichsprachliche Eingabe → Graph-Operationen
- Ontologie-validierte KI-Antworten
- Echtzeit-Qualitätsprüfung
- Grundlegendes Self-Learning

**Nächste Schritte**: Token-Optimierung, erweiterte Lernmechanismen, Visualisierung

---

*GraphEngine zeigt, wie KI durch strukturierte Wissensbasis und klare Regeln präziser und kontrollierbarer wird.*
