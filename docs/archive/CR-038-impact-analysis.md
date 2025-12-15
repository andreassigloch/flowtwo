# CR-038 Impact Analysis - AgentDB Refactor

**Date:** 2025-12-10
**Analyst:** Impact Analysis Agent
**Status:** Complete

## Executive Summary

This document maps all files affected by CR-038's AgentDB refactor to support true dependency injection from WebSocket data. The analysis identified **11 production files** and **7 test files** requiring changes to eliminate multiple AgentDB instances.

**Key Finding:** Despite CR-039's singleton implementation, the system still has **11 runtime calls** to `getUnifiedAgentDBService()`, creating potential race conditions and data consistency issues.

---

## Critical Architecture Violation

### Current Problem: Multiple AgentDB Access Points

```
chat-interface.ts:512    → await getUnifiedAgentDBService(workspaceId, systemId)
                            ├─→ Passes to StatelessGraphCanvas ✅
                            ├─→ Passes to CommandContext ✅
                            └─→ BUT processMessage() calls getAgentDB() again ❌

llm-engine.ts            → 4 calls to getUnifiedAgentDBService()
  ├─→ Line 76:  During request processing
  ├─→ Line 210: For caching responses
  ├─→ Line 271: For metrics
  └─→ Line 279: For cleanup

openai-engine.ts         → 4 calls to getUnifiedAgentDBService()
  ├─→ Line 84:  During request processing
  ├─→ Line 191: For caching responses
  ├─→ Line 229: For metrics
  └─→ Line 237: For cleanup

unified-rule-evaluator.ts → 1 call at line 562
validate-model.ts         → Direct instantiation (bypasses singleton)
```

### Why This Is a Problem

1. **Change Tracking Breaks**: Baseline captured in one instance, edits in another
2. **Validation Sees Stale Data**: Evaluator reads from different instance than Canvas
3. **Cache Inconsistency**: Version numbers differ across instances
4. **Race Conditions**: Multiple async calls during initialization

---

## Affected Files by Category

### 1. Terminal UI (3 files)

#### `/src/terminal-ui/chat-interface.ts`
**Lines:** 25, 66, 512, 454, 475
**Changes Required:**
- **Line 512**: Keep singleton creation in main() ✅
- **Line 66**: Remove `getAgentDB()` helper (redundant)
- **Lines 454, 475**: Remove `getAgentDB()` calls in episode storage - use module-level `agentDB`
- **Remove**: `setupBackgroundValidation()` function (replaced by BackgroundValidator class)

**Risk:** HIGH - Core initialization point

#### `/src/terminal-ui/commands/types.ts`
**Lines:** 14, 38
**Changes Required:**
- **Line 38**: KEEP `agentDB: UnifiedAgentDBService` field for Phase 3 compatibility
- **Future**: Phase 5+ will remove this field when WebSocket data includes agentDB

**Risk:** LOW - Type definition only

#### `/src/terminal-ui/commands/session-commands.ts`
**No changes required in Phase 3-4**
**Future (Phase 5):** Will receive agentDB from WebSocket instead of CommandContext

---

### 2. LLM Engines (2 files)

#### `/src/llm-engine/llm-engine.ts`
**Lines:** 19, 76, 210, 271, 279
**Changes Required:**
- **Line 76**: Remove - receive agentDB from LLMRequest instead
- **Line 210**: Remove - receive agentDB from LLMRequest instead
- **Line 271**: Remove - receive agentDB from parameter
- **Line 279**: Remove - receive agentDB from parameter

**Risk:** HIGH - Used in every LLM request

#### `/src/llm-engine/openai-engine.ts`
**Lines:** 18, 84, 191, 229, 237
**Changes Required:** Same pattern as llm-engine.ts
- Remove all 4 `getUnifiedAgentDBService()` calls
- Receive agentDB via LLMRequest or method parameters

**Risk:** HIGH - Alternative LLM provider

---

### 3. Validation Layer (2 files)

#### `/src/llm-engine/validation/unified-rule-evaluator.ts`
**Lines:** 15, 35, 39, 545, 555-566
**Status:** ✅ **CORRECT** - Already receives AgentDB via constructor
- **Line 39**: Constructor injection pattern is correct
- **Lines 555-566**: `getUnifiedRuleEvaluator()` factory function - NO LONGER CACHES (CR-039 fix)

**Risk:** LOW - Already following correct pattern

#### `/src/llm-engine/validation/similarity-scorer.ts`
**Lines:** 15, 36, 38, 45, 397
**Status:** ✅ **CORRECT** - Optional AgentDB via constructor
- **Line 38**: Constructor accepts optional AgentDB
- **Line 45**: `setAgentDB()` for lazy initialization

