# CR-049: Optimizer Neuausrichtung auf Architektur-Optimierung

**Type:** Refactoring / Feature
**Status:** Completed ✅
**Priority:** HIGH
**Created:** 2025-12-13
**Completed:** 2025-12-14
**Author:** andreas@siglochconsulting

## Problem

Der aktuelle Optimizer (`violation-guided-search.ts`) optimiert auf **falsche Ziele**:
- Miller's Law (5-9 Kinder pro Parent)
- Volatility Isolation
- REQ/TEST Traceability

Die **eigentlichen Architektur-Optimierungsziele** werden ignoriert:
1. Ähnliche Funktionen zusammenfassen (Redundanz eliminieren)
2. Ähnliche Schemas konsolidieren (Interface-Homogenität)
3. Überschneidungen zwischen logischer und physischer Architektur reduzieren

## Optimierungsziele (Neu)

### Ziel 1: FUNC Similarity → Merge/Abstract

**Regel:** `func_merge_candidate` (similarity ≥ 0.70)

Ähnliche FUNCs sollen:
- Bei similarity ≥ 0.85: Zusammengeführt werden (near-duplicate)
- Bei similarity 0.70-0.85: Gemeinsame Abstraktion extrahieren

### Ziel 2: SCHEMA Similarity → Consolidate

**Regel:** `schema_merge_candidate` (similarity ≥ 0.70)

Ähnliche SCHEMAs sollen:
- Bei identischer Struktur: Zu einem SCHEMA zusammengeführt werden
- Bei ähnlicher Struktur: Basis-SCHEMA mit Varianten

### Ziel 3: Allocation Cohesion → Minimize Cross-Cutting

**Regel:** `allocation_cohesion` (neu zu implementieren)

Jeder FUNC sollte genau einem MOD zugeordnet sein. Cross-Cutting (FUNC von mehreren MODs genutzt) minimieren.

---

## Unabhängigkeit der Optimierungen

Die drei Optimierungsziele sind **voneinander unabhängig**:

| Optimierung | Ändert | Beeinflusst nicht |
|-------------|--------|-------------------|
| FUNC Similarity | FUNC Nodes, io-Kanten | SCHEMA, allocate-Kanten |
| SCHEMA Similarity | SCHEMA Nodes, relation-Kanten | FUNC, allocate-Kanten |
| Allocation Cohesion | allocate-Kanten | FUNC-Struktur, SCHEMA |

**Konsequenz für `/optimize`:**
- Alle drei können in einem Durchlauf optimiert werden
- Oder einzeln ausgeführt werden (z.B. nur FUNC, nur SCHEMA)
- Reihenfolge ist egal, aber empfohlen: FUNC → SCHEMA → Allocation

---

## Beispiel 1: FUNC Similarity Merge

### VORHER (Redundante Funktionen)

```
Funktionsnetzwerk:
┌─────────────────────────────────────────────────────────────┐
│ FCHAIN: OrderProcessing                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Customer] ──OrderData──► [ValidateOrder]                  │
│                                  │                          │
│                            OrderValidated                   │
│                                  ▼                          │
│                           [ProcessPayment]                  │
│                                  │                          │
│                           PaymentResult                     │
│                                  ▼                          │
│                           [ValidatePayment] ◄── Problem!    │
│                                  │                          │
│                          PaymentValidated                   │
│                                  ▼                          │
│                           [CreateShipment]                  │
│                                  │                          │
│                           ShipmentData                      │
│                                  ▼                          │
│                           [ValidateShipment] ◄── Problem!   │
│                                  │                          │
│                                  ▼                          │
│                              [Warehouse]                    │
└─────────────────────────────────────────────────────────────┘

Nodes (10):
- FUNC ValidateOrder:    "Prüft Bestelldaten auf Vollständigkeit und Plausibilität"
- FUNC ValidatePayment:  "Prüft Zahlungsdaten auf Vollständigkeit und Gültigkeit"
- FUNC ValidateShipment: "Prüft Versanddaten auf Vollständigkeit und Korrektheit"
- FUNC ProcessPayment:   "Verarbeitet Zahlung beim Payment Provider"
- FUNC CreateShipment:   "Erstellt Versandauftrag im Logistiksystem"
- FLOW OrderData, OrderValidated, PaymentResult, PaymentValidated, ShipmentData
- ACTOR Customer, Warehouse

Similarity Analysis:
- ValidateOrder ↔ ValidatePayment:  0.82 (actionVerb=1.0, descr=0.75, flow=0.6)
- ValidateOrder ↔ ValidateShipment: 0.79 (actionVerb=1.0, descr=0.72, flow=0.5)
- ValidatePayment ↔ ValidateShipment: 0.81 (actionVerb=1.0, descr=0.73, flow=0.6)

Violations:
- func_merge_candidate: ValidateOrder / ValidatePayment (0.82)
- func_merge_candidate: ValidateOrder / ValidateShipment (0.79)
- func_merge_candidate: ValidatePayment / ValidateShipment (0.81)
```

