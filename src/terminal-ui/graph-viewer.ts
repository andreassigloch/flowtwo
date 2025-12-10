/**
 * GraphEngine - Graph Viewer (Terminal 2)
 *
 * Watches for graph updates and re-renders ASCII visualization
 * - Monitors WebSocket for update notifications
 * - Displays graph in current view
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import * as fs from 'fs';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import { CanvasWebSocketClient } from '../canvas/websocket-client.js';
import type { BroadcastUpdate } from '../canvas/websocket-server.js';
import type { ViewType } from '../shared/types/view.js';
import { WS_URL, LOG_PATH } from '../shared/config.js';
import { initNeo4jClient, resolveSession } from '../shared/session-resolver.js';
import type { ChangeStatus } from '../llm-engine/agentdb/change-tracker.js';
import type { Node, Edge } from '../shared/types/ontology.js';
import { generateAsciiGraph } from './views/index.js';

// Configuration - will be set by resolveSession() in main()
const config = {
  workspaceId: '',
  systemId: '',
  chatId: '',
  userId: '',
};

// Components - initialized in main() after session resolution
let neo4jClient: Neo4jClient;
let currentView: ViewType = 'hierarchy';
let wsClient: CanvasWebSocketClient;
let lastProcessedTimestamp: string | null = null;

/**
 * CR-039: Local render buffer for graph viewer
 * Fed by WebSocket broadcasts from chat-interface (single source of truth)
 * NO AgentDB instance - pure display component
 */
interface RenderBuffer {
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  nodeChangeStatus?: Map<string, ChangeStatus>;
}

const renderBuffer: RenderBuffer = {
  nodes: new Map(),
  edges: new Map(),
  nodeChangeStatus: undefined,
};

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

/**
 * Render graph to console from local render buffer
 * CR-039: Uses render buffer fed by WebSocket (no AgentDB)
 * CR-033: Change tracking indicators from broadcast metadata
 */
async function render(): Promise<void> {
  // CR-039: Read from local render buffer (fed by WebSocket)
  const stateWithChanges = {
    nodes: renderBuffer.nodes,
    edges: renderBuffer.edges,
    currentView,
    nodeChangeStatus: renderBuffer.nodeChangeStatus,
  };

  console.log('');
  console.log('\x1b[36m' + '\u2500'.repeat(60) + '\x1b[0m');
  console.log(`\x1b[1;36mGraph Update:\x1b[0m ${new Date().toLocaleTimeString()}`);
  console.log(`\x1b[36mView:\x1b[0m ${currentView} | \x1b[36mNodes:\x1b[0m ${renderBuffer.nodes.size} | \x1b[36mEdges:\x1b[0m ${renderBuffer.edges.size}`);
  console.log('\x1b[36m' + '\u2500'.repeat(60) + '\x1b[0m');
  console.log('');

  const ascii = await generateAsciiGraph(stateWithChanges, currentView, config.systemId);
  console.log(ascii);

  console.log('');
  console.log('\x1b[90m(Scroll up to see previous versions | Cmd+K to clear | Ctrl+C to exit)\x1b[0m');
  console.log('');
}

/**
 * Handle graph update from WebSocket
 * CR-039: Updates local render buffer (no AgentDB)
 */
async function handleGraphUpdate(update: BroadcastUpdate): Promise<void> {
  // Handle shutdown signal
  if (update.type === 'shutdown') {
    log('\ud83d\uded1 Received shutdown signal');
    console.log('');
    console.log('\x1b[33m\ud83d\uded1 Shutting down...\x1b[0m');
    if (wsClient) {
      wsClient.disconnect();
    }
    process.exit(0);
  }

  if (update.type !== 'graph_update') {
    return;
  }

  // Deduplication: skip if we already processed this exact update
  const updateTimestamp = String(update.timestamp);
  if (lastProcessedTimestamp === updateTimestamp) {
    return;
  }
  lastProcessedTimestamp = updateTimestamp;

  try {
    // Update systemId from broadcast if provided (initial state sync)
    if (update.systemId && update.systemId !== config.systemId) {
      const oldSystemId = config.systemId;
      config.systemId = update.systemId;
      log(`\ud83d\udd04 Switched to system: ${update.systemId} (was: ${oldSystemId || 'none'})`);
      console.log(`\x1b[33m\ud83d\udd04 System: ${update.systemId}\x1b[0m`);

      // Update subscription to new system
      if (wsClient) {
        wsClient.updateSubscription(update.systemId);
      }
    }

    // Parse JSON state from WebSocket broadcast
    const stateData = JSON.parse(update.diff || '{}');

    // CR-039: Update local render buffer (NO AgentDB)
    const nodes = (stateData.nodes || []).map(([_, n]: [string, Node]) => n);
    const edges = (stateData.edges || []).map(([_, e]: [string, Edge]) => e);

    // Clear and rebuild render buffer
    renderBuffer.nodes.clear();
    renderBuffer.edges.clear();
    for (const node of nodes) {
      renderBuffer.nodes.set(node.semanticId, node);
    }
    for (const edge of edges) {
      renderBuffer.edges.set(edge.uuid, edge);
    }

    // CR-039 Fix 4: Parse nodeChangeStatus from broadcast metadata
    if (stateData.nodeChangeStatus) {
      renderBuffer.nodeChangeStatus = new Map(
        Object.entries(stateData.nodeChangeStatus) as [string, ChangeStatus][]
      );
    } else {
      renderBuffer.nodeChangeStatus = undefined;
    }

    // Update current view if changed
    if (stateData.currentView) {
      currentView = stateData.currentView;
    }

    // Re-render from local buffer
    await render();
    log(`\u2705 Rendered ${nodes.length} nodes, ${edges.length} edges`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`\u274c Error processing graph update: ${errorMsg}`);
    console.error(`\x1b[31m\u274c Error processing graph update: ${errorMsg}\x1b[0m`);
  }
}

