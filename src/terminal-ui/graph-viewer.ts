/**
 * GraphEngine - Graph Viewer (Terminal 2)
 *
 * Watches for graph updates and re-renders ASCII visualization
 * - Monitors FIFO for update notifications
 * - Displays graph in current view
 * - Accepts commands to switch views
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as readline from 'readline';
import { GraphCanvas } from '../canvas/graph-canvas.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import { GraphEngine } from '../graph-engine/graph-engine.js';
import { CanvasWebSocketClient } from '../canvas/websocket-client.js';
import type { BroadcastUpdate } from '../canvas/websocket-server.js';
import type { ViewType } from '../shared/types/view.js';
import { DEFAULT_VIEW_CONFIGS } from '../shared/types/view.js';
import { WS_URL, LOG_PATH } from '../shared/config.js';

// Configuration
const config = {
  workspaceId: process.env.WORKSPACE_ID || 'demo-workspace',
  systemId: process.env.SYSTEM_ID || 'UrbanMobility.SY.001',
  chatId: process.env.CHAT_ID || 'demo-chat-001',
  userId: process.env.USER_ID || 'andreas@siglochconsulting',
};

// Initialize components
let graphCanvas: GraphCanvas;
let neo4jClient: Neo4jClient | undefined;
let graphEngine: GraphEngine;
let currentView: ViewType = 'hierarchy';
let wsClient: CanvasWebSocketClient;

// Initialize Neo4j (optional)
if (process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD) {
  neo4jClient = new Neo4jClient({
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  });
}

// Initialize canvas
graphCanvas = new GraphCanvas(
  config.workspaceId,
  config.systemId,
  config.chatId,
  config.userId,
  currentView,
  neo4jClient
);

graphEngine = new GraphEngine();

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

/**
 * Get node type color for terminal display
 */
function getNodeColor(nodeType: string): string {
  const colors: Record<string, string> = {
    SYS: '\x1b[1;35m',    // bold magenta
    UC: '\x1b[1;33m',     // bold yellow
    FCHAIN: '\x1b[33m',   // yellow
    FUNC: '\x1b[32m',     // green
    REQ: '\x1b[31m',      // red
    FLOW: '\x1b[34m',     // blue
    MOD: '\x1b[35m',      // magenta
    ACTOR: '\x1b[36m',    // cyan
    TEST: '\x1b[31m',     // red
    SCHEMA: '\x1b[90m',   // gray
  };
  return colors[nodeType] || '\x1b[36m'; // default cyan
}

/**
 * Generate ASCII graph visualization
 * Uses view configuration from DEFAULT_VIEW_CONFIGS
 */
function generateAsciiGraph(): string {
  const state = graphCanvas.getState();
  const lines: string[] = [];

  if (state.nodes.size === 0) {
    return '\x1b[90m(No nodes in graph yet - send a message in CHAT terminal)\x1b[0m';
  }

  // Get view configuration
  const viewConfig = DEFAULT_VIEW_CONFIGS[currentView];
  if (!viewConfig) {
    return `\x1b[33m❌ Unknown view: ${currentView}\x1b[0m`;
  }

  // Header
  lines.push(`\x1b[1;36mGraph:\x1b[0m ${config.systemId}`);
  lines.push(`\x1b[1;36mView:\x1b[0m ${viewConfig.name}`);
  lines.push(`\x1b[1;36mNodes:\x1b[0m ${state.nodes.size} | \x1b[1;36mEdges:\x1b[0m ${state.edges.size}`);
  lines.push('');

  // Render based on view type
  switch (currentView) {
    case 'hierarchy':
      lines.push(...renderHierarchyView(state, viewConfig));
      break;
    case 'allocation':
      lines.push(...renderAllocationView(state, viewConfig));
      break;
    case 'requirements':
      lines.push(...renderRequirementsView(state, viewConfig));
      break;
    case 'use-case':
      lines.push(...renderUseCaseView(state, viewConfig));
      break;
    case 'functional-flow':
      lines.push('\x1b[33m⚠️  Functional-flow view not yet implemented in ASCII\x1b[0m');
      lines.push('\x1b[90m(This view requires graphical rendering - use Web-UI)\x1b[0m');
      break;
    default:
      lines.push(`\x1b[33m⚠️  View "${currentView}" not implemented in ASCII renderer\x1b[0m`);
  }

  return lines.join('\n');
}

