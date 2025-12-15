# CR-038: Session Manager Architecture Design (Phase 5)

**Type:** Architecture Design
**Status:** In Progress
**Phase:** 5 - Session Manager (Orchestrator)
**Created:** 2025-12-10
**Author:** andreas@siglochconsulting

---

## Executive Summary

This document provides the architectural design for **Phase 5: Session Manager** - the core orchestrator that will own the single AgentDB instance and coordinate all components. This is the **primary remaining work** for CR-038, as Phases 1-4 and 6 have already been implemented via CR-039.

### Implementation Status Overview

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| **1** | Graph Viewer refactor | ✅ **DONE** (CR-039) | Uses render buffer, no AgentDB |
| **2** | WebSocket Broadcast | ✅ **DONE** (CR-039) | Includes nodeChangeStatus |
| **3** | Evaluator Data Source | ✅ **DONE** (CR-039) | No singleton cache |
| **4** | Background Validation | ✅ **DONE** (CR-039) | 500ms debounce implemented |
| **5** | **Session Manager** | ❌ **TODO** | **PRIMARY WORK** - this design |
| **6** | Variant Pool | ✅ **DONE** (existing) | Copy-on-write implemented |
| **7** | Self-Learning Integration | ⏳ **PARTIAL** | Components exist, not integrated |
| **8** | Context Manager | ❌ **TODO** | Full graph sent to LLM |
| **9** | Canvas Controller Split | ⏳ **PARTIAL** | StatelessGraphCanvas exists |

**Key Finding:** CR-039 already fixed the immediate bugs (multiple AgentDB instances). CR-038 Phase 5 is about **architectural consolidation** - creating Session Manager as the central orchestrator.

---

## Current Architecture (Before Phase 5)

### Current Component Ownership

```
chat-interface.ts (OWNS EVERYTHING - anti-pattern)
├── agentDB (UnifiedAgentDBService) ← Single instance ✅
├── graphCanvas (StatelessGraphCanvas) ← Delegates to agentDB ✅
├── chatCanvas (ChatCanvas)
├── llmEngine (ILLMEngine)
├── neo4jClient (Neo4jClient)
├── wsClient (WebSocketClient)
├── sessionManager (SessionManager) ← EXISTS but only used for shutdown!
└── Background validation ← Hardcoded in chat-interface
```

**Problem:** `chat-interface.ts` has grown to **705 lines** and violates Single Responsibility Principle:
- Manages session lifecycle
- Owns AgentDB initialization
- Handles WebSocket broadcasting
- Implements background validation
- Routes commands to handlers
- Processes LLM requests
- Manages chat UI

### What SessionManager Currently Does (Minimal)

File: `src/session.ts` (currently ~100 lines)

```typescript
class SessionManager {
  constructor(private neo4jClient: Neo4jClient) {}

  // ONLY used for shutdown - does NOT orchestrate anything
  async shutdown(sessionData: SessionData): Promise<void> {
    await this.neo4jClient.saveUserSession(sessionData);
    await this.neo4jClient.close();
  }

  registerComponents(...) { /* Unused */ }
}
```

**Current SessionManager is a stub!** It only saves session data on shutdown.

---

## Target Architecture (After Phase 5)

### Session Manager as Central Orchestrator

```
┌──────────────────────────────────────────────────────────────────┐
│                      SESSION MANAGER                              │
│                   (Central Orchestrator)                          │
│                                                                   │
│  OWNS:                                                            │
│  • UnifiedAgentDBService (SINGLE INSTANCE)                        │
│  • Neo4j persistence lifecycle                                    │
│  • Session state (workspaceId, systemId, chatId, userId)         │
│  • Component initialization order                                 │
│  • Background validation setup                                    │
│                                                                   │
│  PROVIDES:                                                        │
│  • getAgentDB() → UnifiedAgentDBService                           │
│  • getGraphCanvas() → StatelessGraphCanvas                        │
│  • getChatCanvas() → ChatCanvas                                   │
│  • getLLMEngine() → ILLMEngine                                    │
│  • getCommandContext() → CommandContext (for handlers)            │
│                                                                   │
│  COORDINATES:                                                     │
│  • /load → Neo4j → AgentDB → Canvas → WebSocket broadcast        │
│  • /commit → AgentDB.captureBaseline() → Neo4j save → broadcast  │
│  • /optimize → Variant Pool → isolated analysis → apply          │
│  • LLM request → Context Manager → LLM → Canvas → broadcast      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │ Terminal  │        │  WebSocket│        │ Command   │
    │ Chat UI   │        │  Broadcast│        │ Handlers  │
    │ (thin)    │        │  (state)  │        │ (logic)   │
    └───────────┘        └───────────┘        └───────────┘
```

