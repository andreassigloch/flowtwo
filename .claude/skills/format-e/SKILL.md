---
name: format-e
description: Convert any input (text, lists, tables, diagrams) to GraphEngine-importable Format E
version: 1.0.0
author: andreas@siglochconsulting
tags: [format-e, conversion, import, graph, testdata]
---

# Format E Conversion Skill

Convert ANY structured input into GraphEngine-importable Format E text files.

## When to Use

- Converting text descriptions to graph structures
- Transforming tables/CSV to nodes and edges
- Creating test data from example scenarios
- Importing diagrams described in natural language
- Building graphs from bullet lists or hierarchies

## Quick Reference

### Output Format
```
## Nodes
Name|Type|SemanticId|Description

## Edges
SourceId -cp-> TargetId
```

### Node Types
| Type | Use For |
|------|---------|
| SYS | System boundary (always one root) |
| FUNC | Functions, operations, actions |
| REQ | Requirements, constraints |
| UC | Use cases, scenarios |
| MOD | Modules, components, parts |
| ACTOR | External entities, users, systems |
| FLOW | Data flows, messages |
| FCHAIN | Function chains, workflows |
| TEST | Test cases |
| SCHEMA | Global definitions |

### Edge Types
| Arrow | Meaning |
|-------|---------|
| `-cp->` | Contains/composes (hierarchy) |
| `-io->` | Data flow (input/output) |
| `-sat->` | Satisfies (requirement) |
| `-ver->` | Verifies (test) |
| `-alc->` | Allocates to (module) |
| `-rel->` | Generic relation |

## Conversion Examples

### From: Natural Language Description
**Input:**
> "The OrderSystem has three functions: ValidateOrder checks input,
> CheckInventory verifies stock, ConfirmOrder sends confirmation.
> Data flows from validation through inventory to confirmation."

**Output:**
```
## Nodes
OrderSystem|SYS|sys1|Order processing system
ValidateOrder|FUNC|func1|Checks input
CheckInventory|FUNC|func2|Verifies stock
ConfirmOrder|FUNC|func3|Sends confirmation

## Edges
sys1 -cp-> func1, func2, func3
func1 -io-> func2
func2 -io-> func3
```

### From: Bullet List Hierarchy
**Input:**
```
- Vehicle Control System
  - Navigation
    - Route Planning
    - GPS Tracking
  - Safety
    - Collision Detection
    - Emergency Brake
```

**Output:**
```
## Nodes
VehicleControlSystem|SYS|sys1|Vehicle Control System
Navigation|FUNC|nav1|Navigation subsystem
RoutePlanning|FUNC|route1|Route Planning
GPSTracking|FUNC|gps1|GPS Tracking
Safety|FUNC|safety1|Safety subsystem
CollisionDetection|FUNC|coll1|Collision Detection
EmergencyBrake|FUNC|brake1|Emergency Brake

## Edges
sys1 -cp-> nav1, safety1
nav1 -cp-> route1, gps1
safety1 -cp-> coll1, brake1
```

### From: Table/CSV
**Input:**
```
ID,Name,Type,Parent
S1,SmartHome,System,
F1,Lighting,Function,S1
F2,Climate,Function,S1
F3,DimLights,Function,F1
```

**Output:**
```
## Nodes
SmartHome|SYS|S1|SmartHome system
Lighting|FUNC|F1|Lighting control
Climate|FUNC|F2|Climate control
DimLights|FUNC|F3|Dim lights function

## Edges
S1 -cp-> F1, F2
F1 -cp-> F3
```

### From: Workflow/Sequence
**Input:**
> "User submits order → System validates → Payment processed → Confirmation sent to User"

**Output:**
```
## Nodes
OrderWorkflow|FCHAIN|wf1|Order processing workflow
User|ACTOR|user1|External user
SubmitOrder|FUNC|f1|Submit order action
ValidateOrder|FUNC|f2|Validate order
ProcessPayment|FUNC|f3|Process payment
SendConfirmation|FUNC|f4|Send confirmation

## Edges
wf1 -cp-> user1, f1, f2, f3, f4
user1 -io-> f1
f1 -io-> f2
f2 -io-> f3
f3 -io-> f4
f4 -io-> user1
```

### From: Requirements List
**Input:**
```
REQ-001: System shall process 1000 orders/hour
REQ-002: Response time < 200ms
REQ-003: 99.9% availability
```

**Output:**
```
## Nodes
PerformanceRequirements|SYS|sys1|Performance requirements
Throughput|REQ|req1|System shall process 1000 orders/hour
ResponseTime|REQ|req2|Response time < 200ms
Availability|REQ|req3|99.9% availability

## Edges
sys1 -cp-> req1, req2, req3
```

## Conversion Rules

### SemanticId Generation
- Use short, meaningful IDs: `sys1`, `func1`, `req1`
- Keep consistent pattern within document
- Avoid spaces and special characters

### Type Selection
1. **Root element** → SYS (always exactly one)
2. **Actions/verbs** → FUNC
3. **"The system shall..."** → REQ
4. **External parties** → ACTOR
5. **Data/messages** → FLOW
6. **Sequences/processes** → FCHAIN

### Edge Selection
1. **Parent-child/containment** → `-cp->`
2. **Data flowing between** → `-io->`
3. **"satisfies requirement"** → `-sat->`
4. **"tests/verifies"** → `-ver->`

### 1:N Syntax (Efficiency)
```
# Instead of:
sys1 -cp-> func1
sys1 -cp-> func2
sys1 -cp-> func3

# Write:
sys1 -cp-> func1, func2, func3
```

## Validation Checklist

Before saving Format E file:

- [ ] Has `## Nodes` section marker
- [ ] Has `## Edges` section marker
- [ ] Exactly ONE SYS node (root)
- [ ] All edge targets exist as nodes
- [ ] No duplicate SemanticIds
- [ ] Pipe `|` separates fields (not spaces/tabs)
- [ ] Arrows use correct syntax (`-cp->` not `->`)

## Test Import

```bash
# In GraphEngine terminal
/import path/to/file.txt
/status  # Should show node/edge counts
```

## Files

- **Parser:** `src/shared/parsers/format-e-parser.ts`
- **Test Data:** `eval/testdata/*.txt`
