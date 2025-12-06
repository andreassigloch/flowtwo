/**
 * Unit Tests - Functional Network View Logic
 *
 * Tests the connection tracing, actor classification, and topological sorting
 * for the functional-network view.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GraphState, Node, Edge, NodeType, EdgeType } from '../../../src/shared/types/ontology.js';

// Helper functions to create test data
function createNode(semanticId: string, type: NodeType, name: string): Node {
  return {
    uuid: semanticId,
    semanticId,
    type,
    name,
    descr: `Description for ${name}`,
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createEdge(uuid: string, sourceId: string, targetId: string, type: EdgeType): Edge {
  return {
    uuid,
    type,
    sourceId,
    targetId,
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

/**
 * Trace connections through FLOW nodes (same logic as in graph-viewer.ts)
 * Pattern: Source -io-> FLOW -io-> Target
 */
function traceConnections(
  state: GraphState
): Array<{ sourceId: string; targetId: string; flowName: string }> {
  const flowNodes = Array.from(state.nodes.values()).filter(n => n.type === 'FLOW');
  const connections: Array<{ sourceId: string; targetId: string; flowName: string }> = [];

  for (const flowNode of flowNodes) {
    const incomingEdges = Array.from(state.edges.values()).filter(
      e => e.type === 'io' && e.targetId === flowNode.semanticId
    );
    const outgoingEdges = Array.from(state.edges.values()).filter(
      e => e.type === 'io' && e.sourceId === flowNode.semanticId
    );

    for (const inEdge of incomingEdges) {
      for (const outEdge of outgoingEdges) {
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

  return connections;
}

/**
 * Classify actors as input or output based on connection direction
 */
function classifyActors(
  actors: Node[],
  connections: Array<{ sourceId: string; targetId: string; flowName: string }>
): { inputActors: Node[]; outputActors: Node[] } {
  const inputActors: Node[] = [];
  const outputActors: Node[] = [];

  for (const actor of actors) {
    const hasOutgoing = connections.some(c => c.sourceId === actor.semanticId);
    const hasIncoming = connections.some(c => c.targetId === actor.semanticId);

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

  return { inputActors, outputActors };
}

/**
 * Topological sort of FUNC nodes based on connections
 */
function topologicalSortFuncs(
  funcs: Node[],
  connections: Array<{ sourceId: string; targetId: string; flowName: string }>
): Node[] {
  if (funcs.length <= 1) return funcs;

  const funcIds = new Set(funcs.map(f => f.semanticId));
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const func of funcs) {
    inDegree.set(func.semanticId, 0);
    outEdges.set(func.semanticId, []);
  }

  for (const conn of connections) {
    if (funcIds.has(conn.sourceId) && funcIds.has(conn.targetId)) {
      inDegree.set(conn.targetId, (inDegree.get(conn.targetId) || 0) + 1);
      outEdges.get(conn.sourceId)?.push(conn.targetId);
    }
  }

  const queue: Node[] = [];
  const result: Node[] = [];
  const funcMap = new Map(funcs.map(f => [f.semanticId, f]));

  for (const func of funcs) {
    if ((inDegree.get(func.semanticId) || 0) === 0) {
      queue.push(func);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const targetId of outEdges.get(current.semanticId) || []) {
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

describe('Functional Network View', () => {
  let graphState: GraphState;

  beforeEach(() => {
    graphState = {
      workspaceId: 'test-workspace',
      systemId: 'test-system',
      nodes: new Map(),
      edges: new Map(),
      ports: new Map(),
      version: 1,
      lastSavedVersion: 1,
      lastModified: new Date(),
    };
  });

  describe('Connection Tracing', () => {
    it('traces connections through FLOW nodes correctly', () => {
      // Setup: User -io-> OrderData -io-> ValidateInput
      const user = createNode('user-1', 'ACTOR', 'User');
      const orderData = createNode('flow-1', 'FLOW', 'OrderData');
      const validateInput = createNode('func-1', 'FUNC', 'ValidateInput');

      graphState.nodes.set(user.semanticId, user);
      graphState.nodes.set(orderData.semanticId, orderData);
      graphState.nodes.set(validateInput.semanticId, validateInput);

      graphState.edges.set('e1', createEdge('e1', user.semanticId, orderData.semanticId, 'io'));
      graphState.edges.set('e2', createEdge('e2', orderData.semanticId, validateInput.semanticId, 'io'));

      const connections = traceConnections(graphState);

      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual({
        sourceId: user.semanticId,
        targetId: validateInput.semanticId,
        flowName: 'OrderData',
      });
    });

    it('handles multiple sources through same FLOW', () => {
      // Setup: User -io-> SharedData -io-> Processor
      //        API  -io-> SharedData -io-> Processor
      const user = createNode('user-1', 'ACTOR', 'User');
      const api = createNode('api-1', 'ACTOR', 'API');
      const sharedData = createNode('flow-1', 'FLOW', 'SharedData');
      const processor = createNode('func-1', 'FUNC', 'Processor');

      graphState.nodes.set(user.semanticId, user);
      graphState.nodes.set(api.semanticId, api);
      graphState.nodes.set(sharedData.semanticId, sharedData);
      graphState.nodes.set(processor.semanticId, processor);

      graphState.edges.set('e1', createEdge('e1', user.semanticId, sharedData.semanticId, 'io'));
      graphState.edges.set('e2', createEdge('e2', api.semanticId, sharedData.semanticId, 'io'));
      graphState.edges.set('e3', createEdge('e3', sharedData.semanticId, processor.semanticId, 'io'));

      const connections = traceConnections(graphState);

      expect(connections).toHaveLength(2);
      expect(connections).toContainEqual({
        sourceId: user.semanticId,
        targetId: processor.semanticId,
        flowName: 'SharedData',
      });
      expect(connections).toContainEqual({
        sourceId: api.semanticId,
        targetId: processor.semanticId,
        flowName: 'SharedData',
      });
    });

    it('handles multiple targets through same FLOW (fan-out)', () => {
      // Setup: Func1 -io-> BroadcastData -io-> Func2
      //                                  -io-> Func3
      const func1 = createNode('func-1', 'FUNC', 'Producer');
      const broadcastData = createNode('flow-1', 'FLOW', 'BroadcastData');
      const func2 = createNode('func-2', 'FUNC', 'Consumer1');
      const func3 = createNode('func-3', 'FUNC', 'Consumer2');

      graphState.nodes.set(func1.semanticId, func1);
      graphState.nodes.set(broadcastData.semanticId, broadcastData);
      graphState.nodes.set(func2.semanticId, func2);
      graphState.nodes.set(func3.semanticId, func3);

      graphState.edges.set('e1', createEdge('e1', func1.semanticId, broadcastData.semanticId, 'io'));
      graphState.edges.set('e2', createEdge('e2', broadcastData.semanticId, func2.semanticId, 'io'));
      graphState.edges.set('e3', createEdge('e3', broadcastData.semanticId, func3.semanticId, 'io'));

      const connections = traceConnections(graphState);

      expect(connections).toHaveLength(2);
      expect(connections).toContainEqual({
        sourceId: func1.semanticId,
        targetId: func2.semanticId,
        flowName: 'BroadcastData',
      });
      expect(connections).toContainEqual({
        sourceId: func1.semanticId,
        targetId: func3.semanticId,
        flowName: 'BroadcastData',
      });
    });

    it('ignores non-io edges', () => {
      const func1 = createNode('func-1', 'FUNC', 'Func1');
      const flow1 = createNode('flow-1', 'FLOW', 'Flow1');
      const func2 = createNode('func-2', 'FUNC', 'Func2');

      graphState.nodes.set(func1.semanticId, func1);
      graphState.nodes.set(flow1.semanticId, flow1);
      graphState.nodes.set(func2.semanticId, func2);

      // compose edge instead of io - should not create connection
      graphState.edges.set('e1', createEdge('e1', func1.semanticId, flow1.semanticId, 'compose'));
      graphState.edges.set('e2', createEdge('e2', flow1.semanticId, func2.semanticId, 'io'));

      const connections = traceConnections(graphState);

      expect(connections).toHaveLength(0);
    });
  });

  describe('Actor Classification', () => {
    it('classifies actors with only outgoing as input', () => {
      const user = createNode('user-1', 'ACTOR', 'User');
      const admin = createNode('admin-1', 'ACTOR', 'Admin');

      const connections = [
        { sourceId: 'user-1', targetId: 'func-1', flowName: 'Data' },
      ];

      const { inputActors, outputActors } = classifyActors([user, admin], connections);

      expect(inputActors).toContainEqual(user);
      expect(outputActors).toContainEqual(admin); // no connections = output
    });

    it('classifies actors with only incoming as output', () => {
      const reporter = createNode('reporter-1', 'ACTOR', 'Reporter');

      const connections = [
        { sourceId: 'func-1', targetId: 'reporter-1', flowName: 'Report' },
      ];

      const { inputActors, outputActors } = classifyActors([reporter], connections);

      expect(inputActors).toHaveLength(0);
      expect(outputActors).toContainEqual(reporter);
    });

    it('classifies bidirectional actors as input', () => {
      const gateway = createNode('gateway-1', 'ACTOR', 'Gateway');

      const connections = [
        { sourceId: 'gateway-1', targetId: 'func-1', flowName: 'Request' },
        { sourceId: 'func-1', targetId: 'gateway-1', flowName: 'Response' },
      ];

      const { inputActors, outputActors } = classifyActors([gateway], connections);

      expect(inputActors).toContainEqual(gateway);
      expect(outputActors).toHaveLength(0);
    });
  });

  describe('Topological Sort', () => {
    it('sorts functions in dependency order', () => {
      const func1 = createNode('func-1', 'FUNC', 'First');
      const func2 = createNode('func-2', 'FUNC', 'Second');
      const func3 = createNode('func-3', 'FUNC', 'Third');

      const connections = [
        { sourceId: 'func-1', targetId: 'func-2', flowName: 'A' },
        { sourceId: 'func-2', targetId: 'func-3', flowName: 'B' },
      ];

      const sorted = topologicalSortFuncs([func3, func1, func2], connections);

      expect(sorted[0].semanticId).toBe('func-1');
      expect(sorted[1].semanticId).toBe('func-2');
      expect(sorted[2].semanticId).toBe('func-3');
    });

    it('handles disconnected functions', () => {
      const func1 = createNode('func-1', 'FUNC', 'Connected1');
      const func2 = createNode('func-2', 'FUNC', 'Connected2');
      const func3 = createNode('func-3', 'FUNC', 'Isolated');

      const connections = [
        { sourceId: 'func-1', targetId: 'func-2', flowName: 'A' },
      ];

      const sorted = topologicalSortFuncs([func3, func1, func2], connections);

      // func1 before func2, func3 can be anywhere
      const idx1 = sorted.findIndex(f => f.semanticId === 'func-1');
      const idx2 = sorted.findIndex(f => f.semanticId === 'func-2');
      expect(idx1).toBeLessThan(idx2);
      expect(sorted).toHaveLength(3);
    });

    it('handles cycles gracefully', () => {
      const func1 = createNode('func-1', 'FUNC', 'CycleA');
      const func2 = createNode('func-2', 'FUNC', 'CycleB');

      const connections = [
        { sourceId: 'func-1', targetId: 'func-2', flowName: 'A' },
        { sourceId: 'func-2', targetId: 'func-1', flowName: 'B' },
      ];

      // Should not throw, should return all nodes
      const sorted = topologicalSortFuncs([func1, func2], connections);

      expect(sorted).toHaveLength(2);
      expect(sorted).toContainEqual(func1);
      expect(sorted).toContainEqual(func2);
    });

    it('returns single function unchanged', () => {
      const func1 = createNode('func-1', 'FUNC', 'Single');

      const sorted = topologicalSortFuncs([func1], []);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toEqual(func1);
    });

    it('returns empty array for no functions', () => {
      const sorted = topologicalSortFuncs([], []);

      expect(sorted).toHaveLength(0);
    });
  });

  describe('Integration - Full Pipeline', () => {
    it('processes a complete functional network', () => {
      // Setup: User -> ValidateInput -> ProcessOrder -> GenerateReport -> Admin
      const user = createNode('user-1', 'ACTOR', 'User');
      const admin = createNode('admin-1', 'ACTOR', 'Admin');
      const validate = createNode('func-1', 'FUNC', 'ValidateInput');
      const process = createNode('func-2', 'FUNC', 'ProcessOrder');
      const report = createNode('func-3', 'FUNC', 'GenerateReport');

      const orderData = createNode('flow-1', 'FLOW', 'OrderData');
      const validOrder = createNode('flow-2', 'FLOW', 'ValidOrder');
      const orderResult = createNode('flow-3', 'FLOW', 'OrderResult');
      const reportData = createNode('flow-4', 'FLOW', 'ReportData');

      // Add all nodes
      [user, admin, validate, process, report, orderData, validOrder, orderResult, reportData]
        .forEach(n => graphState.nodes.set(n.semanticId, n));

      // Add io edges
      graphState.edges.set('e1', createEdge('e1', user.semanticId, orderData.semanticId, 'io'));
      graphState.edges.set('e2', createEdge('e2', orderData.semanticId, validate.semanticId, 'io'));
      graphState.edges.set('e3', createEdge('e3', validate.semanticId, validOrder.semanticId, 'io'));
      graphState.edges.set('e4', createEdge('e4', validOrder.semanticId, process.semanticId, 'io'));
      graphState.edges.set('e5', createEdge('e5', process.semanticId, orderResult.semanticId, 'io'));
      graphState.edges.set('e6', createEdge('e6', orderResult.semanticId, report.semanticId, 'io'));
      graphState.edges.set('e7', createEdge('e7', report.semanticId, reportData.semanticId, 'io'));
      graphState.edges.set('e8', createEdge('e8', reportData.semanticId, admin.semanticId, 'io'));

      // Trace connections
      const connections = traceConnections(graphState);

      expect(connections).toHaveLength(4);
      expect(connections).toContainEqual({ sourceId: 'user-1', targetId: 'func-1', flowName: 'OrderData' });
      expect(connections).toContainEqual({ sourceId: 'func-1', targetId: 'func-2', flowName: 'ValidOrder' });
      expect(connections).toContainEqual({ sourceId: 'func-2', targetId: 'func-3', flowName: 'OrderResult' });
      expect(connections).toContainEqual({ sourceId: 'func-3', targetId: 'admin-1', flowName: 'ReportData' });

      // Classify actors
      const { inputActors, outputActors } = classifyActors([user, admin], connections);

      expect(inputActors).toHaveLength(1);
      expect(inputActors[0].name).toBe('User');
      expect(outputActors).toHaveLength(1);
      expect(outputActors[0].name).toBe('Admin');

      // Sort functions
      const sorted = topologicalSortFuncs([report, validate, process], connections);

      expect(sorted[0].name).toBe('ValidateInput');
      expect(sorted[1].name).toBe('ProcessOrder');
      expect(sorted[2].name).toBe('GenerateReport');
    });
  });
});