/**
 * Render hierarchy view (tree using compose edges)
 */
function renderHierarchyView(state: any, viewConfig: any): string[] {
  const lines: string[] = [];
  const visited = new Set<string>();
  const { includeNodeTypes, includeEdgeTypes } = viewConfig.layoutConfig;

  function renderNode(nodeId: string, indent: string = '', isLast: boolean = true): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = state.nodes.get(nodeId);
    if (!node || !includeNodeTypes.includes(node.type)) return;

    const prefix = isLast ? '└─' : '├─';
    const color = getNodeColor(node.type);
    lines.push(`${indent}${prefix}[${color}${node.type}\x1b[0m] ${node.name}`);

    // Get child edges (compose edges from this node)
    const childEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && includeEdgeTypes.includes(e.type)
    );
    const childIndent = indent + (isLast ? '  ' : '│ ');

    childEdges.forEach((edge: any, idx: number) => {
      const childIsLast = idx === childEdges.length - 1;
      renderNode(edge.targetId, childIndent, childIsLast);
    });
  }

  // Find root nodes (nodes with no incoming edges of specified types)
  const rootNodes = Array.from(state.nodes.values()).filter((node: any) => {
    if (!includeNodeTypes.includes(node.type)) return false;
    const hasIncoming = Array.from(state.edges.values()).some(
      (e: any) => e.targetId === node.semanticId && includeEdgeTypes.includes(e.type)
    );
    return !hasIncoming;
  });

  if (rootNodes.length > 0) {
    rootNodes.forEach((root: any) => renderNode(root.semanticId));
  } else {
    lines.push('\x1b[90m(No root nodes found for hierarchy view)\x1b[0m');
  }

  return lines;
}

/**
 * Render allocation view (modules containing functions)
 */
function renderAllocationView(state: any, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeNodeTypes } = viewConfig.layoutConfig;

  // Find all MOD nodes
  const modules = Array.from(state.nodes.values()).filter(
    (n: any) => n.type === 'MOD'
  );

  if (modules.length === 0) {
    lines.push('\x1b[90m(No modules found)\x1b[0m');
    return lines;
  }

  modules.forEach((mod: any, modIdx: number) => {
    // Find functions allocated to this module
    const allocatedFuncs = Array.from(state.edges.values())
      .filter((e: any) => e.sourceId === mod.semanticId && e.type === 'allocate')
      .map((e: any) => state.nodes.get(e.targetId))
      .filter((n: any) => n && n.type === 'FUNC');

    // Draw module box
    const modColor = getNodeColor('MOD');
    const boxWidth = Math.max(40, mod.name.length + 10);
    const topLine = '┌─ ' + `[${modColor}MOD\x1b[0m] ${mod.name}` + ' ' + '─'.repeat(boxWidth - mod.name.length - 10) + '┐';
    lines.push(topLine);

    if (allocatedFuncs.length === 0) {
      lines.push('│ \x1b[90m(no functions allocated)\x1b[0m' + ' '.repeat(boxWidth - 24) + '│');
    } else {
      allocatedFuncs.forEach((func: any, funcIdx: number) => {
        const funcColor = getNodeColor('FUNC');
        const isLast = funcIdx === allocatedFuncs.length - 1;
        const prefix = isLast ? '└─' : '├─';
        lines.push(`│ ${prefix}[${funcColor}FUNC\x1b[0m] ${func.name}` + ' '.repeat(Math.max(0, boxWidth - func.name.length - 12)) + '│');
      });
    }

    lines.push('└' + '─'.repeat(boxWidth) + '┘');

    if (modIdx < modules.length - 1) {
      lines.push(''); // Spacing between modules
    }
  });

  return lines;
}

/**
 * Render requirements view (tree using satisfy edges)
 */
