# CR-046: View Dataflow Deduplication & Bidirectional Actor Fix

**Type:** Bug Fix
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-12-11

## Problem / Use Case

Two rendering issues in the spec+ and mermaid views:

1. **Duplicate Flow Names**: When multiple sources write to the same FLOW (e.g., ProductManager and Stakeholder both write to RequirementInput), the flow name appeared multiple times in the view output.

2. **Missing Bidirectional Actors**: Actors that are both input AND output (e.g., ProductManager sends ProgressReport AND receives ValidationResults) were only shown as input, missing their receiving role.

### Example of Duplicate Issue
```
[ACTOR] ProductManager
  ↓ RequirementInput
[ACTOR] Stakeholder
  ↓ RequirementInput      ← duplicate
[FUNC] InitiatePRD
  ↓ RequirementInput      ← duplicate
  ↓ RequirementInput      ← duplicate
```

### Example of Missing Receiver
PRDImplementationChain shows ProductManager as input but not as receiver of ValidationResults.

## Root Cause Analysis

1. **Duplicates**: The io-flow-io connection extraction creates one connection per source→FLOW→target triplet. When multiple sources write to the same FLOW, rendering each source's outgoing flows without deduplication causes repetition.

2. **Bidirectional Actors**: Line 281 in spec-views.ts filtered output actors with:
   ```typescript
   filter(a => outputActorIds.has(a.semanticId) && !inputActorIds.has(a.semanticId))
   ```
   This excluded actors that appear in both sets.

## Solution

### Fix 1: Flow Name Deduplication
Apply Set-based deduplication when rendering flow arrows:
```typescript
const outFlows = connections.filter(c => c.sourceId === actor.semanticId);
const uniqueFlowNames = [...new Set(outFlows.map(f => f.flowName))];
for (const flowName of uniqueFlowNames) {
  lines.push(`↓ ${flowName}`);
}
```

### Fix 2: Bidirectional Actor Section
Add separate rendering for bidirectional actors with "(receives)" annotation:
```typescript
const bidirectionalActors = actors.filter(
  a => inputActorIds.has(a.semanticId) && outputActorIds.has(a.semanticId)
);
if (bidirectionalActors.length > 0) {
  for (const actor of bidirectionalActors) {
    const inFlows = connections.filter(c => c.targetId === actor.semanticId);
    // render incoming flows + actor with "(receives)" suffix
  }
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/terminal-ui/views/spec-views.ts` | Deduplication at 3 locations (input actors, functions, output actors) + bidirectional actor section |
| `src/terminal-ui/views/mermaid-views.ts` | Deduplication in architecture view (lines 51-76) and functional-network view (lines 195-227) |
| `src/terminal-ui/views/view-renderers.ts` | Added fchain view type support |

## Verification

1. Neo4j data verified correct (no duplicate compose edges)
2. Build passes: `npm run build`
3. Manual testing with PRDCreationChain and PRDImplementationChain

## Current Status

- [x] Identified root cause via cypher-shell queries
- [x] Fixed spec-views.ts deduplication (3 locations)
- [x] Added bidirectional actor section
- [x] Applied same pattern to mermaid-views.ts
- [x] Build verification passed
- [x] Added Neo4j debug section to CLAUDE.md

## Acceptance Criteria

- [x] Flow names appear only once per connection in spec+ view
- [x] Bidirectional actors show both as input and as receiver
- [x] Architecture and functional-network views have same deduplication
- [x] Build passes without errors

## References

- Neo4j skill: `.claude/skills/neo4j-query/SKILL.md`
- Related: CR-032 (Unified Data Layer)
