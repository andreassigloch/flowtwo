/**
 * Spec Views - Specification view renderers (spec, spec+)
 *
 * CR-033: Added change indicator support (+/-/~)
 *
 * @author andreas@siglochconsulting
 */

import type { GraphState } from './view-utils.js';
import { getNodeColor, getChangeIndicator, buildOccurrenceMap, findChildOccurrences, sortByFlowOrder } from './view-utils.js';

/**
 * Render spec view (complete specification with multiple occurrences)
 */
export function renderSpecView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeEdgeTypes } = viewConfig.layoutConfig;
  const nestingEdgeTypes = includeEdgeTypes.filter((t: string) =>
    ['compose', 'satisfy', 'allocate'].includes(t)
  );

  const occurrenceMap = buildOccurrenceMap(state, nestingEdgeTypes);

  if (occurrenceMap.byNode.size === 0) {
    lines.push('\x1b[90m(No nodes found)\x1b[0m');
    return lines;
  }

  const rootOccurrences: any[] = [];
  for (const occurrences of occurrenceMap.byNode.values()) {
    const root = occurrences.find((occ: any) => occ.depth === 0);
    if (root) {
      rootOccurrences.push(root);
    }
  }

  rootOccurrences.forEach((rootOcc) => {
    lines.push(...renderOccurrence(rootOcc, state, occurrenceMap, '', true));
  });

  return lines;
}

/**
 * Render spec+ view (specification with inline descriptions)
 */
export function renderSpecPlusView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeEdgeTypes } = viewConfig.layoutConfig;
  const nestingEdgeTypes = includeEdgeTypes.filter((t: string) =>
    ['compose', 'satisfy', 'allocate'].includes(t)
  );

  const occurrenceMap = buildOccurrenceMap(state, nestingEdgeTypes);

  if (occurrenceMap.byNode.size === 0) {
    lines.push('\x1b[90m(No nodes found)\x1b[0m');
    return lines;
  }

  const rootOccurrences: any[] = [];
  for (const occurrences of occurrenceMap.byNode.values()) {
    const root = occurrences.find((occ: any) => occ.depth === 0);
    if (root) {
      rootOccurrences.push(root);
    }
  }

  rootOccurrences.forEach((rootOcc) => {
    lines.push(...renderOccurrenceWithDescription(rootOcc, state, occurrenceMap, '', true));
  });

  return lines;
}

/**
 * Render single occurrence
 */
function renderOccurrence(
  occurrence: any,
  state: GraphState,
  occurrenceMap: any,
  indent: string,
  isRoot: boolean = false
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);
  const changeInd = getChangeIndicator(node.semanticId, state.nodeChangeStatus);

  if (occurrence.isPrimary) {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);

    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    const baseIndent = isRoot ? '' : indent;

    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
      const childIndent = baseIndent + (isLast ? '  ' : '\u2502 ');

      const childLines = renderOccurrence(child, state, occurrenceMap, childIndent, false);
      if (childLines.length > 0) {
        childLines[0] = `${baseIndent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name} \x1b[90m\u2192\x1b[0m`);
  }

  return lines;
}

/**
 * Render single occurrence with description (for spec+ view)
 * Enhanced to show FCHAIN dataflows inline
 */
function renderOccurrenceWithDescription(
  occurrence: any,
  state: GraphState,
  occurrenceMap: any,
  indent: string,
  isRoot: boolean = false
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);
  const changeInd = getChangeIndicator(node.semanticId, state.nodeChangeStatus);

  if (occurrence.isPrimary) {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);

    if (node.descr && node.descr.trim()) {
      const descIndent = isRoot ? '  ' : indent + '  ';
      lines.push(`${descIndent}\x1b[90m${node.descr}\x1b[0m`);
    }

    // For FCHAIN nodes, render dataflow diagram inline
    if (node.type === 'FCHAIN') {
      const flowIndent = isRoot ? '  ' : indent + '  ';
      const flowLines = renderFchainDataflow(node.semanticId, state, flowIndent);
      if (flowLines.length > 0) {
        lines.push(...flowLines);
      }
    }

    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    const baseIndent = isRoot ? '' : indent;

    // For FCHAIN, skip FUNC/FLOW/ACTOR children as they're shown in dataflow
    const filteredChildren = node.type === 'FCHAIN'
      ? children.filter((child: any) => {
          const childNode = state.nodes.get(child.nodeId);
          return childNode && !['FUNC', 'FLOW', 'ACTOR'].includes(childNode.type);
        })
      : children;

    filteredChildren.forEach((child: any, idx: number) => {
      const isLast = idx === filteredChildren.length - 1;
      const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
      const childIndent = baseIndent + (isLast ? '  ' : '\u2502 ');

      const childLines = renderOccurrenceWithDescription(child, state, occurrenceMap, childIndent, false);
      if (childLines.length > 0) {
        childLines[0] = `${baseIndent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name} \x1b[90m\u2192\x1b[0m`);
  }

  return lines;
}

