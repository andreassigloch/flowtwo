/**
 * Mermaid Views - Architecture and Functional Network view renderers
 *
 * Uses Mermaid diagrams with inline image rendering for supported terminals.
 *
 * @author andreas@siglochconsulting
 */

import type { GraphState } from './view-utils.js';
import { topologicalSortFuncs } from './view-utils.js';
import {
  detectTerminalCapabilities,
  renderMermaidAsImage,
} from '../terminal-graphics.js';

/**
 * Render architecture view
 */
export async function renderArchitectureView(state: GraphState, _viewConfig: any): Promise<string[]> {
  const sysNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'SYS');

  if (sysNodes.length === 0) {
    return ['\x1b[90m(No SYS node found - create a System node first)\x1b[0m'];
  }

  const topLevelFuncs: Array<{ id: string; name: string; type: string }> = [];

  for (const sysNode of sysNodes as any[]) {
    const composeEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === sysNode.semanticId && e.type === 'compose'
    );

    for (const edge of composeEdges as any[]) {
      const child = state.nodes.get(edge.targetId);
      if (child && child.type === 'FUNC') {
        topLevelFuncs.push({ id: child.semanticId, name: child.name, type: 'FUNC' });
      }
    }
  }

  if (topLevelFuncs.length === 0) {
    return ['\x1b[90m(No top-level FUNC nodes found - create FUNCs composed by SYS)\x1b[0m'];
  }

  const funcIds = new Set(topLevelFuncs.map(n => n.id));
  const funcById = new Map(topLevelFuncs.map(f => [f.id, f]));
  const connections: Array<{ sourceFunc: string; targetFunc: string; flowName: string }> = [];

  const flowNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'FLOW');

  for (const flowNode of flowNodes as any[]) {
    const incomingFromFuncs = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.targetId === flowNode.semanticId && funcIds.has(e.sourceId)
    );
    const outgoingToFuncs = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.sourceId === flowNode.semanticId && funcIds.has(e.targetId)
    );

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

  const sysName = (sysNodes[0] as any).name || 'System';

  return renderArchitectureMermaid(sysName, topLevelFuncs, connections, funcById);
}

/**
 * Render architecture as Mermaid flowchart + text fallback
 */
async function renderArchitectureMermaid(
  sysName: string,
  funcs: Array<{ id: string; name: string }>,
  connections: Array<{ sourceFunc: string; targetFunc: string; flowName: string }>,
  funcById: Map<string, { id: string; name: string }>
): Promise<string[]> {
  const lines: string[] = [];

  lines.push('\x1b[1;36m\u250c\u2500 LOGICAL ARCHITECTURE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1b[0m');
  lines.push(`\x1b[1;36m\u2502\x1b[0m  System: \x1b[35m${sysName}\x1b[0m`);
  lines.push(`\x1b[1;36m\u2502\x1b[0m  Functions: ${funcs.length} | Flows: ${connections.length}`);

  const capabilities = detectTerminalCapabilities();
  if (capabilities.supportsImages) {
    lines.push(`\x1b[1;36m\u2502\x1b[0m  Terminal: \x1b[32m${capabilities.termProgram} (graphics: ${capabilities.protocol})\x1b[0m`);
  }

  lines.push('\x1b[1;36m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1b[0m');
  lines.push('');

  const mermaidLines: string[] = [];
  mermaidLines.push('graph LR');

  const idMap = new Map<string, string>();
  funcs.forEach((func, idx) => {
    const shortId = `F${idx + 1}`;
    idMap.set(func.id, shortId);
    mermaidLines.push(`    ${shortId}[${func.name}]`);
  });

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

  try {
    const imageOutput = await renderMermaidAsImage(mermaidCode, 'architecture');
    if (imageOutput) {
      lines.push('\x1b[90m[Rendered as inline image]\x1b[0m');
      lines.push('');
      lines.push(imageOutput);
      lines.push('\x1b[90m\u2500\u2500\u2500 Text View \u2500\u2500\u2500\x1b[0m');
    }
  } catch {
    // Image rendering failed - fall back to text
  }

  lines.push('\x1b[90m```mermaid\x1b[0m');
  lines.push(mermaidCode);
  lines.push('\x1b[90m```\x1b[0m');
  lines.push('');

  lines.push('\x1b[90m\u2500\u2500\u2500 Data Flows \u2500\u2500\u2500\x1b[0m');
  if (connections.length === 0) {
    lines.push('  \x1b[90m(No FLOW connections between top-level functions)\x1b[0m');
  } else {
    for (const conn of connections) {
      const srcName = funcById.get(conn.sourceFunc)?.name || '?';
      const tgtName = funcById.get(conn.targetFunc)?.name || '?';
      lines.push(`  \x1b[36m${srcName}\x1b[0m \x1b[33m\u2500\u2500${conn.flowName}\u2500\u2500\u25b6\x1b[0m \x1b[36m${tgtName}\x1b[0m`);
    }
  }

  const connectedFuncs = new Set([
    ...connections.map(c => c.sourceFunc),
    ...connections.map(c => c.targetFunc),
  ]);
  const isolatedFuncs = funcs.filter(f => !connectedFuncs.has(f.id));
  if (isolatedFuncs.length > 0) {
    lines.push('');
    lines.push('\x1b[90m\u2500\u2500\u2500 Standalone Functions \u2500\u2500\u2500\x1b[0m');
    for (const func of isolatedFuncs) {
      lines.push(`  \x1b[36m${func.name}\x1b[0m`);
    }
  }

  return lines;
}