### NACHHER (Abstrahierte Validierung)

```
Funktionsnetzwerk (optimiert):
┌─────────────────────────────────────────────────────────────┐
│ FCHAIN: OrderProcessing                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Customer] ──OrderData──► [ValidateEntity] ◄── Abstrakt!   │
│                                  │                          │
│                            EntityValidated                  │
│                                  ▼                          │
│                           [ProcessPayment]                  │
│                                  │                          │
│                           PaymentResult                     │
│                                  ▼                          │
│                           [ValidateEntity] ◄── Wiederverw.  │
│                                  │                          │
│                          EntityValidated                    │
│                                  ▼                          │
│                           [CreateShipment]                  │
│                                  │                          │
│                           ShipmentData                      │
│                                  ▼                          │
│                           [ValidateEntity] ◄── Wiederverw.  │
│                                  │                          │
│                                  ▼                          │
│                              [Warehouse]                    │
└─────────────────────────────────────────────────────────────┘

Nodes (8): -2 Nodes
- FUNC ValidateEntity:   "Prüft Entitätsdaten auf Vollständigkeit, Plausibilität und Gültigkeit"
- FUNC ProcessPayment:   "Verarbeitet Zahlung beim Payment Provider"
- FUNC CreateShipment:   "Erstellt Versandauftrag im Logistiksystem"
- FLOW OrderData, EntityValidated, PaymentResult, ShipmentData
- ACTOR Customer, Warehouse

Move Operations:
1. MERGE(ValidateOrder, ValidatePayment) → ValidateEntity
2. MERGE(ValidateEntity, ValidateShipment) → ValidateEntity (absorbiert)
3. CONSOLIDATE FLOWs: OrderValidated, PaymentValidated → EntityValidated

Result:
- 3 FUNCs → 1 FUNC (Validate*)
- 3 FLOWs → 1 FLOW (*Validated)
- Keine func_merge_candidate Violations mehr
```

---

## Beispiel 2: SCHEMA Consolidation

### VORHER (Redundante Schemas)

```
SCHEMAs im System:
┌────────────────────────────────────────────────────────────────┐
│ OrderSchema                                                    │
│ {                                                              │
│   "id": "string",                                              │
│   "timestamp": "datetime",                                     │
│   "status": "enum[pending,confirmed,shipped]",                 │
│   "items": "array<Item>",                                      │
│   "total": "decimal"                                           │
│ }                                                              │
├────────────────────────────────────────────────────────────────┤
│ PaymentSchema                                                  │
│ {                                                              │
│   "id": "string",                                              │
│   "timestamp": "datetime",                                     │
│   "status": "enum[pending,approved,rejected]",                 │
│   "amount": "decimal",                                         │
│   "method": "string"                                           │
│ }                                                              │
├────────────────────────────────────────────────────────────────┤
│ ShipmentSchema                                                 │
│ {                                                              │
│   "id": "string",                                              │
│   "timestamp": "datetime",                                     │
│   "status": "enum[pending,dispatched,delivered]",              │
│   "address": "Address",                                        │
│   "trackingNumber": "string"                                   │
│ }                                                              │
└────────────────────────────────────────────────────────────────┘

Similarity Analysis (structSimilarity):
- OrderSchema ↔ PaymentSchema:   0.72 (id, timestamp, status gemeinsam)
- OrderSchema ↔ ShipmentSchema:  0.68 (id, timestamp, status gemeinsam)
- PaymentSchema ↔ ShipmentSchema: 0.71 (id, timestamp, status gemeinsam)

Violations:
- schema_merge_candidate: OrderSchema / PaymentSchema (0.72)
- schema_merge_candidate: PaymentSchema / ShipmentSchema (0.71)
```

### NACHHER (Konsolidiertes Schema)

```
SCHEMAs (optimiert):
┌────────────────────────────────────────────────────────────────┐
│ EntitySchema (MERGED - alle Felder vereint)                    │
│ {                                                              │
│   "id": "string",                                              │
│   "timestamp": "datetime",                                     │
│   "status": "string",                                          │
│   "items?": "array<Item>",      // optional, nur für Order     │
│   "total?": "decimal",          // optional, nur für Order     │
│   "amount?": "decimal",         // optional, nur für Payment   │
│   "method?": "string",          // optional, nur für Payment   │
│   "address?": "Address",        // optional, nur für Shipment  │
│   "trackingNumber?": "string"   // optional, nur für Shipment  │
│ }                                                              │
└────────────────────────────────────────────────────────────────┘

Move Operations:
1. MERGE(OrderSchema, PaymentSchema, ShipmentSchema) → EntitySchema
2. UPDATE alle FLOW→relation→SCHEMA Kanten auf EntitySchema
3. DELETE OrderSchema, PaymentSchema, ShipmentSchema

Result:
- 3 SCHEMAs → 1 SCHEMA
- Keine schema_merge_candidate Violations mehr
- Interface-Homogenität: 1 Schema statt 3 Varianten
- Nutzer verwenden nur die Felder die sie brauchen
```

