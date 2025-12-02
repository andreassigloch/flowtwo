# CR-027: Agentic Framework and Process Upgrade

**Type:** Architecture
**Status:** Completed
**Priority:** HIGH
**Target Phase:** Phase 2-3
**Created:** 2025-11-28
**Author:** andreas@siglochconsulting

## Problem / Use Case

### Current State
CR-024 implemented a multi-agent system with 4 agents, but:
1. **Agent configuration embedded in code** - Agent prompts and behavior defined in TypeScript files
2. **No formal process definition** - Phases exist but workflow/routing not externalized
3. **Limited decision tree usage** - Decision trees in ontology-rules.json but not fully integrated
4. **Missing verification-engineer agent** - Phase 4 (verification) has no dedicated agent
5. **No volatility-aware architecture** - New `volatility` property on FUNC not leveraged by agents

### Gap Analysis (CR-024 vs New Framework)
| Aspect | CR-024 Implementation | CR-027 Upgrade |
|--------|----------------------|----------------|
| Agent definition | Code (agent-prompts.ts) | JSON config + MD prompts |
| Workflow routing | Implicit in code | Explicit in agent-config.json |
| Tool access | Hardcoded | Configurable per agent |
| Success criteria | Generic | Per-agent rule sets |
| Agent handoff | Manual | Explicit triggers and data contracts |
| Work item queue | Basic AgentMessage | Full work item lifecycle |
| Volatility handling | Not addressed | Decision tree + validation rule |

### New Assets Created
The following specification files have been created and need implementation:
- `settings/agent-config.json` - Agent behavior, workflow, routing (NEW)
- `settings/prompts/*.md` - 5 agent prompt templates (NEW)
- `settings/ontology-rules.json` - Updated with volatility property and rule

## Requirements

### Functional Requirements

**FR-027.1: Configuration-Driven Agents**
- Load agent definitions from `agent-config.json`
- Load prompts from `settings/prompts/*.md`
- Runtime agent configuration without code changes

**FR-027.2: Workflow Routing Engine**
- Implement routing rules from `agent-config.json.workflow.routing`
- Route user input to appropriate agent based on phase and context
- Route validation failures to reviewer → responsible agent

**FR-027.3: Agent Handoff Protocol**
- Implement handoff triggers and data contracts
- Pass Format E snapshots between agents
- Track handoff history in AgentDB

**FR-027.4: Work Item Queue**
- Full work item lifecycle (pending → in_progress → completed/blocked)
- Priority-based processing
- Timeout handling per priority level
- Route work items to responsible agents

**FR-027.5: Verification Engineer Agent**
- New agent for Phase 4 (verification)
- Creates TEST nodes for REQs
- Validates full traceability path
- Reports coverage gaps

**FR-027.6: Volatility-Aware Architecture**
- System-architect uses `volatilityClassification` decision tree
- Assigns volatility property to FUNC nodes
- Validates with `volatile_func_isolation` rule
- Suggests adapter/facade patterns for high-volatility FUNC

**FR-027.7: Phase Gate Automation**
- architecture-reviewer validates gate rules automatically
- Block phase transition if gate rules fail
- Generate work items for blocking violations

### Non-Functional Requirements

**NFR-027.1:** Agent configuration hot-reload without restart
**NFR-027.2:** Prompt changes take effect immediately
**NFR-027.3:** Work item processing < 100ms per item
**NFR-027.4:** Full audit trail of agent activities

## Architecture / Solution Approach

### 1. Configuration Loader

```typescript
// New: src/llm-engine/agents/config-loader.ts
interface AgentConfigLoader {
  loadAgentConfig(): AgentConfig;
  loadPrompt(agentId: string): string;
  watchForChanges(callback: () => void): void;
}
```

### 2. Workflow Router

```typescript
// New: src/llm-engine/agents/workflow-router.ts
interface WorkflowRouter {
  routeUserInput(message: string, context: SessionContext): AgentId;
  routeValidationFailure(violations: Violation[]): WorkItem[];
  routePhaseGate(phase: Phase): GateResult;
}
```

### 3. Work Item Manager

```typescript
// New: src/llm-engine/agents/work-item-manager.ts
interface WorkItemManager {
  createWorkItem(item: WorkItemInput): WorkItem;
  getNextItem(agentId: string): WorkItem | null;
  updateStatus(itemId: string, status: WorkItemStatus): void;
  getBlockingItems(phase: Phase): WorkItem[];
}
```