/**
 * Render functional network view
 */
export async function renderFunctionalNetworkView(state: GraphState, _viewConfig: any): Promise<string[]> {
  const funcNodes: Array<{ id: string; name: string; type: 'FUNC' }> = [];
  const actorNodes: Array<{ id: string; name: string; type: 'ACTOR' }> = [];

  for (const node of state.nodes.values()) {
    if (node.type === 'FUNC') {
      funcNodes.push({ id: node.semanticId, name: node.name, type: 'FUNC' });
    } else if (node.type === 'ACTOR') {
      actorNodes.push({ id: node.semanticId, name: node.name, type: 'ACTOR' });
    }
  }

  if (funcNodes.length === 0 && actorNodes.length === 0) {
    return ['\x1b[90m(No FUNC or ACTOR nodes found)\x1b[0m'];
  }

  const flowNodes = Array.from(state.nodes.values()).filter((n: any) => n.type === 'FLOW');
  const connections: Array<{ sourceId: string; targetId: string; flowName: string }> = [];

  for (const flowNode of flowNodes as any[]) {
    const incomingEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.targetId === flowNode.semanticId
    );
    const outgoingEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.type === 'io' && e.sourceId === flowNode.semanticId
    );

    for (const inEdge of incomingEdges as any[]) {
      for (const outEdge of outgoingEdges as any[]) {
        const sourceNode = state.nodes.get(inEdge.sourceId);
        const targetNode = state.nodes.get(outEdge.targetId);

        if (sourceNode && targetNode &&
            ['FUNC', 'ACTOR'].includes(sourceNode.type) &&
            ['FUNC', 'ACTOR'].includes(targetNode.type)) {
          connections.push({
            sourceId: inEdge.sourceId,
            targetId: outEdge.targetId,
            flowName: flowNode.name,
          });
        }
      }
    }
  }

  const inputActors: typeof actorNodes = [];
  const outputActors: typeof actorNodes = [];

  for (const actor of actorNodes) {
    const hasOutgoing = connections.some(c => c.sourceId === actor.id);
    const hasIncoming = connections.some(c => c.targetId === actor.id);

    if (hasOutgoing && !hasIncoming) {
      inputActors.push(actor);
    } else if (hasIncoming && !hasOutgoing) {
      outputActors.push(actor);
    } else if (hasOutgoing) {
      inputActors.push(actor);
    } else {
      outputActors.push(actor);
    }
  }

  const sortedFuncs = topologicalSortFuncs(funcNodes, connections);

  const allNodes = new Map<string, { id: string; name: string; type: string }>();
  for (const f of funcNodes) allNodes.set(f.id, f);
  for (const a of actorNodes) allNodes.set(a.id, a);

  return renderFunctionalNetworkMermaid(inputActors, outputActors, sortedFuncs, connections, allNodes);
}

/**
 * Render functional network as Mermaid + text
 */
