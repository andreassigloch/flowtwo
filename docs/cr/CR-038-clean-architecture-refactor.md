# CR-038: Clean Architecture Refactor

**Type:** Architecture / Refactoring
**Status:** Planned
**Priority:** CRITICAL
**Created:** 2025-12-08
**Author:** andreas@siglochconsulting

**Fixes:** Degraded functionality in /analyze, /optimize, change tracking (CR-033)
**Builds On:** CR-032 (Unified Data Layer), CR-033 (Change Tracking)

## Problem Statement

### Symptoms
1. `/analyze` returns nothing despite loaded graph with violations
2. `/optimize` doesn't see current data
3. Change tracking indicators (+/-/~) don't appear in graph viewer
4. `/status` shows incorrect change counts

### Root Cause: Multiple AgentDB Instances

```
chat-interface.ts         → creates AgentDB instance #1 (has data)
graph-viewer.ts           → creates AgentDB instance #2 (empty baseline)
unified-rule-evaluator.ts → caches AgentDB instance #3 (stale forever)
```

**CR-032 defined AgentDB as Single Source of Truth, but implementation created multiple instances.**

### Evidence

| Component | AgentDB Source | Problem |
|-----------|---------------|---------|
| chat-interface | `getUnifiedAgentDBService()` | ✅ Has correct data |
| graph-viewer | `getUnifiedAgentDBService()` | Creates separate instance, no baseline |
| unified-rule-evaluator | `getUnifiedAgentDBService()` cached in singleton | Stale data forever |

## Consolidated Use Cases

Based on docs/architecture.md + CR-024/027/031/032/033/034:

| UC | Name | Description | Source CR |
|----|------|-------------|-----------|
| **UC-1** | Graph Modeling | User describes system → multi-agent routes → Format E ops → graph updates | CR-024, CR-027 |
| **UC-2** | Validation | `/validate`, `/phase-gate N`, `/analyze` - ontology rule checks | CR-024, CR-031 |
| **UC-3** | Optimization | `/optimize [N]`, `/score` - multi-objective scoring, Pareto front | CR-028, CR-031 |
| **UC-4** | Change Tracking | +/-/~ indicators, `/status`, `/commit` - git-like workflow | CR-033 |
| **UC-5** | Session Mgmt | `/load`, `/save`, `/import`, `/export` - Neo4j persistence | CR-032 |
| **UC-6** | Self-Learning | Episodes, rewards, skill library, embedding retrieval | CR-026, CR-031 |
| **UC-7** | LLM Flexibility | Anthropic/OpenAI/Local provider switching via env | CR-034 |

## Requirements

### Functional Requirements

**FR-038.1: Single AgentDB Instance**
- Only ONE AgentDB instance per session
- All components receive reference, don't create own

**FR-038.2: Dependency Injection**
- Components receive AgentDB via parameter/constructor
- No singleton factory caching (`evaluatorInstances` removed)

**FR-038.3: Render-Ready WebSocket Broadcasts**
- WebSocket payload includes `nodeChangeStatus`
- Graph viewer doesn't need AgentDB to show change indicators

**FR-038.4: Thin Terminal Components**
- Chat Interface: I/O only (user input, LLM output display)
- Graph Viewer: pure display (receives render-ready data)

### Non-Functional Requirements

**NFR-038.1:** No performance regression
**NFR-038.2:** All existing tests pass
**NFR-038.3:** Zero breaking changes to commands

### Scalability Considerations (Future-Proofing)

Current architecture targets single-user with <500 nodes. For scale:

| Bottleneck | Current | Solution | Priority |
|------------|---------|----------|----------|
| Full graph broadcast | O(n) per change | Format E = delta by design ✅ | Already solved |
| Variant Pool memory | Deep copy O(n) | Copy-on-write | 🟠 Add in Phase 6 |
| Command blocking | Sequential | Async queue + workers | 🟡 Future CR |
| View isolation | Broadcast all | View subscriptions (client requests) | 🟡 Future CR |
| Multi-user | Single session | Session registry | ⚪ Out of scope |

**Key Insight:** Format E operations ARE deltas. No new format needed for efficient broadcasts.

