/**
 * GraphEngine - Chat Interface (Terminal 3)
 *
 * Simple readline-based chat interface
 * - User input
 * - LLM responses
 * - Commands (/help, /save, /stats, /view)
 *
 * CR-063 Migration: Uses SessionManager from session-manager.ts as SINGLE entry point.
 * All components (AgentDB, Canvases, LLM, SkillLibrary, etc.) come from SessionManager.
 *
 * @author andreas@siglochconsulting
 * @version 3.0.0
 */

import 'dotenv/config';
import * as readline from 'readline';
import * as fs from 'fs';
import type { StatelessGraphCanvas } from '../canvas/stateless-graph-canvas.js';
import type { ChatCanvas } from '../canvas/chat-canvas.js';
import type { ILLMEngine } from '../llm-engine/engine-factory.js';
import type { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import type { CanvasWebSocketClient } from '../canvas/websocket-client.js';
import type { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { SessionManager } from '../session-manager.js';
import { LOG_PATH } from '../shared/config.js';
import type { UnifiedAgentDBService } from '../llm-engine/agentdb/unified-agentdb-service.js';
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
  handleRestoreCommand,
  handleLoadCommand,
  handleExportCommand,
  handleImportCommand,
  handleExportsCommand,
  handleStatsCommand,
  handleStatusCommand,
  handleViewCommand,
  printHelpMenu,
} from './commands/session-commands.js';
import { handleLearningCommand } from './commands/learning-commands.js';
import { getPreApplyValidator, parseOperations } from '../llm-engine/validation/pre-apply-validator.js';

// CR-063: SessionManager owns ALL components - these are just local references
let sessionManager: SessionManager;

// Local references to components (owned by SessionManager)
// Using definite assignment assertion (!) since these are set in main() before any usage
let config = { workspaceId: '', systemId: '', chatId: '', userId: '' };
let llmEngine: ILLMEngine | undefined;
let neo4jClient!: Neo4jClient;
let wsClient!: CanvasWebSocketClient;
let graphCanvas!: StatelessGraphCanvas;
let chatCanvas!: ChatCanvas;
let agentDB!: UnifiedAgentDBService;
let parser!: FormatEParser;

/**
 * CR-045: Input lock flag to prevent duplicate processing during sub-dialogs
 * When true, the main readline ignores input (another dialog is active)
 */
let inputLocked = false;

/**
 * CR-045: Lock input processing (called before opening sub-dialogs like /load selection)
 */
export function lockInput(): void {
  inputLocked = true;
  log('🔒 Input locked (sub-dialog active)');
}

/**
 * CR-045: Unlock input processing (called after sub-dialogs close)
 */
export function unlockInput(): void {
  inputLocked = false;
  log('🔓 Input unlocked');
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

  // Include deleted nodes from baseline so they can be rendered with "-" indicator
  const allNodes = [...nodes];
  const changes = agentDB.getChanges();
  for (const change of changes) {
    if (change.elementType === 'node' && change.status === 'deleted' && change.baseline) {
      allNodes.push(change.baseline as any);
    }
  }

  // CR-039: validationSummary goes to ChatCanvas (for LLM), not WebSocket (graph-viewer is pure display)
  const stateData = {
    nodes: allNodes.map((n) => [n.semanticId, n]),
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
 *
 * CR-063: Now uses sessionManager.getCommandContext() which includes
 * sessionManagerNew for access to SkillLibrary, ReflexionMemory, etc.
 */
function createCommandContext(rl: readline.Interface): CommandContext {
  // Use SessionManager's getCommandContext which includes sessionManagerNew
  return sessionManager.getCommandContext(rl);
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

    case '/restore':
      handleRestoreCommand(ctx);
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

    case '/learning':
      await handleLearningCommand(ctx);
      break;

    default:
      console.log('\x1b[33mUnknown command. Type /help for available commands.\x1b[0m');
  }
}

/**
 * CR-055 Phase 4: Maximum retry attempts for pre-apply validation failures
 */
const MAX_VALIDATION_RETRIES = 2;

/**
 * Process user message with optional retry context
 *
 * @param message - User message or retry prompt
 * @param retryCount - Current retry attempt (0 = initial, 1+ = retry)
 * @param originalMessage - Original user message (preserved across retries)
 */
async function processMessage(
  message: string,
  retryCount: number = 0,
  originalMessage?: string
): Promise<void> {
  try {
    const isRetry = retryCount > 0;
    const displayMessage = originalMessage || message;
    log(`📨 ${isRetry ? `Retry ${retryCount}` : 'User'}: ${message.substring(0, 200)}...`);

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

        // CR-055: Pre-Apply Validation MUST run BEFORE adding to chat history
        // Otherwise chatCanvas.addAssistantMessage() forwards operations to AgentDB
        // before we can block them
        if (response.operations) {
          const preValidator = getPreApplyValidator();
          const parsedOps = parseOperations(response.operations);
          log(`🔍 Pre-Apply: Parsed ${parsedOps.length} operations from LLM output`);
          if (parsedOps.length > 0) {
            log(`   First op: ${JSON.stringify(parsedOps[0])}`);
          }
          const existingNodes = agentDB.getNodes();
          const existingEdges = agentDB.getEdges();
          const preValidation = preValidator.validateOperations(parsedOps, existingNodes, existingEdges);
          log(`🔍 Pre-Apply validation: valid=${preValidation.valid}, errors=${preValidation.errors.length}`);

          if (!preValidation.valid) {
            // Block the operations - add message WITHOUT operations
            log(`🚫 Pre-Apply Validation FAILED: ${preValidation.errors.length} errors`);
            await chatCanvas.addAssistantMessage(response.textResponse, undefined); // No operations!

            console.log('\x1b[31m🚫 Operations blocked by pre-apply validation:\x1b[0m');
            for (const err of preValidation.errors.slice(0, 3)) {
              console.log(`   \x1b[31m• ${err.code}:\x1b[0m ${err.reason}`);
              console.log(`     \x1b[90mFix: ${err.suggestion}\x1b[0m`);
            }
            if (preValidation.errors.length > 3) {
              console.log(`   \x1b[90m... and ${preValidation.errors.length - 3} more errors\x1b[0m`);
            }
            console.log('');

            // Add validation feedback to chatHistory for next LLM call
            await chatCanvas.addSystemMessage(preValidation.feedback);
            log(`📝 Pre-validation feedback added to chatHistory`);

            // CR-055 Phase 4: Automatic retry with feedback
            if (retryCount < MAX_VALIDATION_RETRIES) {
              console.log(`\x1b[33m🔄 Attempting automatic correction (retry ${retryCount + 1}/${MAX_VALIDATION_RETRIES})...\x1b[0m`);
              console.log('');

              // Build retry prompt with validation feedback
              const retryPrompt = `[VALIDATION FAILED - AUTOMATIC RETRY]\n\nYour previous output had validation errors:\n${preValidation.feedback}\n\nPlease fix these issues and try again. Original request: ${displayMessage}`;

              // Recursive retry with incremented counter
              await processMessage(retryPrompt, retryCount + 1, displayMessage);
              return;
            }

            // Max retries exhausted
            console.log('\x1b[33m⚠️  Operations NOT applied after retries. Manual correction needed.\x1b[0m');
            console.log('');
            return;
          }

          // Validation passed - add message with operations
          await chatCanvas.addAssistantMessage(response.textResponse, response.operations);

          const diff = parser.parseDiff(response.operations, config.workspaceId, config.systemId);

          if (diff.operations.length === 0) {
            log(`⚠️ PARSE FAILURE: Operations block found but 0 operations parsed`);
            log(`📋 Operations block (first 800 chars):\n${response.operations.substring(0, 800)}`);
            console.log('\x1b[33m⚠️  Operations block found but no valid Format-E operations parsed\x1b[0m');
            console.log('\x1b[90m   Check LOG for details. Expected format: + SemanticID|Description\x1b[0m');
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
        } else {
          // No operations - just add the text response
          await chatCanvas.addAssistantMessage(response.textResponse, undefined);
        }

        log('✅ Response complete');

        try {
          const reward = agentExecutor.calculateReward(selectedAgent, {
            agentId: selectedAgent,
            textResponse: response.textResponse,
            operations: response.operations ?? undefined,
            isComplete: true,
          });

          // Episode success based on reward threshold (CR-054)
          const SUCCESS_THRESHOLD = 0.7;
          const success = reward >= SUCCESS_THRESHOLD;

          await agentDB.storeEpisode(
            selectedAgent,
            message,
            success,
            { response: response.textResponse, operations: response.operations },
            success
              ? `Agent: ${selectedAgent}, Reward: ${reward.toFixed(2)}`
              : `Failed: ${selectedAgent}, Reward: ${reward.toFixed(2)} < ${SUCCESS_THRESHOLD}`
          );
          log(`🧠 Episode stored for agent: ${selectedAgent} (reward: ${reward.toFixed(2)}, success: ${success})`);
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
      await agentDB.storeEpisode(
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
 *
 * CR-063 Migration: Uses SessionManager.create() as SINGLE initialization point.
 * All components are owned by SessionManager - no duplicate initialization.
 */
async function main(): Promise<void> {
  printHeader();

  log('🚀 Chat interface started');

  // STEP 1: Resolve session (get workspace, system, user from Neo4j/env)
  const tempNeo4j = initNeo4jClient();
  const resolved = await resolveSession(tempNeo4j);
  await tempNeo4j.close(); // Close temporary connection - SessionManager creates its own

  console.log(`\x1b[90m✓ Session: ${resolved.systemId} (${resolved.source})\x1b[0m`);
  log(`📋 Session: ${resolved.systemId} (source: ${resolved.source})`);

  // STEP 2: Create SessionManager - THIS initializes ALL components
  // (Neo4j, AgentDB, Canvases, LLM, WebSocket, SkillLibrary, ReflexionMemory, etc.)
  try {
    sessionManager = await SessionManager.create(resolved);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('');
    console.error('\x1b[31m╔═══════════════════════════════════════╗\x1b[0m');
    console.error('\x1b[31m║  ERROR: Session Initialization Failed ║\x1b[0m');
    console.error('\x1b[31m╚═══════════════════════════════════════╝\x1b[0m');
    console.error('');
    console.error(`\x1b[31m${errorMsg}\x1b[0m`);
    console.error('');
    log(`❌ Session initialization failed: ${errorMsg}`);
    process.exit(1);
  }

  // STEP 3: Get component references from SessionManager for local use
  // These are just references - SessionManager owns them
  neo4jClient = sessionManager.getNeo4jClient();
  agentDB = sessionManager.getAgentDB();
  graphCanvas = sessionManager.getGraphCanvas();
  chatCanvas = sessionManager.getChatCanvas();
  llmEngine = sessionManager.getLLMEngine();
  wsClient = sessionManager.getWebSocketClient();
  parser = sessionManager.getParser();
  const smConfig = sessionManager.getConfig();
  config.workspaceId = smConfig.workspaceId;
  config.systemId = smConfig.systemId;
  config.chatId = smConfig.chatId;
  config.userId = smConfig.userId;

  console.log('\x1b[32m✅ All components initialized via SessionManager\x1b[0m');
  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[34mYou:\x1b[0m ',
  });

  rl.prompt();

  rl.on('line', async (input) => {
    // CR-045: Skip if input is locked (sub-dialog like /load selection is active)
    if (inputLocked) {
      log(`🔒 Input ignored while locked: "${input.substring(0, 20)}..."`);
      return;
    }

    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === '/exit') {
      log('🛑 Shutting down all terminals...');

      // CR-063: SessionManager handles ALL shutdown (background validator, WS, Neo4j, SkillLibrary, etc.)
      if (sessionManager) {
        await sessionManager.shutdown();
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