### Thin Terminal Interface

`chat-interface.ts` becomes **~200 lines** (70% reduction):

```typescript
// chat-interface.ts (AFTER Phase 5 - thin UI layer)

async function main(): Promise<void> {
  printHeader();

  // 1. Initialize Session Manager (OWNS everything)
  const sessionMgr = await SessionManager.create();

  // 2. Get components from Session Manager
  const llmEngine = sessionMgr.getLLMEngine();
  const wsClient = sessionMgr.getWebSocketClient();

  // 3. Setup readline
  const rl = readline.createInterface({...});

  // 4. Handle input (delegate to Session Manager)
  rl.on('line', async (input) => {
    if (input.startsWith('/')) {
      await sessionMgr.handleCommand(input, rl);
    } else {
      await sessionMgr.processMessage(input, (chunk) => {
        // Stream to console
        if (chunk.type === 'text') process.stdout.write(chunk.text);
      });
    }
    rl.prompt();
  });
}
```

**Key Change:** Terminal UI becomes pure I/O - Session Manager handles all logic.

---

## Detailed Design

### 1. SessionManager Class Structure

File: `src/session-manager.ts` (NEW - expanded from stub)

```typescript
/**
 * Session Manager - Central Orchestrator
 *
 * Owns the single AgentDB instance and coordinates all components.
 * Implements the "Session" concept from CR-038 Onion Model.
 */
export class SessionManager {
  // ============================================================
  // Core Components (OWNED by Session Manager)
  // ============================================================

  private agentDB: UnifiedAgentDBService;
  private graphCanvas: StatelessGraphCanvas;
  private chatCanvas: ChatCanvas;
  private llmEngine: ILLMEngine | null = null;
  private neo4jClient: Neo4jClient;
  private wsClient: CanvasWebSocketClient;

  // Session state
  private config: SessionConfig;

  // Background services
  private validationTimer: NodeJS.Timeout | null = null;
  private workflowRouter: WorkflowRouter;
  private agentExecutor: AgentExecutor;

  // ============================================================
  // Factory Method (SINGLE ENTRY POINT)
  // ============================================================

  /**
   * Create and initialize Session Manager
   *
   * This is THE entry point for the entire application.
   * All components are initialized here in the correct order.
   */
  static async create(): Promise<SessionManager> {
    const manager = new SessionManager();
    await manager.initialize();
    return manager;
  }

  private constructor() {
    // Private - forces use of factory method
  }

  /**
   * Initialize all components in dependency order
   */
  private async initialize(): Promise<void> {
    // STEP 1: Neo4j + Session Resolution
    this.neo4jClient = initNeo4jClient();
    const resolved = await resolveSession(this.neo4jClient);
    this.config = {
      workspaceId: resolved.workspaceId,
      systemId: resolved.systemId,
      chatId: resolved.chatId,
      userId: resolved.userId,
    };

    // STEP 2: AgentDB (SINGLE INSTANCE - THE source of truth)
    this.agentDB = await getUnifiedAgentDBService(
      this.config.workspaceId,
      this.config.systemId
    );

    // STEP 3: Canvases (delegate to AgentDB)
    this.graphCanvas = new StatelessGraphCanvas(
      this.agentDB,
      this.config.workspaceId,
      this.config.systemId,
      this.config.chatId,
      this.config.userId,
      'hierarchy'
    );

    this.chatCanvas = new ChatCanvas(
      this.config.workspaceId,
      this.config.systemId,
      this.config.chatId,
      this.config.userId,
      this.graphCanvas,
      this.neo4jClient
    );

    // STEP 4: LLM Engine (optional)
    try {
      this.llmEngine = createLLMEngine({...});
    } catch {
      this.llmEngine = null;
    }

    // STEP 5: WebSocket Client
    this.wsClient = new CanvasWebSocketClient(...);
    await this.wsClient.connect();

    // STEP 6: Load graph from Neo4j into AgentDB
    await this.loadGraphFromNeo4j();

    // STEP 7: Setup background validation
    this.setupBackgroundValidation();

    // STEP 8: Initialize multi-agent system
    this.workflowRouter = getWorkflowRouter();
    this.agentExecutor = getAgentExecutor();
  }

  // ============================================================
  // Component Accessors (PUBLIC API)
  // ============================================================

  getAgentDB(): UnifiedAgentDBService {
    return this.agentDB;
  }

  getGraphCanvas(): StatelessGraphCanvas {
    return this.graphCanvas;
  }

  getChatCanvas(): ChatCanvas {
    return this.chatCanvas;
  }

  getLLMEngine(): ILLMEngine | null {
    return this.llmEngine;
  }

  getWebSocketClient(): CanvasWebSocketClient {
    return this.wsClient;
  }

  getConfig(): SessionConfig {
    return this.config;
  }

  /**
   * Get command context for handlers
   *
   * Replaces createCommandContext() in chat-interface
   */
  getCommandContext(rl: readline.Interface): CommandContext {
    return {
      config: this.config,
      llmEngine: this.llmEngine,
      neo4jClient: this.neo4jClient,
      sessionManager: this, // Self-reference
      wsClient: this.wsClient,
      graphCanvas: this.graphCanvas,
      chatCanvas: this.chatCanvas,
      agentDB: this.agentDB,
      parser: new FormatEParser(),
      rl,
      log: (msg) => this.log(msg),
      notifyGraphUpdate: () => this.notifyGraphUpdate(),
    };
  }

  // ============================================================
  // Session Lifecycle (CORE OPERATIONS)
  // ============================================================

  /**
   * Load graph from Neo4j into AgentDB
   *
   * Centralizes the load logic from chat-interface
   */
  private async loadGraphFromNeo4j(): Promise<void> {
    const { nodes, edges } = await this.neo4jClient.loadGraph({
      workspaceId: this.config.workspaceId,
      systemId: this.config.systemId,
    });

    if (nodes.length === 0) return;

    // Load into AgentDB (single source of truth)
    for (const node of nodes) {
      this.agentDB.setNode(node, { upsert: true });
    }
    for (const edge of edges) {
      this.agentDB.setEdge(edge, { upsert: true });
    }

    // Capture baseline for change tracking (loaded state = committed)
    this.agentDB.captureBaseline();

    // Broadcast initial state
    this.notifyGraphUpdate();

    this.log(`📥 Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j`);
  }

  /**
   * Save current graph state to Neo4j
   *
   * Used by /commit and /save commands
   */
  async saveGraphToNeo4j(): Promise<void> {
    const nodes = this.agentDB.getNodes();
    const edges = this.agentDB.getEdges();

    await this.neo4jClient.saveNodes(nodes);
    await this.neo4jClient.saveEdges(edges);

    // Capture new baseline
    this.agentDB.captureBaseline();

    // Broadcast updated state (clears change indicators)
    this.notifyGraphUpdate();

    this.log(`💾 Saved ${nodes.length} nodes, ${edges.length} edges to Neo4j`);
  }

  /**
   * Switch to different system
   *
   * Used by /load command
   */
  async switchSystem(systemId: string): Promise<void> {
    // Clear current AgentDB data (preserves episodes/variants)
    this.agentDB.clearForSystemLoad();

    // Update config
    this.config.systemId = systemId;

    // Load new system
    await this.loadGraphFromNeo4j();

    // Update WebSocket subscription
    this.wsClient.updateSubscription(systemId);

    this.log(`🔄 Switched to system: ${systemId}`);
  }

  // ============================================================
  // Broadcasting (CENTRALIZED)
  // ============================================================

  /**
   * Notify all terminals of graph update
   *
   * Centralizes broadcast logic from chat-interface
   */
  notifyGraphUpdate(): void {
    if (!this.wsClient.isConnected()) {
      this.log('❌ WebSocket not connected - cannot broadcast');
      return;
    }

    const nodes = this.agentDB.getNodes();
    const edges = this.agentDB.getEdges();

    // Build change status for broadcast (CR-033)
    const nodeChangeStatus = this.buildNodeChangeStatus();

    const stateData = {
      nodes: nodes.map((n) => [n.semanticId, n]),
      edges: edges.map((e) => [`${e.sourceId}-${e.type}-${e.targetId}`, e]),
      ports: [],
      currentView: this.graphCanvas.getCurrentView(),
      timestamp: Date.now(),
      nodeChangeStatus, // CR-033 change indicators
    };

    this.wsClient.send({
      type: 'graph_update',
      workspaceId: this.config.workspaceId,
      systemId: this.config.systemId,
      diff: JSON.stringify(stateData),
      timestamp: new Date().toISOString(),
    });

    const changeCount = nodeChangeStatus ? Object.keys(nodeChangeStatus).length : 0;
    this.log(`📡 Broadcast: ${nodes.length} nodes, ${edges.length} edges, ${changeCount} changes`);
  }

  /**
   * Build nodeChangeStatus map for broadcast
   */
  private buildNodeChangeStatus(): Record<string, string> | undefined {
    if (!this.agentDB.hasBaseline()) {
      return undefined;
    }

    const statusMap: Record<string, string> = {};
    const nodes = this.agentDB.getNodes();

    for (const node of nodes) {
      const status = this.agentDB.getNodeChangeStatus(node.semanticId);
      if (status !== 'unchanged') {
        statusMap[node.semanticId] = status;
      }
    }

    // Include deleted nodes
    const changes = this.agentDB.getChanges();
    for (const change of changes) {
      if (change.elementType === 'node' && change.status === 'deleted') {
        statusMap[change.id] = 'deleted';
      }
    }

    return Object.keys(statusMap).length > 0 ? statusMap : undefined;
  }

  // ============================================================
  // Background Services
  // ============================================================

  /**
   * Setup background validation on graph changes
   *
   * Moved from chat-interface.ts
   */
  private setupBackgroundValidation(): void {
    this.agentDB.onGraphChange(() => {
      // Clear previous timer
      if (this.validationTimer) {
        clearTimeout(this.validationTimer);
      }

      // Debounce: wait 500ms before validating
      this.validationTimer = setTimeout(async () => {
        try {
          const evaluator = createUnifiedRuleEvaluator(this.agentDB);
          const result = await evaluator.evaluate('phase2_logical');

          // Push to ChatCanvas for LLM context
          this.chatCanvas.setValidationSummary({
            violationCount: result.totalViolations,
            rewardScore: result.rewardScore,
            phaseGateReady: result.phaseGateReady,
            timestamp: new Date(),
          });

          if (result.totalViolations > 0) {
            this.log(`🔍 Validation: ${result.totalViolations} violations (score: ${(result.rewardScore * 100).toFixed(0)}%)`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.log(`⚠️ Validation error: ${errorMsg}`);
        }
      }, 500);
    });

    this.log('✅ Background validation setup (500ms debounce)');
  }

  // ============================================================
  // Message Processing (DELEGATES TO COMPONENTS)
  // ============================================================

  /**
   * Process user message via LLM
   *
   * Moved from chat-interface.ts
   */
  async processMessage(
    message: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    if (!this.llmEngine) {
      throw new Error('LLM Engine not available');
    }

    this.log(`📨 User: ${message}`);

    // 1. Route to agent
    const currentState = this.graphCanvas.getState();
    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements',
      graphEmpty: currentState.nodes.size === 0,
      userMessage: message,
      recentNodeTypes: Array.from(currentState.nodes.values())
        .slice(-5)
        .map((n) => n.type),
    };

    const selectedAgent = this.workflowRouter.routeUserInput(message, sessionContext);
    this.log(`🤖 Agent: ${selectedAgent}`);

    // 2. Get agent prompt
    const parser = new FormatEParser();
    const canvasState = parser.serializeGraph(currentState);
    const agentPrompt = this.agentExecutor.getAgentContextPrompt(
      selectedAgent,
      canvasState,
      message
    );

    // 3. Add user message to chat canvas
    await this.chatCanvas.addUserMessage(message);

    // 4. Build conversation context
    const conversationContext = this.chatCanvas.getConversationContext(10);
    const chatHistory = conversationContext.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 5. Execute LLM request
    const request = {
      message,
      chatId: this.config.chatId,
      workspaceId: this.config.workspaceId,
      systemId: this.config.systemId,
      userId: this.config.userId,
      canvasState,
      chatHistory,
      systemPrompt: agentPrompt,
    };

    await this.llmEngine.processRequestStream(request, async (chunk) => {
      // Stream text chunks to UI
      onChunk(chunk);

      // Handle completion
      if (chunk.type === 'complete' && chunk.response) {
        const response = chunk.response;

        // Add assistant message
        await this.chatCanvas.addAssistantMessage(
          response.textResponse,
          response.operations ?? undefined
        );

        // Apply graph operations
        if (response.operations) {
          const diff = parser.parseDiff(
            response.operations,
            this.config.workspaceId,
            this.config.systemId
          );

          await this.graphCanvas.applyDiff(diff);

          // Handle new system detection
          if (this.config.systemId === 'new-system') {
            await this.detectAndPersistNewSystem();
          }

          // Broadcast graph update
          this.notifyGraphUpdate();

          const stats = this.agentDB.getGraphStats();
          this.log(`📊 Graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);
        }

        // Store episode for learning
        await this.storeEpisode(selectedAgent, message, response);

        this.log('✅ Response complete');
      }
    });
  }

  /**
   * Handle command
   *
   * Delegates to command handlers
   */
  async handleCommand(cmd: string, rl: readline.Interface): Promise<void> {
    const [command, ...args] = cmd.split(' ');
    const ctx = this.getCommandContext(rl);

    switch (command) {
      case '/load':
        await handleLoadCommand(rl, ctx);
        break;
      case '/commit':
      case '/save':
        await this.saveGraphToNeo4j();
        break;
      case '/validate':
        await handleValidateCommand(args, ctx);
        break;
      case '/analyze':
        await handleAnalyzeCommand(ctx);
        break;
      case '/optimize':
        await handleOptimizeCommand(args[0] || '', ctx);
        break;
      // ... other commands
      default:
        console.log('Unknown command. Type /help for available commands.');
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Detect new system and persist to Neo4j
   */
  private async detectAndPersistNewSystem(): Promise<void> {
    const sysNodes = this.agentDB.getNodes({ type: 'SYS' });
    if (sysNodes.length === 0) return;

    const newSystemId = sysNodes[0].semanticId;
    console.log(`✓ Detected new system: ${newSystemId}`);
    this.log(`📌 System ID: ${newSystemId}`);

    await updateActiveSystem(this.neo4jClient, this.config, newSystemId);
    await this.saveGraphToNeo4j();
  }

  /**
   * Store episode for agent learning
   */
  private async storeEpisode(
    agent: string,
    task: string,
    response: { textResponse: string; operations?: string }
  ): Promise<void> {
    try {
      const reward = this.agentExecutor.calculateReward(agent, {
        agentId: agent,
        textResponse: response.textResponse,
        operations: response.operations,
        isComplete: true,
      });

      await this.agentDB.storeEpisode(
        agent,
        task,
        true,
        { response: response.textResponse, operations: response.operations },
        `Agent: ${agent}, Reward: ${reward.toFixed(2)}`
      );

      this.log(`🧠 Episode stored: ${agent} (reward: ${reward.toFixed(2)})`);
    } catch (error) {
      this.log(`⚠️ Episode storage failed: ${error}`);
    }
  }

  /**
   * Log to stdout file
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMsg = `[${timestamp}] ${message}`;
    fs.appendFileSync(LOG_PATH, logMsg + '\n');
  }

  // ============================================================
  // Shutdown
  // ============================================================

  async shutdown(): Promise<void> {
    this.log('🛑 Shutting down...');

    // Send shutdown signal to all terminals
    if (this.wsClient.isConnected()) {
      this.wsClient.send({
        type: 'shutdown',
        timestamp: new Date().toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Save final state
    await this.saveGraphToNeo4j();
    await this.chatCanvas.persistToNeo4j();

    // Save session data
    const state = this.graphCanvas.getState();
    await this.neo4jClient.saveUserSession({
      userId: this.config.userId,
      workspaceId: this.config.workspaceId,
      activeSystemId: this.config.systemId,
      currentView: state.currentView,
      chatId: this.config.chatId,
      lastActive: new Date(),
    });

    // Cleanup components
    if (this.validationTimer) clearTimeout(this.validationTimer);
    this.wsClient.disconnect();
    await this.neo4jClient.close();
    await this.agentDB.shutdown();

    this.log('✅ Shutdown complete');
  }
}

/**
 * Session configuration
 */
interface SessionConfig {
  workspaceId: string;
  systemId: string;
  chatId: string;
  userId: string;
}
```

---

## Migration Plan

### Step 1: Create Session Manager (No Breaking Changes)

1. Expand `src/session.ts` with SessionManager class above
2. Keep `chat-interface.ts` unchanged (parallel implementation)
3. Run tests to verify new SessionManager works in isolation

### Step 2: Refactor chat-interface.ts

1. Replace initialization code with `SessionManager.create()`
2. Replace direct component access with `sessionMgr.getX()` calls
3. Delegate commands to `sessionMgr.handleCommand()`
4. Delegate message processing to `sessionMgr.processMessage()`
5. Remove duplicate logic (now in SessionManager)

**Result:** `chat-interface.ts` shrinks from ~705 lines to ~200 lines

### Step 3: Update Command Handlers

No changes needed - `CommandContext` remains the same.

### Step 4: Integration Testing

1. Test `/load`, `/save`, `/commit` workflows
2. Test `/analyze`, `/optimize` with Variant Pool
3. Test background validation
4. Test WebSocket broadcasting
5. Test multi-terminal coordination

---

## Acceptance Criteria

From CR-038:

| Criterion | Verification Method | Status |
|-----------|---------------------|--------|
| Only ONE AgentDB instance per session | Unit test: verify singleton | ✅ VERIFIED (17/17 tests pass) |
| Session Manager is single orchestrator | Code review: check ownership | ✅ COMPLETE |
| Chat interface is thin I/O layer | Line count: <250 lines | ⏳ TODO (next: refactor chat-interface.ts) |
| All components receive AgentDB via parameter | Code review: no `getUnifiedAgentDBService()` in components | ✅ Already true |
| Background validation triggers on changes | Integration test: modify graph, verify validation | ✅ Already true |
| /analyze detects violations | E2E test: create violation, run /analyze | ✅ Already true |
| /optimize uses Variant Pool | Unit test: verify isolation | ✅ Already true |
| Change indicators show in graph viewer | E2E test: modify node, check +/-/~ | ✅ Already true |
| All existing tests pass | Run `npm test` | ⏳ TODO (after chat-interface refactor) |

**Key Insight:** Most acceptance criteria already met by CR-039. Phase 5 is about **code organization**, not bug fixes.

---

## Estimated Effort

| Task | Hours | Notes |
|------|-------|-------|
| Expand SessionManager class | 3 | Copy logic from chat-interface |
| Refactor chat-interface.ts | 2 | Replace with SessionManager calls |
| Update tests | 2 | Adapt to new structure |
| Integration testing | 2 | Verify all workflows |
| Documentation | 1 | Update architecture.md |
| **Total** | **10 hours** | ~1.5 days |

**Note:** Original CR-038 estimated 4 hours for Phase 5. Updated to 10 hours because:
1. SessionManager needs full message processing logic (not just orchestration)
2. Command delegation requires careful refactoring
3. Integration testing with multi-terminal setup takes time

---

## Next Steps

1. ✅ **Complete this design** (current document)
2. ✅ **Implement SessionManager class** in `src/session-manager.ts` (DONE)
3. ✅ **Write unit tests** for SessionManager (17/17 tests passing)
4. ⏳ **Refactor chat-interface.ts** to use SessionManager (NEXT)
5. ⏳ Run integration tests
6. ⏳ Update `docs/architecture.md` with new ownership model

## Implementation Status

### ✅ Phase 5 Core Implementation Complete (2025-12-10)

**What was implemented:**

1. **SessionManager class** (`src/session-manager.ts`, 681 lines)
   - Factory method `SessionManager.create()` - single entry point
   - Owns single AgentDB instance (THE source of truth)
   - Initializes all components in correct dependency order
   - Session lifecycle (load/save/switch system)
   - Background validation (500ms debounce)
   - WebSocket broadcasting coordination
   - Message processing delegation
   - Command context provider

2. **Unit Tests** (`tests/unit/session-manager.test.ts`, 358 lines)
   - 17 tests, all passing
   - Verifies singleton AgentDB instance
   - Tests initialization order
   - Tests session lifecycle
   - Tests broadcasting
   - Tests shutdown cleanup

**Key Achievement:**
- **Only ONE AgentDB instance** per session verified by tests
- All components receive AgentDB via dependency injection
- No component creates its own AgentDB

**Next Step:**
Refactor `chat-interface.ts` (currently 705 lines) to use SessionManager.

---

## References

- [CR-038 Main Document](CR-038-clean-architecture-refactor.md) - Full refactor plan
- [CR-032](../archive/CR-032-unified-data-layer.md) - AgentDB as Single Source of Truth
- [CR-033](CR-033-git-diff-change-tracking.md) - Change Tracking
- [CR-039](CR-039-agentdb-singleton-fix.md) - Multiple AgentDB instances bug fix
- [docs/architecture.md](../architecture.md) - System architecture
