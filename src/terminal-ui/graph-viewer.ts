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
let neo4jClient: Neo4jClient | undefined;
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
const graphCanvas = new GraphCanvas(
  config.workspaceId,
  config.systemId,
  config.chatId,
  config.userId,
  currentView,
  neo4jClient
);

const _graphEngine = new GraphEngine();

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
    case 'spec':
      lines.push(...renderSpecView(state, viewConfig));
      break;
    case 'architecture':
      lines.push(...renderArchitectureView(state, viewConfig));
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
function renderAllocationView(state: any, _viewConfig: any): string[] {
  const lines: string[] = [];

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
 * Render spec view (complete specification with multiple occurrences)
 */
function renderSpecView(state: any, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeEdgeTypes } = viewConfig.layoutConfig;
  const nestingEdgeTypes = includeEdgeTypes.filter((t: string) =>
    ['compose', 'satisfy', 'allocate'].includes(t)
  );

  // Build occurrence map
  const occurrenceMap = buildOccurrenceMap(state, nestingEdgeTypes);

  if (occurrenceMap.byNode.size === 0) {
    lines.push('\x1b[90m(No nodes found)\x1b[0m');
    return lines;
  }

  // Find root occurrences (depth 0)
  const rootOccurrences: any[] = [];
  for (const occurrences of occurrenceMap.byNode.values()) {
    const root = occurrences.find((occ: any) => occ.depth === 0);
    if (root) {
      rootOccurrences.push(root);
    }
  }

  // Render each root recursively
  rootOccurrences.forEach((rootOcc) => {
    lines.push(...renderOccurrence(rootOcc, state, occurrenceMap, ''));
  });

  return lines;
}

/**
 * Build occurrence map for spec view (simplified version for terminal UI)
 */
function buildOccurrenceMap(state: any, nestingEdgeTypes: string[]): any {
  const occurrenceMap = {
    byNode: new Map(),
    byPath: new Map(),
  };

  // Find root nodes (no incoming nesting edges)
  const nodesWithIncoming = new Set<string>();
  for (const edge of state.edges.values()) {
    if (nestingEdgeTypes.includes(edge.type)) {
      nodesWithIncoming.add(edge.targetId);
    }
  }

  const roots: any[] = [];
  for (const node of state.nodes.values()) {
    if (!nodesWithIncoming.has(node.semanticId)) {
      roots.push(node);
    }
  }

  // BFS traversal
  const queue: any[] = roots.map((node) => ({
    nodeId: node.semanticId,
    path: node.name,
    depth: 0,
    parentPath: null,
    edgeType: null,
  }));

  const visitedPaths = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Prevent infinite loops
    if (visitedPaths.has(current.path)) {
      continue;
    }
    visitedPaths.add(current.path);

    // Record occurrence
    if (!occurrenceMap.byNode.has(current.nodeId)) {
      occurrenceMap.byNode.set(current.nodeId, []);
    }

    const occurrences = occurrenceMap.byNode.get(current.nodeId)!;
    const isPrimary = occurrences.length === 0;

    const occurrence = {
      nodeId: current.nodeId,
      path: current.path,
      isPrimary,
      depth: current.depth,
      parentPath: current.parentPath,
      nestingEdgeType: current.edgeType,
    };

    occurrences.push(occurrence);
    occurrenceMap.byPath.set(current.path, occurrence);

    // Only expand children for primary occurrence
    if (!isPrimary) {
      continue;
    }

    // Find children via nesting edge types
    for (const edgeType of nestingEdgeTypes) {
      const children = Array.from(state.edges.values())
        .filter((e: any) => e.sourceId === current.nodeId && e.type === edgeType)
        .map((e: any) => state.nodes.get(e.targetId))
        .filter((n: any) => n);

      for (const child of children) {
        const childPath = `${current.path}/${child.name}`;
        queue.push({
          nodeId: child.semanticId,
          path: childPath,
          depth: current.depth + 1,
          parentPath: current.path,
          edgeType,
        });
      }
    }
  }

  return occurrenceMap;
}

/**
 * Render single occurrence (primary or reference)
 */