**Risk:** LOW - Flexible initialization pattern

---

### 4. Canvas Layer (1 file)

#### `/src/canvas/stateless-graph-canvas.ts`
**Lines:** 21, 41, 52
**Status:** ✅ **CORRECT** - Receives AgentDB via constructor
- **Line 52**: Constructor requires AgentDB instance
- Pure delegation pattern (no state duplication)

**Risk:** LOW - Reference implementation

---

### 5. AgentDB Core (3 files)

#### `/src/llm-engine/agentdb/unified-agentdb-service.ts`
**Lines:** 40-648 (class), 658-690 (singleton)
**Status:** ✅ **CR-039 Singleton Implemented**
- **Lines 658-690**: True singleton pattern with session switching
- **Line 682**: `new UnifiedAgentDBService()` only called by singleton manager

**Risk:** NONE - Core service

#### `/src/llm-engine/agentdb/neo4j-sync.ts`
**Lines:** 17, 72, 92
**Status:** ✅ **CORRECT** - Receives AgentDB via constructor

**Risk:** NONE - Utility service

#### `/src/llm-engine/agentdb/reflexion-memory.ts`
**Lines:** 16, 58, 69
**Status:** ✅ **CORRECT** - Receives AgentDB via constructor

**Risk:** NONE - Memory service

---

### 6. Scripts (1 file)

#### `/scripts/validate-model.ts`
**Lines:** 13, 83
**Changes Required:**
- **Line 83**: Replace `new UnifiedAgentDBService()` with `getUnifiedAgentDBService()`
- This is a **standalone script**, so direct instantiation is acceptable IF it manages lifecycle properly

**Risk:** LOW - Script usage only

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│                   chat-interface.ts                  │
│  main() → getUnifiedAgentDBService() [SINGLETON]    │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┬─────────────┐
         │             │             │             │
         ▼             ▼             ▼             ▼
   StatelessGraphCanvas  CommandContext  ChatCanvas  BackgroundValidator
   [receives agentDB]   [receives agentDB]  [indirect]  [receives agentDB]
         │                    │
         │                    ├─→ session-commands.ts
         │                    ├─→ validation-commands.ts
         │                    └─→ derive-commands.ts
         │
         └─→ UnifiedRuleEvaluator [receives agentDB]
                  └─→ SimilarityScorer [receives agentDB]

┌─────────────────────────────────────────────────────┐
│              LLM Engines (NEED REFACTOR)            │
│  llm-engine.ts: 4x getUnifiedAgentDBService() ❌     │
│  openai-engine.ts: 4x getUnifiedAgentDBService() ❌   │
└─────────────────────────────────────────────────────┘
```

---

## Phase 3-4 Implementation Plan

### Phase 3: BackgroundValidator Extraction ✅ COMPLETE

**Files Modified:**
1. `/src/llm-engine/validation/background-validator.ts` - NEW file
2. `/src/llm-engine/validation/index.ts` - Export BackgroundValidator
3. `/src/terminal-ui/chat-interface.ts` - Use BackgroundValidator class

**Benefits:**
- Encapsulates validation logic
- Testable component
- Proper lifecycle management

### Phase 4: BackgroundValidator Initialization Order ✅ COMPLETE

**Change:**
```typescript
// BEFORE (chat-interface.ts lines 88-122)
function setupBackgroundValidation(): void {
  agentDB.onGraphChange(() => {
    if (validationTimeout) clearTimeout(validationTimeout);
    validationTimeout = setTimeout(async () => {
      const evaluator = createUnifiedRuleEvaluator(agentDB);
      // ... validation logic
    }, 500);
  });
}

