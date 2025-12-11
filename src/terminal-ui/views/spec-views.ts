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
 * Render fchain view (dedicated function chain view)
 * Activity diagram with swimlanes, sequence numbers, and dataflows
 */
export function renderFchainView(state: GraphState, _viewConfig: any): string[] {
  const lines: string[] = [];

  // Find all FCHAIN nodes
  const fchainNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'FCHAIN');

  if (fchainNodes.length === 0) {
    lines.push('\x1b[90m(No FCHAIN nodes found - create function chains first)\x1b[0m');
    return lines;
  }

  // Render each FCHAIN as a separate activity diagram
  fchainNodes.forEach((fchain: any, idx: number) => {
    const fchainColor = getNodeColor('FCHAIN');
    const changeInd = getChangeIndicator(fchain.semanticId, state.nodeChangeStatus);

    // Header box
    lines.push('\x1b[1;36m╔═══════════════════════════════════════════════════════════╗\x1b[0m');
    lines.push(`\x1b[1;36m║\x1b[0m ${changeInd}[${fchainColor}FCHAIN\x1b[0m] ${fchain.name}`);
    if (fchain.descr) {
      lines.push(`\x1b[1;36m║\x1b[0m \x1b[90m${fchain.descr}\x1b[0m`);
    }
    lines.push('\x1b[1;36m╚═══════════════════════════════════════════════════════════╝\x1b[0m');
    lines.push('');

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

    // Identify input/output actors
    const inputActorIds = new Set<string>();
    const outputActorIds = new Set<string>();

    for (const conn of connections) {
      const sourceNode = state.nodes.get(conn.sourceId);
      const targetNode = state.nodes.get(conn.targetId);
      if (sourceNode?.type === 'ACTOR') inputActorIds.add(conn.sourceId);
      if (targetNode?.type === 'ACTOR') outputActorIds.add(conn.targetId);
    }

    // Sort functions by flow order
    const allNodes = [...funcs, ...actors, ...flows];
    const sortedNodes = sortByFlowOrder(allNodes, state);
    const sortedFuncs = sortedNodes.filter(n => n.type === 'FUNC');

    // Build swimlane structure
    const inputActors = actors.filter(a => inputActorIds.has(a.semanticId));
    const outputActors = actors.filter(a => outputActorIds.has(a.semanticId) && !inputActorIds.has(a.semanticId));
    // Note: bidirectional actors (both input and output) are included in inputActors

    // Render swimlane headers
    const swimlanes: string[] = [];
    if (inputActors.length > 0) {
      swimlanes.push(...inputActors.map(a => a.name));
    }
    swimlanes.push('System');
    if (outputActors.length > 0) {
      swimlanes.push(...outputActors.map(a => a.name));
    }

    // Calculate column widths
    const colWidth = 20;
    const totalWidth = swimlanes.length * (colWidth + 3);

    // Swimlane header row
    let headerRow = '\x1b[90m│\x1b[0m';
    for (const lane of swimlanes) {
      const padded = lane.substring(0, colWidth - 2).padStart((colWidth + lane.substring(0, colWidth - 2).length) / 2).padEnd(colWidth);
      headerRow += ` \x1b[1;36m${padded}\x1b[0m \x1b[90m│\x1b[0m`;
    }
    lines.push('\x1b[90m┌' + '─'.repeat(totalWidth) + '┐\x1b[0m');
    lines.push(headerRow);
    lines.push('\x1b[90m├' + ('─'.repeat(colWidth + 2) + '┼').repeat(swimlanes.length - 1) + '─'.repeat(colWidth + 2) + '┤\x1b[0m');

    // Render activity rows
    let seqNum = 1;

    // Input from actors
    for (const actor of inputActors) {
      const outFlows = connections.filter(c => c.sourceId === actor.semanticId);
      for (const flow of outFlows) {
        const row = renderActivityRow(swimlanes, actor.name, 'System', flow.flowName, colWidth, state, actor.semanticId);
        lines.push(row);
      }
    }

    // Functions in sequence
    for (let i = 0; i < sortedFuncs.length; i++) {
      const func = sortedFuncs[i];
      const funcColor = getNodeColor('FUNC');
      const changeInd = getChangeIndicator(func.semanticId, state.nodeChangeStatus);

      // Function execution row (in System lane)
      const funcRow = renderFunctionRow(swimlanes, 'System', `${seqNum}. ${func.name}`, colWidth, changeInd, funcColor);
      lines.push(funcRow);
      seqNum++;

      // Outgoing flows
      const outFlows = connections.filter(c => c.sourceId === func.semanticId);
      for (const flow of outFlows) {
        const targetNode = state.nodes.get(flow.targetId);
        if (targetNode) {
          const targetLane = targetNode.type === 'ACTOR' ? targetNode.name : 'System';
          const row = renderActivityRow(swimlanes, 'System', targetLane, flow.flowName, colWidth, state, null);
          lines.push(row);
        }
      }
    }

    lines.push('\x1b[90m└' + '─'.repeat(totalWidth) + '┘\x1b[0m');

    // Summary
    lines.push('');
    lines.push(`\x1b[90mFunctions: ${funcs.length} | Actors: ${actors.length} | Flows: ${flows.length} | Connections: ${connections.length}\x1b[0m`);

    if (idx < fchainNodes.length - 1) {
      lines.push('');
      lines.push('');
    }
  });

  return lines;
}

