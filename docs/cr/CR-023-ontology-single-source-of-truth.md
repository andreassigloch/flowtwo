# CR-023: Ontology Single Source of Truth

**Type:** Refactoring
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-11-21

---

## Problem / Use Case

The ontology definition (node types, edge types, valid connections, colors) is currently duplicated across:
1. `src/shared/types/ontology.ts` - TypeScript types and metadata
2. `docs/specs/ontology_schema.json` - JSON schema (outdated)
3. Various hardcoded values in renderers

This causes:
- Inconsistency when updating ontology
- Hardcoded colors in multiple files
- No single source for LLM context

---

## Requirements

### Functional Requirements

**FR-1: Single JSON Definition**
- All ontology data in `settings/ontology.json`
- Node types with colors, descriptions, abbreviations
- Edge types with nesting rules, valid connections, visual styles

**FR-2: TypeScript Generation**
- Generate `ontology.ts` types from JSON (or load at runtime)
- Type safety preserved

**FR-3: Runtime Access**
- Load ontology for validation
- Load ontology for LLM prompts
- Load ontology for terminal colors

---

## Architecture / Solution Approach

### Phase 1: Create JSON Definition (Done)
- `settings/ontology.json` with complete ontology
- `settings/README.md` with usage documentation

### Phase 2: Update TypeScript Types
- Import JSON in `ontology.ts` or generate types
- Replace hardcoded EDGE_TYPE_METADATA with JSON import

### Phase 3: Update Consumers
- `graph-viewer.ts` - use ontology colors
- `prompt-builder.ts` - load ontology for LLM context
- Validation functions - use valid connections from JSON

---

## Current Status

- [x] Create `settings/` directory
- [x] Create `settings/ontology.json` with full definition
- [x] Create `settings/README.md`
- [x] Update `ontology.ts` to use JSON (imports JSON, exports ONTOLOGY + EDGE_TYPE_METADATA)
- [x] Update `getNodeColor()` in ascii-grid.ts to use ontology
- [ ] Update LLM prompts to load ontology (optional - can be done when needed)

---

## Acceptance Criteria

- [x] Single ontology definition in `settings/ontology.json`
- [x] TypeScript types derived from or consistent with JSON
- [x] Node colors come from ontology, not hardcoded
- [ ] LLM has access to ontology for context (deferred - to be done when LLM integration needs it)

---

## Dependencies

- None (foundational change)

---

## Estimated Effort

**Total:** 2-3 hours

---

## References

- Ontology Definition: settings/ontology.json
- TypeScript Types: src/shared/types/ontology.ts
- View Configs: docs/specs/views/

---

**End of CR-023**