/**
 * Render FCHAIN dataflow inline (for spec+ view)
 * Shows: ACTOR → FUNC → FLOW → FUNC → ACTOR sequence
 */
function renderFchainDataflow(fchainId: string, state: GraphState, indent: string): string[] {
  const lines: string[] = [];

  // Get all children of this FCHAIN via compose edges
  const childIds = new Set<string>();
  for (const edge of state.edges.values()) {
    if (edge.type === 'compose' && edge.sourceId === fchainId) {
      childIds.add(edge.targetId);
    }
  }

  if (childIds.size === 0) return lines;

  // Collect nodes by type
  const funcs: any[] = [];
  const actors: any[] = [];
  const flows: any[] = [];

  for (const childId of childIds) {
    const node = state.nodes.get(childId);
    if (!node) continue;
    if (node.type === 'FUNC') funcs.push(node);
    else if (node.type === 'ACTOR') actors.push(node);
    else if (node.type === 'FLOW') flows.push(node);
  }

  if (funcs.length === 0) return lines;

  // Build io connections within FCHAIN scope
  const connections = extractIoConnections(state, childIds);

  if (connections.length === 0 && funcs.length === 1) {
    // Single function with no connections - just show it
    return lines;
  }

  // Sort nodes by flow order
  const allNodes = [...funcs, ...actors, ...flows];
  const sortedNodes = sortByFlowOrder(allNodes, state);

  // Build the dataflow visualization
  lines.push(`${indent}\x1b[90m┌─ Dataflow ─────────────────────────────────┐\x1b[0m`);

  // Identify input/output actors
  const inputActorIds = new Set<string>();
  const outputActorIds = new Set<string>();

  for (const conn of connections) {
    const sourceNode = state.nodes.get(conn.sourceId);
    const targetNode = state.nodes.get(conn.targetId);
    if (sourceNode?.type === 'ACTOR') inputActorIds.add(conn.sourceId);
    if (targetNode?.type === 'ACTOR') outputActorIds.add(conn.targetId);
  }

  // Render input actors
  const inputActors = actors.filter(a => inputActorIds.has(a.semanticId));
  if (inputActors.length > 0) {
    for (const actor of inputActors) {
      const actorColor = getNodeColor('ACTOR');
      const changeInd = getChangeIndicator(actor.semanticId, state.nodeChangeStatus);
      lines.push(`${indent}\x1b[90m│\x1b[0m ${changeInd}[${actorColor}ACTOR\x1b[0m] ${actor.name}`);

      // Find unique flows from this actor (dedupe by flow name)
      const outFlows = connections.filter(c => c.sourceId === actor.semanticId);
      const uniqueFlowNames = [...new Set(outFlows.map(f => f.flowName))];
      for (const flowName of uniqueFlowNames) {
        lines.push(`${indent}\x1b[90m│\x1b[0m   \x1b[33m↓ ${flowName}\x1b[0m`);
      }
    }
  }

  // Render functions in sequence with their connections
  const sortedFuncs = sortedNodes.filter(n => n.type === 'FUNC');
  let seqNum = 1;

  for (let i = 0; i < sortedFuncs.length; i++) {
    const func = sortedFuncs[i];
    const funcColor = getNodeColor('FUNC');
    const changeInd = getChangeIndicator(func.semanticId, state.nodeChangeStatus);

    lines.push(`${indent}\x1b[90m│\x1b[0m \x1b[36m${seqNum}.\x1b[0m ${changeInd}[${funcColor}FUNC\x1b[0m] ${func.name}`);
    seqNum++;

    // Find unique outgoing flows to next function (dedupe by flow name)
    const outFlows = connections.filter(c => c.sourceId === func.semanticId);
    const funcOutFlows = outFlows.filter(f => {
      const targetNode = state.nodes.get(f.targetId);
      return targetNode?.type === 'FUNC';
    });
    const uniqueFlowNames = [...new Set(funcOutFlows.map(f => f.flowName))];
    for (const flowName of uniqueFlowNames) {
      lines.push(`${indent}\x1b[90m│\x1b[0m   \x1b[33m↓ ${flowName}\x1b[0m`);
    }
  }

  // Render output actors (pure output only, not bidirectional)
  const pureOutputActors = actors.filter(a => outputActorIds.has(a.semanticId) && !inputActorIds.has(a.semanticId));
  if (pureOutputActors.length > 0) {
    for (const actor of pureOutputActors) {
      // Find unique flows to this actor (dedupe by flow name)
      const inFlows = connections.filter(c => c.targetId === actor.semanticId);
      const uniqueFlowNames = [...new Set(inFlows.map(f => f.flowName))];
      for (const flowName of uniqueFlowNames) {
        lines.push(`${indent}\x1b[90m│\x1b[0m   \x1b[33m↓ ${flowName}\x1b[0m`);
      }

      const actorColor = getNodeColor('ACTOR');
      const changeInd = getChangeIndicator(actor.semanticId, state.nodeChangeStatus);
      lines.push(`${indent}\x1b[90m│\x1b[0m ${changeInd}[${actorColor}ACTOR\x1b[0m] ${actor.name}`);
    }
  }

  // Render bidirectional actors (both input and output) - show their incoming flows
  const bidirectionalActors = actors.filter(a => inputActorIds.has(a.semanticId) && outputActorIds.has(a.semanticId));
  if (bidirectionalActors.length > 0) {
    for (const actor of bidirectionalActors) {
      const inFlows = connections.filter(c => c.targetId === actor.semanticId);
      if (inFlows.length > 0) {
        const uniqueFlowNames = [...new Set(inFlows.map(f => f.flowName))];
        for (const flowName of uniqueFlowNames) {
          lines.push(`${indent}\x1b[90m│\x1b[0m   \x1b[33m↓ ${flowName}\x1b[0m`);
        }
        const actorColor = getNodeColor('ACTOR');
        const changeInd = getChangeIndicator(actor.semanticId, state.nodeChangeStatus);
        lines.push(`${indent}\x1b[90m│\x1b[0m ${changeInd}[${actorColor}ACTOR\x1b[0m] ${actor.name} \x1b[90m(receives)\x1b[0m`);
      }
    }
  }

  lines.push(`${indent}\x1b[90m└────────────────────────────────────────────┘\x1b[0m`);

  return lines;
}

