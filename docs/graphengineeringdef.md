# Graph Engineering Definitionen - Spezifikations-Beispiele

**Version:** 1.0  
**Datum:** 2025-11-14  
**Basis:** graphengineREQ_v2.md  
**Zweck:** Konkrete Formate, Regeln und Beispiele für Implementierung

---

## 1. Rendering-Ontologie Spezifikation

### 1.1 Schema: rendering_ontology.json

```json
{
  "version": "1.0.0",
  "description": "Rendering rules for ontology node types",
  "nodeTypes": {
    "SYS": {
      "symbol": "rounded-rectangle",
      "stereotype": "«system»",
      "portExtraction": "none",
      "isContainer": true,
      "canContain": ["SYS", "UC", "MOD"],
      "zoomLevels": {
        "L0": {
          "render": "icon",
          "icon": "system-icon",
          "size": {"width": 24, "height": 24}
        },
        "L1": {
          "render": "compact",
          "showLabel": true,
          "maxLabelLength": 10,
          "size": {"width": 80, "height": 40}
        },
        "L2": {
          "render": "block",
          "showStereotype": true,
          "showLabel": true,
          "showBoundary": true,
          "size": {"width": 150, "height": 60}
        },
        "L3": {
          "render": "detailed",
          "showContent": ["requirements"],
          "showAttributes": ["Name", "Descr"],
          "size": {"width": 200, "height": 100}
        },
        "L4": {
          "render": "expanded",
          "showChildren": true,
          "nestedLayout": true
        }
      },
      "styling": {
        "fillColor": "#E3F2FD",
        "strokeColor": "#1976D2",
        "strokeWidth": 2,
        "fontSize": 12,
        "fontFamily": "Arial"
      }
    },
    "UC": {
      "symbol": "ellipse",
      "stereotype": null,
      "portExtraction": "none",
      "isContainer": true,
      "canContain": ["FCHAIN", "ACTOR"],
      "actorConnections": "boundary-lines",
      "zoomLevels": {
        "L0": {
          "render": "icon",
          "icon": "usecase-icon",
          "size": {"width": 24, "height": 24}
        },
        "L1": {
          "render": "compact",
          "showLabel": true,
          "maxLabelLength": 15,
          "size": {"width": 100, "height": 50}
        },
        "L2": {
          "render": "ellipse",
          "showLabel": true,
          "size": {"width": 120, "height": 60}
        },
        "L3": {
          "render": "detailed",
          "showContent": ["requirements"],
          "size": {"width": 150, "height": 80}
        },
        "L4": {
          "render": "container",
          "showChildren": true,
          "nestedLayout": true,
          "shape": "rounded-rectangle"
        }
      },
      "styling": {
        "fillColor": "#FFF9C4",
        "strokeColor": "#F57F17",
        "strokeWidth": 2,
        "fontSize": 11,
        "fontFamily": "Arial"
      }
    },
    "FUNC": {
      "symbol": "rectangle",
      "stereotype": "«function»",
      "portExtraction": "fromFlowNodes",
      "isContainer": true,
      "canContain": ["FUNC"],
      "portPositions": {
        "input": "left",
        "output": "right"
      },
      "zoomLevels": {
        "L0": {
          "render": "icon",
          "icon": "function-icon",
          "size": {"width": 24, "height": 24}
        },
        "L1": {
          "render": "compact",
          "showLabel": true,
          "maxLabelLength": 10,
          "size": {"width": 80, "height": 40}
        },
        "L2": {
          "render": "block",
          "showStereotype": true,
          "showLabel": true,
          "showPorts": true,
          "portStyle": "small-circle",
          "size": {"width": 120, "height": 60}
        },
        "L3": {
          "render": "detailed",
          "showContent": ["requirements", "allocation"],
          "showPorts": true,
          "portStyle": "labeled",
          "portLabelPosition": "outside",
          "size": {"width": 160, "height": 80}
        },
        "L4": {
          "render": "expanded",
          "showChildren": true,
          "nestedLayout": true,
          "mode": "white-box"
        }
      },
      "styling": {
        "fillColor": "#C8E6C9",
        "strokeColor": "#388E3C",
        "strokeWidth": 2,
        "fontSize": 11,
        "fontFamily": "Arial",
        "stereotypeColor": "#1B5E20"
      },
      "portStyling": {
        "fillColor": "#FFFFFF",
        "strokeColor": "#388E3C",
        "size": 8,
        "labelColor": "#1B5E20",
        "labelFontSize": 9
      }
    },
    "FLOW": {
      "symbol": "none",
      "renderAsNode": false,
      "useAsPort": true,
      "portDefinition": {
        "labelSource": "Name",
        "tooltipAttributes": ["Type", "Pattern", "Validation"],
        "iconByType": {
          "sync": "sync-icon",
          "async": "async-icon",
          "stream": "stream-icon",
          "batch": "batch-icon"
        }
      }
    },
    "ACTOR": {
      "symbol": "stick-figure",
      "stereotype": null,
      "portExtraction": "fromFlowNodes",
      "isContainer": false,
      "boundaryElement": true,
      "zoomLevels": {
        "L0": {
          "render": "icon",
          "icon": "actor-icon",
          "size": {"width": 24, "height": 24}
        },
        "L1": {
          "render": "stick-figure",
          "showLabel": true,
          "labelPosition": "below",
          "size": {"width": 30, "height": 50}
        },
        "L2": {
          "render": "stick-figure",
          "showLabel": true,
          "labelPosition": "below",
          "size": {"width": 40, "height": 60}
        }
      },
      "styling": {
        "strokeColor": "#000000",
        "strokeWidth": 2,
        "fontSize": 10,
        "fontFamily": "Arial"
      }
    },
    "FCHAIN": {
      "symbol": "swimlane",
      "stereotype": "«chain»",
      "portExtraction": "fromFlowNodes",
      "isContainer": true,
      "canContain": ["FUNC", "FLOW", "ACTOR"],
      "zoomLevels": {
        "L1": {
          "render": "compact",
          "showLabel": true,
          "size": {"width": 100, "height": 40}
        },
        "L2": {
          "render": "swimlane",
          "showLabel": true,
          "orientation": "horizontal",
          "size": {"minWidth": 200, "minHeight": 100}
        },
        "L3": {
          "render": "detailed-swimlane",
          "showContent": true,
          "showChildren": true
        }
      },
      "styling": {
        "fillColor": "#F5F5F5",
        "strokeColor": "#757575",
        "strokeWidth": 1,
        "strokeStyle": "dashed",
        "fontSize": 11,
        "fontFamily": "Arial"
      }
    },
    "REQ": {
      "symbol": "rectangle",
      "stereotype": "«requirement»",
      "portExtraction": "none",
      "isContainer": false,
      "zoomLevels": {
        "L0": {
          "render": "icon",
          "icon": "requirement-icon"
        },
        "L1": {
          "render": "compact",
          "showLabel": true,
          "maxLabelLength": 15,
          "size": {"width": 100, "height": 40}
        },
        "L2": {
          "render": "block",
          "showStereotype": true,
          "showLabel": true,
          "showAttributes": ["Name"],
          "size": {"width": 140, "height": 60}
        },
        "L3": {
          "render": "detailed",
          "showAttributes": ["Name", "Descr"],
          "showContent": ["tests"],
          "size": {"width": 180, "height": 100}
        }
      },
      "styling": {
        "fillColor": "#FFECB3",
        "strokeColor": "#F57C00",
        "strokeWidth": 2,
        "fontSize": 10,
        "fontFamily": "Arial"
      }
    },
    "TEST": {
      "symbol": "rectangle",
      "stereotype": "«test»",
      "portExtraction": "none",
      "isContainer": false,
      "zoomLevels": {
        "L1": {
          "render": "compact",
          "showLabel": true,
          "showBadge": "status",
          "size": {"width": 80, "height": 35}
        },
        "L2": {
          "render": "block",
          "showStereotype": true,
          "showLabel": true,
          "showBadge": "status",
          "size": {"width": 120, "height": 50}
        }
      },
      "styling": {
        "fillColor": "#E1BEE7",
        "strokeColor": "#7B1FA2",
        "strokeWidth": 2,
        "fontSize": 10,
        "fontFamily": "Arial"
      },
      "badges": {
        "status": {
          "position": "top-right",
          "values": {
            "passed": {"icon": "check", "color": "#4CAF50"},
            "failed": {"icon": "cross", "color": "#F44336"},
            "pending": {"icon": "clock", "color": "#FF9800"}
          }
        }
      }
    },
    "MOD": {
      "symbol": "component-rectangle",
      "stereotype": "«module»",
      "portExtraction": "explicit",
      "isContainer": true,
      "canContain": ["FUNC"],
      "zoomLevels": {
        "L1": {
          "render": "compact",
          "showLabel": true,
          "size": {"width": 80, "height": 40}
        },
        "L2": {
          "render": "component",
          "showStereotype": true,
          "showLabel": true,
          "size": {"width": 120, "height": 60}
        },
        "L3": {
          "render": "detailed-component",
          "showContent": ["allocated-functions"],
          "size": {"width": 160, "height": 100}
        }
      },
      "styling": {
        "fillColor": "#B2DFDB",
        "strokeColor": "#00695C",
        "strokeWidth": 2,
        "fontSize": 11,
        "fontFamily": "Arial"
      }
    },
    "SCHEMA": {
      "symbol": "database-cylinder",
      "stereotype": "«schema»",
      "portExtraction": "none",
      "isContainer": false,
      "zoomLevels": {
        "L1": {
          "render": "icon",
          "icon": "schema-icon",
          "showLabel": true,
          "size": {"width": 60, "height": 40}
        },
        "L2": {
          "render": "database-symbol",
          "showLabel": true,
          "size": {"width": 80, "height": 60}
        },
        "L3": {
          "render": "detailed",
          "showAttributes": ["Name", "Struct"],
          "structFormat": "code-block",
          "size": {"width": 200, "height": 150}
        }
      },
      "styling": {
        "fillColor": "#BBDEFB",
        "strokeColor": "#1565C0",
        "strokeWidth": 2,
        "fontSize": 10,
        "fontFamily": "Courier New"
      }
    }
  },
  "edgeTypes": {
    "compose": {
      "style": "none",
      "renderAsEdge": false,
      "implicitByContainment": true,
      "note": "Darstellung durch Nested Boxes, keine explizite Linie"
    },
    "io": {
      "style": "solid-arrow",
      "routing": "orthogonal",
      "arrowHead": "filled-triangle",
      "label": "fromFlowNode",
      "labelPosition": "middle",
      "styling": {
        "strokeColor": "#616161",
        "strokeWidth": 2,
        "arrowSize": 8
      }
    },
    "satisfy": {
      "style": "dashed-arrow",
      "routing": "direct",
      "arrowHead": "open-triangle",
      "stereotype": "«satisfy»",
      "styling": {
        "strokeColor": "#FF6F00",
        "strokeWidth": 1.5,
        "strokeDashArray": [5, 3],
        "arrowSize": 8
      }
    },
    "verify": {
      "style": "dashed-arrow",
      "routing": "direct",
      "arrowHead": "open-triangle",
      "stereotype": "«verify»",
      "styling": {
        "strokeColor": "#7B1FA2",
        "strokeWidth": 1.5,
        "strokeDashArray": [5, 3],
        "arrowSize": 8
      }
    },
    "allocate": {
      "style": "solid-arrow",
      "routing": "direct",
      "arrowHead": "filled-diamond",
      "stereotype": "«allocate»",
      "styling": {
        "strokeColor": "#00695C",
        "strokeWidth": 2,
        "arrowSize": 10
      }
    },
    "relation": {
      "style": "solid-line",
      "routing": "direct",
      "arrowHead": "none",
      "styling": {
        "strokeColor": "#9E9E9E",
        "strokeWidth": 1
      }
    }
  }
}
```