function renderOccurrence(
  occurrence: any,
  state: any,
  occurrenceMap: any,
  indent: string
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);
  const allOccurrences = occurrenceMap.byNode.get(occurrence.nodeId) || [];

  if (occurrence.isPrimary) {
    // Render primary occurrence
    const usageCount = allOccurrences.length;
    const marker =
      usageCount > 1
        ? ` \x1b[90m[primary, used in ${usageCount} contexts]\x1b[0m`
        : ` \x1b[90m[primary]\x1b[0m`;

    lines.push(`${indent}[${color}${node.type}\x1b[0m] ${node.name}${marker}`);

    // Find and render children
    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const childIndent = indent + (isLast ? '  ' : '│ ');
      const prefix = isLast ? '└─' : '├─';

      const childLines = renderOccurrence(child, state, occurrenceMap, childIndent);
      if (childLines.length > 0) {
        childLines[0] = `${indent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    // Render reference occurrence
    const primary = allOccurrences.find((occ: any) => occ.isPrimary);
    const refPath = primary ? primary.path : '?';
    lines.push(
      `${indent}\x1b[90m→\x1b[0m [${color}${node.type}\x1b[0m] ${node.name} \x1b[90m[see ${refPath}]\x1b[0m`
    );
  }

  return lines;
}

/**
 * Find child occurrences of a given path
 */
function findChildOccurrences(parentPath: string, occurrenceMap: any): any[] {
  const children: any[] = [];

  for (const occurrence of occurrenceMap.byPath.values()) {
    if (occurrence.parentPath === parentPath) {
      children.push(occurrence);
    }
  }

  return children;
}

/**
 * Render use-case view (UC with parent, actors, requirements)
 */
function renderUseCaseView(state: any, _viewConfig: any): string[] {
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
 * Render architecture view (first-level logical blocks as boxes)
 *
 * Shows major system components as ASCII boxes with their direct children.
 * Similar to the logical architecture diagram with function blocks.
 */
function renderArchitectureView(state: any, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeNodeTypes, includeEdgeTypes } = viewConfig.layoutConfig;
  const maxDepth = viewConfig.layoutConfig.parameters?.maxDepth ?? 2;

  // Find root nodes (SYS or MOD with no incoming compose edges)
  const nodesWithIncoming = new Set<string>();
  for (const edge of state.edges.values()) {
    if (includeEdgeTypes.includes(edge.type)) {
      nodesWithIncoming.add(edge.targetId);
    }
  }

  const rootNodes = Array.from(state.nodes.values()).filter((node: any) => {
    if (!includeNodeTypes.includes(node.type)) return false;
    return !nodesWithIncoming.has(node.semanticId);
  });

  if (rootNodes.length === 0) {
    lines.push('\x1b[90m(No root nodes found for architecture view)\x1b[0m');
    return lines;
  }

  // Render each root as a major block
  rootNodes.forEach((root: any, rootIdx: number) => {
    lines.push(...renderArchitectureBlock(root, state, includeNodeTypes, includeEdgeTypes, 0, maxDepth));
    if (rootIdx < rootNodes.length - 1) {
      lines.push('');
    }
  });

  // Show io edges between blocks at the end
  const ioEdges = Array.from(state.edges.values()).filter(
    (e: any) => e.type === 'io' && viewConfig.renderConfig.showEdges.includes('io')
  );

  if (ioEdges.length > 0) {
    lines.push('');
    lines.push('\x1b[1;36mData Flows:\x1b[0m');
    ioEdges.forEach((edge: any) => {
      const source = state.nodes.get(edge.sourceId);
      const target = state.nodes.get(edge.targetId);
      if (source && target) {
        const sourceColor = getNodeColor(source.type);
        const targetColor = getNodeColor(target.type);
        lines.push(
          `  [${sourceColor}${source.type}\x1b[0m] ${source.name} ──▶ [${targetColor}${target.type}\x1b[0m] ${target.name}`
        );
      }
    });
  }

  return lines;
}

/**
 * Render a single architecture block (box with children)
 */
function renderArchitectureBlock(
  node: any,
  state: any,
  includeNodeTypes: string[],
  includeEdgeTypes: string[],
  depth: number,
  maxDepth: number
): string[] {
  const lines: string[] = [];
  const color = getNodeColor(node.type);
  const indent = '  '.repeat(depth);

  // Get direct children via compose edges
  const childEdges = Array.from(state.edges.values()).filter(
    (e: any) => e.sourceId === node.semanticId && includeEdgeTypes.includes(e.type)
  );

  const children = childEdges
    .map((e: any) => state.nodes.get(e.targetId))
    .filter((n: any) => n && includeNodeTypes.includes(n.type));

  // Calculate box width based on content
  const headerText = `[${node.type}] ${node.name}`;
  const childTexts = children.map((c: any) => `  [${c.type}] ${c.name}`);
  const maxContentWidth = Math.max(
    headerText.length,
    ...childTexts.map((t: string) => t.length),
    30
  );
  const boxWidth = maxContentWidth + 4;

  // Draw box header
  lines.push(`${indent}┌${'─'.repeat(boxWidth)}┐`);
  lines.push(`${indent}│ [${color}${node.type}\x1b[0m] ${node.name}${' '.repeat(Math.max(0, boxWidth - headerText.length - 2))}│`);

  if (children.length > 0 && depth < maxDepth - 1) {
    lines.push(`${indent}│${'─'.repeat(boxWidth)}│`);

    children.forEach((child: any, idx: number) => {
      const childColor = getNodeColor(child.type);
      const childText = `[${child.type}] ${child.name}`;
      const isLast = idx === children.length - 1;
      const prefix = isLast ? '└─' : '├─';

      lines.push(
        `${indent}│ ${prefix}[${childColor}${child.type}\x1b[0m] ${child.name}${' '.repeat(Math.max(0, boxWidth - childText.length - 5))}│`
      );
    });
  } else if (children.length > 0) {
    // At max depth, just show count
    lines.push(`${indent}│ \x1b[90m(${children.length} children)\x1b[0m${' '.repeat(Math.max(0, boxWidth - 15))}│`);
  }

  lines.push(`${indent}└${'─'.repeat(boxWidth)}┘`);

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
  // Handle shutdown signal
  if (update.type === 'shutdown') {
    log('🛑 Received shutdown signal');
    console.log('');
    console.log('\x1b[33m🛑 Shutting down...\x1b[0m');
    if (wsClient) {
      wsClient.disconnect();
    }
    process.exit(0);
  }

  if (update.type !== 'graph_update') {
    return;
  }

  try {
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
    } catch {
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

// Crash handlers - log errors to STDOUT file
process.on('uncaughtException', async (error: Error) => {
  const errorMsg = `💥 CRASH (uncaughtException): ${error.message}`;
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
  const errorMsg = `💥 CRASH (unhandledRejection): ${reason}`;
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
  log(`💥 FATAL: ${error.message}`);
  if (error.stack) {
    log(error.stack);
  }
  process.exit(1);
});