/**
 * Extract io connections within a set of nodes (via FLOW intermediaries)
 */
function extractIoConnections(
  state: GraphState,
  scopeNodeIds: Set<string>
): Array<{ sourceId: string; targetId: string; flowName: string; flowId: string }> {
  const connections: Array<{ sourceId: string; targetId: string; flowName: string; flowId: string }> = [];

  // Find FLOW nodes in scope
  const flowNodes: any[] = [];
  for (const nodeId of scopeNodeIds) {
    const node = state.nodes.get(nodeId);
    if (node?.type === 'FLOW') {
      flowNodes.push(node);
    }
  }

  // For each FLOW, trace incoming and outgoing io edges
  for (const flowNode of flowNodes) {
    const incomingEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.targetId === flowNode.semanticId
    );
    const outgoingEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.sourceId === flowNode.semanticId
    );

    // Create connections: source → FLOW → target
    for (const inEdge of incomingEdges) {
      for (const outEdge of outgoingEdges) {
        const sourceNode = state.nodes.get(inEdge.sourceId);
        const targetNode = state.nodes.get(outEdge.targetId);

        // Only include if both ends are in scope and are FUNC or ACTOR
        if (sourceNode && targetNode &&
            scopeNodeIds.has(inEdge.sourceId) && scopeNodeIds.has(outEdge.targetId) &&
            ['FUNC', 'ACTOR'].includes(sourceNode.type) &&
            ['FUNC', 'ACTOR'].includes(targetNode.type)) {
          connections.push({
            sourceId: inEdge.sourceId,
            targetId: outEdge.targetId,
            flowName: flowNode.name,
            flowId: flowNode.semanticId,
          });
        }
      }
    }
  }

  return connections;
}

