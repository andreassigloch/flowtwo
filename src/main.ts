/**
 * GraphEngine - Startup Orchestrator
 *
 * Central orchestration for multi-terminal GraphEngine setup:
 * 1. Validates configuration
 * 2. Starts WebSocket server
 * 3. Loads last session from Neo4j
 * 4. Sends initial broadcast to all connected clients
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import { validateConfig, WS_PORT } from './shared/config.js';
import { CanvasWebSocketServer } from './canvas/websocket-server.js';
import { Neo4jClient } from './neo4j-client/neo4j-client.js';
import type { BroadcastUpdate } from './canvas/websocket-server.js';

// Configuration
const config = {
  workspaceId: process.env.WORKSPACE_ID || 'demo-workspace',
  systemId: process.env.SYSTEM_ID || '',
  userId: process.env.USER_ID || 'andreas@siglochconsulting',
};

let wsServer: CanvasWebSocketServer | null = null;
let neo4jClient: Neo4jClient | null = null;

/**
 * Load last session from Neo4j
 * Returns systemId of last active session or creates new one
 */
async function loadLastSession(): Promise<{ systemId: string; nodes: any[]; edges: any[] }> {
  if (!neo4jClient) {
    console.log('⚠️  Neo4j not configured - starting with empty session');
    return { systemId: 'new-system', nodes: [], edges: [] };
  }

  try {
    // Query for last modified system
    const result = await neo4jClient.query<{ systemId: string }>(`
      MATCH (n:Node {type: 'SYS'})
      RETURN n.semanticId as systemId
      ORDER BY n.updatedAt DESC
      LIMIT 1
    `);

    if (result.length === 0) {
      console.log('📭 No existing systems found - starting fresh');
      return { systemId: 'new-system', nodes: [], edges: [] };
    }

    const systemId = result[0].systemId;
    console.log(`📂 Found last session: ${systemId}`);

    // Load graph data
    const { nodes, edges } = await neo4jClient.loadGraph({
      workspaceId: config.workspaceId,
      systemId,
    });

    console.log(`✅ Loaded ${nodes.length} nodes, ${edges.length} edges`);
    return { systemId, nodes, edges };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to load last session: ${errorMsg}`);
    return { systemId: 'new-system', nodes: [], edges: [] };
  }
}

/**
 * Send initial broadcast to all connected clients
 */
function sendInitialBroadcast(systemId: string, nodes: any[], edges: any[]): void {
  if (!wsServer) {
    console.error('❌ WebSocket server not initialized');
    return;
  }

  // Serialize state
  const stateData = {
    nodes: nodes.map(n => [n.semanticId, n]),
    edges: edges.map(e => [`${e.sourceId}-${e.type}-${e.targetId}`, e]),
    ports: [],
    currentView: 'hierarchy',
    timestamp: Date.now(),
  };

  const update: BroadcastUpdate = {
    type: 'graph_update',
    diff: JSON.stringify(stateData),
    workspaceId: config.workspaceId,
    systemId,
    source: {
      userId: config.userId,
      sessionId: 'orchestrator',
      origin: 'system',
    },
    timestamp: new Date(),
  };

  // Use the server's broadcast method to send to all clients
  wsServer.broadcast(update, config.workspaceId, systemId);
  console.log(`📡 Initial broadcast sent for ${systemId}`);
}

/**
 * Main application entry point
 * Orchestrates startup sequence
 */
export async function main(): Promise<void> {
  console.log('🚀 GraphEngine v2.0.0 - Startup Orchestrator');
  console.log('');

  // Step 1: Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    console.error('❌ Configuration errors:');
    configValidation.errors.forEach(error => {
      console.error(`   • ${error}`);
    });
    console.error('');
    console.error('Please check your .env file or environment variables.');
    process.exit(1);
  }
  console.log('✅ Configuration valid');

  // Step 2: Initialize Neo4j (optional)
  if (process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD) {
    try {
      neo4jClient = new Neo4jClient({
        uri: process.env.NEO4J_URI,
        user: process.env.NEO4J_USER,
        password: process.env.NEO4J_PASSWORD,
      });
      console.log('✅ Neo4j client initialized');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Neo4j initialization failed: ${errorMsg}`);
    }
  } else {
    console.log('⚠️  Neo4j not configured (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)');
  }

  // Step 3: Start WebSocket server
  try {
    wsServer = new CanvasWebSocketServer(WS_PORT);
    console.log(`✅ WebSocket server started on port ${WS_PORT}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to start WebSocket server: ${errorMsg}`);
    process.exit(1);
  }

  // Step 4: Load last session
  const { systemId, nodes, edges } = await loadLastSession();
  config.systemId = systemId;

  // Step 5: Cache initial state for new clients
  // The broadcast will be cached by the server and sent to new subscribers
  if (nodes.length > 0) {
    sendInitialBroadcast(systemId, nodes, edges);
  }

  // Print instructions
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GraphEngine is ready. Start the terminals:');
  console.log('');
  console.log('  Terminal 2: tsx src/terminal-ui/graph-viewer.ts');
  console.log('  Terminal 3: tsx src/terminal-ui/chat-interface.ts');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`📊 Active system: ${systemId}`);
  console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
  console.log('');
  console.log('Press Ctrl+C to shutdown');

  // Keep process running
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');

    // Broadcast shutdown to all clients
    if (wsServer) {
      const shutdownUpdate: BroadcastUpdate = {
        type: 'shutdown',
        timestamp: new Date(),
      };
      wsServer.broadcast(shutdownUpdate, config.workspaceId, config.systemId);
      await wsServer.close();
    }

    if (neo4jClient) {
      await neo4jClient.close();
    }

    console.log('👋 Goodbye!');
    process.exit(0);
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}
