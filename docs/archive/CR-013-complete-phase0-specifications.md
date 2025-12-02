# CR-013: Complete Phase 0 Specification Files

**Status:** Closed - Merged into CR-001
**Priority:** HIGH
**Target Phase:** Phase 0
**Created:** 2025-11-19
**Updated:** 2025-11-28
**Closed:** 2025-11-28
**Author:** andreas@siglochconsulting

## Closure Summary

**All remaining tasks have been addressed:**
- ✅ View configs created (docs/specs/views/*.json)
- ✅ Ontology colors now in settings/ontology.json (CR-023)
- ✅ Agent configs created (settings/agent-config.json, settings/prompts/*.md) - CR-027
- ✅ **Rendering config (zoom levels, shapes, edge styles) → Merged into CR-001** (Part B: Rendering Configuration)
- ✅ **Format E EBNF → Removed** (LLMs learn from examples, not grammars; examples in prompts/*.md)

**Why Closed:**
1. Zoom levels L0-L4 and rendering configuration integrated into [CR-001](CR-001-add-layout-algorithms.md) as "Part B: Rendering Configuration"
2. EBNF grammar provides no value for LLMs - removed entirely
3. All other Phase 0 specs were already complete

---

## Original Problem (Historical)

Phase 0 specification foundation is incomplete. According to [implan.md:41-51](../implan.md#L41-L51), the following specification files are missing or incomplete:

- `docs/specs/rendering_ontology.json` - Node rendering rules (L0-L4 zoom levels)
- `docs/specs/format_e_spec.md` - Format E EBNF grammar specification
- View configuration files (CURRENT_STATUS.md reports these as DONE, but needs verification)

**Resolution:**
- rendering_ontology.json → `settings/rendering.json` in CR-001
- format_e_spec.md → Removed (examples in prompts/*.md sufficient)
- View configs → Already complete

## Requirements

**From implan.md Phase 0 remaining tasks:**

1. **rendering_ontology.json** - Define node rendering rules:
   - L0-L4 zoom levels per node type
   - Symbol/shape definitions
   - Color schemes
   - Label formatting
   - Icon mappings

2. ~~**format_e_spec.md**~~ - **REMOVED**: LLMs learn from examples (in prompts/*.md), not EBNF grammars

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

### 2. View Configuration Verification

**Verify existing configs contain:**
- Layout algorithm specification
- Node/edge filtering rules
- Port layout rules (for functional-flow)
- Zoom level defaults
- Performance constraints (max nodes)

## Implementation Plan

### Phase 1: rendering_ontology.json (4-5 hours)
1. Define schema structure
2. Specify rendering rules for all 10 node types
3. Define edge rendering styles (6 edge types)
4. Add zoom level definitions (L0-L4)
5. Add validation rules

### Phase 2: View Config Verification (2-3 hours)
1. Review existing view configs (per CURRENT_STATUS.md)
2. Verify completeness against requirements
3. Add missing fields if any
4. Cross-reference with rendering_ontology.json
5. Test configs with layout algorithms

### Phase 3: Integration & Validation (2-3 hours)
1. Update GraphCanvas to use rendering_ontology.json
2. Test all view configs with ASCII renderer
3. Verify zoom levels work correctly

## Acceptance Criteria

- [ ] rendering_ontology.json complete with all 10 node types
- [ ] All 6 edge types defined with rendering rules
- [ ] L0-L4 zoom levels specified for each node type
- [ ] All 5 view configs verified complete
- [ ] Specifications validated against implementation

## Dependencies

- Ontology schema (docs/ontology/ontology_schema.json) - already exists
- View configs (claimed done per CURRENT_STATUS.md) - needs verification
- Format E parser (src/shared/parsers/format-e-parser.ts) - already implemented
- ASCII renderer (src/terminal-ui/graph-viewer.ts) - already implemented

## Estimated Effort

- rendering_ontology.json: 4-5 hours
- View Config Verification: 2-3 hours
- Integration & Validation: 2-3 hours
- **Total: 8-11 hours (1-1.5 days)**

## Benefits

**Clarity:**
- Formal specification for all rendering behavior
- Clear contract for layout algorithms

**Consistency:**
- Standardized rendering across views
- Predictable zoom behavior

**Maintainability:**
- Single source of truth for rendering rules
- Easier to extend with new node types

## References

- [implan.md:41-51](../implan.md#L41-L51) - Phase 0 Remaining Tasks
- docs/ontology/ontology_schema.json - Ontology definition
- src/shared/parsers/format-e-parser.ts - Current Format E parser
- CURRENT_STATUS.md - Reports view configs as DONE

## Notes

- Priority HIGH because Phase 0 is foundation for all subsequent phases
- rendering_ontology.json should reference settings/ontology.json node types
- Consider adding JSON Schema for rendering_ontology.json validation
- View configs may need adjustments after rendering_ontology.json is complete
- Format E examples already in `settings/prompts/*.md` (CR-027) - no separate EBNF needed
