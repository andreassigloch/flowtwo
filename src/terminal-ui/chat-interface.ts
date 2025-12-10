/**
 * GraphEngine - Chat Interface (Terminal 3)
 *
 * Simple readline-based chat interface
 * - User input
 * - LLM responses
 * - Commands (/help, /save, /stats, /view)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import * as readline from 'readline';
import * as fs from 'fs';
import { StatelessGraphCanvas } from '../canvas/stateless-graph-canvas.js';
import { ChatCanvas } from '../canvas/chat-canvas.js';
import { createLLMEngine, type ILLMEngine, getCurrentProvider } from '../llm-engine/engine-factory.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { CanvasWebSocketClient } from '../canvas/websocket-client.js';
import type { BroadcastUpdate } from '../canvas/websocket-server.js';
import { SessionManager } from '../session.js';
import { WS_URL, LOG_PATH, LLM_TEMPERATURE } from '../shared/config.js';
import { getUnifiedAgentDBService, UnifiedAgentDBService } from '../llm-engine/agentdb/unified-agentdb-service.js';
import { getWorkflowRouter, SessionContext } from '../llm-engine/agents/workflow-router.js';
import { getAgentExecutor } from '../llm-engine/agents/agent-executor.js';
import { getAgentConfigLoader } from '../llm-engine/agents/config-loader.js';
import { initNeo4jClient, resolveSession, updateActiveSystem } from '../shared/session-resolver.js';

// Command handlers (extracted for modularity)
import type { CommandContext } from './commands/types.js';
import { handleDeriveCommand } from './commands/derive-commands.js';
import {
  handleValidateCommand,
  handlePhaseGateCommand,
  handleScoreCommand,
  handleAnalyzeCommand,
  handleOptimizeCommand,
} from './commands/validation-commands.js';
import { handleCleanupCommand } from './commands/cleanup-commands.js';
import {
  handleNewCommand,
  handleCommitCommand,
  handleSaveCommand,
  handleLoadCommand,
  handleExportCommand,
  handleImportCommand,
  handleExportsCommand,
  handleStatsCommand,
  handleStatusCommand,
  handleViewCommand,
  printHelpMenu,
} from './commands/session-commands.js';
import { createUnifiedRuleEvaluator } from '../llm-engine/validation/index.js';

// Configuration - will be set by resolveSession() in main()
const config = {
  workspaceId: '',
  systemId: '',
  chatId: '',
  userId: '',
};

// Helper to get UnifiedAgentDBService with current session context (CR-032)
const getAgentDB = () => getUnifiedAgentDBService(config.workspaceId, config.systemId);

// Components - initialized in main() after session resolution
let llmEngine: ILLMEngine | undefined;
let neo4jClient: Neo4jClient;
let sessionManager: SessionManager;
let wsClient: CanvasWebSocketClient;
let graphCanvas: StatelessGraphCanvas;
let chatCanvas: ChatCanvas;
let agentDB: UnifiedAgentDBService;
const parser = new FormatEParser();

// CR-039 Fix 5: Background validation state
let validationTimeout: NodeJS.Timeout | null = null;

/**
 * CR-039 Fix 5: Setup background validation on graph changes
 * Debounced 500ms to avoid excessive validation calls
 *
 * CR-039: Pushes validation results to ChatCanvas (for LLM context)
 * NOTE: Does NOT call notifyGraphUpdate() - avoids broadcast loop
 */
function setupBackgroundValidation(): void {
  agentDB.onGraphChange(() => {
    // Clear previous timeout
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    // Debounce: wait 500ms before running validation
    validationTimeout = setTimeout(async () => {
      try {
        const evaluator = createUnifiedRuleEvaluator(agentDB);
        const result = await evaluator.evaluate('phase2_logical');

        // CR-039: Push to ChatCanvas for LLM context
        chatCanvas.setValidationSummary({
          violationCount: result.totalViolations,
          rewardScore: result.rewardScore,
          phaseGateReady: result.phaseGateReady,
          timestamp: new Date(),
        });

        // Log validation summary (but don't broadcast - avoid loop)
        if (result.totalViolations > 0) {
          log(`🔍 Background validation: ${result.totalViolations} violations (score: ${(result.rewardScore * 100).toFixed(0)}%)`);
        }
        // NOTE: Don't call notifyGraphUpdate() here - it creates a broadcast loop
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`⚠️ Background validation error: ${errorMsg}`);
      }
    }, 500);
  });

  log('✅ Background validation setup (500ms debounce)');
}

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