async function renderFunctionalNetworkMermaid(
  inputActors: Array<{ id: string; name: string; type: string }>,
  outputActors: Array<{ id: string; name: string; type: string }>,
  funcs: Array<{ id: string; name: string; type: string }>,
  connections: Array<{ sourceId: string; targetId: string; flowName: string }>,
  allNodes: Map<string, { id: string; name: string; type: string }>
): Promise<string[]> {
  const lines: string[] = [];

  lines.push('\x1b[1;36m\u250c\u2500 FUNCTIONAL NETWORK \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1b[0m');
  lines.push(`\x1b[1;36m\u2502\x1b[0m  Functions: ${funcs.length} | Actors: ${inputActors.length + outputActors.length} | Flows: ${connections.length}`);

  const capabilities = detectTerminalCapabilities();
  if (capabilities.supportsImages) {
    lines.push(`\x1b[1;36m\u2502\x1b[0m  Terminal: \x1b[32m${capabilities.termProgram} (graphics: ${capabilities.protocol})\x1b[0m`);
  }

  lines.push('\x1b[1;36m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1b[0m');
  lines.push('');

  const mermaidLines: string[] = [];
  mermaidLines.push('flowchart LR');

  const idMap = new Map<string, string>();
  let idCounter = 1;

  if (inputActors.length > 0) {
    mermaidLines.push('    subgraph Inputs');
    for (const actor of inputActors) {
      const shortId = `A${idCounter++}`;
      idMap.set(actor.id, shortId);
      mermaidLines.push(`        ${shortId}([${actor.name}])`);
    }
    mermaidLines.push('    end');
  }

  for (const func of funcs) {
    const shortId = `F${idCounter++}`;
    idMap.set(func.id, shortId);
    mermaidLines.push(`    ${shortId}[${func.name}]`);
  }

  if (outputActors.length > 0) {
    mermaidLines.push('    subgraph Outputs');
    for (const actor of outputActors) {
      const shortId = `A${idCounter++}`;
      idMap.set(actor.id, shortId);
      mermaidLines.push(`        ${shortId}([${actor.name}])`);
    }
    mermaidLines.push('    end');
  }

  if (connections.length > 0) {
    mermaidLines.push('');
    for (const conn of connections) {
      const srcId = idMap.get(conn.sourceId);
      const tgtId = idMap.get(conn.targetId);
      if (srcId && tgtId) {
        mermaidLines.push(`    ${srcId} -->|${conn.flowName}| ${tgtId}`);
      }
    }
  }

  const mermaidCode = mermaidLines.join('\n');

  try {
    const imageOutput = await renderMermaidAsImage(mermaidCode, 'functional-network');
    if (imageOutput) {
      lines.push('\x1b[90m[Rendered as inline image]\x1b[0m');
      lines.push('');
      lines.push(imageOutput);
      lines.push('\x1b[90m\u2500\u2500\u2500 Text View \u2500\u2500\u2500\x1b[0m');
    }
  } catch {
    // Image rendering failed
  }

  lines.push('\x1b[90m```mermaid\x1b[0m');
  lines.push(mermaidCode);
  lines.push('\x1b[90m```\x1b[0m');
  lines.push('');

  lines.push('\x1b[90m\u2500\u2500\u2500 Data Flows \u2500\u2500\u2500\x1b[0m');
  if (connections.length === 0) {
    lines.push('  \x1b[90m(No connections found)\x1b[0m');
  } else {
    for (const conn of connections) {
      const srcNode = allNodes.get(conn.sourceId);
      const tgtNode = allNodes.get(conn.targetId);
      const srcName = srcNode?.name || '?';
      const tgtName = tgtNode?.name || '?';
      const srcColor = srcNode?.type === 'ACTOR' ? '\x1b[36m' : '\x1b[32m';
      const tgtColor = tgtNode?.type === 'ACTOR' ? '\x1b[36m' : '\x1b[32m';
      lines.push(`  ${srcColor}${srcName}\x1b[0m \x1b[33m\u2500\u2500${conn.flowName}\u2500\u2500\u25b6\x1b[0m ${tgtColor}${tgtName}\x1b[0m`);
    }
  }

  const connectedIds = new Set([
    ...connections.map(c => c.sourceId),
    ...connections.map(c => c.targetId),
  ]);
  const isolatedFuncs = funcs.filter(f => !connectedIds.has(f.id));
  const isolatedActors = [...inputActors, ...outputActors].filter(a => !connectedIds.has(a.id));

  if (isolatedFuncs.length > 0 || isolatedActors.length > 0) {
    lines.push('');
    lines.push('\x1b[90m\u2500\u2500\u2500 Isolated (No Connections) \u2500\u2500\u2500\x1b[0m');
    for (const func of isolatedFuncs) {
      lines.push(`  \x1b[32m[FUNC] ${func.name}\x1b[0m`);
    }
    for (const actor of isolatedActors) {
      lines.push(`  \x1b[36m[ACTOR] ${actor.name}\x1b[0m`);
    }
  }

  return lines;
}