/**
 * Render fchain/fchain+ view (dedicated function chain view)
 * ASCII graph flowing from top-left to bottom-right
 *
 * Simplified algorithm (3 rules):
 * - outFlows.length === 1 → DOWN (sequential: │ ▼)
 * - outFlows.length > 1  → FORK (parallel: ├─▶ └─▶)
 * - inFlows.length > 1   → JOIN_RIGHT (merge: ─┴─▶)
 *
 * Key principles:
 * - Graph flows ONLY down/right, NEVER back up
 * - Join on the level of the lowest parallel path (no backtracking)
 * - Flow labels in ITALIC under the node
 *
 * Two variants:
 * - fchain: Compact single-line format
 * - fchain+: Detailed with [A]/[F] tags, flow labels (italic), descriptions
 *
 * Error handling:
 * - Cycles: ❌ warning + linear fallback
 * - Nested diamonds: ⚠️ info + flattened view
 */
export function renderFchainView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  // Handle both string ('fchain+') and object ({ viewId: 'fchain+' }) params
  const viewType = typeof viewConfig === 'string' ? viewConfig : viewConfig?.viewId;
  const isDetailed = viewType === 'fchain+';

  // Find all FCHAIN nodes
  const fchainNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'FCHAIN');

  if (fchainNodes.length === 0) {
    lines.push('\x1b[90m(No FCHAIN nodes found - create function chains first)\x1b[0m');
    return lines;
  }

  // Render each FCHAIN
  fchainNodes.forEach((fchain: any, idx: number) => {
    try {
      renderSingleFchain(lines, fchain, state, isDetailed);
    } catch (e) {
      // Graceful fallback on error
      lines.push(`${BOX}  ${RED}❌ Render error: ${e instanceof Error ? e.message : 'Unknown error'}${RESET}`);
      renderLinearFallback(lines, fchain, state);
    }

    if (idx < fchainNodes.length - 1) {
      lines.push('');
    }
  });

  return lines;
}

/**
 * Render a single FCHAIN with header/footer
 */
function renderSingleFchain(
  lines: string[],
  fchain: any,
  state: GraphState,
  isDetailed: boolean
): void {
  const fchainColor = getNodeColor('FCHAIN');
  const changeInd = getChangeIndicator(fchain.semanticId, state.nodeChangeStatus);

  // Header
  const headerWidth = 78;
  const titleLen = fchain.name.length + 12;
  lines.push(`${GRAY}┌─ ${changeInd}[${fchainColor}FCHAIN${RESET}${GRAY}] ${fchain.name} ${'─'.repeat(Math.max(0, headerWidth - titleLen))}┐${RESET}`);

  if (isDetailed && fchain.descr) {
    lines.push(`${BOX}  ${GRAY}${fchain.descr}${RESET}`);
  }
  lines.push(BOX);

  // Get children of this FCHAIN
  const childIds = new Set<string>();
  for (const edge of state.edges.values()) {
    if (edge.type === 'compose' && edge.sourceId === fchain.semanticId) {
      childIds.add(edge.targetId);
    }
  }

  // Collect by type
  const funcs: any[] = [];
  const actors: any[] = [];
  const flows: any[] = [];

  for (const childId of childIds) {
    const node = state.nodes.get(childId);
    if (!node) continue;
    if (node.type === 'FUNC') funcs.push(node);
    else if (node.type === 'ACTOR') actors.push(node);
    else if (node.type === 'FLOW') flows.push(node);
  }

  // Build connections
  const connections = extractIoConnections(state, childIds);

  // Check for cycles
  if (hasCycles(connections)) {
    lines.push(`${BOX}  ${RED}❌ Cycle detected - showing linear fallback${RESET}`);
    renderLinearFallback(lines, fchain, state);
  } else if (hasNestedDiamond(connections, funcs)) {
    lines.push(`${BOX}  ${YELLOW}⚠️ Nested parallel paths simplified${RESET}`);
    if (isDetailed) {
      renderDetailedFchainGraph(lines, funcs, actors, connections, state);
    } else {
      renderCompactFchainGraph(lines, funcs, actors, connections, state);
    }
  } else {
    if (isDetailed) {
      renderDetailedFchainGraph(lines, funcs, actors, connections, state);
    } else {
      renderCompactFchainGraph(lines, funcs, actors, connections, state);
    }
  }

  // Footer
  lines.push(BOX);
  lines.push(`${GRAY}└─ Functions: ${funcs.length} │ Actors: ${actors.length} │ Flows: ${flows.length} ${'─'.repeat(30)}┘${RESET}`);
}