/**
 * Build nodeChangeStatus map for broadcast
 * CR-039 Fix 4: Include change status in WebSocket broadcasts
 */
function buildNodeChangeStatus(): Record<string, string> | undefined {
  if (!agentDB.hasBaseline()) {
    return undefined;
  }

  const statusMap: Record<string, string> = {};
  const nodes = agentDB.getNodes();

  for (const node of nodes) {
    const status = agentDB.getNodeChangeStatus(node.semanticId);
    if (status !== 'unchanged') {
      statusMap[node.semanticId] = status;
    }
  }

  // Include deleted nodes
  const changes = agentDB.getChanges();
  for (const change of changes) {
    if (change.elementType === 'node' && change.status === 'deleted') {
      statusMap[change.id] = 'deleted';
    }
  }

  return Object.keys(statusMap).length > 0 ? statusMap : undefined;
}

/**
 * Notify graph viewer of update via WebSocket
 * CR-032: Reads from AgentDB (Single Source of Truth)
 * CR-039 Fix 4: Includes nodeChangeStatus metadata
 */
function notifyGraphUpdate(): void {
  if (!wsClient || !wsClient.isConnected()) {
    const error = 'WebSocket not connected - cannot notify graph viewer';
    log(`❌ ${error}`);
    console.error(`\x1b[31m❌ ${error}\x1b[0m`);
    return;
  }

  const nodes = agentDB.getNodes();
  const edges = agentDB.getEdges();

  // CR-039 Fix 4: Build change status for broadcast
  const nodeChangeStatus = buildNodeChangeStatus();

  // CR-039: validationSummary goes to ChatCanvas (for LLM), not WebSocket (graph-viewer is pure display)
  const stateData = {
    nodes: nodes.map((n) => [n.semanticId, n]),
    edges: edges.map((e) => [`${e.sourceId}-${e.type}-${e.targetId}`, e]),
    ports: [],
    currentView: graphCanvas.getCurrentView(),
    timestamp: Date.now(),
    // CR-039: Include change tracking metadata for graph-viewer
    nodeChangeStatus,
  };

  wsClient.send({
    type: 'graph_update',
    workspaceId: config.workspaceId,
    systemId: config.systemId,
    diff: JSON.stringify(stateData),
    timestamp: new Date().toISOString(),
  });

  const changeCount = nodeChangeStatus ? Object.keys(nodeChangeStatus).length : 0;
  log(`📡 Graph update broadcast (${nodes.length} nodes, ${edges.length} edges, ${changeCount} changes)`);
}

/**
 * Print header
 */