function renderRequirementsView(state: any, viewConfig: any): string[] {
  const lines: string[] = [];
  const visited = new Set<string>();
  const { includeNodeTypes } = viewConfig.layoutConfig;

  function renderNode(nodeId: string, indent: string = '', isLast: boolean = true): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = state.nodes.get(nodeId);
    if (!node || !includeNodeTypes.includes(node.type)) return;

    const prefix = isLast ? '└─' : '├─';
    const color = getNodeColor(node.type);
    lines.push(`${indent}${prefix}[${color}${node.type}\x1b[0m] ${node.name}`);

    // Get satisfy edges (REQ children)
    const satisfyEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && e.type === 'satisfy'
    );

    // Get verify edges (TEST nodes)
    const verifyEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && e.type === 'verify'
    );

    const childIndent = indent + (isLast ? '  ' : '│ ');

    // Render requirements first
    satisfyEdges.forEach((edge: any, idx: number) => {
      const childIsLast = idx === satisfyEdges.length - 1 && verifyEdges.length === 0;
      renderNode(edge.targetId, childIndent, childIsLast);
    });

    // Render tests with verify annotation
    verifyEdges.forEach((edge: any, idx: number) => {
      const test = state.nodes.get(edge.targetId);
      if (test) {
        const childIsLast = idx === verifyEdges.length - 1;
        const testPrefix = childIsLast ? '└─' : '├─';
        const testColor = getNodeColor('TEST');
        lines.push(`${childIndent}${testPrefix}[${testColor}TEST\x1b[0m] ${test.name} \x1b[90m(verifies)\x1b[0m`);
      }
    });
  }

  // Find root nodes (FUNC or REQ with no incoming satisfy edges)
  const rootNodes = Array.from(state.nodes.values()).filter((node: any) => {
    if (!['FUNC', 'REQ'].includes(node.type)) return false;
    const hasIncoming = Array.from(state.edges.values()).some(
      (e: any) => e.targetId === node.semanticId && e.type === 'satisfy'
    );
    return !hasIncoming;
  });

  if (rootNodes.length > 0) {
    rootNodes.forEach((root: any) => renderNode(root.semanticId));
  } else {
    lines.push('\x1b[90m(No root requirements found)\x1b[0m');
  }

  return lines;
}

/**
 * Render use-case view (UC with parent, actors, requirements)
 */
function renderUseCaseView(state: any, viewConfig: any): string[] {
  const lines: string[] = [];

  // Find all UC nodes
  const useCases = Array.from(state.nodes.values()).filter(
    (n: any) => n.type === 'UC'
  );

  if (useCases.length === 0) {
    lines.push('\x1b[90m(No use cases found)\x1b[0m');
    return lines;
  }

  useCases.forEach((uc: any, ucIdx: number) => {
    const ucColor = getNodeColor('UC');
    lines.push(`[${ucColor}UC\x1b[0m] ${uc.name}`);

    // Find parent (incoming compose edge from SYS or UC)
    const parentEdge = Array.from(state.edges.values()).find(
      (e: any) => e.targetId === uc.semanticId && e.type === 'compose' &&
                  ['SYS', 'UC'].includes(state.nodes.get(e.sourceId)?.type)
    );
    if (parentEdge) {
      const parent = state.nodes.get(parentEdge.sourceId);
      if (parent) {
        const parentColor = getNodeColor(parent.type);
        lines.push(`  ↑ Parent: [${parentColor}${parent.type}\x1b[0m] ${parent.name}`);
      }
    }

    // Find actors (outgoing compose edges to ACTOR)
    const actorEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === uc.semanticId && e.type === 'compose' &&
                  state.nodes.get(e.targetId)?.type === 'ACTOR'
    );
    if (actorEdges.length > 0) {
      lines.push('  Actors:');
      actorEdges.forEach((edge: any) => {
        const actor = state.nodes.get(edge.targetId);
        if (actor) {
          const actorColor = getNodeColor('ACTOR');
          lines.push(`    - [${actorColor}ACTOR\x1b[0m] ${actor.name}`);
        }
      });
    }

    // Find requirements (outgoing satisfy edges to REQ)
    const reqEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === uc.semanticId && e.type === 'satisfy' &&
                  state.nodes.get(e.targetId)?.type === 'REQ'
    );
    if (reqEdges.length > 0) {
      lines.push('  Requirements:');
      reqEdges.forEach((edge: any) => {
        const req = state.nodes.get(edge.targetId);
        if (req) {
          const reqColor = getNodeColor('REQ');
          lines.push(`    - [${reqColor}REQ\x1b[0m] ${req.name}`);
        }
      });
    }

    if (ucIdx < useCases.length - 1) {
      lines.push(''); // Spacing between use cases
    }
  });

  return lines;
}

