/**
 * View Utilities - Shared utilities for view renderers
 *
 * @author andreas@siglochconsulting
 */

/**
 * Graph state type for view renderers
 */
export interface GraphState {
  nodes: Map<string, any>;
  edges: Map<string, any>;
}

/**
 * Get node type color for terminal display
 */
export function getNodeColor(nodeType: string): string {
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
  return colors[nodeType] || '\x1b[36m';
}

/**
 * Build occurrence map for spec view
 */
export function buildOccurrenceMap(state: GraphState, nestingEdgeTypes: string[]): any {
  const occurrenceMap = {
    byNode: new Map(),
    byPath: new Map(),
  };

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

    if (visitedPaths.has(current.path)) {
      continue;
    }
    visitedPaths.add(current.path);

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

    if (!isPrimary) {
      continue;
    }

    for (const edgeType of nestingEdgeTypes) {
      let children = Array.from(state.edges.values())
        .filter((e: any) => e.sourceId === current.nodeId && e.type === edgeType)
        .map((e: any) => state.nodes.get(e.targetId))
        .filter((n: any) => n);

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
 * Find child occurrences of a given path
 */
export function findChildOccurrences(parentPath: string, occurrenceMap: any): any[] {
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
 */
export function sortByFlowOrder(nodes: any[], state: GraphState): any[] {
  const nodeSet = new Set(nodes.map((n: any) => n.semanticId));

  const actors: any[] = [];
  const funcsFlows: any[] = [];

  for (const node of nodes) {
    if (node.type === 'ACTOR') {
      actors.push(node);
    } else {
      funcsFlows.push(node);
    }
  }

  const inputActors: any[] = [];
  const outputActors: any[] = [];

  for (const actor of actors) {
    const hasOutgoingIo = Array.from(state.edges.values()).some(
      (e: any) => e.type === 'io' && e.sourceId === actor.semanticId && nodeSet.has(e.targetId)
    );
    const hasIncomingIo = Array.from(state.edges.values()).some(
      (e: any) => e.type === 'io' && e.targetId === actor.semanticId && nodeSet.has(e.sourceId)
    );

    if (hasOutgoingIo && !hasIncomingIo) {
      inputActors.push(actor);
    } else if (hasIncomingIo && !hasOutgoingIo) {
      outputActors.push(actor);
    } else if (hasOutgoingIo) {
      inputActors.push(actor);
    } else {
      outputActors.push(actor);
    }
  }

  const sorted = topologicalSortByIo(funcsFlows, state, nodeSet);

  return [...inputActors, ...sorted, ...outputActors];
}

/**
 * Topological sort of nodes based on io edges
 */
export function topologicalSortByIo(nodes: any[], state: GraphState, nodeSet: Set<string>): any[] {
  if (nodes.length <= 1) return nodes;

  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.semanticId, 0);
    outEdges.set(node.semanticId, []);
  }

  for (const edge of state.edges.values()) {
    if (edge.type !== 'io') continue;

    const sourceInSet = nodeSet.has(edge.sourceId);
    const targetInSet = nodeSet.has(edge.targetId);

    if (sourceInSet && targetInSet) {
      const sourceNode = state.nodes.get(edge.sourceId);
      const targetNode = state.nodes.get(edge.targetId);

      if (
        sourceNode && targetNode &&
        ['FUNC', 'FLOW'].includes(sourceNode.type) &&
        ['FUNC', 'FLOW'].includes(targetNode.type)
      ) {
        inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
        outEdges.get(edge.sourceId)?.push(edge.targetId);
      }
    }
  }

  const queue: any[] = [];
  const result: any[] = [];
  const nodeMap = new Map(nodes.map((n: any) => [n.semanticId, n]));

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
 * Topological sort of FUNC nodes based on connections
 */
export function topologicalSortFuncs(
  funcs: Array<{ id: string; name: string; type: 'FUNC' }>,
  connections: Array<{ sourceId: string; targetId: string; flowName: string }>
): Array<{ id: string; name: string; type: 'FUNC' }> {
  if (funcs.length <= 1) return funcs;

  const funcIds = new Set(funcs.map(f => f.id));
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const func of funcs) {
    inDegree.set(func.id, 0);
    outEdges.set(func.id, []);
  }

  for (const conn of connections) {
    if (funcIds.has(conn.sourceId) && funcIds.has(conn.targetId)) {
      inDegree.set(conn.targetId, (inDegree.get(conn.targetId) || 0) + 1);
      outEdges.get(conn.sourceId)?.push(conn.targetId);
    }
  }

  const queue: typeof funcs = [];
  const result: typeof funcs = [];
  const funcMap = new Map(funcs.map(f => [f.id, f]));

  for (const func of funcs) {
    if ((inDegree.get(func.id) || 0) === 0) {
      queue.push(func);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const targetId of outEdges.get(current.id) || []) {
      const newDegree = (inDegree.get(targetId) || 1) - 1;
      inDegree.set(targetId, newDegree);
      if (newDegree === 0) {
        const target = funcMap.get(targetId);
        if (target) queue.push(target);
      }
    }
  }

  for (const func of funcs) {
    if (!result.includes(func)) {
      result.push(func);
    }
  }

  return result;
}
