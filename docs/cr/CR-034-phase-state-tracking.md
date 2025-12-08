# CR-034: Phase State Tracking

**Type:** Feature
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2025-12-08
**Author:** andreas@siglochconsulting

## Problem / Use Case

The `SessionContext.currentPhase` in workflow routing is hardcoded to `'phase1_requirements'`. This means:
- Agent routing always assumes phase 1 context
- Phase gate checks cannot track progression
- Multi-phase workflows don't advance properly

**Location:** [chat-interface.ts:1706](../../src/terminal-ui/chat-interface.ts#L1706)
```typescript
currentPhase: 'phase1_requirements', // TODO: Track phase state
```

## Requirements

### Functional Requirements
- FR-1: Store current phase in AgentDB session state (per CR-032 architecture)
- FR-2: Derive initial phase from graph content on session load
- FR-3: Advance phase when gate rules pass (via `/phase-gate` command)
- FR-4: Expose current phase in `SessionContext` for routing decisions

### Non-Functional Requirements
- NFR-1: Phase state persists across session (stored in AgentDB, persisted to Neo4j on `/save`)
- NFR-2: Phase derivation < 100ms (use cached validation results)

## Architecture / Solution Approach

### Phase Derivation Logic

Derive phase from graph content when no explicit phase is stored:

```
IF no nodes exist → phase1_requirements
ELSE IF no FUNC nodes → phase1_requirements
ELSE IF no MOD nodes → phase2_logical
ELSE IF no allocate edges → phase3_physical
ELSE IF no TEST nodes → phase4_verification
ELSE → phase4_verification (complete)
```

### Storage Location

Per CR-032, AgentDB is source of truth. Add to session state:

| Field | Location | Notes |
|-------|----------|-------|
| `currentPhase` | AgentDB session metadata | Persisted with graph |
| `gateStatus` | Computed from validation | Cached, invalidated on graph change |

### Integration Points

1. **On session load:** Derive phase from graph if not stored
2. **On `/phase-gate`:** Check gate rules, advance if passed
3. **On routing:** Read from AgentDB session state
4. **On `/save`:** Persist with graph to Neo4j

## Implementation Plan

### Phase 1: AgentDB Session State (2-3 hours)
- Add `sessionMetadata` to UnifiedAgentDBService
- Store `currentPhase`, `lastGateCheck` timestamp
- Persist/load with graph snapshot

### Phase 2: Phase Derivation (2-3 hours)
- Implement `derivePhaseFromGraph()` logic
- Call on session load when no phase stored
- Unit tests for derivation logic

### Phase 3: Routing Integration (1-2 hours)
- Update `chat-interface.ts` to read phase from AgentDB
- Remove hardcoded `'phase1_requirements'`
- Update `SessionContext` population

### Phase 4: Phase Gate Enhancement (2-3 hours)
- Update `/phase-gate` to set phase on success
- Add `/phase` command to show/set current phase
- Validate gate rules before advancing

## Acceptance Criteria

- [ ] `currentPhase` stored in AgentDB session metadata
- [ ] Phase derived from graph content on first load
- [ ] `/phase-gate` advances phase when rules pass
- [ ] Routing decisions use actual phase (not hardcoded)
- [ ] Phase persists across `/save` and reload

## Dependencies

- CR-032: Unified Data Layer (AgentDB as source of truth)
- ontology-rules.json: Phase definitions and gate rules

## Estimated Effort

Total: 7-11 hours (1-2 days)

## References

- Phase definitions: [ontology-rules.json:262-287](../../settings/ontology-rules.json#L262-L287)
- Gate rules per phase: `phases.*.gateRules`
- Agent routing config: [agent-config.json:197-254](../../settings/agent-config.json#L197-L254)
