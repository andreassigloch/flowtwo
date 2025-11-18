# GraphEngine - Implementation Plan

**Version:** 2.0.0
**Author:** andreas@siglochconsulting
**Date:** 2025-11-18
**Status:** Updated based on current implementation

---

## Implementation Philosophy

**Test-Driven Development (TDD)**: Write tests BEFORE implementation
**Root Cause Driven**: Fix diseases, not symptoms
**Test Pyramid**: 70% Unit / 20% Integration / 10% E2E

**Quality Gates** (ALL must pass before PR merge):
- ✅ Unit test coverage ≥80%
- ✅ Integration test coverage ≥60%
- ✅ E2E smoke tests: 100% pass rate
- ✅ Contract violations: 0
- ✅ Test isolation failures: 0

---

## Current Status Overview

**Implementation Progress:** 41% (27/66 requirements)
**Architecture Compliance:** ✅ Excellent
**MVP Status:** ⚠️ Pre-MVP - Critical features missing

See [IMPLEMENTATION_ANALYSIS.md](IMPLEMENTATION_ANALYSIS.md) for detailed status.

---

## Phase 0: Foundation ✅ COMPLETE (90%)

### Status
- ✅ Project structure established
- ✅ Type definitions complete
- ✅ Test infrastructure configured
- ⏳ Specification files (rendering_ontology.json, view configs) missing

### Remaining Tasks
1. Create `docs/specs/rendering_ontology.json` with node rendering rules (L0-L4 zoom levels)
2. Create view configuration files in `docs/specs/views/`:
   - `hierarchy.json` (Reingold-Tilford)
   - `functional-flow.json` (Orthogonal + ports)
   - `requirements.json` (Sugiyama layered)
   - `allocation.json` (Treemap)
   - `use-case-diagram.json` (Radial)
3. Document Format E EBNF grammar in `docs/specs/format_e_spec.md`

---

## Phase 1: Canvas State Manager ⚠️ PARTIAL (42%)

### Completed ✅
- Canvas state management (GraphCanvas, ChatCanvas, CanvasBase)
- Format E parsing and serialization
- Diff application logic
- Dirty tracking
- Type-safe state structures

### 🔴 CRITICAL ISSUES