---

## 2. Format E Spezifikation

### 2.1 Syntax-Definition (EBNF)

```ebnf
(* Format E - Graph Serialization Syntax *)

graph           = view_header nodes edges ;
view_header     = "## View-Context" LF view_type LF filter_def LF ;
view_type       = "Type:" identifier ;
filter_def      = "Filter:" node_list "|" edge_list ;

nodes           = "## Nodes" LF node_line* ;
node_line       = name "|" type "|" semantic_id [ "|" descr ] [ attributes ] LF ;

edges           = "## Edges" LF edge_line* ;
edge_line       = semantic_id operator semantic_id LF ;

(* Diff Extension *)
diff            = "<operations>" LF 
                  snapshot LF 
                  view_context LF 
                  diff_nodes 
                  diff_edges 
                  "</operations>" ;

snapshot        = "<base_snapshot>" semantic_id "@" version "</base_snapshot>" ;
view_context    = "<view_context>" identifier "</view_context>" ;

diff_nodes      = "## Nodes" LF diff_node_line* ;
diff_node_line  = diff_op node_line ;
diff_op         = "+" | "-" ;

diff_edges      = "## Edges" LF diff_edge_line* ;
diff_edge_line  = diff_op edge_line ;

(* Operators *)
operator        = "-cp->" | "-io->" | "-sf->" | "-vf->" | "-al->" | "-rl->" ;

(* Attributes *)
attributes      = "[" attribute_list "]" ;
attribute_list  = attribute ( "," attribute )* ;
attribute       = key ":" value ;

(* Tokens *)
name            = ALPHA ( ALPHA | DIGIT )* ;  (* PascalCase, max 25 chars *)
type            = "SYS" | "UC" | "FUNC" | "FLOW" | "REQ" | "TEST" | 
                  "MOD" | "ACTOR" | "FCHAIN" | "SCHEMA" ;
semantic_id     = name "." type_abbr "." counter ;
type_abbr       = "SY" | "UC" | "FN" | "FL" | "RQ" | "TS" | 
                  "MD" | "AC" | "FC" | "SC" ;
counter         = DIGIT DIGIT DIGIT ;
version         = DIGIT+ ;
identifier      = ALPHA ( ALPHA | DIGIT | "-" )* ;
descr           = TEXT ;  (* Any text, no pipe character *)
key             = ALPHA ( ALPHA | DIGIT )* ;
value           = TEXT | NUMBER ;

ALPHA           = ? Unicode letter ? ;
DIGIT           = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
TEXT            = ? Any text except newline and special chars ? ;
NUMBER          = DIGIT+ [ "." DIGIT+ ] ;
LF              = ? Line Feed character ? ;
```