// AFTER (chat-interface.ts lines 537-543)
backgroundValidator = createBackgroundValidator(agentDB, chatCanvas, {
  debounceMs: 300, // CR-038 Phase 4: 300ms as specified
  phase: 'phase2_logical',
  log,
});
```

**Key Differences:**
1. **Moved after ChatCanvas initialization** - can now call `chatCanvas.setValidationSummary()`
2. **Debounce reduced to 300ms** - faster feedback (was 500ms)
3. **Proper cleanup** - `backgroundValidator.stop()` on exit

---

## Phase 5: WebSocket Data Integration (FUTURE)

### Goal
Pass agentDB via WebSocket broadcast data instead of storing in CommandContext.

### Files to Modify (Phase 5)
1. `/src/shared/types/llm.ts` - Add `agentDB` to LLMRequest
2. `/src/canvas/websocket-server.ts` - Include agentDB in broadcasts
3. `/src/terminal-ui/chat-interface.ts` - Remove `ctx.agentDB`, use broadcast data
4. `/src/llm-engine/llm-engine.ts` - Receive agentDB from request.agentDB
5. `/src/llm-engine/openai-engine.ts` - Receive agentDB from request.agentDB

---

## Test Files (No Changes Required)

Tests correctly create isolated instances:
1. `/tests/integration/agentdb/crash-recovery.test.ts` - 13 instances
2. `/tests/integration/validation/testdata-evaluator.test.ts` - 1 instance
3. `/tests/unit/validation/unified-rule-evaluator.test.ts` - 1 instance
4. `/tests/unit/canvas/stateless-graph-canvas.test.ts` - 1 instance
5. `/tests/unit/agentdb/reflexion-memory.test.ts` - 1 instance
6. `/tests/unit/agentdb/unified-agentdb-service.test.ts` - 2 instances
7. `/tests/unit/agentdb/neo4j-sync.test.ts` - 1 instance

**Test Strategy:**
- Tests MUST create isolated instances (correct behavior)
- Add ESLint rule: `no-new-agentdb-in-production`
- Rule should allow `new UnifiedAgentDBService()` ONLY in `/tests/` directory

---

## Risk Assessment

### HIGH RISK (Must Test Extensively)

1. **LLM Engine Refactor**
   - **Risk**: Breaking request processing flow
   - **Mitigation**: Add `agentDB` to LLMRequest type, pass from chat-interface
   - **Testing**: E2E tests for full request cycle

2. **Episode Storage**
   - **Risk**: Wrong AgentDB instance for Reflexion memory
   - **Mitigation**: Use module-level `agentDB` in chat-interface.ts
   - **Testing**: Verify episodes saved to correct instance

3. **Change Tracking**
   - **Risk**: Baseline vs. edits in different instances
   - **Mitigation**: Single instance ensures consistency
   - **Testing**: Verify `/status` shows correct changes after edits

### MEDIUM RISK

4. **Background Validation**
   - **Risk**: Initialization order (needs ChatCanvas)
   - **Mitigation**: ✅ Phase 4 moved after ChatCanvas init
   - **Testing**: Verify validation results pushed to ChatCanvas

5. **WebSocket Broadcasts**
   - **Risk**: Serializing AgentDB state for broadcast
   - **Mitigation**: Phase 5 - pass agentDB reference, not serialized state
   - **Testing**: Multi-terminal sync tests

### LOW RISK

6. **Validation Layer**
   - **Risk**: Already using constructor injection
   - **Mitigation**: No changes needed
   - **Testing**: Existing validation tests

7. **Canvas Layer**
   - **Risk**: Already using constructor injection
   - **Mitigation**: No changes needed
   - **Testing**: Existing canvas tests

---

## Success Criteria

### Phase 3-4 (COMPLETE ✅)
- [x] BackgroundValidator extracted to separate class
- [x] Initialization order fixed (after ChatCanvas)
- [x] Debounce reduced to 300ms
- [x] Proper cleanup on exit

### Phase 5 (FUTURE)
- [ ] Only ONE call to `getUnifiedAgentDBService()` (in main())
- [ ] All LLM engines receive agentDB via request parameter
- [ ] All commands receive agentDB via WebSocket data (not CommandContext)
- [ ] No `getAgentDB()` helper function exists
- [ ] ESLint rule prevents new AgentDB instances in production code
- [ ] E2E tests verify single instance across terminals
- [ ] Change tracking works correctly after `/commit`
- [ ] Background validation sees same data as LLM

---

## Conclusion

**Total Scope:**
- **Production Files**: 11 files analyzed
- **Test Files**: 7 files (no changes)
- **High-Risk Changes**: 2 files (llm-engine.ts, openai-engine.ts)
- **Medium-Risk Changes**: 1 file (chat-interface.ts)
- **Low-Risk Changes**: 0 files (validation/canvas already correct)

**Current Status (Phase 4 Complete):**
- ✅ BackgroundValidator extracted and integrated
- ✅ Initialization order corrected
- ✅ Proper lifecycle management

**Next Steps (Phase 5):**
The architecture is now ready for WebSocket data integration. Phase 5 will eliminate the remaining `getUnifiedAgentDBService()` calls in LLM engines by passing agentDB via request parameters.

**Estimated Effort (Phase 5):**
- LLM Engine Refactor: 3-4 hours
- WebSocket Integration: 2-3 hours
- Testing & Validation: 2-3 hours
- **Total: 7-10 hours**
