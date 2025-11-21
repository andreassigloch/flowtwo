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
import { GraphCanvas } from '../canvas/graph-canvas.js';
import { ChatCanvas } from '../canvas/chat-canvas.js';
import { LLMEngine } from '../llm-engine/llm-engine.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { CanvasWebSocketClient } from '../canvas/websocket-client.js';
import type { BroadcastUpdate } from '../canvas/websocket-server.js';
import { SessionManager } from '../session.js';
import { WS_URL, LOG_PATH, LLM_TEMPERATURE, AGENTDB_ENABLED } from '../shared/config.js';
import { getAgentDBService } from '../llm-engine/agentdb/agentdb-service.js';

// Configuration
const config = {
  workspaceId: process.env.WORKSPACE_ID || 'demo-workspace',
  systemId: process.env.SYSTEM_ID || 'new-system', // Will be auto-detected from first SYS node
  chatId: process.env.CHAT_ID || 'demo-chat-001',
  userId: process.env.USER_ID || 'andreas@siglochconsulting',
};

// Initialize components
let llmEngine: LLMEngine | undefined;
let neo4jClient: Neo4jClient | undefined;
let sessionManager: SessionManager | undefined;
let wsClient: CanvasWebSocketClient;
const parser = new FormatEParser();

// Initialize Neo4j (optional)
if (process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD) {
  neo4jClient = new Neo4jClient({
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  });
  sessionManager = new SessionManager(neo4jClient);
}

// Initialize canvases
const graphCanvas = new GraphCanvas(
  config.workspaceId,
  config.systemId,
  config.chatId,
  config.userId,
  'hierarchy',
  neo4jClient
);

const chatCanvas = new ChatCanvas(
  config.workspaceId,
  config.systemId,
  config.chatId,
  config.userId,
  graphCanvas,
  neo4jClient
);