/**
 * Check for cycles in the connection graph
 */
function hasCycles(
  connections: Array<{ sourceId: string; targetId: string; flowName: string; flowId: string }>
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const conn of connections) {
    if (!adjacency.has(conn.sourceId)) adjacency.set(conn.sourceId, []);
    adjacency.get(conn.sourceId)!.push(conn.targetId);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);

    for (const neighbor of adjacency.get(node) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
}

/**
 * Check for nested diamond patterns (fork within fork before join)
 */
function hasNestedDiamond(
  connections: Array<{ sourceId: string; targetId: string; flowName: string; flowId: string }>,
  funcs: any[]
): boolean {
  const outgoing = new Map<string, string[]>();
  const funcIds = new Set(funcs.map(f => f.semanticId));

  for (const conn of connections) {
    if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
    outgoing.get(conn.sourceId)!.push(conn.targetId);
  }

  // Find fork nodes (>1 outgoing to functions)
  const forkNodes: string[] = [];
  for (const [nodeId, targets] of outgoing) {
    const funcTargets = targets.filter(t => funcIds.has(t));
    if (funcTargets.length > 1) {
      forkNodes.push(nodeId);
    }
  }

  // Check if any fork node is reachable from another fork node
  for (const fork1 of forkNodes) {
    const visited = new Set<string>();
    const queue = outgoing.get(fork1) || [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Found another fork node reachable from fork1
      if (forkNodes.includes(current) && current !== fork1) {
        return true;
      }

      for (const next of outgoing.get(current) || []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }

  return false;
}

/**
 * Linear fallback rendering for error cases
 */
function renderLinearFallback(lines: string[], fchain: any, state: GraphState): void {
  // Get children
  const childIds = new Set<string>();
  for (const edge of state.edges.values()) {
    if (edge.type === 'compose' && edge.sourceId === fchain.semanticId) {
      childIds.add(edge.targetId);
    }
  }

  const nodes: any[] = [];
  for (const childId of childIds) {
    const node = state.nodes.get(childId);
    if (node && ['FUNC', 'ACTOR'].includes(node.type)) {
      nodes.push(node);
    }
  }

  // Sort by type and name
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'ACTOR' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    const color = getNodeColor(node.type);
    const tag = node.type === 'ACTOR' ? 'A' : 'F';
    const changeInd = getChangeIndicator(node.semanticId, state.nodeChangeStatus);
    lines.push(`${BOX}  ${changeInd}[${color}${tag}${RESET}] ${node.name}`);
  }
}

// ANSI codes for fchain rendering
const ITALIC = '\x1b[3m';
const RESET = '\x1b[0m';
const GRAY = '\x1b[90m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOX = `${GRAY}│${RESET}`;

/**
 * Render compact graph: A ─▶ F1 ─▶ F2 ─▶ B
 * With proper fork/join visualization
 */
function renderCompactFchainGraph(
  lines: string[],
  funcs: any[],
  actors: any[],
  connections: Array<{ sourceId: string; targetId: string; flowName: string; flowId: string }>,
  state: GraphState
): void {
  // Build adjacency by semanticId
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const nodeById = new Map<string, any>();

  for (const f of funcs) nodeById.set(f.semanticId, f);
  for (const a of actors) nodeById.set(a.semanticId, a);

  for (const conn of connections) {
    if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
    if (!incoming.has(conn.targetId)) incoming.set(conn.targetId, []);
    outgoing.get(conn.sourceId)!.push(conn.targetId);
    incoming.get(conn.targetId)!.push(conn.sourceId);
  }

  // Find input/output actors
  const inputActors = actors.filter(a => !incoming.has(a.semanticId) && outgoing.has(a.semanticId));
  const outputActors = actors.filter(a => incoming.has(a.semanticId) && !outgoing.has(a.semanticId));

  // Sort functions topologically
  const sortedFuncs = sortByFlowOrder([...funcs, ...actors], state).filter(n => n.type === 'FUNC');

  if (inputActors.length === 0 && sortedFuncs.length === 0) {
    lines.push(`${BOX}  ${GRAY}(empty chain)${RESET}`);
    return;
  }

  // Detect fork and join nodes
  const forkNodes = new Set<string>();
  const joinNodes = new Set<string>();

  for (const func of sortedFuncs) {
    const outs = (outgoing.get(func.semanticId) || []).filter(id =>
      funcs.some(f => f.semanticId === id)
    );
    const ins = (incoming.get(func.semanticId) || []).filter(id =>
      funcs.some(f => f.semanticId === id) || actors.some(a => a.semanticId === id)
    );
    if (outs.length > 1) forkNodes.add(func.semanticId);
    if (ins.length > 1) joinNodes.add(func.semanticId);
  }

  const hasFork = forkNodes.size > 0;

  // Helper to get name with change indicator
  const getNameWithIndicator = (node: any): string => {
    const ind = getChangeIndicator(node.semanticId, state.nodeChangeStatus);
    return ind ? `${ind}${node.name}` : node.name;
  };

  if (!hasFork) {
    // Simple linear chain: A ─▶ F1 ─▶ F2 ─▶ B
    const parts: string[] = [];
    if (inputActors.length === 1) {
      parts.push(getNameWithIndicator(inputActors[0]));
    } else if (inputActors.length > 1) {
      parts.push(`(${inputActors.map(a => getNameWithIndicator(a)).join(', ')})`);
    }
    for (const func of sortedFuncs) {
      parts.push(getNameWithIndicator(func));
    }
    if (outputActors.length === 1) {
      parts.push(getNameWithIndicator(outputActors[0]));
    } else if (outputActors.length > 1) {
      parts.push(`(${outputActors.map(a => getNameWithIndicator(a)).join(', ')})`);
    }
    lines.push(`${BOX}  ${parts.join(' ─▶ ')}`);
  } else {
    // Fork/Join: Need multi-line rendering
    // Find main path (longest) and branch paths
    const visited = new Set<string>();
    const mainPath: string[] = [];
    const branches: string[][] = [];

    // Start from input actors or first function
    let current = inputActors.length > 0 ? inputActors[0].semanticId : sortedFuncs[0]?.semanticId;

    // Traverse main path (follow first outgoing edge)
    while (current && !visited.has(current)) {
      visited.add(current);
      mainPath.push(current);
      const outs = outgoing.get(current) || [];

      // If fork, record branches
      if (outs.length > 1) {
        for (let i = 1; i < outs.length; i++) {
          const branchPath: string[] = [];
          const branchVisited = new Set<string>(); // Track visited in this branch to prevent cycles
          let branchNode = outs[i];
          while (branchNode && !visited.has(branchNode) && !mainPath.includes(branchNode) && !branchVisited.has(branchNode)) {
            branchVisited.add(branchNode);
            branchPath.push(branchNode);
            const branchOuts = outgoing.get(branchNode) || [];
            branchNode = branchOuts[0];
          }
          if (branchPath.length > 0) branches.push(branchPath);
        }
      }
      current = outs[0];
    }

    // Add remaining output actors
    for (const a of outputActors) {
      if (!visited.has(a.semanticId)) mainPath.push(a.semanticId);
    }

    // Render main line with fork/join markers and change indicators
    const mainNames = mainPath.map(id => {
      const node = nodeById.get(id);
      return node ? getNameWithIndicator(node) : id;
    });
    let mainLine = mainNames[0] || '';

    for (let i = 1; i < mainNames.length; i++) {
      const nodeId = mainPath[i];
      const isFork = forkNodes.has(mainPath[i - 1]);
      const isJoin = joinNodes.has(nodeId);

      if (isFork) {
        mainLine += ` ─┬─▶ ${mainNames[i]}`;
      } else if (isJoin) {
        mainLine += ` ─┴─▶ ${mainNames[i]}`;
      } else {
        mainLine += ` ─▶ ${mainNames[i]}`;
      }
    }
    lines.push(`${BOX}  ${mainLine}`);

    // Render branch lines with change indicators
    for (const branch of branches) {
      const branchNames = branch.map(id => {
        const node = nodeById.get(id);
        return node ? getNameWithIndicator(node) : id;
      });
      const indent = mainLine.indexOf('─┬─▶') + 1;
      const branchLine = ' '.repeat(Math.max(0, indent)) + `└─▶ ${branchNames.join(' ─▶ ')} ─┘`;
      lines.push(`${BOX}  ${branchLine}`);
    }
  }
}

/**
 * Render detailed graph with [A]/[F] tags and flow labels (italic)
 * Flow labels are ALWAYS vertical (under │), never horizontal
 */
function renderDetailedFchainGraph(
  lines: string[],
  funcs: any[],
  actors: any[],
  connections: Array<{ sourceId: string; targetId: string; flowName: string; flowId: string }>,
  state: GraphState
): void {
  // Build adjacency with flow names
  const outgoing = new Map<string, Array<{ targetId: string; flowName: string }>>();
  const incoming = new Map<string, Array<{ sourceId: string; flowName: string }>>();

  for (const conn of connections) {
    if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
    if (!incoming.has(conn.targetId)) incoming.set(conn.targetId, []);
    outgoing.get(conn.sourceId)!.push({ targetId: conn.targetId, flowName: conn.flowName });
    incoming.get(conn.targetId)!.push({ sourceId: conn.sourceId, flowName: conn.flowName });
  }

  // Categorize actors
  const inputActors = actors.filter(a => !incoming.has(a.semanticId) && outgoing.has(a.semanticId));
  const outputActors = actors.filter(a => incoming.has(a.semanticId) && !outgoing.has(a.semanticId));
  const midActors = actors.filter(a => incoming.has(a.semanticId) && outgoing.has(a.semanticId));

  // Sort functions topologically
  const sortedFuncs = sortByFlowOrder([...funcs, ...actors], state).filter(n => n.type === 'FUNC');

  const actorColor = getNodeColor('ACTOR');
  const funcColor = getNodeColor('FUNC');

  // Base indent for the flow line
  const baseIndent = 18;

  // Render input actors
  if (inputActors.length > 0) {
    for (let i = 0; i < inputActors.length; i++) {
      const actor = inputActors[i];
      const changeInd = getChangeIndicator(actor.semanticId, state.nodeChangeStatus);
      const connector = inputActors.length > 1 ? (i === inputActors.length - 1 ? '─┘' : '─┤') : '─┐';
      lines.push(`${BOX}  ${changeInd}[${actorColor}A${RESET}] ${actor.name} ${connector}`);
    }

    // Flow label from input actors (vertical, italic)
    const firstOutFlows = outgoing.get(inputActors[0].semanticId) || [];
    const uniqueFlows = [...new Set(firstOutFlows.map(f => f.flowName))];
    if (uniqueFlows.length > 0) {
      lines.push(`${BOX}  ${' '.repeat(baseIndent)}│ ${ITALIC}${YELLOW}${uniqueFlows[0]}${RESET}`);
      lines.push(`${BOX}  ${' '.repeat(baseIndent)}│`);
    }
  }

  // Render functions
  let funcSeq = 1;
  const renderedFlowLabels = new Set<string>(); // Track rendered flow labels to avoid duplicates

  for (let i = 0; i < sortedFuncs.length; i++) {
    const func = sortedFuncs[i];
    const inFlows = incoming.get(func.semanticId) || [];
    const outFlows = outgoing.get(func.semanticId) || [];

    // Check for join: multiple FUNCTION sources (not counting actors)
    const funcSources = inFlows.filter(f => funcs.some(fn => fn.semanticId === f.sourceId));
    const isJoin = funcSources.length > 1;

    // Function line with change indicator
    const funcChangeInd = getChangeIndicator(func.semanticId, state.nodeChangeStatus);
    if (isJoin) {
      lines.push(`${BOX}  ${' '.repeat(baseIndent - 5)}────┴─▶${funcChangeInd}[${funcColor}F${RESET}] ${funcSeq}. ${func.name}`);
    } else if (i === 0 && inputActors.length > 0) {
      lines.push(`${BOX}  ${' '.repeat(baseIndent)}└─▶${funcChangeInd}[${funcColor}F${RESET}] ${funcSeq}. ${func.name}`);
    } else {
      lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}${funcChangeInd}[${funcColor}F${RESET}] ${funcSeq}. ${func.name}`);
    }
    funcSeq++;

    // Get targets
    const funcTargets = outFlows.filter(f => funcs.some(fn => fn.semanticId === f.targetId));
    const actorTargets = outFlows.filter(f => actors.some(a => a.semanticId === f.targetId));

    // Get unique flow names to next function(s) - avoiding duplicates
    const funcFlowNames = [...new Set(funcTargets.map(f => f.flowName))];

    // Check for fork to functions
    if (funcTargets.length > 1) {
      // Fork: multiple function targets
      for (let j = 0; j < funcTargets.length; j++) {
        const target = funcTargets[j];
        const connector = j === funcTargets.length - 1 ? '└' : '├';
        lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}│ ${ITALIC}${YELLOW}${target.flowName}${RESET}`);
        lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}${connector}─▶ ...`);
        renderedFlowLabels.add(target.flowName);
      }
    } else if (funcFlowNames.length > 0 && i < sortedFuncs.length - 1) {
      // Single flow to next function - vertical flow label (only if not already rendered)
      const flowName = funcFlowNames[0];
      if (!renderedFlowLabels.has(flowName)) {
        lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}│ ${ITALIC}${YELLOW}${flowName}${RESET}`);
        lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}▼`);
        renderedFlowLabels.add(flowName);
      }
    }

    // Flows to actors (mid-chain or output) - render AFTER the function's flow to next function
    for (const target of actorTargets) {
      const targetActor = actors.find(a => a.semanticId === target.targetId);
      if (targetActor) {
        const isMid = midActors.some(m => m.semanticId === target.targetId);
        const suffix = isMid ? ` ${GRAY}(mid-chain)${RESET}` : '';
        const actorChangeInd = getChangeIndicator(targetActor.semanticId, state.nodeChangeStatus);
        // Only show flow label if different from the one going to next function
        if (!renderedFlowLabels.has(target.flowName)) {
          lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}│ ${ITALIC}${YELLOW}${target.flowName}${RESET}`);
        }
        lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}├─▶${actorChangeInd}[${actorColor}A${RESET}] ${targetActor.name}${suffix}`);
      }
    }
  }

  // Render any unrendered output actors
  const renderedOutputs = new Set<string>();
  for (const func of sortedFuncs) {
    const outFlows = outgoing.get(func.semanticId) || [];
    for (const f of outFlows) {
      if (outputActors.some(a => a.semanticId === f.targetId)) {
        renderedOutputs.add(f.targetId);
      }
    }
  }

  const unrenderedOutputs = outputActors.filter(a => !renderedOutputs.has(a.semanticId));
  for (const actor of unrenderedOutputs) {
    const changeInd = getChangeIndicator(actor.semanticId, state.nodeChangeStatus);
    const inFlows = incoming.get(actor.semanticId) || [];
    const uniqueFlows = [...new Set(inFlows.map(f => f.flowName))];

    if (uniqueFlows.length > 0) {
      lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}│ ${ITALIC}${YELLOW}${uniqueFlows[0]}${RESET}`);
    }
    lines.push(`${BOX}  ${' '.repeat(baseIndent + 4)}└─▶ ${changeInd}[${actorColor}A${RESET}] ${actor.name}`);
  }
}