### 2.2 Beispiel: Valide Syntax

```
## View-Context
Type: FunctionalFlow
Filter: UC,FUNC,ACTOR nodes | compose,io edges

## Nodes
CargoManagement|SYS|CargoManagement.SY.001
ManageFleet|UC|ManageFleet.UC.001 [x:200,y:100,zoom:L2]
OptimizeRoutes|FUNC|OptimizeRoutes.FN.001|Calculate optimal delivery routes [x:400,y:150,zoom:L3]
RouteData|FLOW|RouteData.FL.001|Route calculation results
Driver|ACTOR|Driver.AC.001

## Edges
CargoManagement.SY.001 -cp-> ManageFleet.UC.001
ManageFleet.UC.001 -cp-> OptimizeRoutes.FN.001
OptimizeRoutes.FN.001 -io-> RouteData.FL.001
RouteData.FL.001 -io-> Driver.AC.001
```

### 2.3 Beispiel: Diff-Format

```
<operations>
<base_snapshot>ManageFleet.UC.001@v42</base_snapshot>
<view_context>FunctionalFlow</view_context>

## Nodes
+ ValidateOrder|FUNC|ValidateOrder.FN.005|Validates customer orders [x:250,y:200,zoom:L2]
+ OrderData|FLOW|OrderData.FL.006|Order validation data
- ObsoleteFunc.FN.003
- OptimizeRoutes.FN.001|Calculate optimal delivery routes
+ OptimizeRoutes.FN.001|Enhanced route optimization with ML [x:400,y:150,zoom:L3]

## Edges
+ ManageFleet.UC.001 -cp-> ValidateOrder.FN.005
+ ValidateOrder.FN.005 -io-> OrderData.FL.006
+ OrderData.FL.006 -io-> OptimizeRoutes.FN.001
- ObsoleteFunc.FN.003 -cp-> Driver.AC.001
</operations>
```

### 2.4 Operator-Mapping

| Relationship | Operator | Beschreibung |
|--------------|----------|--------------|
| compose | `-cp->` | Komposition/Containment |
| io | `-io->` | Input/Output Flow |
| satisfy | `-sf->` | Satisfy Requirement |
| verify | `-vf->` | Verify Test |
| allocate | `-al->` | Allocate Function to Module |
| relation | `-rl->` | Generic Relation |

### 2.5 Semantic ID Format

**Pattern:** `{Name}.{TypeAbbr}.{Counter}`

**Type-Abbreviations:**
- SYS → SY
- UC → UC
- FUNC → FN
- FLOW → FL
- REQ → RQ
- TEST → TS
- MOD → MD
- ACTOR → AC
- FCHAIN → FC
- SCHEMA → SC

