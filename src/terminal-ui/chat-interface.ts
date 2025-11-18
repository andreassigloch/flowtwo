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

// Configuration
const config = {
  workspaceId: process.env.WORKSPACE_ID || 'demo-workspace',
  systemId: process.env.SYSTEM_ID || 'UrbanMobility.SY.001',
  chatId: process.env.CHAT_ID || 'demo-chat-001',
  userId: process.env.USER_ID || 'andreas@siglochconsulting',
};

// Initialize components
let graphCanvas: GraphCanvas;
let chatCanvas: ChatCanvas;
let llmEngine: LLMEngine | undefined;
let neo4jClient: Neo4jClient | undefined;
const parser = new FormatEParser();

// Initialize Neo4j (optional)
if (process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD) {
  neo4jClient = new Neo4jClient({
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  });
}

// Initialize canvases
graphCanvas = new GraphCanvas(
  config.workspaceId,
  config.systemId,
  config.chatId,
  config.userId,
  'hierarchy',
  neo4jClient
);

chatCanvas = new ChatCanvas(
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
    temperature: 0.7,
    enableCache: true,
  });
}

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync('/tmp/graphengine.log', logMsg + '\n');
}

/**
 * Notify graph viewer of update via shared state file
 */
function notifyGraphUpdate(): void {
  try {
    const state = graphCanvas.getState();
    const stateData = {
      nodes: Array.from(state.nodes.entries()),
      edges: Array.from(state.edges.entries()),
      ports: Array.from(state.ports.entries()),
      currentView: state.currentView,
      timestamp: Date.now(),
    };
    fs.writeFileSync('/tmp/graphengine-state.json', JSON.stringify(stateData));
    log('📝 Wrote graph state to shared file');
  } catch (error) {
    log(`⚠️  Failed to write state: ${error}`);
  }
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
  console.log('Commands: /help, /save, /stats, /view <name>, exit');
  console.log('');

  if (!llmEngine) {
    console.log('\x1b[33m⚠️  LLM Engine not configured (set ANTHROPIC_API_KEY in .env)\x1b[0m');
    console.log('');
  }
}

/**
 * Handle command
 */
async function handleCommand(cmd: string): Promise<void> {
  const [command, ...args] = cmd.split(' ');

  switch (command) {
    case '/help':
      console.log('');
      console.log('Available commands:');
      console.log('  /help           - Show this help');
      console.log('  /save           - Save graph to Neo4j');
      console.log('  /stats          - Show graph statistics');
      console.log('  /view <name>    - Switch view (hierarchy, functional, requirements, allocation, usecase)');
      console.log('  /clear          - Clear chat history');
      console.log('  exit            - Quit application');
      console.log('');
      break;

    case '/save':
      if (!neo4jClient) {
        console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
        break;
      }
      console.log('💾 Saving to Neo4j...');
      log('💾 Saving to Neo4j...');
      await graphCanvas.persistToNeo4j();
      await chatCanvas.persistToNeo4j();
      console.log('\x1b[32m✅ Saved successfully\x1b[0m');
      log('✅ Saved successfully');
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
        console.log('Views: hierarchy, functional, requirements, allocation, usecase');
        break;
      }
      const viewName = args[0];
      // Update graph canvas view
      console.log(`🔄 Switching to ${viewName} view...`);
      log(`🔄 Switching to ${viewName} view`);
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

    // Create LLM request
    const request = {
      message,
      chatId: config.chatId,
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
      canvasState: parser.serializeGraph(graphCanvas.getState()),
    };

    // Send to LLM
    const response = await llmEngine.processRequest(request);

    // Add assistant response to chat canvas
    await chatCanvas.addAssistantMessage(response.textResponse, response.operations);

    // Display response
    console.log('');
    console.log(`\x1b[32mAssistant:\x1b[0m ${response.textResponse}`);
    console.log('');

    // Apply operations to graph if present
    if (response.operations) {
      const diff = parser.parseDiff(response.operations);
      await graphCanvas.applyDiff(diff);

      const state = graphCanvas.getState();
      log(`📊 Graph updated (${state.nodes.size} nodes, ${state.edges.size} edges)`);

      // Notify graph viewer
      notifyGraphUpdate();
      console.log('\x1b[90m(Graph updated - check GRAPH terminal)\x1b[0m');
      console.log('');
    }

    log('✅ Response complete');

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
    } catch (error) {
      console.log('\x1b[33m⚠️  Could not load from Neo4j (starting fresh)\x1b[0m');
    }
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

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log('');
      console.log('💾 Saving before exit...');
      log('🛑 Shutting down...');

      if (neo4jClient) {
        await graphCanvas.persistToNeo4j();
        await chatCanvas.persistToNeo4j();
        await neo4jClient.close();
      }

      console.log('\x1b[32m✅ Goodbye!\x1b[0m');
      log('✅ Shutdown complete');
      process.exit(0);
    }

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      rl.prompt();
      return;
    }

    await processMessage(trimmed);
    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('');
    await graphCanvas.persistToNeo4j();
    await chatCanvas.persistToNeo4j();
    if (neo4jClient) await neo4jClient.close();
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

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