### 4. Agent Executor Refactor

```typescript
// Refactor: src/llm-engine/agents/agent-coordinator.ts
interface AgentExecutor {
  executeAgent(agentId: string, context: ExecutionContext): AgentResult;
  validateSuccess(agentId: string, result: AgentResult): boolean;
  handoffToNext(agentId: string, result: AgentResult): void;
}
```

### 5. File Structure

```
settings/
├── ontology-rules.json          # Domain knowledge (existing, v3.0.8+)
├── agent-config.json            # Agent behavior (NEW - created)
└── prompts/                     # Agent prompts (NEW - created)
    ├── requirements-engineer.md
    ├── system-architect.md
    ├── architecture-reviewer.md
    ├── functional-analyst.md
    └── verification-engineer.md

src/llm-engine/agents/
├── index.ts                     # Exports (update)
├── types.ts                     # Types (update with new interfaces)
├── config-loader.ts             # NEW: Load agent-config.json + prompts
├── workflow-router.ts           # NEW: Route decisions
├── work-item-manager.ts         # NEW: Work item lifecycle
├── agent-executor.ts            # REFACTOR from agent-coordinator.ts
├── agent-prompts.ts             # DEPRECATE: Move to prompts/*.md
├── decision-tree.ts             # Keep (used by system-architect)
├── validation-queries.ts        # Keep (used by architecture-reviewer)
├── architecture-validator.ts    # Keep (enhance with volatility)
└── review-flow.ts               # Keep (integrate with work items)
```

## Implementation Plan

### Phase 1: Configuration Infrastructure (4-6 hours) ✅
- [x] Create `config-loader.ts` with hot-reload support
- [x] Load `agent-config.json` at startup
- [x] Load prompts from `settings/prompts/*.md`
- [x] Unit tests for config loading (23 tests)

### Phase 2: Workflow Router (4-6 hours) ✅
- [x] Implement routing rules engine
- [x] Route user input based on phase/context
- [x] Route validation failures to work items
- [x] Unit tests for routing logic (21 tests)

### Phase 3: Work Item Manager (4-6 hours) ✅
- [x] Implement work item CRUD
- [x] Priority-based queue
- [x] Timeout handling
- [x] AgentDB storage integration
- [x] Unit tests (20 tests)

### Phase 4: Agent Executor Refactor (6-8 hours) ✅
- [x] Refactor agent-coordinator to use config
- [x] Implement handoff protocol
- [x] Track success criteria per agent
- [x] Deprecate hardcoded prompts (note added to agent-prompts.ts)
- [x] Unit tests

### Phase 5: Verification Engineer Agent (4-6 hours) ✅
- [x] Implement verification-engineer execution
- [x] TEST node creation from REQs
- [x] Coverage gap detection
- [x] Traceability validation
- [x] Unit tests

### Phase 6: Volatility Integration (3-4 hours) ✅
- [x] Integrate volatilityClassification decision tree
- [x] Update system-architect prompt usage
- [x] Enhance architecture-validator for volatility (V11 rule)
- [x] Unit tests for volatility rules

### Phase 7: Phase Gate Automation (3-4 hours) ✅
- [x] Auto-trigger reviewer at phase boundaries
- [x] Block phase transitions on gate failures
- [x] Generate blocking work items
- [x] Unit tests

### Phase 8: Integration & Testing (4-6 hours) ✅
- [x] End-to-end workflow test (28 tests)
- [x] Multi-agent handoff test
- [x] Work item processing test
- [x] Performance benchmarks (< 10ms work items, < 5ms routing)

## Current Status

- [x] `settings/agent-config.json` created
- [x] `settings/prompts/*.md` created (5 agents)
- [x] `settings/ontology-rules.json` updated with volatility
- [x] Phase 1: Configuration Infrastructure ✅ (config-loader.ts, 23 tests)
- [x] Phase 2: Workflow Router ✅ (workflow-router.ts, 21 tests)
- [x] Phase 3: Work Item Manager ✅ (work-item-manager.ts, 20 tests)
- [x] Phase 4: Agent Executor Refactor ✅ (agent-executor.ts)
- [x] Phase 5: Verification Engineer Agent ✅ (added to types.ts, agent-prompts.ts)
- [x] Phase 6: Volatility Integration ✅ (V11 rule in architecture-validator.ts)
- [x] Phase 7: Phase Gate Automation ✅ (phase-gate-manager.ts)
- [x] Phase 8: Integration & Testing ✅ (28 integration tests, performance benchmarks)
- [x] Phase 9: Runtime Integration ✅ (chat-interface.ts uses WorkflowRouter, AgentExecutor)
- [x] Legacy cleanup ✅ (deleted agent-coordinator.ts, agent-prompts.ts)