#### 1. Silent Neo4j Persistence Failure
**Location:** [src/canvas/graph-canvas.ts:340-342](../src/canvas/graph-canvas.ts#L340-L342)

**Problem:** Optional Neo4j client → silent data loss when absent

**Fix Required:**
- Make Neo4j client mandatory in constructor OR
- Throw explicit error when persistence attempted without client
- Remove console.log fallbacks
- Add integration tests for actual database persistence

#### 2. WebSocket Broadcasting Not Implemented
**Location:** [src/canvas/canvas-base.ts:184-198](../src/canvas/canvas-base.ts#L184-L198)

**Problem:** Multi-user sync impossible - updates only logged

**Fix Required:**
- Implement WebSocket server in Canvas
- Broadcast updates to all clients in same workspace+system
- Terminal UI subscribe to WebSocket updates
- Implement operational transform for concurrent edits (optional for MVP)

### Remaining Tasks
1. **Fix persistence layer** (Critical)
   - Require Neo4j client or throw errors
   - Implement auto-save interval (5 min default)
   - Persist on session end
   - Add crash recovery

2. **Implement WebSocket broadcasting** (Critical)
   - Add WebSocket server to Canvas
   - Broadcast graph_update and chat_update events
   - Handle client subscriptions by workspace+system

3. **Cache strategy decision logic**
   - Implement: use cache vs apply diff vs fetch from Neo4j
   - Load from Neo4j on session start
   - Configurable cache invalidation

4. **Multi-user operational transform** (Post-MVP)
   - Conflict resolution for concurrent edits
   - Support max 10 concurrent users per workspace

---

## Phase 2: Graph Engine - Layouts ⚠️ PARTIAL (25%)

### Completed ✅
- Reingold-Tilford tree layout (Hierarchy View)
- View filtering (layout vs render graphs)
- Port extraction from FLOW nodes
- Graph Engine REST API structure

### Missing 🔴 HIGH PRIORITY

#### Layout Algorithms (4/5 missing)
**Location:** [src/graph-engine/graph-engine.ts:79-92](../src/graph-engine/graph-engine.ts#L79-L92)

All throw explicit errors - need implementation:

1. **Sugiyama Layered Layout** (Requirements Traceability View)
   - Assign nodes to layers based on longest path
   - Minimize edge crossings (barycenter heuristic)
   - Support layer constraints
   - Target: <2s for <1000 nodes

2. **Orthogonal Layout** (Functional Flow View)
   - Manhattan routing (90° angles only)
   - Port-based connectivity
   - Minimize edge-node overlaps
   - Target: <3s for <500 nodes + <1000 edges

3. **Treemap Layout** (Allocation View)
   - Squarified treemap algorithm
   - Pack child nodes within containers
   - Auto-resize containers
   - Configurable aspect ratio

4. **Radial Layout** (Use Case Diagram View)
   - UC-centered radial positioning
   - ACTOR nodes in outer ring
   - Support use case associations
   - Clear stakeholder visualization

### Remaining Tasks
1. **Implement 4 missing layout algorithms** (High Priority)
2. **Performance optimization**
   - Benchmark all layouts with 500-1000 node graphs
   - Ensure <2s completion time
   - Implement incremental layout updates
3. **Enhance FLOW property extraction**
   - Move from regex parsing to structured metadata
   - Define FLOW property schema (Type, Pattern, Validation)

---

## Phase 3: LLM Engine + AgentDB ⚠️ PARTIAL (25%)

### Completed ✅
- LLM request/response handling (Anthropic API)
- Prompt caching (Anthropic native)
- Response parsing (text + operations extraction)
- Canvas state serialization to Format E

### Missing 🔴 HIGH PRIORITY

#### 1. Auto-Derivation Logic
**Requirements:** FR-8.1

Not implemented - core AI assistance feature:

- **UC → FUNC**: Decompose use cases into functions
- **REQ → TEST**: Generate test cases from requirements
- **FUNC → FLOW**: Infer I/O flows from function descriptions
- **FUNC → MOD**: Suggest allocation to hardware/software modules

**Implementation Approach:**
- Add derivation prompts to PromptBuilder
- Parse derived entities from LLM response
- Link derived nodes to source nodes (compose, satisfy, verify, allocate)
- Require user confirmation for large derivations

#### 2. Ontology Validation Advisor
**Requirements:** FR-8.2

Not implemented - quality assurance missing:

**12 Validation Rules to Implement:**
1. Naming: PascalCase, max 25 chars
2. Isolation: No isolated nodes (except top-level SYS)
3. Function I/O: Every FUNC must have ≥1 input AND ≥1 output FLOW
4. FCHAIN connectivity: All elements connected via io
5. Functional flow: ACTOR→FLOW→FUNC→...→FLOW→ACTOR chain
6. Leaf UC actor: Leaf UC must have ≥1 ACTOR
7. Requirement satisfied: Every REQ satisfied by ≥1 FUNC or UC
8. Requirement verified: Every REQ verified by ≥1 TEST
9. No circular compose: No circular composition
10. Valid I/O connection: FLOW Type must match on both sides
11. Allocated functions: Every FUNC allocated to ≥1 MOD (warning)
12. Schema referenced: SCHEMA referenced by ≥1 FLOW (warning)

**Implementation Approach:**
- Create validation engine in `src/llm-engine/validator.ts`
- Run validation before applying LLM operations
- LLM explains violations in natural language
- LLM suggests fixes
- Block on errors, warn on warnings

#### 3. AgentDB Persistent Caching
**Requirements:** FR-10.2

Config exists but not implemented:

- Cache LLM responses by (prompt hash + canvas hash)
- Cache canvas state history per chat session
- Cache ontology snapshots per workspace
- Cache derivation rules
- Configurable TTL (default: 30 min for responses, persistent for history)
- Cache invalidation on canvas state changes

**Implementation Approach:**
- Install AgentDB MCP client
- Integrate with LLMEngine
- Check cache before LLM call
- Store response after LLM call
- Invalidate on canvas mutations

### Remaining Tasks
1. **Implement auto-derivation** (High Priority)
2. **Implement validation advisor** (High Priority)
3. **Add SE methodology prompts** (Medium Priority)
   - INCOSE/SysML 2.0 guidance
   - Phase recognition (requirements → architecture → design → verification)
   - Suggest next logical steps
4. **Integrate AgentDB caching** (Medium Priority)
5. **Add clarifying question logic** (Medium Priority)
   - LLM asks questions when requirements ambiguous
   - Store clarifications in context

---

## Phase 4: Terminal UI ✅ COMPLETE (100%)

### Status
- ✅ Chat interface (readline-based, clean conversation UI)
- ✅ Graph visualization (ASCII tree, auto-refresh)
- ✅ Application logging (separate STDOUT terminal)
- ✅ 3-terminal architecture (macOS Terminal.app windows)
- ✅ IPC via shared state file (polling-based, simple and debuggable)
- ✅ View context tracking (hierarchy, functional, requirements, allocation, usecase)
- ✅ LLM integration with streaming responses

### Implementation Details
**Architecture**: 3 separate terminals instead of tmux panels
- **Terminal 1 (STDOUT)**: `tail -f /tmp/graphengine.log` - all debug output, LLM usage stats
- **Terminal 2 (GRAPH)**: ASCII visualization polling `/tmp/graphengine-state.json` every 500ms
- **Terminal 3 (CHAT)**: Clean readline interface for user interaction

**Key Decisions**:
- Abandoned tmux due to quote escaping complexity
- Simple shared file IPC (debuggable, no FIFO/WebSocket needed for MVP)
- Clean separation: logs, visualization, interaction
- Ontology V3 compliant: only compose edges create hierarchy indentation

### Enhancements (Post-MVP)
1. Interactive graph editing (node/edge creation via UI)
2. Minimap for large graphs (>100 nodes)
3. Expand/collapse container nodes
4. Zoom levels (L0-L4) per node type
5. Pan & zoom controls (keyboard + mouse)

---

## Phase 5: Integration & E2E ⚠️ PARTIAL (31%)

### Completed ✅
- E2E smoke tests for Terminal UI
- Basic system integration
- Test infrastructure (Vitest, testcontainers)

### Missing

#### 1. Persistence Integration Tests
**Critical** - Verify actual Neo4j operations:

- Canvas persists dirty nodes to Neo4j
- Audit logs created with chatId tracing
- Chat messages persisted and retrievable
- Data survives restart
- No test isolation failures

#### 2. Multi-User Sync Tests
**Critical** - Verify WebSocket broadcasting:

- User A edit broadcasts to User B
- Concurrent edits handled correctly
- Canvas state consistent across clients
- Max 10 concurrent users supported

#### 3. Performance Tests
**High Priority** - Measure against requirements:

- Layout computation <2s for 500-node graphs
- LLM time to first token <500ms
- Token streaming <50ms per token
- Canvas update <200ms after LLM operations
- Prompt caching >60% token reduction

#### 4. Contract Validation Tests
**Medium Priority** - Ensure API compliance:

- WebSocket message format validation
- REST API schema validation (OpenAPI)
- Format E diff syntax validation
- Type contract enforcement

### Remaining Tasks
1. **Add persistence integration tests** (Critical)
2. **Add multi-user sync E2E tests** (Critical)
3. **Add performance benchmarks** (High Priority)
4. **Add contract validation tests** (Medium Priority)
5. **Improve test pyramid balance**
   - Increase unit tests (60% → 70%)
   - Reduce E2E tests (25% → 10%)

---

## Phase 6: Production Readiness (Not Started)

### Requirements
1. **Auto-save & crash recovery**
   - Auto-save every 5 minutes
   - Persist on session end (even on crash)
   - Recover from Neo4j connection loss (exponential backoff)

2. **Access control**
   - User roles: owner, admin, editor, viewer
   - Workspace-level permissions
   - Return 403 on access violations

3. **Error handling**
   - Natural language error messages
   - Suggest corrective actions
   - Full context logging for debugging

4. **Monitoring & metrics**
   - LLM usage tracking
   - Layout performance metrics
   - Token reduction measurements
   - User activity logs

5. **Documentation**
   - API documentation (OpenAPI spec)
   - User guide
   - SE methodology guide
   - Deployment guide

---

## Testing Strategy

### Unit Tests (Target: 70%)
**Current:** 60% of test files

**Focus Areas:**
- Format E parsing (valid/invalid syntax)
- Canvas state management (add/remove/update)
- Diff application logic
- View filtering
- Port extraction
- Layout algorithms (positions, bounds)
- LLM request/response handling
- Validation rules

**Mocking:**
- Mock Anthropic API
- Mock Neo4j (use in-memory structures)
- Mock AgentDB
- No real I/O

### Integration Tests (Target: 20%)
**Current:** 15% of test files

**Focus Areas:**
- Canvas ↔ Neo4j persistence
- LLM Engine ↔ AgentDB communication
- Graph Engine REST API
- WebSocket message contracts
- Multi-user canvas sync

**Test Containers:**
- Neo4j 5.x
- Redis (if used for sessions)

### E2E Tests (Target: 10%)
**Current:** 25% of test files (too many - rebalance)

**Critical Paths (5-10 tests only):**
1. Create system via natural language
2. Switch between views
3. Multi-user concurrent edit
4. Persistence after restart
5. Performance: layout <2s for 500 nodes

**Environment:** Full system (all components running)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Layout algorithms too complex | Medium | High | Use ELK.js as fallback, simplify custom algorithms |
| LLM hallucinations create invalid graphs | High | High | Strong validation, rollback on error, user confirmation |
| Neo4j performance at scale | Low | Medium | Index optimization, query profiling, graph partitioning |
| AgentDB integration delays | Medium | Medium | File-based cache as fallback |
| Multi-user conflicts | Medium | High | Operational transform, conflict resolution UI |

---

## Definition of Done (Each Phase)

**Code Complete:**
1. ✅ All unit tests written BEFORE implementation
2. ✅ All unit tests pass (≥80% coverage)
3. ✅ All integration tests pass (≥60% coverage)
4. ✅ E2E smoke tests pass (100%)
5. ✅ Contract validation tests pass (0 violations)
6. ✅ No test isolation failures
7. ✅ Code reviewed
8. ✅ Documentation updated

**Phase Complete:**
1. All tasks "Code Complete"
2. CI/CD pipeline green
3. Demo successful

---

## MVP Acceptance Criteria

From [requirements.md](requirements.md) Section 6:

| # | Criterion | Status | Blocker |
|---|-----------|--------|---------|
| 1 | Create complete system via NL | ⏳ PARTIAL | Auto-derivation missing |
| 2 | Switch between all 5 views | ❌ NO | 4 layouts missing |
| 3 | LLM auto-derives with >80% accuracy | ❌ NO | Auto-derivation not implemented |
| 4 | LLM validates 12 ontology rules | ❌ NO | Validation not implemented |
| 5 | Canvas persists across sessions | ❌ NO | Persistence mocked |
| 6 | Multi-user sync for 2+ users | ❌ NO | WebSocket not implemented |
| 7 | Layout <2s for 500-node graph | ⏳ UNTESTED | No benchmarks |
| 8 | Prompt caching >60% reduction | ⏳ UNTESTED | No measurements |
| 9 | Operations audit-logged | ❌ NO | Audit log mocked |
| 10 | Zero data loss on crash | ❌ NO | Auto-save not implemented |

**MVP Status:** ❌ **NOT READY** (0/10 criteria met)

---

## Priority Roadmap

### 🔴 CRITICAL (Week 1-2) - Must Fix for ANY Use
1. Fix silent Neo4j persistence failures
2. Implement WebSocket broadcasting
3. Add persistence integration tests
4. Fix audit logging

### 🟡 HIGH PRIORITY (Week 3-4) - Needed for MVP
5. Implement 4 missing layout algorithms
6. Implement auto-derivation (UC→FUNC, REQ→TEST)
7. Implement ontology validation (12 rules)
8. Add performance benchmarks

### 🟢 MEDIUM PRIORITY (Week 5-6) - MVP Enhancement
9. Integrate AgentDB caching
10. Add SE methodology prompts
11. Implement auto-save & crash recovery
12. Add access control

### 🔵 LOW PRIORITY (Post-MVP)
13. Interactive graph editing
14. Expand/collapse nodes
15. Zoom levels (L0-L4)
16. Minimap for large graphs

---

## Estimated Timeline

**Current Status:** Pre-MVP (41% complete)

**Remaining Effort to MVP:**
- Critical fixes: 1-2 weeks
- High priority features: 2-3 weeks
- Integration & testing: 1 week
- **Total: 4-6 weeks**

**Assumptions:**
- 1 full-time developer
- No major blockers
- AgentDB integration straightforward
- Layout algorithms can use ELK.js if needed

---

**End of Implementation Plan**