/**
 * Main entry point
 * CR-039: Simplified - no AgentDB, pure display component
 */
async function main(): Promise<void> {
  // Initial header (only once)
  console.clear();
  console.log('\x1b[36m\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\x1b[0m');
  console.log('\x1b[36m\u2551     TERMINAL 2: GRAPH VIEWER         \u2551\x1b[0m');
  console.log('\x1b[36m\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\x1b[0m');
  console.log('');

  log('\ud83d\udcca Graph viewer started (CR-039: pure display mode)');

  // STEP 1: Session Resolution (for WebSocket subscription)
  neo4jClient = initNeo4jClient();

  const resolved = await resolveSession(neo4jClient);
  config.workspaceId = resolved.workspaceId;
  config.systemId = resolved.systemId;
  config.userId = resolved.userId;
  config.chatId = resolved.chatId;

  console.log(`\x1b[90m\u2713 Session: ${resolved.systemId} (${resolved.source})\x1b[0m`);
  log(`\ud83d\udccb Session: ${resolved.systemId} (source: ${resolved.source})`);

  // CR-039: NO AgentDB initialization - graph viewer is pure display
  // Data comes via WebSocket from chat-interface (single source of truth)

  console.log('\x1b[90mGraph updates will appear below (scroll to see history)\x1b[0m');
  console.log('');

  // STEP 4: WebSocket Connection
  wsClient = new CanvasWebSocketClient(
    process.env.WS_URL || WS_URL,
    {
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
    },
    handleGraphUpdate
  );

  try {
    await wsClient.connect();
    console.log('\x1b[32m\u2705 Connected to WebSocket server\x1b[0m');
    console.log('');
    log('\u2705 WebSocket connected');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const wsUrl = process.env.WS_URL || WS_URL;
    console.error('');
    console.error('\x1b[31m\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\x1b[0m');
    console.error('\x1b[31m\u2551  ERROR: WebSocket Connection Failed  \u2551\x1b[0m');
    console.error('\x1b[31m\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\x1b[0m');
    console.error('');
    console.error(`\x1b[31mCould not connect to WebSocket server at ${wsUrl}\x1b[0m`);
    console.error(`\x1b[31mError: ${errorMsg}\x1b[0m`);
    console.error('');
    console.error('\x1b[33mPlease ensure the WebSocket server is running:\x1b[0m');
    console.error('\x1b[33m  npm run websocket-server\x1b[0m');
    console.error('');
    log(`\u274c WebSocket connection failed: ${errorMsg}`);
    process.exit(1);
  }

  console.log('\x1b[90mWaiting for graph updates from chat interface...\x1b[0m');
  console.log('');
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('');
  log('\ud83d\uded1 Graph viewer shutting down');
  if (wsClient) wsClient.disconnect();
  if (neo4jClient) await neo4jClient.close();
  process.exit(0);
});

// Crash handlers - log errors to STDOUT file
process.on('uncaughtException', async (error: Error) => {
  const errorMsg = `\ud83d\udca5 CRASH (uncaughtException): ${error.message}`;
  console.error(errorMsg);
  log(errorMsg);
  if (error.stack) {
    log(error.stack);
  }
  if (wsClient) wsClient.disconnect();
  if (neo4jClient) await neo4jClient.close();
  process.exit(1);
});

process.on('unhandledRejection', async (reason: unknown) => {
  const errorMsg = `\ud83d\udca5 CRASH (unhandledRejection): ${reason}`;
  console.error(errorMsg);
  log(errorMsg);
  if (reason instanceof Error && reason.stack) {
    log(reason.stack);
  }
  if (wsClient) wsClient.disconnect();
  if (neo4jClient) await neo4jClient.close();
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  log(`\ud83d\udca5 FATAL: ${error.message}`);
  if (error.stack) {
    log(error.stack);
  }
  process.exit(1);
});