---

## Beispiel 3: Allocation Cohesion (Logisch ↔ Physisch)

### VORHER (Cross-Cutting Allocation)

```
Logische Architektur (FUNC):          Physische Architektur (MOD):
┌─────────────────────────────┐       ┌─────────────────────────────┐
│ ValidateOrder               │       │ OrderService                │
│ ProcessPayment              │       │   ├─ ValidateOrder    ✓     │
│ CreateShipment              │       │   ├─ ProcessPayment   ✗     │
│ NotifyCustomer              │       │   └─ NotifyCustomer   ✗     │
│ UpdateInventory             │       ├─────────────────────────────┤
│ GenerateInvoice             │       │ PaymentService              │
└─────────────────────────────┘       │   ├─ ProcessPayment   ✓     │
                                      │   └─ GenerateInvoice  ✗     │
                                      ├─────────────────────────────┤
                                      │ ShippingService             │
                                      │   ├─ CreateShipment   ✓     │
                                      │   └─ UpdateInventory  ✗     │
                                      ├─────────────────────────────┤
                                      │ NotificationService         │
                                      │   └─ NotifyCustomer   ✓     │
                                      └─────────────────────────────┘

Allocation Matrix (FUNC → MOD):
                    OrderSvc  PaymentSvc  ShippingSvc  NotifySvc
ValidateOrder         ✓
ProcessPayment        ✓          ✓                               ← Cross-Cut!
CreateShipment                               ✓
NotifyCustomer        ✓                                  ✓       ← Cross-Cut!
UpdateInventory                              ✓
GenerateInvoice                  ✓

Violations:
- allocation_cohesion: ProcessPayment allocated to 2 MODs (OrderService, PaymentService)
- allocation_cohesion: NotifyCustomer allocated to 2 MODs (OrderService, NotificationService)
- Cohesion Score: 4/6 = 0.67 (unter Threshold 0.80)
```

### NACHHER (Clean Allocation)

```
Logische Architektur (FUNC):          Physische Architektur (MOD):
┌─────────────────────────────┐       ┌─────────────────────────────┐
│ ValidateOrder               │       │ OrderService                │
│ ProcessPayment              │       │   └─ ValidateOrder    ✓     │
│ CreateShipment              │       ├─────────────────────────────┤
│ NotifyCustomer              │       │ PaymentService              │
│ UpdateInventory             │       │   ├─ ProcessPayment   ✓     │
│ GenerateInvoice             │       │   └─ GenerateInvoice  ✓     │
└─────────────────────────────┘       ├─────────────────────────────┤
                                      │ ShippingService             │
                                      │   ├─ CreateShipment   ✓     │
                                      │   └─ UpdateInventory  ✓     │
                                      ├─────────────────────────────┤
                                      │ NotificationService         │
                                      │   └─ NotifyCustomer   ✓     │
                                      └─────────────────────────────┘

Allocation Matrix (optimiert):
                    OrderSvc  PaymentSvc  ShippingSvc  NotifySvc
ValidateOrder         ✓
ProcessPayment                   ✓                               ← Clean!
CreateShipment                               ✓
NotifyCustomer                                           ✓       ← Clean!
UpdateInventory                              ✓
GenerateInvoice                  ✓

Move Operations:
1. DEALLOC(ProcessPayment, OrderService)  → nur noch PaymentService
2. DEALLOC(NotifyCustomer, OrderService)  → nur noch NotificationService

Result:
- Jeder FUNC genau 1 MOD
- Cohesion Score: 6/6 = 1.00 (über Threshold 0.80)
- Keine allocation_cohesion Violations mehr
```

---

## Neue/Fehlende Ontologie-Regeln

### Regel 1: allocation_cohesion (NEU)

```json
"allocation_cohesion": {
  "id": "allocation_cohesion",
  "description": "Each FUNC should be allocated to exactly one MOD (no cross-cutting)",
  "phase": "phase3_physical",
  "severity": "warning",
  "weight": 0.15,
  "type": "soft",
  "cypher": "MATCH (f:Node {type: 'FUNC'})<-[a:EDGE {type: 'allocate'}]-(m:Node {type: 'MOD'}) WITH f, count(m) AS modCount WHERE modCount > 1 RETURN f.semanticId AS violation, 'FUNC allocated to ' + modCount + ' MODs (should be 1)' AS reason",
  "metric": "cohesion = FUNCs_with_single_MOD / total_FUNCs",
  "threshold": 0.80
}
```