**Recommendation:** Implement copy-on-write variants (Phase 6) now. View subscriptions can be added when multiple canvas views are needed.

## Architecture

### Component Responsibilities

| Component | Responsibility | Owns State? |
|-----------|---------------|-------------|
| **Session Manager** | Session lifecycle, owns AgentDB | YES - single AgentDB |
| **LLM Engine** | Multi-agent routing, streaming | NO - receives AgentDB ref |
| **Validation** | Rule evaluation, scoring | NO - receives AgentDB ref |
| **Canvas** | View transformation (Format E) | NO - reads AgentDB |
| **Chat Interface** | User I/O, command dispatch | NO - receives context |
| **Graph Viewer** | Render ASCII from WS data | NO - pure display |

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SESSION MANAGER (Orchestrator)                   │
│                        src/session-manager.ts (NEW)                      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              UnifiedAgentDBService (SINGLE INSTANCE)               │ │
│  │                                                                     │ │
│  │   GraphStore    ChangeTracker    ResponseCache    EmbeddingStore   │ │
│  │   - nodes       - baseline       - query+ver      - node embeds    │ │
│  │   - edges       - diff calc      - keyed cache    - similarity     │ │
│  │   - version     - getStatus()    - invalidation   - batch compute  │ │
│  │                                                                     │ │
│  │   ReflexionMemory              SkillLibrary                        │ │
│  │   - episodes                    - success patterns                 │ │
│  │   - rewards                     - context match                    │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              Variant Pool (for Evaluator/Optimizer)                │ │
│  │   - Isolated graph copies for what-if analysis                     │ │
│  │   - Pareto front variants (optimization)                           │ │
│  │   - Does NOT pollute main graph                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                 │                                       │
│             ┌───────────────────┼───────────────────┐                   │
│             │                   │                   │                   │
│             ▼                   ▼                   ▼                   │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│   │   LLM ENGINE    │  │   VALIDATION    │  │     CANVAS      │        │
│   │                 │  │                 │  │                 │        │
│   │ WorkflowRouter  │  │ RuleEvaluator   │  │ Stateless       │        │
│   │ AgentExecutor   │  │ SimilarityScore │  │ View transform  │        │
│   │ Anthropic/OpenAI│  │ Optimizer*      │  │ Format E        │        │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │
│            │                    │                    │                  │
│            │         * Uses Variant Pool             │                  │
└────────────┼────────────────────┼────────────────────┼──────────────────┘
             │                    │                    │
             │  WebSocket Server (port 3001)           │
             │  - Broadcasts render-ready Format E     │
             │  - Includes nodeChangeStatus            │
             │                                         │
             └───────────────────┬─────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  CHAT INTERFACE │    │  GRAPH VIEWER   │    │  STDOUT LOG     │
│  (Terminal 3)   │    │  (Terminal 2)   │    │  (Terminal 1)   │
│                 │    │                 │    │                 │
│  - User input   │    │  - Receive WS   │    │  - Debug logs   │
│  - LLM output   │    │  - Render ASCII │    │  - Metrics      │
│  - Commands     │    │  - Change indic.│    │  - Agent logs   │
│  - NO state     │    │  - NO AgentDB   │    │                 │
│  - Thin I/O     │    │  - Pure display │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Architectural Principles

1. **Single Source of Truth**: ONE AgentDB instance per session
2. **Dependency Injection**: Components receive AgentDB, don't create it
3. **No Singleton Factories**: Remove `getUnifiedRuleEvaluator()` caching
4. **Render-Ready Broadcasts**: WebSocket sends computed state including changeStatus
5. **Thin Terminals**: Graph viewer = I/O only, no state management

### CR-024 Compatibility: Work Item Queue

**Risk:** Graph-viewer loses access to work item queue (agent handoffs).

**Solution:** WebSocket broadcast includes work item summary:
```typescript
// Broadcast payload (Format E)
{
  nodes: [...],
  edges: [...],
  nodeChangeStatus: { nodeId: 'added' | 'modified' | 'deleted' },
  workItemSummary: {
    pending: 3,
    inProgress: 1,
    blocked: 0,
    byAgent: { 'system-architect': 2, 'requirements-engineer': 1 }
  }
}
```

