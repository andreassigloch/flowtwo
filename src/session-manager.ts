/**
 * Session Manager - Central Orchestrator (CR-038 Phase 5)
 *
 * Owns the single AgentDB instance and coordinates all components.
 * Implements the "Session" concept from CR-038 Onion Model.
 *
 * Key Responsibilities:
 * - Owns UnifiedAgentDBService (SINGLE INSTANCE - THE source of truth)
 * - Initializes all components in correct dependency order
 * - Coordinates session lifecycle (load/save/switch)
 * - Manages background validation
 * - Handles WebSocket broadcasting
 * - Delegates message processing and commands
 *
 * @author andreas@siglochconsulting
 */

import * as readline from 'readline';
import * as fs from 'fs';
import { StatelessGraphCanvas } from './canvas/stateless-graph-canvas.js';
import { ChatCanvas } from './canvas/chat-canvas.js';
import { createLLMEngine, type ILLMEngine } from './llm-engine/engine-factory.js';
import { Neo4jClient } from './neo4j-client/neo4j-client.js';
import { FormatEParser } from './shared/parsers/format-e-parser.js';
import { CanvasWebSocketClient } from './canvas/websocket-client.js';
import type { BroadcastUpdate } from './canvas/websocket-server.js';
import { WS_URL, LOG_PATH, LLM_TEMPERATURE } from './shared/config.js';
import { getUnifiedAgentDBService, UnifiedAgentDBService } from './llm-engine/agentdb/unified-agentdb-service.js';
import { getWorkflowRouter, type SessionContext } from './llm-engine/agents/workflow-router.js';
import { getAgentExecutor } from './llm-engine/agents/agent-executor.js';
import { getAgentConfigLoader } from './llm-engine/agents/config-loader.js';
import { initNeo4jClient, updateActiveSystem } from './shared/session-resolver.js';
import { createUnifiedRuleEvaluator, UnifiedRuleEvaluator } from './llm-engine/validation/index.js';
import type { StreamChunk } from './shared/types/llm.js';
import { ReflexionMemory } from './llm-engine/agentdb/reflexion-memory.js';
import { SkillLibrary } from './llm-engine/agentdb/skill-library.js';
import { ContextManager, createContextManager } from './llm-engine/context-manager.js';
import type { CommandContext } from './terminal-ui/commands/types.js';
import { WorkflowRouter } from './llm-engine/agents/workflow-router.js';
import { AgentExecutor } from './llm-engine/agents/agent-executor.js';
import { SessionManager as LegacySessionManager } from './session.js';

/**
 * Session configuration
 */
export interface SessionConfig {
  workspaceId: string;
  systemId: string;
  chatId: string;
  userId: string;
}

/**
 * Session Manager - Central Orchestrator
 *
 * This is THE entry point for the entire application.
 * All components are initialized here in correct dependency order.
 */
export class SessionManager {
  // ============================================================
  // Core Components (OWNED by Session Manager)
  // ============================================================

  private agentDB!: UnifiedAgentDBService;
  private graphCanvas!: StatelessGraphCanvas;
  private chatCanvas!: ChatCanvas;
  private llmEngine: ILLMEngine | undefined = undefined;
  private neo4jClient!: Neo4jClient;
  private wsClient!: CanvasWebSocketClient;
  private parser: FormatEParser;

  // Session state
  private config!: SessionConfig;

  // Multi-agent system
  private workflowRouter!: WorkflowRouter;
  private agentExecutor!: AgentExecutor;

  // Background services
  private validationTimer: NodeJS.Timeout | null = null;

  // Self-learning components (CR-038 Phase 7)
  private evaluator!: UnifiedRuleEvaluator;
  private reflexionMemory!: ReflexionMemory;
  private skillLibrary!: SkillLibrary;
  private contextManager!: ContextManager;

  // Legacy session manager (for backward compatibility with commands)
  private legacySessionManager!: LegacySessionManager;

  // ============================================================
  // Factory Method (SINGLE ENTRY POINT)
  // ============================================================