**Counter:** 3-stellig, zero-padded (001-999)

**Beispiele:**
- `ParseInput.FN.001`
- `UserAuthentication.UC.042`
- `PaymentData.FL.005`
- `SecurityRequirement.RQ.123`

---

## 3. View-Definitionen

### 3.1 Functional Flow View

**Datei:** `views/functional-flow.json`

```json
{
  "id": "functional-flow",
  "name": "Functional Flow View",
  "description": "Function network with data flow visualization",
  "layoutConfig": {
    "includeNodeTypes": ["UC", "FCHAIN", "FUNC", "ACTOR", "FLOW"],
    "includeRelTypes": ["compose", "io"],
    "excludeIsolated": false,
    "algorithm": "orthogonal",
    "algorithmParameters": {
      "direction": "left-to-right",
      "gridSize": 10,
      "nodeSpacing": 50,
      "edgeSpacing": 20,
      "portSpacing": 15,
      "minimizeCrossings": true,
      "edgeRouting": "manhattan"
    },
    "containerNodes": ["UC", "FCHAIN"],
    "containerParameters": {
      "padding": 30,
      "minSize": {"width": 200, "height": 150},
      "autoExpand": true
    },
    "constraints": {
      "portAlignment": true,
      "layerSeparation": 100,
      "aspectRatio": "16:9"
    }
  },
  "renderConfig": {
    "showNodes": ["UC", "FUNC", "ACTOR"],
    "hideNodes": ["FLOW"],
    "showEdges": ["io"],
    "hideEdges": ["compose"],
    "portRendering": "fromFlowNodes",
    "portStyle": "labeled",
    "edgeStyle": "orthogonal",
    "edgeLabels": "flowType",
    "containerStyle": "nested-boxes",
    "zoomLevels": {
      "default": "L2",
      "UC": "L2",
      "FUNC": "L3",
      "ACTOR": "L1"
    }
  },
  "interactionConfig": {
    "allowExpand": ["UC", "FUNC"],
    "allowCollapse": ["UC", "FUNC"],
    "expandMode": "progressive",
    "collapseMode": "black-box"
  }
}
```

### 3.2 System Hierarchy View

**Datei:** `views/hierarchy.json`

```json
{
  "id": "hierarchy",
  "name": "System Hierarchy View",
  "description": "System decomposition tree",
  "layoutConfig": {
    "includeNodeTypes": ["SYS", "UC", "MOD"],
    "includeRelTypes": ["compose"],
    "excludeIsolated": true,
    "algorithm": "reingold-tilford",
    "algorithmParameters": {
      "orientation": "top-down",
      "siblingSpacing": 60,
      "levelSpacing": 120,
      "subtreeSpacing": 80,
      "alignment": "center"
    },
    "containerNodes": [],
    "constraints": {
      "levelAlignment": true,
      "minimizeWidth": true
    }
  },
  "renderConfig": {
    "showNodes": ["SYS", "UC", "MOD"],
    "hideNodes": [],
    "showEdges": [],
    "hideEdges": ["compose"],
    "portRendering": "none",
    "edgeStyle": "none",
    "containerStyle": "nested-boxes",
    "zoomLevels": {
      "default": "L2",
      "SYS": "L2",
      "UC": "L1",
      "MOD": "L1"
    }
  },
  "interactionConfig": {
    "allowExpand": ["SYS", "UC", "MOD"],
    "allowCollapse": ["SYS", "UC", "MOD"],
    "expandMode": "subtree",
    "collapseMode": "recursive"
  }
}
```

### 3.3 Requirements Traceability View

**Datei:** `views/requirements.json`

```json
{
  "id": "requirements",
  "name": "Requirements Traceability View",
  "description": "Requirements flow from system to implementation",
  "layoutConfig": {
    "includeNodeTypes": ["SYS", "UC", "FUNC", "REQ", "TEST"],
    "includeRelTypes": ["satisfy", "verify"],
    "excludeIsolated": true,
    "algorithm": "sugiyama",
    "algorithmParameters": {
      "layerAssignment": "longest-path",
      "crossingReduction": "barycenter",
      "positionAssignment": "brandes-koepf",
      "layerSpacing": 100,
      "nodeSpacing": 50,
      "iterations": 20
    },
    "containerNodes": [],
    "constraints": {
      "layerConstraints": {
        "SYS": 0,
        "UC": 1,
        "FUNC": 2,
        "REQ": 3,
        "TEST": 4
      }
    }
  },
  "renderConfig": {
    "showNodes": ["SYS", "UC", "FUNC", "REQ", "TEST"],
    "hideNodes": [],
    "showEdges": ["satisfy", "verify"],
    "hideEdges": [],
    "portRendering": "none",
    "edgeStyle": "polyline",
    "edgeLabels": "stereotype",
    "containerStyle": "none",
    "zoomLevels": {
      "default": "L2",
      "REQ": "L3",
      "TEST": "L2"
    }
  },
  "interactionConfig": {
    "allowExpand": [],
    "allowCollapse": [],
    "highlightMode": "traceability-path"
  }
}
```

### 3.4 Allocation View

**Datei:** `views/allocation.json`