Graph viewer displays work item count without needing direct AgentDB access.

### CR-031 Compatibility: Background Validation

**Risk:** `onGraphChange()` breaks if graph-viewer has no AgentDB.

**Problem:** CR-031 designed background validation to trigger via `agentDB.onGraphChange()`. If multiple AgentDB instances exist, only one receives changes → validation inconsistent.

**Solution:** Session Manager is the ONLY component that registers `onGraphChange()`:

```typescript
// src/session-manager.ts
class SessionManager {
  private setupBackgroundValidation(): void {
    this.agentDB.onGraphChange(debounce(async () => {
      // Lightweight validation (integrity rules only)
      const result = await this.validator.validateIntegrity();

      // Include in next broadcast
      this.lastValidationResult = result;
      this.broadcastGraphUpdate();
    }, 300));
  }
}

// WebSocket broadcast includes validation summary
{
  nodes: [...],
  edges: [...],
  nodeChangeStatus: {...},
  workItemSummary: {...},
  validationSummary: {
    violationCount: 3,
    severities: { error: 1, warning: 2 },
    lastChecked: '2025-12-08T10:30:00Z'
  }
}
```

**Result:**
- Graph-viewer receives validation results via WebSocket (no direct AgentDB needed)
- Chat-interface displays violation count in prompt
- Single point of validation → consistent results

## Implementation Plan

### Phase 1: Fix Graph Viewer (2 hours)

**Files:** `src/terminal-ui/graph-viewer.ts`

**Changes:**
1. Remove `agentDB` variable and `getAgentDB()` function
2. Remove `StatelessGraphCanvas` import/usage
3. Parse `nodeChangeStatus` from WebSocket payload
4. Pass received state directly to `generateAsciiGraph()`

### Phase 2: Fix WebSocket Broadcast (2 hours)

**Files:**
- `src/terminal-ui/chat-interface.ts`
- `src/terminal-ui/graph-viewer.ts` (buffer handling)

**Key Insight:** Format E already IS the delta format. No new format needed.

**Architecture Clarification:**
- Graph viewer's local buffer was not the problem
- Problem was: viewer created separate AgentDB instance
- Solution: viewer keeps render buffer, fed by Format E deltas from single source

```
Session Manager (owns AgentDB)
        ↓
Broadcasts Format E operations + metadata
        ↓
Graph Viewer (local render buffer - OK!)
  - Applies Format E deltas to buffer
  - Renders from buffer
  - NO AgentDB instance
```

**Changes:**
1. In `notifyGraphUpdate()`: broadcast Format E operations (already deltas)
2. Include metadata in broadcast:
   ```typescript
   {
     type: 'graph-update',
     version: 42,
     operations: [...Format E ops...],  // Delta by design
     nodeChangeStatus: {...},
     workItemSummary: {...},
     validationSummary: {...}
   }
   ```
3. Graph viewer applies operations to local render buffer
4. Full sync on reconnect (`type: 'sync-request'` → server sends full state)

### Phase 3: Fix Evaluator Data Source (2 hours)

**Files:**
- `src/llm-engine/validation/unified-rule-evaluator.ts`
- `src/terminal-ui/commands/validation-commands.ts`

**Changes:**
1. Remove `evaluatorInstances` singleton cache
2. `getUnifiedRuleEvaluator()` accepts AgentDB as parameter
3. Commands pass `ctx.agentDB` to evaluator
4. Each call creates fresh evaluator with current data

### Phase 4: Background Validation (2 hours)

**Files:**
- `src/terminal-ui/chat-interface.ts`
- `src/llm-engine/validation/background-validator.ts` (new)

**Changes:**
1. Create debounced validation handler (300ms debounce)
2. Trigger on AgentDB graph changes (`onGraphChange`)
3. Lightweight mode: integrity rules only
4. Show violation count in status/prompt

### Phase 5: Session Manager (4 hours)

**Files:**
- `src/session-manager.ts` (new)
- `src/terminal-ui/chat-interface.ts` (simplify)
- `src/main.ts` (integrate)

**Changes:**
1. Create `SessionManager` class that owns AgentDB
2. Session manager creates LLM Engine, Validation with AgentDB refs
3. Session manager handles Neo4j load/save lifecycle
4. Chat interface becomes thin I/O layer
5. All components receive context from session manager