// Initialize LLM Engine (optional)
if (process.env.ANTHROPIC_API_KEY) {
  llmEngine = new LLMEngine({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    temperature: LLM_TEMPERATURE,
    enableCache: true,
  });
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
 * Notify graph viewer of update via WebSocket
 * Uses same JSON format as file-based polling
 */
function notifyGraphUpdate(): void {
  const state = graphCanvas.getState();

  if (!wsClient || !wsClient.isConnected()) {
    const error = 'WebSocket not connected - cannot notify graph viewer';
    log(`❌ ${error}`);
    console.error(`\x1b[31m❌ ${error}\x1b[0m`);
    return;
  }

  // Serialize graph state as JSON (same format as file-based polling)
  const stateData = {
    nodes: Array.from(state.nodes.entries()),
    edges: Array.from(state.edges.entries()),
    ports: Array.from(state.ports.entries()),
    currentView: state.currentView,
    timestamp: Date.now(),
  };

  wsClient.broadcastUpdate(
    'graph_update',
    JSON.stringify(stateData),  // JSON serialized state (not Format E)
    {
      userId: config.userId,
      sessionId: config.chatId,
      origin: 'llm-operation',
    }
  );

  log('📡 Broadcast graph update via WebSocket');
}

/**
 * Print header
 */
function printHeader(): void {
  console.clear();
  console.log('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║     TERMINAL 3: CHAT INTERFACE       ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('Commands: /help, /new, /load, /save, /stats, /view <name>, /exit');
  console.log('');

  if (!llmEngine) {
    console.log('\x1b[33m⚠️  LLM Engine not configured (set ANTHROPIC_API_KEY in .env)\x1b[0m');
    console.log('');
  }
}

/**
 * Handle /load command - list and load systems from Neo4j
 * Uses the main readline interface to avoid stdin conflicts
 */
async function handleLoadCommand(mainRl: readline.Interface): Promise<void> {
  if (!neo4jClient) return;

  try {
    console.log('');
    console.log('🔍 Scanning Neo4j for available systems...');
    log('🔍 Scanning Neo4j for systems');

    // Get all systems in workspace
    const systems = await neo4jClient.listSystems(config.workspaceId);

    if (systems.length === 0) {
      console.log('\x1b[33m⚠️  No systems found in workspace: ' + config.workspaceId + '\x1b[0m');
      console.log('');
      return;
    }

    // Display available systems
    console.log('');
    console.log('\x1b[1;36mAvailable Systems:\x1b[0m');
    console.log('');

    systems.forEach((sys, idx) => {
      console.log(`  ${idx + 1}. \x1b[35m${sys.systemId}\x1b[0m \x1b[90m(${sys.nodeCount} nodes)\x1b[0m`);
    });

    console.log('');
    console.log('\x1b[90mEnter number (1-' + systems.length + ') or semantic ID to load (or press Enter to cancel):\x1b[0m');
    console.log('');

    // Use main readline interface to avoid stdin conflicts
    mainRl.question('\x1b[34mLoad:\x1b[0m ', async (answer) => {
      // Don't close the main interface!

      const trimmed = answer.trim();
      if (!trimmed || trimmed === 'q' || trimmed === 'exit' || trimmed === 'cancel') {
        console.log('\x1b[33m❌ Cancelled\x1b[0m');
        console.log('');
        mainRl.prompt();
        return;
      }

      // Check if numeric index
      const index = parseInt(trimmed, 10);
      let selectedSystem: { systemId: string; nodeCount: number } | undefined;

      if (!isNaN(index) && index >= 1 && index <= systems.length) {
        selectedSystem = systems[index - 1];
      } else {
        // Try to find by semantic ID
        selectedSystem = systems.find((s) => s.systemId === trimmed);
      }

      if (!selectedSystem) {
        console.log(`\x1b[31m❌ Invalid selection: ${trimmed}\x1b[0m`);
        console.log('');
        return;
      }

      // Load the selected system
      console.log('');
      console.log(`📥 Loading \x1b[35m${selectedSystem.systemId}\x1b[0m...`);
      log(`📥 Loading system: ${selectedSystem.systemId}`);

      try {
        const { nodes, edges } = await neo4jClient!.loadGraph({
          workspaceId: config.workspaceId,
          systemId: selectedSystem.systemId,
        });

        if (nodes.length === 0) {
          console.log('\x1b[33m⚠️  System has no nodes\x1b[0m');
          console.log('');
          return;
        }

        // Update config
        const oldSystemId = config.systemId;
        config.systemId = selectedSystem.systemId;

        // Load into graph canvas
        const nodesMap = new Map(nodes.map((n) => [n.semanticId, n]));
        const edgesMap = new Map(edges.filter((e) => e.semanticId).map((e) => [e.semanticId!, e]));

        await graphCanvas.loadGraph({
          nodes: nodesMap,
          edges: edgesMap,
          ports: new Map(),
        });

        // Invalidate cache for both old and new systems
        const agentdb = await getAgentDBService();
        await agentdb.invalidateGraphSnapshot(oldSystemId);
        await agentdb.invalidateGraphSnapshot(config.systemId);

        console.log(`\x1b[32m✅ Loaded ${nodes.length} nodes, ${edges.length} edges\x1b[0m`);
        log(`✅ Loaded ${nodes.length} nodes, ${edges.length} edges`);

        // Save session with new system ID
        if (sessionManager) {
          const state = graphCanvas.getState();
          await sessionManager.saveSession({
            userId: config.userId,
            workspaceId: config.workspaceId,
            activeSystemId: config.systemId,
            currentView: state.currentView,
            chatId: config.chatId,
            lastActive: new Date(),
          });
          log(`💾 Session updated: ${config.systemId}`);
        }

        // Notify graph viewer
        notifyGraphUpdate();

        console.log('');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`\x1b[31m❌ Error loading system: ${errorMsg}\x1b[0m`);
        log(`❌ Error loading system: ${errorMsg}`);
        console.log('');
      }

      // Restore the prompt after async operation completes
      mainRl.prompt();
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Error scanning systems: ${errorMsg}\x1b[0m`);
    log(`❌ Error scanning systems: ${errorMsg}`);
    console.log('');
  }
}

/**
 * Handle command
 */
async function handleCommand(cmd: string, rl: readline.Interface): Promise<void> {
  const [command, ...args] = cmd.split(' ');

  switch (command) {
    case '/help':
      console.log('');
      console.log('Available commands:');
      console.log('  /help           - Show this help');
      console.log('  /new            - Start new system (clear graph)');
      console.log('  /load           - List and load systems from Neo4j');
      console.log('  /save           - Save graph to Neo4j');
      console.log('  /stats          - Show graph statistics');
      console.log('  /view <name>    - Switch view (hierarchy, functional-flow, requirements, allocation, use-case)');
      console.log('  /clear          - Clear chat history');
      console.log('  /exit           - Save session and quit (also: exit, quit)');
      console.log('');
      break;

    case '/new':
      console.log('');
      console.log('🗑️  Starting new system...');
      log('🗑️  Starting new system');

      // Clear graph state
      await graphCanvas.loadGraph({
        nodes: new Map(),
        edges: new Map(),
        ports: new Map(),
      });

      // Reset system ID to placeholder
      const oldSystemId = config.systemId;
      config.systemId = 'new-system';

      // Invalidate old system's cache
      const agentdb = await getAgentDBService();
      await agentdb.invalidateGraphSnapshot(oldSystemId);

      // Notify graph viewer
      notifyGraphUpdate();

      console.log('\x1b[32m✅ Graph cleared - ready for new system\x1b[0m');
      console.log('\x1b[90m   (System ID will be auto-detected from first SYS node)\x1b[0m');
      log('✅ Graph cleared');
      console.log('');
      break;

    case '/load':
      if (!neo4jClient) {
        console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
        break;
      }
      await handleLoadCommand(rl);
      return; // Don't call rl.prompt() - handleLoadCommand will do it after async operation

    case '/save':
      if (!neo4jClient) {
        console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
        break;
      }
      console.log('💾 Saving to Neo4j...');
      log('💾 Saving to Neo4j...');

      const graphResult = await graphCanvas.persistToNeo4j();
      const chatResult = await chatCanvas.persistToNeo4j();

      if (graphResult.skipped && chatResult.skipped) {
        console.log('\x1b[33m⚠️  No changes to save (graph is up to date)\x1b[0m');
        log('⚠️  No changes to save');
      } else {
        const graphCount = graphResult.savedCount || 0;
        const chatCount = chatResult.savedCount || 0;
        console.log(`\x1b[32m✅ Saved successfully: ${graphCount} graph items, ${chatCount} messages\x1b[0m`);
        log(`✅ Saved successfully: ${graphCount} graph items, ${chatCount} messages`);
      }
      break;

    case '/stats':
      const state = graphCanvas.getState();
      console.log('');
      console.log(`Workspace: ${config.workspaceId}`);
      console.log(`System: ${config.systemId}`);
      console.log(`Nodes: ${state.nodes.size}`);
      console.log(`Edges: ${state.edges.size}`);
      console.log(`View: ${state.currentView}`);
      console.log('');
      log(`📊 Stats - Nodes: ${state.nodes.size}, Edges: ${state.edges.size}`);
      break;

    case '/view':
      if (args.length === 0) {
        console.log('\x1b[33mUsage: /view <name>\x1b[0m');
        console.log('Views: hierarchy, functional-flow, requirements, allocation, use-case');
        break;
      }
      const viewName = args[0];
      const validViews = ['hierarchy', 'functional-flow', 'requirements', 'allocation', 'use-case'];
      if (!validViews.includes(viewName)) {
        console.log(`\x1b[33m❌ Invalid view: ${viewName}\x1b[0m`);
        console.log('Valid views: hierarchy, functional-flow, requirements, allocation, use-case');
        break;
      }
      // Update graph canvas view
      console.log(`🔄 Switching to ${viewName} view...`);
      log(`🔄 Switching to ${viewName} view`);
      graphCanvas.setCurrentView(viewName);
      notifyGraphUpdate();
      console.log('\x1b[32m✅ View updated (check GRAPH terminal)\x1b[0m');
      break;

    case '/clear':
      printHeader();
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

    console.log('\x1b[33m🤖 Processing...\x1b[0m');
    log('🤖 Processing with LLM...');

    // Add user message to chat canvas
    await chatCanvas.addUserMessage(message);

    // Get graph snapshot from AgentDB cache (or serialize if not cached)
    const agentdb = await getAgentDBService();
    let canvasState = await agentdb.getGraphSnapshot(config.systemId);

    if (!canvasState) {
      // Cache miss - serialize and store
      const state = graphCanvas.getState();
      canvasState = parser.serializeGraph(state);

      await agentdb.storeGraphSnapshot(config.systemId, canvasState, {
        nodeCount: state.nodes.size,
        edgeCount: state.edges.size,
      });
    }

    // Create LLM request
    const request = {
      message,
      chatId: config.chatId,
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
      canvasState,
    };

    // Track streaming state
    let isFirstChunk = true;
    let streamedText = '';

    // Send to LLM with streaming
    await llmEngine.processRequestStream(request, async (chunk) => {
      if (chunk.type === 'text' && chunk.text) {
        // Display text chunk in real-time
        if (isFirstChunk) {
          console.log('');
          process.stdout.write('\x1b[32mAssistant:\x1b[0m ');
          isFirstChunk = false;
        }
        process.stdout.write(chunk.text);
        streamedText += chunk.text;
      } else if (chunk.type === 'complete' && chunk.response) {
        // Stream complete - process operations
        const response = chunk.response;

        // Add newline after streamed text
        console.log('\n');

        // Add assistant response to chat canvas
        await chatCanvas.addAssistantMessage(response.textResponse, response.operations);

        // Apply operations to graph if present (silently)
        if (response.operations) {
          const diff = parser.parseDiff(response.operations, config.workspaceId, config.systemId);
          await graphCanvas.applyDiff(diff);

          const state = graphCanvas.getState();
          log(`📊 Graph updated (${state.nodes.size} nodes, ${state.edges.size} edges)`);

          // Invalidate graph snapshot cache after updates
          await agentdb.invalidateGraphSnapshot(config.systemId);

          // Auto-detect system ID from first SYS node (only if placeholder)
          if (config.systemId === 'new-system') {
            const sysNodes = Array.from(state.nodes.values()).filter(n => n.type === 'SYS');
            if (sysNodes.length > 0) {
              const newSystemId = sysNodes[0].semanticId;
              console.log(`\x1b[90m✓ Detected new system: ${newSystemId}\x1b[0m`);
              log(`📌 System ID detected: ${newSystemId}`);
              config.systemId = newSystemId;

              // Update canvas state with new system ID
              graphCanvas.updateSystemId(newSystemId);
            }
          }

          // Notify graph viewer (silently)
          notifyGraphUpdate();

          // Show brief status
          console.log(`\x1b[90m✓ Graph updated: ${state.nodes.size} nodes, ${state.edges.size} edges (see GRAPH terminal)\x1b[0m`);
          console.log('');
        }

        log('✅ Response complete');
      }
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31mError:\x1b[0m ${errorMsg}`);
    log(`❌ Error: ${errorMsg}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  printHeader();

  log('🚀 Chat interface started');

  // Initialize AgentDB if enabled
  if (AGENTDB_ENABLED && llmEngine) {
    try {
      log('🔧 Initializing AgentDB...');
      await getAgentDBService();
      log('✅ AgentDB initialized');
    } catch (error) {
      log(`⚠️ AgentDB initialization failed: ${error}`);
      console.log('\x1b[33m⚠️  AgentDB initialization failed (LLM will work without caching)\x1b[0m');
    }
  }

  // Load session from Neo4j if available
  if (sessionManager) {
    try {
      const session = await sessionManager.loadSession(config.userId, config.workspaceId);
      if (session) {
        // Restore session state
        config.systemId = session.activeSystemId;
        config.chatId = session.chatId;
        console.log(`\x1b[90m✓ Session restored: ${session.activeSystemId}\x1b[0m`);
        log(`📋 Session restored: ${session.activeSystemId}`);
      }
    } catch {
      log('⚠️  Could not load session (starting fresh)');
    }
  }

  // Load graph from Neo4j if available
  if (neo4jClient) {
    try {
      const { nodes, edges } = await neo4jClient.loadGraph({
        workspaceId: config.workspaceId,
        systemId: config.systemId,
      });

      if (nodes.length > 0) {
        console.log(`\x1b[32m✅ Loaded ${nodes.length} nodes from Neo4j\x1b[0m`);
        log(`📥 Loaded ${nodes.length} nodes from Neo4j`);

        const nodesMap = new Map(nodes.map((n) => [n.semanticId, n]));
        const edgesMap = new Map(edges.map((e) => [e.semanticId, e]));

        await graphCanvas.loadGraph({
          nodes: nodesMap,
          edges: edgesMap,
          ports: new Map(),
        });

        notifyGraphUpdate();
      }
    } catch {
      console.log('\x1b[33m⚠️  Could not load from Neo4j (starting fresh)\x1b[0m');
    }
  }

  console.log('');

  // Connect to WebSocket server
  wsClient = new CanvasWebSocketClient(
    process.env.WS_URL || WS_URL,
    {
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
    },
    (update: BroadcastUpdate) => {
      // Handle updates from other clients (not used in chat terminal)
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

  // Register components with session manager for cleanup
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

      // Send shutdown signal to other terminals via WebSocket
      if (wsClient) {
        try {
          wsClient.broadcast({
            type: 'shutdown',
            timestamp: new Date().toISOString(),
          });
          log('📡 Shutdown signal sent to all terminals');

          // Wait longer to ensure message delivery before closing connections
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
        // Fallback if no session manager
        console.log('');
        console.log('💾 Saving before exit...');
        await graphCanvas.persistToNeo4j();
        await chatCanvas.persistToNeo4j();
        await neo4jClient.close();
        console.log('\x1b[32m✅ Goodbye!\x1b[0m');
      }

      log('✅ Shutdown complete');
      process.exit(0);
    }

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed, rl);
      rl.prompt();
      return;
    }

    await processMessage(trimmed);
    rl.prompt();
  });

  rl.on('close', async () => {
    log('🛑 SIGINT received - shutting down...');

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
      await graphCanvas.persistToNeo4j();
      await chatCanvas.persistToNeo4j();
      await neo4jClient.close();
    }

    log('✅ Shutdown complete');
    process.exit(0);
  });
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('');
  console.log('💾 Saving...');
  await graphCanvas.persistToNeo4j();
  await chatCanvas.persistToNeo4j();
  if (neo4jClient) await neo4jClient.close();
  console.log('✅ Goodbye!');
  process.exit(0);
});

// Crash handlers - log errors to STDOUT file
process.on('uncaughtException', async (error: Error) => {
  const errorMsg = `💥 CRASH (uncaughtException): ${error.message}`;
  console.error(errorMsg);
  log(errorMsg);
  if (error.stack) {
    log(error.stack);
  }
  // Emergency save attempt
  try {
    log('💾 Emergency save attempt...');
    await graphCanvas.persistToNeo4j();
    await chatCanvas.persistToNeo4j();
    log('✅ Emergency save successful');
  } catch (saveError) {
    log(`❌ Emergency save failed: ${saveError}`);
  }
  if (neo4jClient) await neo4jClient.close();
  process.exit(1);
});

process.on('unhandledRejection', async (reason: unknown) => {
  const errorMsg = `💥 CRASH (unhandledRejection): ${reason}`;
  console.error(errorMsg);
  log(errorMsg);
  if (reason instanceof Error && reason.stack) {
    log(reason.stack);
  }
  // Emergency save attempt
  try {
    log('💾 Emergency save attempt...');
    await graphCanvas.persistToNeo4j();
    await chatCanvas.persistToNeo4j();
    log('✅ Emergency save successful');
  } catch (saveError) {
    log(`❌ Emergency save failed: ${saveError}`);
  }
  if (neo4jClient) await neo4jClient.close();
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  log(`💥 FATAL: ${error.message}`);
  if (error.stack) {
    log(error.stack);
  }
  process.exit(1);
});