```json
{
  "id": "allocation",
  "name": "Physical Allocation View",
  "description": "Hardware/Software module allocation",
  "layoutConfig": {
    "includeNodeTypes": ["MOD", "FUNC"],
    "includeRelTypes": ["compose", "allocate"],
    "excludeIsolated": false,
    "algorithm": "nested-containment",
    "algorithmParameters": {
      "packingAlgorithm": "squarified",
      "aspectRatio": 1.5,
      "padding": 20,
      "minNodeSize": {"width": 80, "height": 60}
    },
    "containerNodes": ["MOD"],
    "containerParameters": {
      "padding": 25,
      "autoResize": true
    }
  },
  "renderConfig": {
    "showNodes": ["MOD", "FUNC"],
    "hideNodes": [],
    "showEdges": ["allocate"],
    "hideEdges": ["compose"],
    "portRendering": "none",
    "edgeStyle": "direct",
    "containerStyle": "treemap",
    "zoomLevels": {
      "default": "L2",
      "MOD": "L3",
      "FUNC": "L2"
    }
  },
  "interactionConfig": {
    "allowExpand": ["MOD"],
    "allowCollapse": ["MOD"],
    "expandMode": "show-allocated",
    "collapseMode": "hide-allocated"
  }
}
```

### 3.5 Use Case Diagram View

**Datei:** `views/use-case-diagram.json`

```json
{
  "id": "use-case-diagram",
  "name": "Use Case Diagram View",
  "description": "UML-compliant use case visualization",
  "layoutConfig": {
    "includeNodeTypes": ["UC", "ACTOR"],
    "includeRelTypes": ["compose"],
    "excludeIsolated": false,
    "algorithm": "radial",
    "algorithmParameters": {
      "centerNode": "auto",
      "radiusIncrement": 150,
      "angularSpacing": 30,
      "attractorStrength": 0.8
    },
    "containerNodes": [],
    "constraints": {
      "actorsBoundary": true,
      "ucInCenter": true
    }
  },
  "renderConfig": {
    "showNodes": ["UC", "ACTOR"],
    "hideNodes": [],
    "showEdges": [],
    "hideEdges": ["compose"],
    "portRendering": "none",
    "edgeStyle": "none",
    "actorConnections": "boundary-lines",
    "containerStyle": "none",
    "zoomLevels": {
      "default": "L2",
      "UC": "L2",
      "ACTOR": "L1"
    },
    "systemBoundary": {
      "show": true,
      "style": "dashed-rectangle",
      "label": "System"
    }
  },
  "interactionConfig": {
    "allowExpand": ["UC"],
    "allowCollapse": ["UC"],
    "expandMode": "show-fchain",
    "collapseMode": "ellipse-only"
  }
}
```

---

## 4. Layout-Algorithmen Spezifikation

### 4.1 Reingold-Tilford (Tree Layout)

**Anwendung:** Hierarchie-Darstellung mit compose-Beziehungen

**Input:**
```json
{
  "nodes": [{"id": "...", "type": "...", "children": [...]}],
  "rootId": "SYS.001"
}
```

**Parameter:**
- `orientation`: `"top-down"` | `"left-right"` | `"bottom-up"` | `"right-left"` (default: `"top-down"`)
- `siblingSpacing`: `number` (default: 60) - Abstand zwischen Geschwistern
- `levelSpacing`: `number` (default: 120) - Abstand zwischen Hierarchie-Ebenen
- `subtreeSpacing`: `number` (default: 80) - Minimaler Abstand zwischen Subtrees
- `alignment`: `"center"` | `"left"` | `"right"` (default: `"center"`)

**Output:**
```json
{
  "positions": {
    "SYS.001": {"x": 500, "y": 0},
    "UC.001": {"x": 300, "y": 120},
    "UC.002": {"x": 700, "y": 120}
  },
  "bounds": {"width": 1000, "height": 500}
}
```

**Algorithmus (Pseudocode):**
```python
def reingold_tilford(root, params):
    # Phase 1: Postorder traversal - assign preliminary x-coordinates
    def first_walk(node, level):
        if node.is_leaf():
            if node.has_left_sibling():
                node.prelim = node.left_sibling().prelim + params.siblingSpacing
            else:
                node.prelim = 0
        else:
            leftmost = node.children[0]
            rightmost = node.children[-1]
            
            # Recursively layout children
            for child in node.children:
                first_walk(child, level + 1)
            
            # Center parent over children
            midpoint = (leftmost.prelim + rightmost.prelim) / 2
            
            if node.has_left_sibling():
                node.prelim = node.left_sibling().prelim + params.siblingSpacing
                node.modifier = node.prelim - midpoint
            else:
                node.prelim = midpoint
    
    # Phase 2: Preorder traversal - compute final x-coordinates
    def second_walk(node, level, modifier):
        node.x = node.prelim + modifier
        node.y = level * params.levelSpacing
        
        for child in node.children:
            second_walk(child, level + 1, modifier + node.modifier)
    
    first_walk(root, 0)
    second_walk(root, 0, 0)
    
    return collect_positions(root)
```

**Constraints:**
- Gleiche Hierarchie-Ebene = gleiche Y-Koordinate
- Minimale Breite zwischen Subtrees
- Keine Überlappungen

### 4.2 Sugiyama (Layered Layout)

**Anwendung:** DAG mit Multi-Parent-Beziehungen (Requirements-Traceability)

**Input:**
```json
{
  "nodes": [{"id": "...", "type": "..."}],
  "edges": [{"source": "...", "target": "...", "type": "..."}]
}
```

**Parameter:**
- `layerAssignment`: `"longest-path"` | `"coffman-graham"` | `"network-simplex"` (default: `"longest-path"`)
- `crossingReduction`: `"barycenter"` | `"median"` (default: `"barycenter"`)
- `positionAssignment`: `"brandes-koepf"` | `"linear-segments"` (default: `"brandes-koepf"`)
- `layerSpacing`: `number` (default: 100)
- `nodeSpacing`: `number` (default: 50)
- `iterations`: `number` (default: 20) - für Crossing Reduction

**Output:**
```json
{
  "positions": {
    "REQ.001": {"x": 200, "y": 0, "layer": 0},
    "FUNC.001": {"x": 250, "y": 100, "layer": 1}
  },
  "edgeRoutes": {
    "REQ.001->FUNC.001": [
      {"x": 200, "y": 20},
      {"x": 250, "y": 80}
    ]
  }
}
```

