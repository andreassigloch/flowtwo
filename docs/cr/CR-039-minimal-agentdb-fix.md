# CR-039: Minimal AgentDB Fix

**Type:** Bug Fix
**Status:** Planned
**Priority:** CRITICAL
**Created:** 2025-12-08
**Author:** andreas@siglochconsulting

**Fixes:** Immediate issues from CR-038 analysis
**Defers:** Session Manager, Variant Pool (to CR-038)

## Problem Statement

CR-038 identified root causes of broken functionality:
1. `/analyze` returns nothing - evaluator caches stale AgentDB
2. Change tracking broken - graph viewer has separate AgentDB instance
3. `/optimize` sees wrong data - same root cause

**This CR:** Minimal fixes to restore functionality
**CR-038:** Full architectural refactor (deferred)

## Solution: Fix in Place

No new components. Fix existing code:

```
┌─────────────────────────────────────────────────┐
│  chat-interface.ts (controller - unchanged)     │
│  ├── AgentDB (TRUE singleton via fix)           │
│  ├── LLM Engine                                 │
│  ├── Validation (fresh each call, no cache)    │
│  └── WebSocket broadcast + metadata             │
└─────────────────────────────────────────────────┘
         │
         │ Format E + nodeChangeStatus
         ▼
┌─────────────────────────────────────────────────┐
│  graph-viewer.ts (simplified)                   │
│  ├── Render buffer (kept)                       │
│  ├── NO AgentDB (removed)                       │
│  └── Applies WS data to buffer                  │
└─────────────────────────────────────────────────┘
```

## Implementation

### Fix 1: True Singleton (1 hour)

**File:** `src/llm-engine/agentdb/unified-agentdb-service.ts`

Ensure `getUnifiedAgentDBService()` returns same instance:

```typescript
let cachedInstance: UnifiedAgentDBService | null = null;

export function getUnifiedAgentDBService(): UnifiedAgentDBService {
  if (!cachedInstance) {
    cachedInstance = new UnifiedAgentDBService();
  }
  return cachedInstance;
}

// For testing only
export function resetAgentDBInstance(): void {
  cachedInstance = null;
}
```

### Fix 2: Remove Evaluator Cache (2 hours)

**File:** `src/llm-engine/validation/unified-rule-evaluator.ts`

Remove `evaluatorInstances` map. Accept AgentDB as parameter:

```typescript
// REMOVE this
const evaluatorInstances = new Map<string, UnifiedRuleEvaluator>();

// CHANGE this
export function getUnifiedRuleEvaluator(agentDB: UnifiedAgentDBService): UnifiedRuleEvaluator {
  // Always create fresh with current AgentDB
  return new UnifiedRuleEvaluator(agentDB);
}
```

**File:** `src/terminal-ui/commands/validation-commands.ts`

Pass `ctx.agentDB` to evaluator:

```typescript
// Before
const evaluator = getUnifiedRuleEvaluator();

// After
const evaluator = getUnifiedRuleEvaluator(ctx.agentDB);
```

### Fix 3: Remove AgentDB from Graph Viewer (2 hours)

**File:** `src/terminal-ui/graph-viewer.ts`

Remove:
- `agentDB` variable
- `getAgentDB()` function
- `StatelessGraphCanvas` import/usage

Keep:
- Local render buffer
- WebSocket message handling

Parse `nodeChangeStatus` from WebSocket payload instead of computing locally.

### Fix 4: Add Metadata to Broadcast (1 hour)

**File:** `src/terminal-ui/chat-interface.ts`

In `notifyGraphUpdate()`, include:

```typescript
const changeStatus = this.agentDB.getChangeStatus();
ws.broadcast({
  type: 'graph-update',
  nodes: [...],
  edges: [...],
  nodeChangeStatus: changeStatus.nodes,
  edgeChangeStatus: changeStatus.edges
});
```

### Fix 5: Inline Background Validation (2 hours)

**File:** `src/terminal-ui/chat-interface.ts`

Add debounced validation in chat-interface (no new file):

```typescript
private validationTimeout: NodeJS.Timeout | null = null;

private setupBackgroundValidation(): void {
  this.agentDB.onGraphChange(() => {
    if (this.validationTimeout) clearTimeout(this.validationTimeout);
    this.validationTimeout = setTimeout(async () => {
      const result = await this.runLightweightValidation();
      this.lastValidationResult = result;
      this.notifyGraphUpdate(); // Include in next broadcast
    }, 300);
  });
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/llm-engine/agentdb/unified-agentdb-service.ts` | True singleton |
| `src/llm-engine/validation/unified-rule-evaluator.ts` | Remove cache, accept AgentDB param |
| `src/terminal-ui/commands/validation-commands.ts` | Pass ctx.agentDB |
| `src/terminal-ui/graph-viewer.ts` | Remove AgentDB, use WS data |
| `src/terminal-ui/chat-interface.ts` | Add metadata to broadcast, inline validation |

## What This Fixes

- [x] `/analyze` detects violations (evaluator gets current data)
- [x] `/optimize` sees current data (same fix)
- [x] Change tracking indicators appear (single AgentDB, proper baseline)
- [x] `/status` shows correct counts (single source of truth)

## What This Defers (to CR-038)

- [ ] Session Manager as orchestrator
- [ ] Variant Pool with copy-on-write
- [ ] View subscriptions
- [ ] Async command queue

## Estimated Effort

| Fix | Hours |
|-----|-------|
| True singleton | 1 |
| Remove evaluator cache | 2 |
| Remove AgentDB from viewer | 2 |
| Add metadata to broadcast | 1 |
| Inline background validation | 2 |
| **Total** | **8 hours** |

## Acceptance Criteria

- [ ] `/analyze` returns violations on loaded graph
- [ ] `/optimize` works with current data
- [ ] Diff indicators (+/-/~) show in graph viewer
- [ ] `/status` shows correct change count
- [ ] Only ONE AgentDB instance exists (verified via logging)
- [ ] All existing tests pass

## Relationship to CR-038

CR-039 is a **tactical fix**. CR-038 remains as **strategic refactor**.

After CR-039:
- Immediate issues fixed
- Technical debt remains (chat-interface still bloated)
- CR-038 becomes optional improvement, not urgent fix

## References

- [CR-038](CR-038-clean-architecture-refactor.md) - Full architecture analysis
- [CR-032](../archive/CR-032-unified-data-layer.md) - Unified Data Layer
- [CR-033](CR-033-git-diff-change-tracking.md) - Change Tracking