/**
 * Render graph to console
 */
function render(): void {
  // Don't clear on updates - allows scrolling through history
  // Only clear on initial render
  const state = graphCanvas.getState();

  console.log('');
  console.log('\x1b[36m' + '─'.repeat(60) + '\x1b[0m');
  console.log(`\x1b[1;36mGraph Update:\x1b[0m ${new Date().toLocaleTimeString()}`);
  console.log(`\x1b[36mView:\x1b[0m ${currentView} | \x1b[36mNodes:\x1b[0m ${state.nodes.size} | \x1b[36mEdges:\x1b[0m ${state.edges.size}`);
  console.log('\x1b[36m' + '─'.repeat(60) + '\x1b[0m');
  console.log('');

  const ascii = generateAsciiGraph();
  console.log(ascii);

  console.log('');
  console.log('\x1b[90m(Scroll up to see previous versions | Cmd+K to clear | Ctrl+C to exit)\x1b[0m');
  console.log('');
}

/**
 * Handle graph update from WebSocket
 * Uses same format as file-based polling (JSON serialized state)
 */
async function handleGraphUpdate(update: BroadcastUpdate): Promise<void> {
  if (update.type !== 'graph_update') {
    return;
  }

  try {
    log('📡 Received graph update via WebSocket');

    // Parse JSON state (same format as file-based polling)
    const stateData = JSON.parse(update.diff);

    // Load new state
    const nodesMap = new Map(stateData.nodes);
    const edgesMap = new Map(stateData.edges);
    const portsMap = new Map(stateData.ports || []);

    await graphCanvas.loadGraph({
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      nodes: nodesMap,
      edges: edgesMap,
      ports: portsMap,
      version: 1,
      lastSavedVersion: 1,
      lastModified: new Date(),
    });

    // Update current view if changed
    if (stateData.currentView) {
      currentView = stateData.currentView;
    }

    // Re-render
    render();
    log(`✅ Rendered ${nodesMap.size} nodes, ${edgesMap.size} edges`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`❌ Error processing graph update: ${errorMsg}`);
    console.error(`\x1b[31m❌ Error processing graph update: ${errorMsg}\x1b[0m`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Initial header (only once)
  console.clear();
  console.log('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║     TERMINAL 2: GRAPH VIEWER         ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('\x1b[90mGraph updates will appear below (scroll to see history)\x1b[0m');
  console.log('');

  log('📊 Graph viewer started');

  // Load graph from Neo4j if available
  if (neo4jClient) {
    try {
      const { nodes, edges } = await neo4jClient.loadGraph({
        workspaceId: config.workspaceId,
        systemId: config.systemId,
      });

      if (nodes.length > 0) {
        log(`📥 Loaded ${nodes.length} nodes from Neo4j`);

        const nodesMap = new Map(nodes.map((n) => [n.semanticId, n]));
        const edgesMap = new Map(edges.map((e) => [e.semanticId, e]));

        await graphCanvas.loadGraph({
          nodes: nodesMap,
          edges: edgesMap,
          ports: new Map(),
        });
      }
    } catch (error) {
      // Ignore load errors, start fresh
    }
  }

  // Initial render
  render();

  // Connect to WebSocket server
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
    console.log('\x1b[32m✅ Connected to WebSocket server\x1b[0m');
    console.log('');
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
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('');
  log('🛑 Graph viewer shutting down');
  if (wsClient) wsClient.disconnect();
  if (neo4jClient) await neo4jClient.close();
  process.exit(0);
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
