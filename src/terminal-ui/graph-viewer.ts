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
import {
  detectTerminalCapabilities,
  renderMermaidAsImage,
} from './terminal-graphics.js';
import { initNeo4jClient, resolveSession } from '../shared/session-resolver.js';
// ASCII grid imports removed - architecture view now uses Mermaid

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
let graphCanvas: GraphCanvas;
let lastProcessedTimestamp: string | null = null; // Deduplication: track last processed update

// GraphEngine instance (used for layout computation)
void new GraphEngine(); // Suppress unused warning - kept for future use

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
async function generateAsciiGraph(): Promise<string> {
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
    case 'spec+':
      lines.push(...renderSpecPlusView(state, viewConfig));
      break;
    case 'architecture':
      lines.push(...await renderArchitectureView(state, viewConfig));
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

  function renderNode(
    nodeId: string,
    indent: string = '',
    isLast: boolean = true,
    isRoot: boolean = false
  ): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = state.nodes.get(nodeId);
    if (!node || !includeNodeTypes.includes(node.type)) return;

    const color = getNodeColor(node.type);

    if (isRoot) {
      // Root nodes: no prefix, just the node
      lines.push(`[${color}${node.type}\x1b[0m] ${node.name}`);
    } else {
      // Child nodes: with tree prefix
      const prefix = isLast ? '└─' : '├─';
      lines.push(`${indent}${prefix}[${color}${node.type}\x1b[0m] ${node.name}`);
    }

    // Get child edges (compose edges from this node)
    const childEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && includeEdgeTypes.includes(e.type)
    );
    const childIndent = isRoot ? '' : indent + (isLast ? '  ' : '│ ');

    childEdges.forEach((edge: any, idx: number) => {
      const childIsLast = idx === childEdges.length - 1;
      renderNode(edge.targetId, childIndent, childIsLast, false);
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
    rootNodes.forEach((root: any) => renderNode(root.semanticId, '', true, true));
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
    lines.push(...renderOccurrence(rootOcc, state, occurrenceMap, '', true));
  });

  return lines;
}

/**
 * Render spec+ view (specification with inline descriptions)
 */
function renderSpecPlusView(state: any, viewConfig: any): string[] {
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

  // Render each root recursively with descriptions
  rootOccurrences.forEach((rootOcc) => {
    lines.push(...renderOccurrenceWithDescription(rootOcc, state, occurrenceMap, '', true));
  });

  return lines;
}

/**
 * Render single occurrence with description (for spec+ view)
 */