function printHeader(): void {
  console.clear();
  console.log('\x1b[1;36m╔═════════════════════════════════════╗');
  console.log('║      GRAPHENGINE CHAT INTERFACE     ║');
  console.log('╚═════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('\x1b[90mType /help for commands, or describe your system...\x1b[0m');
  console.log('');
}

/**
 * Create command context for handlers
 */
function createCommandContext(rl: readline.Interface): CommandContext {
  return {
    config,
    llmEngine,
    neo4jClient,
    sessionManager,
    wsClient,
    graphCanvas,
    chatCanvas,
    agentDB,
    parser,
    rl,
    log,
    notifyGraphUpdate,
  };
}

/**
 * Handle command
 */
async function handleCommand(cmd: string, rl: readline.Interface): Promise<void> {
  const [command, ...args] = cmd.split(' ');
  const ctx = createCommandContext(rl);

  switch (command) {
    case '/help':
      printHelpMenu();
      break;

    case '/new':
      await handleNewCommand(ctx);
      break;

    case '/load':
      if (!neo4jClient) {
        console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
        break;
      }
      await handleLoadCommand(rl, ctx);
      return;

    case '/commit':
      await handleCommitCommand(ctx);
      break;

    case '/save':  // Alias for /commit (backward compatibility)
      await handleSaveCommand(ctx);
      break;

    case '/export':
      await handleExportCommand(args, ctx);
      break;

    case '/import':
      await handleImportCommand(args, ctx);
      break;

    case '/exports':
      await handleExportsCommand(ctx);
      break;

    case '/stats':
      handleStatsCommand(ctx);
      break;

    case '/status':
      handleStatusCommand(ctx);
      break;

    case '/view':
      handleViewCommand(args, ctx);
      break;

    case '/clear':
      printHeader();
      break;

    case '/derive':
      await handleDeriveCommand(args, ctx);
      return;

    case '/validate':
      await handleValidateCommand(args, ctx);
      break;

    case '/phase-gate':
      await handlePhaseGateCommand(args, ctx);
      break;

    case '/score':
      await handleScoreCommand(ctx);
      break;

    case '/analyze':
      await handleAnalyzeCommand(ctx);
      break;

    case '/optimize':
      await handleOptimizeCommand(args[0] || '', ctx);
      break;

    case '/cleanup':
      await handleCleanupCommand(args, ctx);
      break;

    default:
      console.log('\x1b[33mUnknown command. Type /help for available commands.\x1b[0m');
  }
}

/**
 * Process user message
 */
async function processMessage(message: string): Promise<void> {
  try {
    log(`📨 User: ${message}`);

    if (!llmEngine) {
      console.log('\x1b[33m⚠️  LLM Engine not configured. Set ANTHROPIC_API_KEY in .env\x1b[0m');
      return;
    }

    const workflowRouter = getWorkflowRouter();
    const agentExecutor = getAgentExecutor();
    const configLoader = getAgentConfigLoader();

    const currentState = graphCanvas.getState();
    const canvasState = parser.serializeGraph(currentState);

    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements', // TODO: Track phase state (CR-034)
      graphEmpty: currentState.nodes.size === 0,
      userMessage: message,
      recentNodeTypes: Array.from(currentState.nodes.values())
        .slice(-5)
        .map((n) => n.type),
    };

    const selectedAgent = workflowRouter.routeUserInput(message, sessionContext);
    log(`🤖 Agent selected: ${selectedAgent}`);

    let agentPrompt: string;
    try {
      agentPrompt = agentExecutor.getAgentContextPrompt(selectedAgent, canvasState, message);
    } catch {
      agentPrompt = configLoader.getPrompt('system-architect');
      log(`⚠️ Fallback to system-architect prompt (${selectedAgent} not configured)`);
    }

    console.log(`\x1b[33m🤖 Processing with ${selectedAgent}...\x1b[0m`);
    log(`🤖 Processing with ${selectedAgent}...`);

    await chatCanvas.addUserMessage(message);

    const conversationContext = chatCanvas.getConversationContext(10);
    const chatHistory = conversationContext.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const request = {
      message,
      chatId: config.chatId,
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
      canvasState,
      chatHistory,
      systemPrompt: agentPrompt,
    };

    let isFirstChunk = true;

    await llmEngine.processRequestStream(request, async (chunk: import('../shared/types/llm.js').StreamChunk) => {
      if (chunk.type === 'text' && chunk.text) {
        if (isFirstChunk) {
          console.log('');
          process.stdout.write('\x1b[32mAssistant:\x1b[0m ');
          isFirstChunk = false;
        }
        process.stdout.write(chunk.text);
      } else if (chunk.type === 'complete' && chunk.response) {
        const response = chunk.response;

        console.log('\n');

        await chatCanvas.addAssistantMessage(response.textResponse, response.operations ?? undefined);

        if (response.operations) {
          const diff = parser.parseDiff(response.operations, config.workspaceId, config.systemId);

          if (diff.operations.length === 0) {
            log(`⚠️ PARSE FAILURE: Operations block found but 0 operations parsed`);
            log(`📋 Operations block (first 800 chars):\n${response.operations.substring(0, 800)}`);
            console.log('\x1b[33m⚠️  Operations block found but no valid Format-E operations parsed\x1b[0m');
            console.log('\x1b[90m   Check LOG for details. Expected format: + Name|TYPE|ID|Description\x1b[0m');
          }

          await graphCanvas.applyDiff(diff);

          const stats = agentDB.getGraphStats();
          log(`📊 Graph updated (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);

          if (config.systemId === 'new-system') {
            const sysNodes = agentDB.getNodes({ type: 'SYS' });
            if (sysNodes.length > 0) {
              const newSystemId = sysNodes[0].semanticId;
              console.log(`\x1b[90m✓ Detected new system: ${newSystemId}\x1b[0m`);
              log(`📌 System ID detected: ${newSystemId}`);

              await updateActiveSystem(neo4jClient, config, newSystemId);
              await neo4jClient.saveNodes(agentDB.getNodes());
              await neo4jClient.saveEdges(agentDB.getEdges());
              log(`💾 System persisted to Neo4j: ${newSystemId}`);
            }
          }

          notifyGraphUpdate();

          console.log(`\x1b[90m✓ Graph updated: ${stats.nodeCount} nodes, ${stats.edgeCount} edges (see GRAPH terminal)\x1b[0m`);
          console.log('');
        }

        log('✅ Response complete');

        try {
          const reward = agentExecutor.calculateReward(selectedAgent, {
            agentId: selectedAgent,
            textResponse: response.textResponse,
            operations: response.operations ?? undefined,
            isComplete: true,
          });

          const agentdb = await getAgentDB();
          await agentdb.storeEpisode(
            selectedAgent,
            message,
            true,
            { response: response.textResponse, operations: response.operations },
            `Agent: ${selectedAgent}, Reward: ${reward.toFixed(2)}`
          );
          log(`🧠 Episode stored for agent: ${selectedAgent} (reward: ${reward.toFixed(2)})`);
        } catch (episodeError) {
          log(`⚠️ Episode storage failed: ${episodeError}`);
        }
      }
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31mError:\x1b[0m ${errorMsg}`);
    log(`❌ Error: ${errorMsg}`);

    try {
      const agentdb = await getAgentDB();
      await agentdb.storeEpisode(
        'system-architect',
        message,
        false,
        { error: errorMsg },
        `Error: ${errorMsg}`
      );
    } catch {
      // Ignore episode storage errors during error handling
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  printHeader();

  log('🚀 Chat interface started');

  // STEP 1: Session Resolution (MANDATORY Neo4j)
  neo4jClient = initNeo4jClient();
  sessionManager = new SessionManager(neo4jClient);

  const resolved = await resolveSession(neo4jClient);
  config.workspaceId = resolved.workspaceId;
  config.systemId = resolved.systemId;
  config.userId = resolved.userId;
  config.chatId = resolved.chatId;

  console.log(`\x1b[90m✓ Session: ${resolved.systemId} (${resolved.source})\x1b[0m`);
  log(`📋 Session: ${resolved.systemId} (source: ${resolved.source})`);

  // STEP 2: Initialize AgentDB (CR-032: Single Source of Truth)
  log('🔧 Initializing UnifiedAgentDBService (CR-032)...');
  agentDB = await getUnifiedAgentDBService(config.workspaceId, config.systemId);
  log('✅ UnifiedAgentDBService initialized');

  // CR-039 Fix 5: Setup background validation
  setupBackgroundValidation();

  // STEP 3: Initialize Canvases (delegate to AgentDB)
  graphCanvas = new StatelessGraphCanvas(
    agentDB,
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    'hierarchy'
  );

  chatCanvas = new ChatCanvas(
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    graphCanvas,
    neo4jClient
  );

  // STEP 4: LLM Engine (CR-034: Factory-based provider selection)
  const provider = getCurrentProvider();
  try {
    llmEngine = createLLMEngine({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      maxTokens: 4096,
      temperature: LLM_TEMPERATURE,
      enableCache: true,
    });
    log(`✅ LLM Engine initialized (provider: ${provider})`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`⚠️ LLM Engine not available: ${errorMsg}`);
    console.log(`\x1b[33m⚠️ LLM Engine not available: ${errorMsg}\x1b[0m`);
  }

  // STEP 5: WebSocket Connection
  wsClient = new CanvasWebSocketClient(
    process.env.WS_URL || WS_URL,
    {
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
    },
    (update: BroadcastUpdate) => {
      const userId = update.source?.userId || 'unknown';
      log(`📡 Received ${update.type} from ${userId}`);
    }
  );

  try {
    await wsClient.connect();
    console.log('\x1b[32m✅ Connected to WebSocket server\x1b[0m');
    log('✅ WebSocket connected');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const wsUrl = process.env.WS_URL || WS_URL;
    console.error('');
    console.error('\x1b[31m╔═══════════════════════════════════════╗\x1b[0m');
    console.error('\x1b[31m║  ERROR: WebSocket Connection Failed  ║\x1b[0m');
    console.error('\x1b[31m╚═══════════════════════════════════════╝\x1b[0m');
    console.error('');
    console.error(`\x1b[31mCould not connect to WebSocket server at ${wsUrl}\x1b[0m`);
    console.error(`\x1b[31mError: ${errorMsg}\x1b[0m`);
    console.error('');
    console.error('\x1b[33mPlease ensure the WebSocket server is running:\x1b[0m');
    console.error('\x1b[33m  npm run websocket-server\x1b[0m');
    console.error('');
    log(`❌ WebSocket connection failed: ${errorMsg}`);
    process.exit(1);
  }

  // STEP 6: Load graph from Neo4j into AgentDB
  if (neo4jClient) {
    try {
      const { nodes, edges } = await neo4jClient.loadGraph({
        workspaceId: config.workspaceId,
        systemId: config.systemId,
      });

      if (nodes.length > 0) {
        console.log(`\x1b[32m✅ Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j\x1b[0m`);
        log(`📥 Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j`);

        for (const node of nodes) {
          agentDB.setNode(node, { upsert: true });
        }
        for (const edge of edges) {
          agentDB.setEdge(edge, { upsert: true });
        }
        log(`📦 Loaded ${nodes.length} nodes into AgentDB`);

        // CR-033: Capture baseline for change tracking (loaded state = committed state)
        agentDB.captureBaseline();

        notifyGraphUpdate();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\x1b[33m⚠️  Could not load from Neo4j: ${errorMsg}\x1b[0m`);
      log(`⚠️ Neo4j load error: ${errorMsg}`);
    }
  }

  console.log('');

  if (sessionManager) {
    sessionManager.registerComponents(wsClient, graphCanvas, chatCanvas);
  }

  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[34mYou:\x1b[0m ',
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === '/exit') {
      log('🛑 Shutting down all terminals...');

      if (wsClient) {
        try {
          wsClient.send({
            type: 'shutdown',
            timestamp: new Date().toISOString(),
          });
          log('📡 Shutdown signal sent to all terminals');

          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          log(`⚠️  Could not send shutdown signal: ${error}`);
        }
      }

      if (sessionManager) {
        const state = graphCanvas.getState();
        await sessionManager.shutdown({
          userId: config.userId,
          workspaceId: config.workspaceId,
          activeSystemId: config.systemId,
          currentView: state.currentView,
          chatId: config.chatId,
          lastActive: new Date(),
        });
      } else if (neo4jClient) {
        console.log('');
        console.log('💾 Saving before exit...');
        await graphCanvas.persistToNeo4j();
        await chatCanvas.persistToNeo4j();
        await neo4jClient.close();
        console.log('\x1b[32m✅ Goodbye!\x1b[0m');
      }

      rl.close();
      process.exit(0);
    }

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed, rl);
    } else {
      await processMessage(trimmed);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    log('💤 Chat interface closed');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  log(`💀 Fatal error: ${error}`);
  process.exit(1);
});