**Algorithmus (Pseudocode):**
```python
def sugiyama(graph, params):
    # Phase 1: Layer Assignment
    layers = assign_layers(graph, params.layerAssignment)
    
    # Phase 2: Add dummy nodes for long edges
    extended_graph = add_dummy_nodes(graph, layers)
    
    # Phase 3: Crossing Reduction
    for iteration in range(params.iterations):
        for layer in range(len(layers) - 1):
            reorder_layer_barycenter(extended_graph, layer, layer + 1)
        for layer in range(len(layers) - 1, 0, -1):
            reorder_layer_barycenter(extended_graph, layer, layer - 1)
    
    # Phase 4: Position Assignment
    positions = assign_positions_brandes_koepf(extended_graph, params)
    
    # Phase 5: Remove dummy nodes, compute edge routes
    edge_routes = compute_edge_routes(extended_graph, positions)
    
    return {
        'positions': positions,
        'edgeRoutes': edge_routes
    }

def reorder_layer_barycenter(graph, layer_idx, ref_layer_idx):
    """Reorder nodes in layer to minimize crossings with reference layer"""
    layer = graph.layers[layer_idx]
    ref_layer = graph.layers[ref_layer_idx]
    
    for node in layer:
        # Compute barycenter (average position of connected nodes)
        connected = get_connected_nodes(node, ref_layer)
        if connected:
            node.barycenter = sum(n.position for n in connected) / len(connected)
        else:
            node.barycenter = node.position
    
    # Sort by barycenter
    layer.sort(key=lambda n: n.barycenter)
```

**Constraints:**
- Nodes in Layer i haben nur Edges zu Layer i±1
- Minimiere Kantenkreuzungen
- Minimiere Kantenlänge

### 4.3 Orthogonal Layout

**Anwendung:** Funktionsnetzwerk mit Port-basiertem Routing

**Input:**
```json
{
  "nodes": [
    {
      "id": "FUNC.001",
      "type": "FUNC",
      "ports": {
        "inputs": ["FL.001", "FL.002"],
        "outputs": ["FL.003"]
      }
    }
  ],
  "edges": [
    {"source": "FUNC.001", "sourcePort": "FL.003", "target": "FUNC.002", "targetPort": "FL.004"}
  ]
}
```

**Parameter:**
- `direction`: `"left-to-right"` | `"top-to-bottom"` (default: `"left-to-right"`)
- `gridSize`: `number` (default: 10) - Raster-Größe
- `nodeSpacing`: `number` (default: 50)
- `edgeSpacing`: `number` (default: 20) - Minimaler Abstand zwischen parallelen Edges
- `portSpacing`: `number` (default: 15) - Abstand zwischen Ports
- `minimizeCrossings`: `boolean` (default: `true`)
- `edgeRouting`: `"manhattan"` | `"orthogonal-topology"` (default: `"manhattan"`)

**Output:**
```json
{
  "positions": {
    "FUNC.001": {"x": 100, "y": 200}
  },
  "portPositions": {
    "FL.001": {"x": 100, "y": 210, "side": "left"},
    "FL.003": {"x": 180, "y": 210, "side": "right"}
  },
  "edgeRoutes": {
    "FUNC.001->FUNC.002": [
      {"x": 180, "y": 210},
      {"x": 240, "y": 210},
      {"x": 240, "y": 150},
      {"x": 300, "y": 150}
    ]
  }
}
```

**Algorithmus (Pseudocode):**
```python
def orthogonal_layout(graph, params):
    # Phase 1: Node placement (Force-directed oder Layered)
    positions = initial_placement(graph, params)
    
    # Phase 2: Port positioning
    port_positions = compute_port_positions(graph, positions, params)
    
    # Phase 3: Edge routing (Manhattan)
    edge_routes = {}
    for edge in graph.edges:
        source_port = port_positions[edge.sourcePort]
        target_port = port_positions[edge.targetPort]
        
        route = manhattan_routing(
            source_port, 
            target_port, 
            obstacles=positions,
            params=params
        )
        edge_routes[edge.id] = route
    
    return {
        'positions': positions,
        'portPositions': port_positions,
        'edgeRoutes': edge_routes
    }

def manhattan_routing(start, end, obstacles, params):
    """A* pathfinding on grid with orthogonal moves"""
    grid = create_grid(obstacles, params.gridSize)
    path = a_star(grid, start, end, heuristic=manhattan_distance)
    
    # Simplify path (remove unnecessary waypoints)
    simplified = simplify_orthogonal_path(path)
    
    return simplified
```

**Constraints:**
- Nur orthogonale (90°) Winkel
- Minimale Manhattan-Distanz
- Keine Edge-Node-Überschneidungen
- Ports an festen Positionen (left/right für horizontal, top/bottom für vertikal)

### 4.4 Nested Containment

**Anwendung:** Allocation-View (MOD → FUNC)

**Input:**
```json
{
  "containers": [
    {
      "id": "MOD.001",
      "children": ["FUNC.001", "FUNC.002"]
    }
  ]
}
```

**Parameter:**
- `packingAlgorithm`: `"squarified"` | `"slice-and-dice"` | `"strip"` (default: `"squarified"`)
- `aspectRatio`: `number` (default: 1.5) - gewünschtes Breite/Höhe-Verhältnis
- `padding`: `number` (default: 20) - Container-Padding
- `minNodeSize`: `{width: number, height: number}` (default: `{80, 60}`)

**Output:**
```json
{
  "positions": {
    "MOD.001": {"x": 0, "y": 0, "width": 400, "height": 300},
    "FUNC.001": {"x": 20, "y": 20, "width": 180, "height": 130},
    "FUNC.002": {"x": 220, "y": 20, "width": 160, "height": 130}
  }
}
```

