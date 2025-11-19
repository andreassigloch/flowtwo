# CR-013: Complete Phase 0 Specification Files

**Status:** Partial (view configs complete per CURRENT_STATUS.md)
**Priority:** HIGH
**Target Phase:** Phase 0
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

Phase 0 specification foundation is incomplete. According to [implan.md:41-51](../implan.md#L41-L51), the following specification files are missing or incomplete:

- `docs/specs/rendering_ontology.json` - Node rendering rules (L0-L4 zoom levels)
- `docs/specs/format_e_spec.md` - Format E EBNF grammar specification
- View configuration files (CURRENT_STATUS.md reports these as DONE, but needs verification)

**Current Status:** PARTIAL
- ✅ View configs created (per CURRENT_STATUS.md)
- ⏳ rendering_ontology.json missing
- ⏳ Format E EBNF spec incomplete

**Impact:** Without complete specifications:
- Rendering behavior is inconsistent/undefined
- Format E parsing lacks formal grammar reference
- Difficult to validate implementation compliance
- No clear contract for layout algorithms

## Requirements

**From implan.md Phase 0 remaining tasks:**

1. **rendering_ontology.json** - Define node rendering rules:
   - L0-L4 zoom levels per node type
   - Symbol/shape definitions
   - Color schemes
   - Label formatting
   - Icon mappings

2. **format_e_spec.md** - Format E EBNF grammar:
   - Complete syntax definition
   - Operation types (add, modify, delete)
   - Diff format specification
   - Validation rules
   - Examples and edge cases

3. **View configurations** (verify completion):
   - hierarchy.json (Reingold-Tilford)
   - functional-flow.json (Orthogonal + ports)
   - requirements.json (Sugiyama layered)
   - allocation.json (Treemap)
   - use-case-diagram.json (Radial)

## Proposed Solution

### 1. rendering_ontology.json Structure

```json
{
  "version": "1.0.0",
  "nodeTypes": {
    "REQ": {
      "symbol": "rectangle",
      "color": "#4A90E2",
      "icon": "requirement-icon",
      "zoomLevels": {
        "L0": { "visible": true, "label": "id" },
        "L1": { "visible": true, "label": "id + title" },
        "L2": { "visible": true, "label": "full" },
        "L3": { "visible": true, "label": "full + properties" },
        "L4": { "visible": true, "label": "full + properties + metadata" }
      },
      "dimensions": { "width": 120, "height": 60 },
      "labelFormat": "{id}: {title}"
    },
    "FUNC": {
      "symbol": "rounded-rectangle",
      "color": "#50C878",
      "icon": "function-icon",
      "zoomLevels": { /* ... */ }
    },
    "MOD": {
      "symbol": "container",
      "color": "#9b7853",
      "icon": "module-icon",
      "zoomLevels": { /* ... */ }
    }
    // ... all node types from ontology_schema.json
  },
  "edgeTypes": {
    "compose": {
      "style": "solid",
      "color": "#000000",
      "arrowhead": "none",
      "weight": 1.0
    },
    "satisfiedBy": {
      "style": "dashed",
      "color": "#4A90E2",
      "arrowhead": "open",
      "weight": 0.5
    }
    // ... all edge types
  }
}
```

### 2. format_e_spec.md Content

**Structure:**
1. Introduction and motivation
2. EBNF grammar definition
3. Operation types specification
4. Diff format specification
5. Validation rules
6. Complete examples
7. Edge cases and error handling

**EBNF Grammar (excerpt):**
```ebnf
FormatE       ::= NodeList EdgeList
NodeList      ::= Node*
Node          ::= NodeType ':' NodeId '{' PropertyList '}'
NodeType      ::= 'REQ' | 'FUNC' | 'MOD' | ...
NodeId        ::= [A-Z]+ '-' [0-9]+
PropertyList  ::= Property (',' Property)*
Property      ::= PropertyName '=' PropertyValue

EdgeList      ::= Edge*
Edge          ::= EdgeType '(' SourceId ',' TargetId ')' '{' PropertyList '}'
EdgeType      ::= 'compose' | 'satisfiedBy' | ...

Operation     ::= 'add' | 'modify' | 'delete'
Diff          ::= Operation ':' (Node | Edge)
```

### 3. View Configuration Verification

**Verify existing configs contain:**
- Layout algorithm specification
- Node/edge filtering rules
- Port layout rules (for functional-flow)
- Zoom level defaults
- Performance constraints (max nodes)

## Implementation Plan

### Phase 1: rendering_ontology.json (4-5 hours)
1. Define schema structure
2. Specify rendering rules for all 21 node types
3. Define edge rendering styles (6 edge types)
4. Add zoom level definitions (L0-L4)
5. Document color scheme rationale
6. Add validation rules

### Phase 2: Format E EBNF Specification (3-4 hours)
1. Write complete EBNF grammar
2. Document operation types (add, modify, delete)
3. Specify diff format
4. Add validation rules
5. Provide comprehensive examples
6. Document error conditions

### Phase 3: View Config Verification (2-3 hours)
1. Review existing view configs (per CURRENT_STATUS.md)
2. Verify completeness against requirements
3. Add missing fields if any
4. Cross-reference with rendering_ontology.json
5. Test configs with layout algorithms

### Phase 4: Integration & Validation (2-3 hours)
1. Update GraphCanvas to use rendering_ontology.json
2. Update Format E parser to validate against EBNF spec
3. Test all view configs with ASCII renderer
4. Verify zoom levels work correctly
5. Document specification usage

### Phase 5: Documentation (1-2 hours)
1. Add specification overview to docs/
2. Link specs from architecture.md
3. Document spec versioning strategy
4. Add examples and usage guidelines

## Acceptance Criteria

- [ ] rendering_ontology.json complete with all 21 node types
- [ ] All 6 edge types defined with rendering rules
- [ ] L0-L4 zoom levels specified for each node type
- [ ] Format E EBNF grammar complete and unambiguous
- [ ] Operation types (add, modify, delete) fully specified
- [ ] Diff format documented with examples
- [ ] All 5 view configs verified complete
- [ ] Specifications validated against implementation
- [ ] Documentation references specs correctly
- [ ] Examples provided for all specifications

## Dependencies

- Ontology schema (docs/ontology/ontology_schema.json) - already exists
- View configs (claimed done per CURRENT_STATUS.md) - needs verification
- Format E parser (src/shared/parsers/format-e-parser.ts) - already implemented
- ASCII renderer (src/terminal-ui/graph-viewer.ts) - already implemented

## Estimated Effort

- rendering_ontology.json: 4-5 hours
- Format E EBNF Specification: 3-4 hours
- View Config Verification: 2-3 hours
- Integration & Validation: 2-3 hours
- Documentation: 1-2 hours
- **Total: 12-17 hours (1.5-2 days)**

## Benefits

**Clarity:**
- Formal specification for all rendering behavior
- Clear contract for layout algorithms
- Unambiguous Format E syntax

**Consistency:**
- Standardized rendering across views
- Predictable zoom behavior
- Validated Format E operations

**Maintainability:**
- Single source of truth for rendering rules
- Easier to extend with new node types
- Clear validation criteria

## References

- [implan.md:41-51](../implan.md#L41-L51) - Phase 0 Remaining Tasks
- docs/ontology/ontology_schema.json - Ontology definition
- src/shared/parsers/format-e-parser.ts - Current Format E parser
- CURRENT_STATUS.md - Reports view configs as DONE

## Notes

- Priority HIGH because Phase 0 is foundation for all subsequent phases
- rendering_ontology.json should reference ontology_schema.json node types
- Format E EBNF spec should enable parser validation
- Consider adding JSON Schema for rendering_ontology.json validation
- View configs may need adjustments after rendering_ontology.json is complete