```typescript
// src/session-manager.ts
class SessionManager {
  private agentDB: UnifiedAgentDBService;
  private variantPool: VariantPool;
  private llmEngine: LLMEngine;
  private validator: UnifiedRuleEvaluator;
  private canvas: StatelessGraphCanvas;

  async initialize(config: SessionConfig): Promise<void>;
  getCommandContext(): CommandContext;
  async loadSession(systemId: string): Promise<void>;
  async saveSession(): Promise<void>;
  broadcastGraphUpdate(): void;

  // Variant Pool for evaluator/optimizer
  createVariant(name: string): GraphVariant;
  getVariants(): GraphVariant[];
  applyVariant(name: string): void;  // Merge variant into main graph
  discardVariant(name: string): void;
}
```

### Phase 6: Variant Pool with Copy-on-Write (4 hours)

**Files:**
- `src/llm-engine/agentdb/variant-pool.ts` (new)
- `src/llm-engine/optimizer/multi-objective-scorer.ts` (update)
- `src/llm-engine/validation/unified-rule-evaluator.ts` (update)

**Purpose:** Isolated playground for evaluator/optimizer analysis without polluting main graph.

**Changes:**
1. Create `VariantPool` class managing isolated graph copies
2. **Use copy-on-write** (not deep copy) for memory efficiency:
   ```typescript
   class GraphVariant {
     private baseSnapshot: GraphSnapshot;  // Shared, immutable
     private overrides: Map<string, Node>; // Only modified nodes
     private deletions: Set<string>;       // Deleted node IDs

     getNode(id: string): Node | undefined {
       if (this.deletions.has(id)) return undefined;
       return this.overrides.get(id) ?? this.baseSnapshot.nodes.get(id);
     }

     setNode(id: string, node: Node): void {
       this.overrides.set(id, node);  // Copy on write
     }
   }
   ```
3. Each variant shares unchanged nodes with base snapshot
4. Memory: O(changes) instead of O(n) per variant
5. Optimizer generates Pareto front variants efficiently
6. User explicitly applies chosen variant via `/optimize apply N`

```typescript
// src/llm-engine/agentdb/variant-pool.ts
interface GraphVariant {
  name: string;
  description: string;
  baseSnapshot: GraphSnapshot;     // Shared reference (immutable)
  overrides: Map<string, Node>;    // Modified nodes only
  deletedNodes: Set<string>;
  newEdges: Map<string, Edge>;
  deletedEdges: Set<string>;
  scores: MultiObjectiveScores;
  createdAt: Date;
}

class VariantPool {
  private baseSnapshot: GraphSnapshot;

  constructor(agentDB: UnifiedAgentDBService) {
    // Capture immutable snapshot once
    this.baseSnapshot = agentDB.getImmutableSnapshot();
  }

  createVariant(name: string): GraphVariant;  // Shares baseSnapshot
  applyOperations(variantName: string, ops: FormatEOperation[]): void;
  evaluate(variantName: string): ValidationResult;
  score(variantName: string): MultiObjectiveScores;
  getParetoFront(): GraphVariant[];
  clear(): void;
}
```

**Why Copy-on-Write?**
- 10 variants × 1000 nodes = 10,000 node copies (bad)
- With COW: 10 variants × ~50 changed nodes = 500 copies (good)
- Scales to large graphs without memory explosion

### Phase 7: Self-Learning Integration (2 hours)

**Files:**
- `src/session-manager.ts`
- `src/llm-engine/llm-engine.ts`

**Purpose:** Connect ReflexionMemory and SkillLibrary to the data flow.

**Problem:** ReflexionMemory and SkillLibrary exist (CR-026/CR-032) but are not integrated into the LLM request/response flow. Self-learning features are implemented but never called.

**Required Integration Points:**

1. **Session Manager creates self-learning components:**
   ```typescript
   class SessionManager {
     private agentDB: UnifiedAgentDBService;
     private evaluator: UnifiedRuleEvaluator;
     private reflexionMemory: ReflexionMemory;  // Uses agentDB + evaluator
     private skillLibrary: SkillLibrary;

     initialize() {
       this.reflexionMemory = new ReflexionMemory(this.agentDB, this.evaluator);
       this.skillLibrary = new SkillLibrary();
     }
   }
   ```