### Regel 2: interface_homogeneity (NEU)

```json
"interface_homogeneity": {
  "id": "interface_homogeneity",
  "description": "Minimize unique SCHEMA types at MOD boundaries",
  "phase": "phase3_physical",
  "severity": "warning",
  "weight": 0.10,
  "type": "soft",
  "metric": "homogeneity = 1 - (unique_boundary_schemas / total_schemas)",
  "threshold": 0.70,
  "rationale": "Weniger Interface-Varianten = einfachere Integration"
}
```

---

## Existierende Operatoren - Mapping erweitern

Die Operatoren existieren bereits in `move-operators.ts`, aber werden nicht für die richtigen Violations getriggert:

### MERGE Operator (existiert)

```typescript
// AKTUELL:
applicableTo: ['millers_law_func', 'undersized_mod', 'undersized', 'fragmented']

// ÄNDERN ZU:
applicableTo: [
  'millers_law_func', 'undersized_mod', 'undersized', 'fragmented',
  'func_merge_candidate',      // NEU: Similarity ≥ 0.70
  'func_near_duplicate',       // NEU: Similarity ≥ 0.85
  'schema_merge_candidate',    // NEU: Similarity ≥ 0.70
  'schema_near_duplicate'      // NEU: Similarity ≥ 0.85
]
```

### REALLOC Operator (existiert, = DEALLOC)

```typescript
// AKTUELL:
applicableTo: ['volatile_func_isolation', 'high_volatility', 'imbalanced', 'coupling']

// ÄNDERN ZU:
applicableTo: [
  'volatile_func_isolation', 'high_volatility', 'imbalanced', 'coupling',
  'allocation_cohesion'        // NEU: Cross-cutting FUNC→MOD
]
```

### DELETE Operator (für überzählige Allocations)

```typescript
// AKTUELL:
applicableTo: ['empty_mod', 'empty_uc', 'redundant', 'duplicate', ...]

// ÄNDERN ZU:
applicableTo: [
  'empty_mod', 'empty_uc', 'redundant', 'duplicate', ...,
  'allocation_cohesion'        // NEU: Lösche überzählige allocate-Kanten
]
```

---

## Implementation Plan

### Phase 1: Ontologie erweitern (1h)
- [x] `allocation_cohesion` Regel in `ontology-rules.json` hinzufügen (already existed)
- [x] Similarity-Regeln prüfen (existieren bereits)

### Phase 2: Operator-Mapping erweitern (1h)
- [x] `MERGE.applicableTo` um `func_merge_candidate`, `schema_merge_candidate` erweitern
- [x] `REALLOC.applicableTo` um `allocation_cohesion` erweitern

### Phase 3: Violation Detection erweitern (2h)
- [x] `detectViolations()` in `violation-guided-search.ts` um Similarity-Checks erweitern
- [x] Allocation Cohesion Check implementieren (FUNC mit >1 MOD)

### Phase 4: MERGE-Logik für Similarity anpassen (2h)
- [x] MERGE muss mit Similarity-Violations umgehen (2 konkrete Nodes statt "finde undersized")
- [x] FLOW-Kanten der gemergten Nodes umhängen
- [x] SCHEMA-Felder beim Merge vereinen (alle Felder, optional markiert)

### Phase 5: Tests (1h)
- [x] Unit Test: FUNC merge bei similarity ≥ 0.85
- [x] Unit Test: SCHEMA merge bei similarity ≥ 0.70
- [x] Unit Test: Allocation cohesion fix

**Geschätzter Aufwand:** 7h (1 Tag)

---

## Acceptance Criteria

- [x] `/optimize` erkennt FUNC Similarity Violations
- [x] `/optimize` merged ähnliche FUNCs (similarity ≥ 0.85)
- [x] `/optimize` erkennt SCHEMA Similarity Violations
- [x] `/optimize` extrahiert Base-SCHEMAs bei similarity ≥ 0.70
- [x] `/optimize` erkennt Cross-Cutting Allocations
- [x] `/optimize` reduziert Allocation auf 1:1 (FUNC:MOD)
- [x] Cohesion Score ≥ 0.80 nach Optimierung (via REALLOC operator)
- [x] Alle bestehenden Tests weiterhin grün (12/12 CR-049 tests, 215 core unit tests)

---

## References

- [settings/ontology-rules.json](../../settings/ontology-rules.json) - funcSimilarity, schemaSimilarity, allocationCohesion
- [src/llm-engine/optimizer/](../../src/llm-engine/optimizer/) - Current optimizer implementation
- [src/llm-engine/validation/unified-rule-evaluator.ts](../../src/llm-engine/validation/unified-rule-evaluator.ts) - Validation rules