function renderOccurrenceWithDescription(
  occurrence: any,
  state: any,
  occurrenceMap: any,
  indent: string,
  isRoot: boolean = false
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);

  if (occurrence.isPrimary) {
    // Render primary occurrence
    lines.push(`${indent}[${color}${node.type}\x1b[0m] ${node.name}`);

    // Add description as indented gray text (if exists and non-empty)
    if (node.descr && node.descr.trim()) {
      const descIndent = isRoot ? '  ' : indent + '  ';
      lines.push(`${descIndent}\x1b[90m${node.descr}\x1b[0m`);
    }

    // Find and render children
    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    const baseIndent = isRoot ? '' : indent;

    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const childIndent = baseIndent + (isLast ? '  ' : '│ ');

      const childLines = renderOccurrenceWithDescription(child, state, occurrenceMap, childIndent, false);
      if (childLines.length > 0) {
        // Replace first line's indent with proper prefix
        childLines[0] = `${baseIndent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    // Render reference occurrence - just arrow after name (no description for references)
    lines.push(
      `${indent}[${color}${node.type}\x1b[0m] ${node.name} \x1b[90m→\x1b[0m`
    );
  }

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
      let children = Array.from(state.edges.values())
        .filter((e: any) => e.sourceId === current.nodeId && e.type === edgeType)
        .map((e: any) => state.nodes.get(e.targetId))
        .filter((n: any) => n);

      // Sort children by flow order if parent is FCHAIN
      const parentNode = state.nodes.get(current.nodeId);
      if (parentNode?.type === 'FCHAIN' && children.length > 1) {
        children = sortByFlowOrder(children, state);
      }

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
  indent: string,
  isRoot: boolean = false
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);

  if (occurrence.isPrimary) {
    // Render primary occurrence - no marker (references get the → indicator)
    lines.push(`${indent}[${color}${node.type}\x1b[0m] ${node.name}`);

    // Find and render children
    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    const baseIndent = isRoot ? '' : indent;

    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const childIndent = baseIndent + (isLast ? '  ' : '│ ');

      const childLines = renderOccurrence(child, state, occurrenceMap, childIndent, false);
      if (childLines.length > 0) {
        // Replace first line's indent with proper prefix
        childLines[0] = `${baseIndent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    // Render reference occurrence - just arrow after name
    lines.push(
      `${indent}[${color}${node.type}\x1b[0m] ${node.name} \x1b[90m→\x1b[0m`
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
 * Sort nodes by flow order within an FCHAIN
 *
 * Order: Input ACTORs → FUNCs/FLOWs (topologically) → Output ACTORs
 *
 * Uses io edges to determine the flow sequence:
 * - Input actors: ACTORs with outgoing io to FLOW but no incoming io from FLOW
 * - Output actors: ACTORs with incoming io from FLOW but no outgoing io to FLOW
 * - FUNCs/FLOWs: sorted topologically based on io edges
 */
function sortByFlowOrder(nodes: any[], state: any): any[] {
  const nodeSet = new Set(nodes.map((n: any) => n.semanticId));

  // Separate actors from funcs/flows
  const actors: any[] = [];
  const funcsFlows: any[] = [];

  for (const node of nodes) {
    if (node.type === 'ACTOR') {
      actors.push(node);
    } else {
      funcsFlows.push(node);
    }
  }

  // Classify actors as input or output based on io edges
  const inputActors: any[] = [];
  const outputActors: any[] = [];

  for (const actor of actors) {
    // Check io edges involving this actor
    const hasOutgoingIo = Array.from(state.edges.values()).some(
      (e: any) =>
        e.type === 'io' &&
        e.sourceId === actor.semanticId &&
        nodeSet.has(e.targetId)
    );
    const hasIncomingIo = Array.from(state.edges.values()).some(
      (e: any) =>
        e.type === 'io' &&
        e.targetId === actor.semanticId &&
        nodeSet.has(e.sourceId)
    );

    if (hasOutgoingIo && !hasIncomingIo) {
      inputActors.push(actor);
    } else if (hasIncomingIo && !hasOutgoingIo) {
      outputActors.push(actor);
    } else if (hasOutgoingIo) {
      // Has both or only outgoing - treat as input
      inputActors.push(actor);
    } else {
      // No io edges or only incoming - treat as output
      outputActors.push(actor);
    }
  }

  // Topological sort for funcs/flows based on io edges
  const sorted = topologicalSortByIo(funcsFlows, state, nodeSet);

  // Combine: input actors → sorted funcs/flows → output actors
  return [...inputActors, ...sorted, ...outputActors];
}

/**
 * Topological sort of nodes based on io edges
 */
function topologicalSortByIo(nodes: any[], state: any, nodeSet: Set<string>): any[] {
  if (nodes.length <= 1) return nodes;

  // Build adjacency list and in-degree count
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.semanticId, 0);
    outEdges.set(node.semanticId, []);
  }

  // Count io edges within the node set
  for (const edge of state.edges.values()) {
    if (edge.type !== 'io') continue;

    // Check if both source and target are in our node set (or connected via FLOW)
    const sourceInSet = nodeSet.has(edge.sourceId);
    const targetInSet = nodeSet.has(edge.targetId);

    if (sourceInSet && targetInSet) {
      const sourceNode = state.nodes.get(edge.sourceId);
      const targetNode = state.nodes.get(edge.targetId);

      // Only count edges between FUNC/FLOW nodes
      if (
        sourceNode &&
        targetNode &&
        ['FUNC', 'FLOW'].includes(sourceNode.type) &&
        ['FUNC', 'FLOW'].includes(targetNode.type)
      ) {
        inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
        outEdges.get(edge.sourceId)?.push(edge.targetId);
      }
    }
  }

  // Kahn's algorithm for topological sort
  const queue: any[] = [];
  const result: any[] = [];
  const nodeMap = new Map(nodes.map((n: any) => [n.semanticId, n]));

  // Start with nodes that have no incoming edges
  for (const node of nodes) {
    if ((inDegree.get(node.semanticId) || 0) === 0) {
      queue.push(node);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const targetId of outEdges.get(current.semanticId) || []) {
      const newDegree = (inDegree.get(targetId) || 1) - 1;
      inDegree.set(targetId, newDegree);
      if (newDegree === 0) {
        const targetNode = nodeMap.get(targetId);
        if (targetNode) {
          queue.push(targetNode);
        }
      }
    }
  }

  // If not all nodes were sorted (cycle), append remaining
  if (result.length < nodes.length) {
    for (const node of nodes) {
      if (!result.includes(node)) {
        result.push(node);
      }
    }
  }

  return result;
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
      const parent = state.nodes.get((parentEdge as any).sourceId);
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
 * Render architecture view (first-level logical blocks as 2D boxes with connections)
 *
 * Uses Mermaid diagrams with inline image rendering for supported terminals.
 * Falls back to text-based view for unsupported terminals.
 */
async function renderArchitectureView(state: any, _viewConfig: any): Promise<string[]> {
  // ARCHITECTURE VIEW: Show only:
  // 1. FUNC nodes that are DIRECT children of SYS (top-level logical functions)
  // 2. FLOW nodes that connect these top-level FUNCs

  // Step 1: Find the SYS node(s) - the system root
  const sysNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'SYS');

  if (sysNodes.length === 0) {
    return ['\x1b[90m(No SYS node found - create a System node first)\x1b[0m'];
  }

  // Step 2: Get ONLY direct FUNC children of SYS (SYS -compose-> FUNC)
  const topLevelFuncs: Array<{ id: string; name: string; type: string }> = [];

  for (const sysNode of sysNodes as any[]) {
    const composeEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === sysNode.semanticId && e.type === 'compose'
    );

    for (const edge of composeEdges as any[]) {
      const child = state.nodes.get(edge.targetId);
      // ONLY FUNC nodes - the logical architecture blocks
      if (child && child.type === 'FUNC') {
        topLevelFuncs.push({
          id: child.semanticId,
          name: child.name,
          type: 'FUNC',
        });
      }
    }
  }

  if (topLevelFuncs.length === 0) {
    return ['\x1b[90m(No top-level FUNC nodes found - create FUNCs composed by SYS)\x1b[0m'];
  }

  // Find FLOW nodes that connect these top-level FUNCs
  // Build: FUNC --FLOW_NAME--> FUNC connections
  const funcIds = new Set(topLevelFuncs.map(n => n.id));
  const funcById = new Map(topLevelFuncs.map(f => [f.id, f]));
  const connections: Array<{ sourceFunc: string; targetFunc: string; flowName: string }> = [];

  // Find FLOW nodes that bridge our top-level FUNCs
  const flowNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'FLOW');

  for (const flowNode of flowNodes as any[]) {
    // Incoming io edges from our FUNCs
    const incomingFromFuncs = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.targetId === flowNode.semanticId && funcIds.has(e.sourceId)
    );
    // Outgoing io edges to our FUNCs
    const outgoingToFuncs = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.sourceId === flowNode.semanticId && funcIds.has(e.targetId)
    );

    // Create connections: sourceFunc --flowName--> targetFunc
    for (const inEdge of incomingFromFuncs as any[]) {
      for (const outEdge of outgoingToFuncs as any[]) {
        connections.push({
          sourceFunc: inEdge.sourceId,
          targetFunc: outEdge.targetId,
          flowName: flowNode.name,
        });
      }
    }
  }

  // Get system name for title
  const sysName = (sysNodes[0] as any).name || 'System';

  // Render as Mermaid + Text view
  return renderArchitectureMermaid(sysName, topLevelFuncs, connections, funcById);
}

/**
 * Render architecture as Mermaid flowchart + text fallback
 * With inline image rendering for supported terminals (iTerm2, Kitty)
 */
async function renderArchitectureMermaid(
  sysName: string,
  funcs: Array<{ id: string; name: string }>,
  connections: Array<{ sourceFunc: string; targetFunc: string; flowName: string }>,
  funcById: Map<string, { id: string; name: string }>
): Promise<string[]> {
  const lines: string[] = [];

  // Header
  lines.push('\x1b[1;36m┌─ LOGICAL ARCHITECTURE ─────────────────────────┐\x1b[0m');
  lines.push(`\x1b[1;36m│\x1b[0m  System: \x1b[35m${sysName}\x1b[0m`);
  lines.push(`\x1b[1;36m│\x1b[0m  Functions: ${funcs.length} | Flows: ${connections.length}`);

  // Show terminal graphics capability
  const capabilities = detectTerminalCapabilities();
  if (capabilities.supportsImages) {
    lines.push(`\x1b[1;36m│\x1b[0m  Terminal: \x1b[32m${capabilities.termProgram} (graphics: ${capabilities.protocol})\x1b[0m`);
  }

  lines.push('\x1b[1;36m└────────────────────────────────────────────────┘\x1b[0m');
  lines.push('');

  // Build Mermaid code
  const mermaidLines: string[] = [];
  mermaidLines.push('graph LR');

  // Define nodes with short IDs
  const idMap = new Map<string, string>();
  funcs.forEach((func, idx) => {
    const shortId = `F${idx + 1}`;
    idMap.set(func.id, shortId);
    mermaidLines.push(`    ${shortId}[${func.name}]`);
  });

  // Add connections with FLOW labels
  if (connections.length > 0) {
    mermaidLines.push('');
    for (const conn of connections) {
      const srcId = idMap.get(conn.sourceFunc);
      const tgtId = idMap.get(conn.targetFunc);
      if (srcId && tgtId) {
        mermaidLines.push(`    ${srcId} -->|${conn.flowName}| ${tgtId}`);
      }
    }
  }

  const mermaidCode = mermaidLines.join('\n');

  // Try to render as image in terminal (always attempt, regardless of detection)
  try {
    const imageOutput = await renderMermaidAsImage(mermaidCode);
    if (imageOutput) {
      lines.push('\x1b[90m[Rendered as inline image]\x1b[0m');
      lines.push('');
      lines.push(imageOutput);

      // Still show text fallback below
      lines.push('\x1b[90m─── Text View ───\x1b[0m');
    }
  } catch (error) {
    // Image rendering failed - silently fall back to text only
    // (This is expected for terminals without graphics support)
  }

  // Mermaid code block (copy to markdown viewer to render)
  lines.push('\x1b[90m```mermaid\x1b[0m');
  lines.push(mermaidCode);
  lines.push('\x1b[90m```\x1b[0m');
  lines.push('');

  // Text view (always works in terminal)
  lines.push('\x1b[90m─── Data Flows ───\x1b[0m');
  if (connections.length === 0) {
    lines.push('  \x1b[90m(No FLOW connections between top-level functions)\x1b[0m');
  } else {
    for (const conn of connections) {
      const srcName = funcById.get(conn.sourceFunc)?.name || '?';
      const tgtName = funcById.get(conn.targetFunc)?.name || '?';
      lines.push(`  \x1b[36m${srcName}\x1b[0m \x1b[33m──${conn.flowName}──▶\x1b[0m \x1b[36m${tgtName}\x1b[0m`);
    }
  }

  // Show isolated functions
  const connectedFuncs = new Set([
    ...connections.map(c => c.sourceFunc),
    ...connections.map(c => c.targetFunc),
  ]);
  const isolatedFuncs = funcs.filter(f => !connectedFuncs.has(f.id));
  if (isolatedFuncs.length > 0) {
    lines.push('');
    lines.push('\x1b[90m─── Standalone Functions ───\x1b[0m');
    for (const func of isolatedFuncs) {
      lines.push(`  \x1b[36m${func.name}\x1b[0m`);
    }
  }

  return lines;
}

/**
 * Render graph to console
 */
async function render(): Promise<void> {
  // Don't clear on updates - allows scrolling through history
  // Only clear on initial render
  const state = graphCanvas.getState();

  console.log('');
  console.log('\x1b[36m' + '─'.repeat(60) + '\x1b[0m');
  console.log(`\x1b[1;36mGraph Update:\x1b[0m ${new Date().toLocaleTimeString()}`);
  console.log(`\x1b[36mView:\x1b[0m ${currentView} | \x1b[36mNodes:\x1b[0m ${state.nodes.size} | \x1b[36mEdges:\x1b[0m ${state.edges.size}`);
  console.log('\x1b[36m' + '─'.repeat(60) + '\x1b[0m');
  console.log('');

  const ascii = await generateAsciiGraph();
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

  // Deduplication: skip if we already processed this exact update
  const updateTimestamp = String(update.timestamp);
  if (lastProcessedTimestamp === updateTimestamp) {
    return; // Duplicate message, skip
  }
  lastProcessedTimestamp = updateTimestamp;

  try {
    // Update systemId from broadcast if provided (initial state sync)
    if (update.systemId && update.systemId !== config.systemId) {
      const oldSystemId = config.systemId;
      config.systemId = update.systemId;
      log(`🔄 Switched to system: ${update.systemId} (was: ${oldSystemId || 'none'})`);
      console.log(`\x1b[33m🔄 System: ${update.systemId}\x1b[0m`);

      // Update subscription to new system
      if (wsClient) {
        wsClient.updateSubscription(update.systemId);
      }
    }

    // Parse JSON state (same format as file-based polling)
    const stateData = JSON.parse(update.diff || '{}');

    // Load new state with proper type assertions
    const nodesMap = new Map<string, any>(stateData.nodes || []);
    const edgesMap = new Map<string, any>(stateData.edges || []);
    const portsMap = new Map<string, any[]>(stateData.ports || []);

    await graphCanvas.loadGraph({
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      nodes: nodesMap as any,
      edges: edgesMap as any,
      ports: portsMap as any,
      version: 1,
      lastSavedVersion: 1,
      lastModified: new Date(),
    });

    // Update current view if changed
    if (stateData.currentView) {
      currentView = stateData.currentView;
    }

    // Re-render
    await render();
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

  log('📊 Graph viewer started');

  // ============================================
  // STEP 1: Session Resolution (MANDATORY Neo4j)
  // ============================================
  // Uses central session-resolver for consistent initialization
  // Same logic as chat-interface.ts
  neo4jClient = initNeo4jClient();

  const resolved = await resolveSession(neo4jClient);
  config.workspaceId = resolved.workspaceId;
  config.systemId = resolved.systemId;
  config.userId = resolved.userId;
  config.chatId = resolved.chatId;

  console.log(`\x1b[90m✓ Session: ${resolved.systemId} (${resolved.source})\x1b[0m`);
  log(`📋 Session: ${resolved.systemId} (source: ${resolved.source})`);

  // ============================================
  // STEP 2: Initialize Canvas (after session)
  // ============================================
  graphCanvas = new GraphCanvas(
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    currentView,
    neo4jClient
  );

  console.log('\x1b[90mGraph updates will appear below (scroll to see history)\x1b[0m');
  console.log('');

  // ============================================
  // STEP 3: WebSocket Connection
  // ============================================
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

  console.log('\x1b[90mWaiting for graph updates from chat interface...\x1b[0m');
  console.log('');
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
