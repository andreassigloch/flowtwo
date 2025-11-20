/**
 * Integration Tests - Spec View Rendering
 *
 * Tests end-to-end spec view rendering with realistic graph structures
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ViewFilter } from '../../../src/graph-engine/view-filter.js';
import { GraphState, Node, Edge } from '../../../src/shared/types/ontology.js';
import { DEFAULT_VIEW_CONFIGS } from '../../../src/shared/types/view.js';

describe('Spec View - Integration Tests', () => {
  let graphState: GraphState;

  beforeEach(() => {
    graphState = {
      nodes: new Map(),
      edges: new Map(),
      ports: new Map(),
    };
  });

  it('renders complete system specification with multiple contexts', () => {
    // Build realistic graph structure
    const sys = createNode('sys-1', 'SYS', 'GraphEngine');
    const backend = createNode('backend-1', 'MOD', 'Backend');
    const frontend = createNode('frontend-1', 'MOD', 'Frontend');
    const database = createNode('database-1', 'MOD', 'Database');

    const chatAPI = createNode('chat-api', 'FUNC', 'ChatAPI');
    const wsServer = createNode('ws-server', 'FUNC', 'WebSocketServer');
    const neo4jService = createNode('neo4j', 'FUNC', 'Neo4jService');
    const userAuth = createNode('auth', 'FUNC', 'UserAuth');

    const req1 = createNode('req-1', 'REQ', 'REQ-001: Authentication');
    const req2 = createNode('req-2', 'REQ', 'REQ-002: Data Persistence');

    // Add nodes
    [sys, backend, frontend, database, chatAPI, wsServer, neo4jService, userAuth, req1, req2].forEach(
      (node) => graphState.nodes.set(node.id, node)
    );

    // Compose edges (structural hierarchy)
    graphState.edges.set('e1', createEdge('e1', sys.id, backend.id, 'compose'));
    graphState.edges.set('e2', createEdge('e2', sys.id, frontend.id, 'compose'));
    graphState.edges.set('e3', createEdge('e3', sys.id, database.id, 'compose'));

    // Allocate edges (functions to modules)
    graphState.edges.set('e4', createEdge('e4', backend.id, chatAPI.id, 'allocate'));
    graphState.edges.set('e5', createEdge('e5', backend.id, wsServer.id, 'allocate'));
    graphState.edges.set('e6', createEdge('e6', backend.id, neo4jService.id, 'allocate'));
    graphState.edges.set('e7', createEdge('e7', backend.id, userAuth.id, 'allocate'));
    graphState.edges.set('e8', createEdge('e8', database.id, neo4jService.id, 'allocate')); // Neo4j used in 2 modules
    graphState.edges.set('e9', createEdge('e9', frontend.id, userAuth.id, 'allocate')); // UserAuth used in 2 modules

    // Satisfy edges (requirements)
    graphState.edges.set('e10', createEdge('e10', userAuth.id, req1.id, 'satisfy'));
    graphState.edges.set('e11', createEdge('e11', neo4jService.id, req2.id, 'satisfy'));

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    // Verify multi-occurrence tracking
    const neo4jOccurrences = occurrenceMap.byNode.get(neo4jService.id)!;
    expect(neo4jOccurrences).toHaveLength(2); // Backend and Database
    expect(neo4jOccurrences[0].isPrimary).toBe(true);
    expect(neo4jOccurrences[1].isPrimary).toBe(false);

    const userAuthOccurrences = occurrenceMap.byNode.get(userAuth.id)!;
    expect(userAuthOccurrences).toHaveLength(2); // Backend and Frontend
    expect(userAuthOccurrences[0].isPrimary).toBe(true);
    expect(userAuthOccurrences[1].isPrimary).toBe(false);

    // Verify requirements are nested under functions
    const req1Occurrences = occurrenceMap.byNode.get(req1.id)!;
    expect(req1Occurrences).toHaveLength(1);
    expect(req1Occurrences[0].parentPath).toContain('UserAuth');

    const req2Occurrences = occurrenceMap.byNode.get(req2.id)!;
    expect(req2Occurrences).toHaveLength(1);
    expect(req2Occurrences[0].parentPath).toContain('Neo4jService');
  });

  it('handles empty graph gracefully', () => {
    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    expect(occurrenceMap.byNode.size).toBe(0);
    expect(occurrenceMap.byPath.size).toBe(0);
  });

  it('handles single node graph', () => {
    const sys = createNode('sys-1', 'SYS', 'GraphEngine');
    graphState.nodes.set(sys.id, sys);

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    expect(occurrenceMap.byNode.size).toBe(1);
    const sysOcc = occurrenceMap.byNode.get(sys.id)![0];
    expect(sysOcc.isPrimary).toBe(true);
    expect(sysOcc.depth).toBe(0);
    expect(sysOcc.path).toBe('GraphEngine');
  });

  it('handles deep nesting hierarchy', () => {
    const sys = createNode('sys-1', 'SYS', 'GraphEngine');
    const uc = createNode('uc-1', 'UC', 'ChatUseCase');
    const fchain = createNode('fchain-1', 'FCHAIN', 'MessageFlow');
    const func1 = createNode('func-1', 'FUNC', 'SendMessage');
    const func2 = createNode('func-2', 'FUNC', 'ValidateMessage');

    [sys, uc, fchain, func1, func2].forEach((node) =>
      graphState.nodes.set(node.id, node)
    );

    graphState.edges.set('e1', createEdge('e1', sys.id, uc.id, 'compose'));
    graphState.edges.set('e2', createEdge('e2', uc.id, fchain.id, 'compose'));
    graphState.edges.set('e3', createEdge('e3', fchain.id, func1.id, 'compose'));
    graphState.edges.set('e4', createEdge('e4', fchain.id, func2.id, 'compose'));

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    // Verify depth progression
    expect(occurrenceMap.byNode.get(sys.id)![0].depth).toBe(0);
    expect(occurrenceMap.byNode.get(uc.id)![0].depth).toBe(1);
    expect(occurrenceMap.byNode.get(fchain.id)![0].depth).toBe(2);
    expect(occurrenceMap.byNode.get(func1.id)![0].depth).toBe(3);
    expect(occurrenceMap.byNode.get(func2.id)![0].depth).toBe(3);

    // Verify path construction
    expect(occurrenceMap.byNode.get(func1.id)![0].path).toBe(
      'GraphEngine/ChatUseCase/MessageFlow/SendMessage'
    );
  });

  it('handles all node types', () => {
    const sys = createNode('sys-1', 'SYS', 'System');
    const uc = createNode('uc-1', 'UC', 'UseCase');
    const actor = createNode('actor-1', 'ACTOR', 'User');
    const fchain = createNode('fchain-1', 'FCHAIN', 'Flow');
    const func = createNode('func-1', 'FUNC', 'Function');
    const flow = createNode('flow-1', 'FLOW', 'DataFlow');
    const req = createNode('req-1', 'REQ', 'Requirement');
    const test = createNode('test-1', 'TEST', 'Test');
    const mod = createNode('mod-1', 'MOD', 'Module');
    const schema = createNode('schema-1', 'SCHEMA', 'Schema');

    [sys, uc, actor, fchain, func, flow, req, test, mod, schema].forEach((node) =>
      graphState.nodes.set(node.id, node)
    );

    // Create minimal nesting structure
    graphState.edges.set('e1', createEdge('e1', sys.id, uc.id, 'compose'));
    graphState.edges.set('e2', createEdge('e2', uc.id, actor.id, 'compose'));
    graphState.edges.set('e3', createEdge('e3', uc.id, fchain.id, 'compose'));
    graphState.edges.set('e4', createEdge('e4', fchain.id, func.id, 'compose'));
    graphState.edges.set('e5', createEdge('e5', fchain.id, flow.id, 'compose'));
    graphState.edges.set('e6', createEdge('e6', func.id, req.id, 'satisfy'));
    graphState.edges.set('e7', createEdge('e7', sys.id, mod.id, 'compose'));
    graphState.edges.set('e8', createEdge('e8', mod.id, func.id, 'allocate'));
    graphState.edges.set('e9', createEdge('e9', sys.id, schema.id, 'compose'));

    // Note: TEST not included as it uses 'verify' edge (not a nesting edge)

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    // All node types should be present (except TEST which needs verify edge)
    expect(occurrenceMap.byNode.has(sys.id)).toBe(true);
    expect(occurrenceMap.byNode.has(uc.id)).toBe(true);
    expect(occurrenceMap.byNode.has(actor.id)).toBe(true);
    expect(occurrenceMap.byNode.has(fchain.id)).toBe(true);
    expect(occurrenceMap.byNode.has(func.id)).toBe(true);
    expect(occurrenceMap.byNode.has(flow.id)).toBe(true);
    expect(occurrenceMap.byNode.has(req.id)).toBe(true);
    expect(occurrenceMap.byNode.has(mod.id)).toBe(true);
    expect(occurrenceMap.byNode.has(schema.id)).toBe(true);

    // FUNC should appear twice (via compose and allocate)
    expect(occurrenceMap.byNode.get(func.id)!).toHaveLength(2);
  });

  it('correctly identifies primary occurrence in complex graph', () => {
    // Create graph where a function is used in 3 different contexts
    const sys = createNode('sys-1', 'SYS', 'System');
    const modA = createNode('mod-a', 'MOD', 'ModuleA');
    const modB = createNode('mod-b', 'MOD', 'ModuleB');
    const modC = createNode('mod-c', 'MOD', 'ModuleC');
    const sharedFunc = createNode('shared', 'FUNC', 'SharedFunction');

    [sys, modA, modB, modC, sharedFunc].forEach((node) =>
      graphState.nodes.set(node.id, node)
    );

    graphState.edges.set('e1', createEdge('e1', sys.id, modA.id, 'compose'));
    graphState.edges.set('e2', createEdge('e2', sys.id, modB.id, 'compose'));
    graphState.edges.set('e3', createEdge('e3', sys.id, modC.id, 'compose'));
    graphState.edges.set('e4', createEdge('e4', modA.id, sharedFunc.id, 'allocate'));
    graphState.edges.set('e5', createEdge('e5', modB.id, sharedFunc.id, 'allocate'));
    graphState.edges.set('e6', createEdge('e6', modC.id, sharedFunc.id, 'allocate'));

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    const sharedOccurrences = occurrenceMap.byNode.get(sharedFunc.id)!;
    expect(sharedOccurrences).toHaveLength(3);

    // Only first should be primary
    expect(sharedOccurrences[0].isPrimary).toBe(true);
    expect(sharedOccurrences[1].isPrimary).toBe(false);
    expect(sharedOccurrences[2].isPrimary).toBe(false);

    // All should have different paths
    expect(sharedOccurrences[0].path).toBe('System/ModuleA/SharedFunction');
    expect(sharedOccurrences[1].path).toBe('System/ModuleB/SharedFunction');
    expect(sharedOccurrences[2].path).toBe('System/ModuleC/SharedFunction');
  });
});

// Helper functions

function createNode(id: string, type: string, name: string): Node {
  return {
    id,
    semanticId: id,
    type: type as any,
    category: 'definition',
    properties: {
      Name: name,
      Description: '',
    },
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  type: string
): Edge {
  return {
    id,
    semanticId: id,
    sourceId,
    targetId,
    type: type as any,
    properties: {},
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  };
}