/**
 * Render a function execution row in swimlane
 */
function renderFunctionRow(
  swimlanes: string[],
  lane: string,
  funcName: string,
  colWidth: number,
  changeInd: string,
  funcColor: string
): string {
  let row = '\x1b[90m│\x1b[0m';
  for (const swimlane of swimlanes) {
    if (swimlane === lane) {
      // Pad accounting for ANSI codes
      const visibleLen = funcName.length + 4; // [F] + space + name
      const padding = Math.max(0, colWidth - visibleLen);
      row += ` ${changeInd}[${funcColor}F\x1b[0m] ${funcName.substring(0, colWidth - 5)}${' '.repeat(padding)} \x1b[90m│\x1b[0m`;
    } else {
      row += ' '.repeat(colWidth + 2) + '\x1b[90m│\x1b[0m';
    }
  }
  return row;
}

/**
 * Render an activity/flow row between swimlanes
 */
function renderActivityRow(
  swimlanes: string[],
  fromLane: string,
  toLane: string,
  flowName: string,
  colWidth: number,
  _state: GraphState,
  _actorId: string | null
): string {
  const fromIdx = swimlanes.indexOf(fromLane);
  const toIdx = swimlanes.indexOf(toLane);

  let row = '\x1b[90m│\x1b[0m';

  for (let i = 0; i < swimlanes.length; i++) {
    if (fromIdx === toIdx && i === fromIdx) {
      // Same lane - show flow label
      const label = `  ↓ ${flowName}`;
      row += ` \x1b[33m${label.substring(0, colWidth).padEnd(colWidth)}\x1b[0m \x1b[90m│\x1b[0m`;
    } else if (fromIdx < toIdx) {
      // Left to right flow
      if (i === fromIdx) {
        row += ' '.repeat(colWidth / 2) + '\x1b[33m─'.repeat(colWidth / 2 + 1) + '\x1b[0m\x1b[90m│\x1b[0m';
      } else if (i > fromIdx && i < toIdx) {
        row += '\x1b[33m─'.repeat(colWidth + 2) + '\x1b[0m\x1b[90m│\x1b[0m';
      } else if (i === toIdx) {
        const label = flowName.substring(0, colWidth / 2 - 2);
        row += `\x1b[33m──▶ ${label}${' '.repeat(Math.max(0, colWidth - label.length - 4))}\x1b[0m \x1b[90m│\x1b[0m`;
      } else {
        row += ' '.repeat(colWidth + 2) + '\x1b[90m│\x1b[0m';
      }
    } else if (fromIdx > toIdx) {
      // Right to left flow
      if (i === toIdx) {
        const label = flowName.substring(0, colWidth / 2 - 2);
        row += ` ${label} \x1b[33m◀──${'─'.repeat(colWidth / 2 - label.length)}\x1b[0m\x1b[90m│\x1b[0m`;
      } else if (i > toIdx && i < fromIdx) {
        row += '\x1b[33m─'.repeat(colWidth + 2) + '\x1b[0m\x1b[90m│\x1b[0m';
      } else if (i === fromIdx) {
        row += '\x1b[33m─'.repeat(colWidth / 2 + 1) + '\x1b[0m' + ' '.repeat(colWidth / 2 + 1) + '\x1b[90m│\x1b[0m';
      } else {
        row += ' '.repeat(colWidth + 2) + '\x1b[90m│\x1b[0m';
      }
    } else {
      row += ' '.repeat(colWidth + 2) + '\x1b[90m│\x1b[0m';
    }
  }

  return row;
}