  /**
   * Create and initialize Session Manager
   *
   * This is THE entry point for the entire application.
   * All components are initialized here in the correct order.
   */
  static async create(resolvedSession: {
    workspaceId: string;
    systemId: string;
    chatId: string;
    userId: string;
    source: string;
  }): Promise<SessionManager> {
    const manager = new SessionManager();
    await manager.initialize(resolvedSession);
    return manager;
  }

  private constructor() {
    // Private - forces use of factory method
    this.parser = new FormatEParser();
  }

  /**
   * Initialize all components in dependency order
   */
  private async initialize(resolved: {
    workspaceId: string;
    systemId: string;
    chatId: string;
    userId: string;
    source: string;
  }): Promise<void> {
    // STEP 1: Session Resolution
    this.neo4jClient = initNeo4jClient();
    this.legacySessionManager = new LegacySessionManager(this.neo4jClient);
    this.config = {
      workspaceId: resolved.workspaceId,
      systemId: resolved.systemId,
      chatId: resolved.chatId,
      userId: resolved.userId,
    };

    this.log(`📋 Session: ${resolved.systemId} (source: ${resolved.source})`);

    // STEP 2: AgentDB (SINGLE INSTANCE - THE source of truth)
    this.log('🔧 Initializing UnifiedAgentDBService (CR-032)...');
    this.agentDB = await getUnifiedAgentDBService(
      this.config.workspaceId,
      this.config.systemId
    );
    this.log('✅ UnifiedAgentDBService initialized');

    // STEP 3: Self-learning components (CR-038 Phase 7)
    this.log('🧠 Initializing self-learning components...');
    this.evaluator = createUnifiedRuleEvaluator(this.agentDB);
    this.reflexionMemory = new ReflexionMemory(this.agentDB, this.evaluator);
    this.skillLibrary = new SkillLibrary();
    this.contextManager = createContextManager(this.agentDB);

    // CR-063: Load persisted skill patterns
    await this.loadSkillLibrary();
    this.log('✅ Self-learning components initialized');

    // STEP 4: Setup background validation BEFORE canvases
    this.setupBackgroundValidation();

    // STEP 5: Canvases (delegate to AgentDB)
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

    // STEP 5: LLM Engine (optional)
    try {
      this.llmEngine = createLLMEngine({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        maxTokens: 4096,
        temperature: LLM_TEMPERATURE,
        enableCache: true,
      });
      this.log('✅ LLM Engine initialized');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`⚠️ LLM Engine not available: ${errorMsg}`);
    }

    // STEP 6: WebSocket Client
    this.wsClient = new CanvasWebSocketClient(
      process.env.WS_URL || WS_URL,
      {
        workspaceId: this.config.workspaceId,
        systemId: this.config.systemId,
        userId: this.config.userId,
      },
      (update: BroadcastUpdate) => {
        const userId = update.source?.userId || 'unknown';
        this.log(`📡 Received ${update.type} from ${userId}`);
      }
    );

    await this.wsClient.connect();
    this.log('✅ WebSocket connected');

    // STEP 7: Load graph from Neo4j into AgentDB
    await this.loadGraphFromNeo4j();

    // STEP 8: Initialize multi-agent system
    this.workflowRouter = getWorkflowRouter();
    this.agentExecutor = getAgentExecutor();

    this.log('✅ Session Manager initialized');
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

  getLLMEngine(): ILLMEngine | undefined {
    return this.llmEngine;
  }

  getWebSocketClient(): CanvasWebSocketClient {
    return this.wsClient;
  }

  getConfig(): SessionConfig {
    return this.config;
  }

  getNeo4jClient(): Neo4jClient {
    return this.neo4jClient;
  }

  getParser(): FormatEParser {
    return this.parser;
  }

  // ============================================================
  // Self-Learning Accessors (CR-038 Phase 7)
  // ============================================================

  /**
   * Get ReflexionMemory for episode storage
   */
  getReflexionMemory(): ReflexionMemory {
    return this.reflexionMemory;
  }

  /**
   * Get SkillLibrary for pattern storage
   */
  getSkillLibrary(): SkillLibrary {
    return this.skillLibrary;
  }