**Algorithmus (Pseudocode):**
```python
def nested_containment(containers, params):
    positions = {}
    
    for container in containers:
        # Berechne erforderliche Größe für Children
        total_area = sum(
            child.size.width * child.size.height 
            for child in container.children
        )
        
        # Container-Größe mit Padding
        container_area = total_area / (1 - 2 * params.padding / 100)
        container_width = sqrt(container_area * params.aspectRatio)
        container_height = container_area / container_width
        
        # Platziere Container
        positions[container.id] = {
            'x': container.x,
            'y': container.y,
            'width': container_width,
            'height': container_height
        }
        
        # Squarified Treemap für Children
        available_rect = {
            'x': container.x + params.padding,
            'y': container.y + params.padding,
            'width': container_width - 2 * params.padding,
            'height': container_height - 2 * params.padding
        }
        
        child_positions = squarified_treemap(
            container.children,
            available_rect,
            params
        )
        
        positions.update(child_positions)
    
    return positions

def squarified_treemap(items, rect, params):
    """Squarified Treemap algorithm (Bruls et al. 2000)"""
    # Sort by size descending
    items.sort(key=lambda x: x.area, reverse=True)
    
    positions = {}
    remaining_rect = rect
    row = []
    
    for item in items:
        row.append(item)
        
        if improves_aspect_ratio(row, remaining_rect, params.aspectRatio):
            continue
        else:
            # Layout current row
            row_positions = layout_row(row[:-1], remaining_rect)
            positions.update(row_positions)
            
            # Update remaining rectangle
            remaining_rect = subtract_row_area(remaining_rect, row[:-1])
            row = [item]
    
    # Layout final row
    if row:
        positions.update(layout_row(row, remaining_rect))
    
    return positions
```

---

## 5. Implementierungs-Beispiele

### 5.1 Port-Extraktion aus FLOW-Nodes

**Python:**
```python
def extract_ports(graph, func_node_id):
    """Extract input/output ports from FLOW nodes connected via io edges"""
    func_node = graph.get_node(func_node_id)
    
    input_ports = []
    output_ports = []
    
    for edge in graph.get_edges(type='io'):
        if edge.target == func_node_id:
            # FLOW --io--> FUNC = Input Port
            flow_node = graph.get_node(edge.source)
            input_ports.append({
                'id': flow_node.semanticId,
                'label': flow_node.Name,
                'type': flow_node.Type,
                'pattern': flow_node.Pattern,
                'position': 'left',
                'flowDefinition': flow_node
            })
        
        elif edge.source == func_node_id:
            # FUNC --io--> FLOW = Output Port
            flow_node = graph.get_node(edge.target)
            output_ports.append({
                'id': flow_node.semanticId,
                'label': flow_node.Name,
                'type': flow_node.Type,
                'pattern': flow_node.Pattern,
                'position': 'right',
                'flowDefinition': flow_node
            })
    
    return {
        'inputs': input_ports,
        'outputs': output_ports
    }
```

**JavaScript:**
```javascript
function extractPorts(graph, funcNodeId) {
    const funcNode = graph.getNode(funcNodeId);
    
    const inputPorts = graph.getEdges()
        .filter(e => e.type === 'io' && e.target === funcNodeId)
        .map(e => {
            const flowNode = graph.getNode(e.source);
            return {
                id: flowNode.semanticId,
                label: flowNode.Name,
                type: flowNode.Type,
                position: 'left',
                flowDefinition: flowNode
            };
        });
    
    const outputPorts = graph.getEdges()
        .filter(e => e.type === 'io' && e.source === funcNodeId)
        .map(e => {
            const flowNode = graph.getNode(e.target);
            return {
                id: flowNode.semanticId,
                label: flowNode.Name,
                type: flowNode.Type,
                position: 'right',
                flowDefinition: flowNode
            };
        });
    
    return { inputs: inputPorts, outputs: outputPorts };
}
```

### 5.2 View-Filter Anwendung

**Python:**
```python
def apply_view_filter(graph, view_config):
    """Apply view-specific node/edge filters"""
    layout_config = view_config['layoutConfig']
    render_config = view_config['renderConfig']
    
    # Filter for layout computation
    layout_graph = Graph()
    
    for node in graph.nodes:
        if node.type in layout_config['includeNodeTypes']:
            layout_graph.add_node(node)
    
    for edge in graph.edges:
        if edge.type in layout_config['includeRelTypes']:
            if edge.source in layout_graph and edge.target in layout_graph:
                layout_graph.add_edge(edge)
    
    # Compute layout
    algorithm = get_algorithm(layout_config['algorithm'])
    positions = algorithm.layout(layout_graph, layout_config['algorithmParameters'])
    
    # Filter for rendering
    render_graph = Graph()
    
    for node in graph.nodes:
        if node.type in render_config['showNodes']:
            render_node = node.clone()
            render_node.position = positions.get(node.id)
            render_node.zoomLevel = render_config['zoomLevels'].get(
                node.type, 
                render_config['zoomLevels']['default']
            )
            render_graph.add_node(render_node)
    
    for edge in graph.edges:
        if edge.type in render_config['showEdges']:
            if edge.source in render_graph and edge.target in render_graph:
                render_graph.add_edge(edge)
    
    # Extract ports if needed
    if render_config['portRendering'] == 'fromFlowNodes':
        for node in render_graph.nodes:
            if node.type == 'FUNC':
                node.ports = extract_ports(graph, node.id)
    
    return render_graph
```

### 5.3 Format E Serialisierung

