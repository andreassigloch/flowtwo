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
import type { ViewType } from '../shared/types/view.js';

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
  fs.appendFileSync('/tmp/graphengine.log', logMsg + '\n');
}

/**
 * Generate ASCII graph visualization
 */
function generateAsciiGraph(): string {
  const state = graphCanvas.getState();
  const lines: string[] = [];

  if (state.nodes.size === 0) {
    return '\x1b[90m(No nodes in graph yet - send a message in CHAT terminal)\x1b[0m';
  }

  // Header
  lines.push(`\x1b[1;36mGraph:\x1b[0m ${config.systemId}`);
  lines.push(`\x1b[1;36mView:\x1b[0m ${currentView}`);
  lines.push(`\x1b[1;36mNodes:\x1b[0m ${state.nodes.size} | \x1b[1;36mEdges:\x1b[0m ${state.edges.size}`);
  lines.push('');

  // Build tree structure
  const visited = new Set<string>();

  function renderNode(nodeId: string, indent: string = '', isLast: boolean = true): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = state.nodes.get(nodeId);
    if (!node) return;

    // Node type color coding
    let typeColor = '\x1b[36m'; // cyan
    if (node.type === 'SYS') typeColor = '\x1b[1;35m'; // bold magenta
    if (node.type === 'UC') typeColor = '\x1b[1;33m'; // bold yellow
    if (node.type === 'FUNC') typeColor = '\x1b[32m'; // green
    if (node.type === 'REQ') typeColor = '\x1b[31m'; // red
    if (node.type === 'FLOW') typeColor = '\x1b[34m'; // blue

    const prefix = isLast ? '└─' : '├─';
    lines.push(`${indent}${prefix}[${typeColor}${node.type}\x1b[0m] ${node.name}`);

    // Get child nodes
    const outEdges = Array.from(state.edges.values()).filter((e) => e.sourceId === nodeId);
    const childIndent = indent + (isLast ? '  ' : '│ ');

    outEdges.forEach((edge, idx) => {
      const target = state.nodes.get(edge.targetId);
      if (target && !visited.has(edge.targetId)) {
        const childIsLast = idx === outEdges.length - 1;
        renderNode(edge.targetId, childIndent, childIsLast);
      }
    });
  }

  // Find root nodes (SYS nodes with no incoming edges)
  const rootNodes = Array.from(state.nodes.values()).filter((node) => {
    if (node.type !== 'SYS') return false;
    const hasIncoming = Array.from(state.edges.values()).some((e) => e.targetId === node.semanticId);
    return !hasIncoming;
  });

  // Render from roots
  if (rootNodes.length > 0) {
    rootNodes.forEach((root) => renderNode(root.semanticId));
  } else {
    // No roots found, render all nodes
    state.nodes.forEach((node) => {
      if (!visited.has(node.semanticId)) {
        renderNode(node.semanticId);
      }
    });
  }

  return lines.join('\n');
}

/**
 * Render graph to console
 */
function render(): void {
  console.clear();

  console.log('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║     TERMINAL 2: GRAPH VIEWER         ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m');
  console.log('');

  const ascii = generateAsciiGraph();
  console.log(ascii);

  console.log('');
  console.log('\x1b[90m(Watching for updates... Press Ctrl+C to exit)\x1b[0m');
}

/**
 * Watch for updates via shared state file (polling)
 */
async function watchForUpdates(): Promise<void> {
  let lastTimestamp = 0;

  setInterval(async () => {
    try {
      if (!fs.existsSync('/tmp/graphengine-state.json')) {
        return;
      }

      const stateData = JSON.parse(fs.readFileSync('/tmp/graphengine-state.json', 'utf8'));

      // Check if state changed
      if (stateData.timestamp <= lastTimestamp) {
        return;
      }

      lastTimestamp = stateData.timestamp;

      log('🔄 Graph state updated, reloading...');

      // Load new state
      const nodesMap = new Map(stateData.nodes);
      const edgesMap = new Map(stateData.edges);
      const portsMap = new Map(stateData.ports || []);

      await graphCanvas.loadGraph({
        nodes: nodesMap,
        edges: edgesMap,
        ports: portsMap,
      });

      // Update current view if changed
      if (stateData.currentView) {
        currentView = stateData.currentView;
      }

      // Re-render
      render();
      log(`✅ Rendered ${nodesMap.size} nodes, ${edgesMap.size} edges`);

    } catch (error) {
      // File doesn't exist yet or parse error, ignore
    }
  }, 500); // Poll every 500ms
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
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

  // Watch for updates
  watchForUpdates().catch((error) => {
    log(`❌ Watch error: ${error.message}`);
  });
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('');
  log('🛑 Graph viewer shutting down');
  if (neo4jClient) await neo4jClient.close();
  process.exit(0);
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