## Acceptance Criteria

- [x] Agents loaded from `agent-config.json` (not hardcoded)
- [x] Prompts loaded from `settings/prompts/*.md`
- [x] Hot-reload works for config and prompts
- [x] Workflow routing follows `agent-config.json` rules
- [x] Work items have full lifecycle with timeouts
- [x] Verification-engineer creates TEST nodes
- [x] Volatility assigned to FUNC nodes by system-architect
- [x] High-volatility FUNC validated (≤2 dependents) - V11 rule
- [x] Phase gates block on rule failures
- [x] 80% unit test coverage for new code (145 unit tests across 7 files)
- [x] Integration tests for full workflow (28 tests in agentic-framework.test.ts)

## Dependencies

- CR-024 (Multi-Agent System) - COMPLETED, provides foundation
- CR-026 (AgentDB Self-Learning) - PLANNED, uses reward calculation
- `settings/ontology-rules.json` v3.0.7+ with volatility

## Out of Scope (See CR-028)

The following are explicitly **out of scope** for CR-027 and covered by CR-028:
- Architecture variant generation (move operators)
- Multi-objective scoring (cohesion, coupling, volatility, testability)
- Pareto optimization and non-dominated sorting
- ViolationGuidedLocalSearch algorithm
- Optimizer-Agent implementation
- Test fixture architectures for benchmarking

CR-027 focuses on **agent infrastructure** (config, routing, handoffs).
CR-028 focuses on **architecture optimization** (variants, scoring, search).

## Impact on Other CRs

### Supersedes
None - CR-024 completed, this is an upgrade

### Enhances
| CR | Impact |
|----|--------|
| **CR-024** | Externalizes agent config, adds verification-engineer |
| **CR-026** | Provides better reward signals via volatility rules |
| **CR-005** | Auto-derivation uses agent framework (remaining phases) |

### Enables
| CR | Impact |
|----|--------|
| **CR-028** | Architecture Optimization Cycles - uses agent framework for Optimizer-Agent |

### Obsoletes (Recommend Archive)
| CR | Reason |
|----|--------|
| **CR-018** (Service Orchestration) | Agent framework provides orchestration for LLM services; general service orchestration less critical now |

### Needs Update
| CR | Update Required |
|----|-----------------|
| **CR-003** (Refactoring) | Add new agent files to refactoring scope |
| **CR-013** (Phase 0 Specs) | Reference agent-config.json in architecture |

## Estimated Effort

| Phase | Hours |
|-------|-------|
| Configuration Infrastructure | 4-6 |
| Workflow Router | 4-6 |
| Work Item Manager | 4-6 |
| Agent Executor Refactor | 6-8 |
| Verification Engineer Agent | 4-6 |
| Volatility Integration | 3-4 |
| Phase Gate Automation | 3-4 |
| Integration & Testing | 4-6 |
| **Total** | **32-46 hours (4-6 days)** |

## Benefits

**Maintainability:**
- Agent behavior tunable without code changes
- Prompts iterable by non-developers
- Clear separation: domain (ontology) vs behavior (config)

**Extensibility:**
- Add new agents via config + prompt file
- Modify workflow routing via JSON
- Adjust success criteria without deployment

**Quality:**
- Volatility-aware architecture reduces change impact
- Full traceability via verification-engineer
- Automated phase gates ensure quality before progression

**Transparency:**
- Explicit workflow visible in config
- Work item queue shows pending tasks
- Agent handoffs logged and traceable

## References

- CR-024: Multi-Agent Architecture System (completed)
- CR-026: AgentDB Self-Learning (planned)
- `settings/agent-config.json` - Agent configuration
- `settings/prompts/` - Agent prompt templates
- `settings/ontology-rules.json` - Ontology with volatility
- ISO 15288, INCOSE SE Handbook - SE process standards