**Python:**
```python
def serialize_to_format_e(graph, view_context=None):
    """Serialize graph to Format E"""
    lines = []
    
    # View header (optional)
    if view_context:
        lines.append("## View-Context")
        lines.append(f"Type: {view_context['type']}")
        
        node_types = ','.join(view_context.get('nodeTypes', []))
        edge_types = ','.join(view_context.get('edgeTypes', []))
        lines.append(f"Filter: {node_types} nodes | {edge_types} edges")
        lines.append("")
    
    # Nodes
    lines.append("## Nodes")
    for node in graph.nodes:
        parts = [node.Name, node.type, node.semanticId]
        
        if node.Descr:
            parts.append(node.Descr)
        
        # Optional attributes
        if hasattr(node, 'presentation') and node.presentation:
            attrs = []
            for key, value in node.presentation.items():
                attrs.append(f"{key}:{value}")
            if attrs:
                parts.append(f"[{','.join(attrs)}]")
        
        lines.append('|'.join(parts))
    
    lines.append("")
    
    # Edges
    lines.append("## Edges")
    for edge in graph.edges:
        operator = EDGE_OPERATORS[edge.type]
        lines.append(f"{edge.source} {operator} {edge.target}")
    
    return '\n'.join(lines)

EDGE_OPERATORS = {
    'compose': '-cp->',
    'io': '-io->',
    'satisfy': '-sf->',
    'verify': '-vf->',
    'allocate': '-al->',
    'relation': '-rl->'
}
```

---

## 6. Validierungs-Regeln

### 6.1 Format E Validation

**Syntaktische Validierung:**
```python
import re

FORMAT_E_PATTERNS = {
    'semantic_id': r'^[A-Z][a-zA-Z0-9]*\.(SY|UC|FN|FL|RQ|TS|MD|AC|FC|SC)\.\d{3}$',
    'node_line': r'^[A-Z][a-zA-Z0-9]*\|[A-Z]+\|[A-Z][a-zA-Z0-9]*\.(SY|UC|FN|FL|RQ|TS|MD|AC|FC|SC)\.\d{3}(\|[^|\[\]]+)?(\[.+\])?$',
    'edge_line': r'^[A-Z][a-zA-Z0-9]*\.(SY|UC|FN|FL|RQ|TS|MD|AC|FC|SC)\.\d{3} -(cp|io|sf|vf|al|rl)-> [A-Z][a-zA-Z0-9]*\.(SY|UC|FN|FL|RQ|TS|MD|AC|FC|SC)\.\d{3}$'
}

def validate_format_e(text):
    """Validate Format E syntax"""
    errors = []
    lines = text.strip().split('\n')
    
    section = None
    line_num = 0
    
    for line in lines:
        line_num += 1
        line = line.strip()
        
        if not line:
            continue
        
        if line == '## Nodes':
            section = 'nodes'
            continue
        elif line == '## Edges':
            section = 'edges'
            continue
        elif line.startswith('##'):
            section = 'header'
            continue
        
        if section == 'nodes':
            if not re.match(FORMAT_E_PATTERNS['node_line'], line):
                errors.append(f"Line {line_num}: Invalid node syntax: {line}")
        
        elif section == 'edges':
            if not re.match(FORMAT_E_PATTERNS['edge_line'], line):
                errors.append(f"Line {line_num}: Invalid edge syntax: {line}")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors
    }
```

### 6.2 Ontologie-Rule Validation

**Während Layout:**
```python
def validate_graph_for_view(graph, view_config):
    """Validate graph against ontology rules"""
    errors = []
    warnings = []
    
    # Rule: function_io - FUNC must have at least one input and output
    for node in graph.nodes:
        if node.type == 'FUNC':
            ports = extract_ports(graph, node.id)
            if not ports['inputs']:
                errors.append(f"FUNC {node.semanticId} has no input ports")
            if not ports['outputs']:
                errors.append(f"FUNC {node.semanticId} has no output ports")
    
    # Rule: fchain_connectivity - All elements in FCHAIN connected via io
    for node in graph.nodes:
        if node.type == 'FCHAIN':
            children = graph.get_children(node.id, rel_type='compose')
            
            # Check if all children connected via io
            io_graph = graph.subgraph(
                nodes=children,
                edge_types=['io']
            )
            
            if not is_connected(io_graph):
                warnings.append(
                    f"FCHAIN {node.semanticId} has isolated elements"
                )
    
    # Rule: leaf_usecase_actor - Leaf UC must have at least one ACTOR
    for node in graph.nodes:
        if node.type == 'UC':
            children = graph.get_children(node.id, rel_type='compose')
            child_ucs = [c for c in children if c.type == 'UC']
            
            if not child_ucs:  # Leaf UC
                actors = [c for c in children if c.type == 'ACTOR']
                if not actors:
                    errors.append(
                        f"Leaf UC {node.semanticId} has no ACTOR"
                    )
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }
```

---

## 7. Zusammenfassung

**Erforderliche Dateien für Implementierung:**

1. ✅ `ontology_schema.json` - Existiert
2. ❌ `rendering_ontology.json` - Definiert in Abschnitt 1
3. ❌ `format_e_spec.md` - Definiert in Abschnitt 2
4. ❌ `views/*.json` - 5 Beispiele in Abschnitt 3
5. ❌ `layout_algorithms.md` - 4 Algorithmen in Abschnitt 4

**Code-Beispiele bereitgestellt:**
- Port-Extraktion (Python + JavaScript)
- View-Filter Anwendung (Python)
- Format E Serialisierung (Python)
- Validierung (Python)

**Nächste Schritte:**
1. JSON-Schemas aus Abschnitt 1 & 3 als Files speichern
2. Format E Spec als Markdown speichern
3. Layout-Algorithmen als Markdown speichern
4. Implementierung starten mit bereitgestellten Code-Beispielen