  /**
   * Get ContextManager for token optimization
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get Evaluator for validation
   */
  getEvaluator(): UnifiedRuleEvaluator {
    return this.evaluator;
  }

  /**
   * Get learning statistics (CR-063)
   *
   * Aggregates data from SkillLibrary and ReflexionMemory
   */
  async getLearningStats(): Promise<{
    episodes: { total: number; successful: number; failed: number };
    patterns: { total: number; avgSuccessRate: number; topPatterns: Array<{ task: string; successRate: number; usageCount: number }> };
    agentPerformance: Array<{ agentId: string; avgReward: number; trend: 'improving' | 'stable' | 'declining' }>;
  }> {
    // Get episode stats
    const knownAgents = ['system-architect', 'graph-builder', 'validator', 'optimizer', 'analyzer'];
    const episodeStats = await this.agentDB.getEpisodeStats(knownAgents);

    // Get pattern stats from SkillLibrary
    const patternStats = this.skillLibrary.getStats();

    // Get agent effectiveness
    const agentPerformance: Array<{ agentId: string; avgReward: number; trend: 'improving' | 'stable' | 'declining' }> = [];
    for (const agentId of episodeStats.byAgent.keys()) {
      try {
        const effectiveness = await this.reflexionMemory.getAgentEffectiveness(agentId);
        if (effectiveness.totalEpisodes > 0) {
          agentPerformance.push({
            agentId,
            avgReward: effectiveness.averageReward,
            trend: effectiveness.recentTrend,
          });
        }
      } catch {
        // Skip
      }
    }

    return {
      episodes: {
        total: episodeStats.total,
        successful: episodeStats.successful,
        failed: episodeStats.failed,
      },
      patterns: {
        total: patternStats.totalPatterns,
        avgSuccessRate: patternStats.avgSuccessRate,
        topPatterns: patternStats.topPatterns.map(p => ({
          task: p.task,
          successRate: p.successRate,
          usageCount: p.usageCount,
        })),
      },
      agentPerformance,
    };
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
      sessionManager: this.legacySessionManager,
      wsClient: this.wsClient,
      graphCanvas: this.graphCanvas,
      chatCanvas: this.chatCanvas,
      agentDB: this.agentDB,
      parser: this.parser,
      rl,
      log: (msg) => this.log(msg),
      notifyGraphUpdate: () => this.notifyGraphUpdate(),
      // CR-063: Add accessors for learning components
      sessionManagerNew: this,
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
    try {
      const { nodes, edges } = await this.neo4jClient.loadGraph({
        workspaceId: this.config.workspaceId,
        systemId: this.config.systemId,
      });

      if (nodes.length === 0) {
        this.log('📭 No graph data in Neo4j');
        return;
      }

      // Load into AgentDB (single source of truth)
      for (const node of nodes) {
        this.agentDB.setNode(node, { upsert: true });
      }
      for (const edge of edges) {
        this.agentDB.setEdge(edge, { upsert: true });
      }

      this.log(`📦 Loaded ${nodes.length} nodes into AgentDB`);

      // Capture baseline for change tracking (loaded state = committed)
      this.agentDB.captureBaseline();

      // Broadcast initial state
      this.notifyGraphUpdate();

      this.log(`📥 Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`⚠️ Neo4j load error: ${errorMsg}`);
    }
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

    // Include deleted nodes from baseline so they can be rendered with "-" indicator
    const allNodes = [...nodes];
    const changes = this.agentDB.getChanges();
    for (const change of changes) {
      if (change.elementType === 'node' && change.status === 'deleted' && change.baseline) {
        allNodes.push(change.baseline as any);
      }
    }

    const stateData = {
      nodes: allNodes.map((n) => [n.semanticId, n]),
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
    this.log(`📡 Graph update broadcast (${nodes.length} nodes, ${edges.length} edges, ${changeCount} changes)`);
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
            this.log(`🔍 Background validation: ${result.totalViolations} violations (score: ${(result.rewardScore * 100).toFixed(0)}%)`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.log(`⚠️ Background validation error: ${errorMsg}`);
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
    this.log(`🤖 Agent selected: ${selectedAgent}`);

    // 2. Load learning context (CR-058)
    const learningContext = await this.loadLearningContext(selectedAgent, message, sessionContext);

    // 3. Get agent prompt
    const canvasState = this.parser.serializeGraph(currentState);
    const configLoader = getAgentConfigLoader();

    let agentPrompt: string;
    try {
      agentPrompt = this.agentExecutor.getAgentContextPrompt(selectedAgent, canvasState, message);
    } catch {
      agentPrompt = configLoader.getPrompt('system-architect');
      this.log(`⚠️ Fallback to system-architect prompt (${selectedAgent} not configured)`);
    }

    // 4. Inject learning context into prompt (CR-058)
    if (learningContext) {
      agentPrompt = agentPrompt + '\n\n' + learningContext;
    }

    // 5. Add user message to chat canvas
    await this.chatCanvas.addUserMessage(message);

    // 6. Build conversation context
    const conversationContext = this.chatCanvas.getConversationContext(10);
    const chatHistory = conversationContext.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 7. Execute LLM request
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
          const diff = this.parser.parseDiff(
            response.operations,
            this.config.workspaceId,
            this.config.systemId
          );

          if (diff.operations.length === 0) {
            this.log(`⚠️ PARSE FAILURE: Operations block found but 0 operations parsed`);
            this.log(`📋 Operations block (first 800 chars):\n${response.operations.substring(0, 800)}`);
          }

          await this.graphCanvas.applyDiff(diff);

          // Handle new system detection
          if (this.config.systemId === 'new-system') {
            await this.detectAndPersistNewSystem();
          }

          // Broadcast graph update
          this.notifyGraphUpdate();

          const stats = this.agentDB.getGraphStats();
          this.log(`📊 Graph updated (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);
        }

        // Store episode for learning (CR-058: pass sessionContext for pattern recording)
        await this.storeEpisode(selectedAgent, message, response, sessionContext);

        this.log('✅ Response complete');
      }
    });
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
    this.log(`📌 System ID detected: ${newSystemId}`);

    await updateActiveSystem(this.neo4jClient, this.config, newSystemId);
    await this.saveGraphToNeo4j();
  }

  /**
   * Load learning context for LLM prompt injection (CR-058)
   *
   * Combines lessons from past failures and successful patterns
   * to help the agent avoid repeating mistakes and leverage successes.
   */
  private async loadLearningContext(
    agent: string,
    task: string,
    sessionContext: SessionContext
  ): Promise<string | null> {
    try {
      // Load episode context (lessons from failures, successful patterns)
      const episodeContext = await this.reflexionMemory.loadEpisodeContext(agent, task);
      const contextStr = this.reflexionMemory.formatContextForPrompt(episodeContext);

      // Find applicable skill patterns
      const patterns = this.skillLibrary.findApplicablePatterns(task, {
        phase: sessionContext.currentPhase,
      });

      // Build learning context string
      const parts: string[] = [];

      if (contextStr) {
        parts.push('## Lessons from Past Attempts');
        parts.push(contextStr);
      }

      if (patterns.length > 0) {
        parts.push('');
        parts.push('## Similar Successful Patterns');
        for (const match of patterns.slice(0, 3)) {
          parts.push(`- "${match.pattern.task}" (${(match.similarity * 100).toFixed(0)}% match, reward: ${match.pattern.reward.toFixed(2)})`);
        }
      }

      if (parts.length === 0) {
        return null;
      }

      // Log learning context loaded
      const lessonCount = episodeContext.lessonsLearned ? 1 : 0;
      const patternCount = patterns.length;
      this.log(`📚 Learning context: ${lessonCount} lessons, ${patternCount} patterns loaded`);

      return parts.join('\n');
    } catch (error) {
      this.log(`⚠️ Learning context load failed: ${error}`);
      return null;
    }
  }

  /**
   * Store episode for agent learning and record successful patterns (CR-058)
   */
  private async storeEpisode(
    agent: string,
    task: string,
    response: { textResponse: string; operations?: string | null },
    sessionContext?: SessionContext
  ): Promise<void> {
    try {
      const operations = response.operations ?? undefined;
      const reward = this.agentExecutor.calculateReward(agent, {
        agentId: agent,
        textResponse: response.textResponse,
        operations,
        isComplete: true,
      });

      // Episode success based on reward threshold (CR-054)
      const SUCCESS_THRESHOLD = 0.7;
      const success = reward >= SUCCESS_THRESHOLD;

      await this.agentDB.storeEpisode(
        agent,
        task,
        success,
        { response: response.textResponse, operations },
        success
          ? `Agent: ${agent}, Reward: ${reward.toFixed(2)}`
          : `Failed: ${agent}, Reward: ${reward.toFixed(2)} < ${SUCCESS_THRESHOLD}`
      );

      this.log(`🧠 Episode stored: ${agent} (reward: ${reward.toFixed(2)}, success: ${success})`);

      // CR-058: Record successful pattern to SkillLibrary
      if (success && operations) {
        const patternId = this.skillLibrary.recordSuccess(
          task,
          operations,
          {
            phase: sessionContext?.currentPhase ?? 'phase1_requirements',
            nodeTypes: this.extractNodeTypes(operations),
            edgeTypes: this.extractEdgeTypes(operations),
          },
          reward
        );

        if (patternId) {
          this.log(`📘 Pattern recorded: ${patternId} (reward: ${reward.toFixed(2)})`);
        }
      }
    } catch (error) {
      this.log(`⚠️ Episode storage failed: ${error}`);
    }
  }

  /**
   * Extract node types from Format E operations (CR-058)
   */
  private extractNodeTypes(operations: string): string[] {
    const types = new Set<string>();
    // Match node definitions like: + NodeType/semanticId
    const nodePattern = /[+~]\s*(\w+)\/[\w-]+/g;
    let match;
    while ((match = nodePattern.exec(operations)) !== null) {
      types.add(match[1]);
    }
    return Array.from(types);
  }

  /**
   * Extract edge types from Format E operations (CR-058)
   */
  private extractEdgeTypes(operations: string): string[] {
    const types = new Set<string>();
    // Match edge definitions like: + source --TYPE-> target
    const edgePattern = /--(\w+)->/g;
    let match;
    while ((match = edgePattern.exec(operations)) !== null) {
      types.add(match[1]);
    }
    return Array.from(types);
  }

  /**
   * Log to stdout file
   */
  log(message: string): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMsg = `[${timestamp}] ${message}`;
    fs.appendFileSync(LOG_PATH, logMsg + '\n');
  }

  // ============================================================
  // SkillLibrary Persistence (CR-063)
  // ============================================================

  private readonly SKILL_LIBRARY_PATH = `${process.env.HOME || '~'}/.graphengine/skill-library.json`;

  /**
   * Load persisted skill patterns from disk (CR-063)
   */
  private async loadSkillLibrary(): Promise<void> {
    try {
      if (fs.existsSync(this.SKILL_LIBRARY_PATH)) {
        const data = fs.readFileSync(this.SKILL_LIBRARY_PATH, 'utf-8');
        const patterns = JSON.parse(data);
        this.skillLibrary.importPatterns(patterns);
        this.log(`📘 Loaded ${patterns.length} skill patterns from disk`);
      }
    } catch (error) {
      this.log(`⚠️ Could not load skill library: ${error}`);
    }
  }

  /**
   * Save skill patterns to disk (CR-063)
   */
  private async saveSkillLibrary(): Promise<void> {
    try {
      const patterns = this.skillLibrary.exportPatterns();
      if (patterns.length === 0) {
        return; // Don't save empty library
      }

      // Ensure directory exists
      const dir = this.SKILL_LIBRARY_PATH.substring(0, this.SKILL_LIBRARY_PATH.lastIndexOf('/'));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.SKILL_LIBRARY_PATH, JSON.stringify(patterns, null, 2));
      this.log(`📘 Saved ${patterns.length} skill patterns to disk`);
    } catch (error) {
      this.log(`⚠️ Could not save skill library: ${error}`);
    }
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

    // CR-063: Persist skill library
    await this.saveSkillLibrary();

    // Save session data
    const state = this.graphCanvas.getState();
    await this.legacySessionManager.saveSession({
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