2. **Before LLM call** - Load episode context:
   ```typescript
   // In LLM Engine before sendRequest()
   const context = await this.reflexionMemory.loadEpisodeContext(agentId, task);
   const patterns = this.skillLibrary.findApplicablePatterns(task, { phase });
   // Inject into system prompt
   systemPrompt += this.reflexionMemory.formatContextForPrompt(context);
   ```

3. **After graph operations** - Record episode:
   ```typescript
   // After Canvas applies Format E operations
   const episode = await this.reflexionMemory.storeEpisodeWithValidation(
     agentId, task, operations, phase
   );
   if (episode.success) {
     this.skillLibrary.recordSuccess(task, operations, { phase, nodeTypes, edgeTypes }, episode.reward);
   }
   ```

**Self-Learning Loop:**
```
User Request → Load Context/Patterns → LLM Call → Graph Operations →
    → Validation → Store Episode → Record Pattern (if success) → Next Request
```

## Current Status

- [ ] Phase 1: Fix Graph Viewer
- [ ] Phase 2: Fix WebSocket Broadcast + Format E
- [ ] Phase 3: Fix Evaluator Data Source
- [ ] Phase 4: Background Validation
- [ ] Phase 5: Session Manager
- [ ] Phase 6: Variant Pool
- [ ] Phase 7: Self-Learning Integration

## Acceptance Criteria

- [ ] `/analyze` detects violations on loaded graph
- [ ] `/optimize` works with current data
- [ ] `/optimize` uses Variant Pool (doesn't pollute main graph)
- [ ] Diff indicators (+/-/~) show in graph viewer after changes
- [ ] `/status` shows correct change count
- [ ] Graph viewer displays correctly without own AgentDB
- [ ] Only ONE AgentDB instance exists per session
- [ ] Session Manager is single orchestrator (not chat-interface)
- [ ] Chat interface is thin I/O layer only
- [ ] Background validation triggers on graph changes (debounced 300ms)
- [ ] Validation summary included in WebSocket broadcasts
- [ ] ReflexionMemory stores episodes after graph operations
- [ ] SkillLibrary records successful patterns
- [ ] Episode context injected into LLM prompts
- [ ] All existing tests pass

## Files to Modify

| File | Change |
|------|--------|
| `src/terminal-ui/graph-viewer.ts` | Remove AgentDB, use WS data directly |
| `src/terminal-ui/chat-interface.ts` | Simplify to thin I/O, delegate to Session Manager |
| `src/llm-engine/validation/unified-rule-evaluator.ts` | Remove singleton cache, use Variant Pool |
| `src/terminal-ui/commands/validation-commands.ts` | Pass ctx.agentDB to evaluator |
| `src/session-manager.ts` | NEW - Orchestrator, owns AgentDB |
| `src/llm-engine/agentdb/variant-pool.ts` | NEW - Isolated graph copies for analysis |
| `src/llm-engine/validation/background-validator.ts` | NEW - Debounced validation handler |
| `src/main.ts` | Integrate Session Manager |

## Estimated Effort

| Phase | Hours | Notes |
|-------|-------|-------|
| Phase 1: Fix Graph Viewer | 2 | Remove AgentDB, keep render buffer |
| Phase 2: WebSocket Broadcast | 2 | Format E = delta (no new format) |
| Phase 3: Fix Evaluator Data Source | 2 | Remove singleton cache |
| Phase 4: Background Validation | 2 | Debounced handler |
| Phase 5: Session Manager | 4 | Orchestrator |
| Phase 6: Variant Pool + COW | 4 | Copy-on-write for memory efficiency |
| Phase 7: Self-Learning Integration | 2 | Connect ReflexionMemory + SkillLibrary |
| **Total** | **18 hours** |

## References

- [docs/architecture.md](../architecture.md) - System architecture
- [CR-032](../archive/CR-032-unified-data-layer.md) - Unified Data Layer
- [CR-033](CR-033-git-diff-change-tracking.md) - Change Tracking
