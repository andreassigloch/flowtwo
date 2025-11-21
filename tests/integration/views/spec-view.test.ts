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
      (node) => graphState.nodes.set(node.semanticId, node)
    );

    // Compose edges (structural hierarchy)
    graphState.edges.set('e1', createEdge('e1', sys.semanticId, backend.semanticId, 'compose'));
    graphState.edges.set('e2', createEdge('e2', sys.semanticId, frontend.semanticId, 'compose'));
    graphState.edges.set('e3', createEdge('e3', sys.semanticId, database.semanticId, 'compose'));

    // Allocate edges (functions to modules)
    graphState.edges.set('e4', createEdge('e4', backend.semanticId, chatAPI.semanticId, 'allocate'));
    graphState.edges.set('e5', createEdge('e5', backend.semanticId, wsServer.semanticId, 'allocate'));
    graphState.edges.set('e6', createEdge('e6', backend.semanticId, neo4jService.semanticId, 'allocate'));
    graphState.edges.set('e7', createEdge('e7', backend.semanticId, userAuth.semanticId, 'allocate'));
    graphState.edges.set('e8', createEdge('e8', database.semanticId, neo4jService.semanticId, 'allocate')); // Neo4j used in 2 modules
    graphState.edges.set('e9', createEdge('e9', frontend.semanticId, userAuth.semanticId, 'allocate')); // UserAuth used in 2 modules

    // Satisfy edges (requirements)
    graphState.edges.set('e10', createEdge('e10', userAuth.semanticId, req1.semanticId, 'satisfy'));
    graphState.edges.set('e11', createEdge('e11', neo4jService.semanticId, req2.semanticId, 'satisfy'));

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    // Verify multi-occurrence tracking
    const neo4jOccurrences = occurrenceMap.byNode.get(neo4jService.semanticId)!;
    expect(neo4jOccurrences).toHaveLength(2); // Backend and Database
    expect(neo4jOccurrences[0].isPrimary).toBe(true);
    expect(neo4jOccurrences[1].isPrimary).toBe(false);

    const userAuthOccurrences = occurrenceMap.byNode.get(userAuth.semanticId)!;
    expect(userAuthOccurrences).toHaveLength(2); // Backend and Frontend
    expect(userAuthOccurrences[0].isPrimary).toBe(true);
    expect(userAuthOccurrences[1].isPrimary).toBe(false);

    // Verify requirements are nested under functions
    const req1Occurrences = occurrenceMap.byNode.get(req1.semanticId)!;
    expect(req1Occurrences).toHaveLength(1);
    expect(req1Occurrences[0].parentPath).toContain('UserAuth');

    const req2Occurrences = occurrenceMap.byNode.get(req2.semanticId)!;
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
    graphState.nodes.set(sys.semanticId, sys);

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    expect(occurrenceMap.byNode.size).toBe(1);
    const sysOcc = occurrenceMap.byNode.get(sys.semanticId)![0];
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
      graphState.nodes.set(node.semanticId, node)
    );

    graphState.edges.set('e1', createEdge('e1', sys.semanticId, uc.semanticId, 'compose'));
    graphState.edges.set('e2', createEdge('e2', uc.semanticId, fchain.semanticId, 'compose'));
    graphState.edges.set('e3', createEdge('e3', fchain.semanticId, func1.semanticId, 'compose'));
    graphState.edges.set('e4', createEdge('e4', fchain.semanticId, func2.semanticId, 'compose'));

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    // Verify depth progression
    expect(occurrenceMap.byNode.get(sys.semanticId)![0].depth).toBe(0);
    expect(occurrenceMap.byNode.get(uc.semanticId)![0].depth).toBe(1);
    expect(occurrenceMap.byNode.get(fchain.semanticId)![0].depth).toBe(2);
    expect(occurrenceMap.byNode.get(func1.semanticId)![0].depth).toBe(3);
    expect(occurrenceMap.byNode.get(func2.semanticId)![0].depth).toBe(3);

    // Verify path construction
    expect(occurrenceMap.byNode.get(func1.semanticId)![0].path).toBe(
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
      graphState.nodes.set(node.semanticId, node)
    );

    // Create minimal nesting structure
    graphState.edges.set('e1', createEdge('e1', sys.semanticId, uc.semanticId, 'compose'));
    graphState.edges.set('e2', createEdge('e2', uc.semanticId, actor.semanticId, 'compose'));
    graphState.edges.set('e3', createEdge('e3', uc.semanticId, fchain.semanticId, 'compose'));
    graphState.edges.set('e4', createEdge('e4', fchain.semanticId, func.semanticId, 'compose'));
    graphState.edges.set('e5', createEdge('e5', fchain.semanticId, flow.semanticId, 'compose'));
    graphState.edges.set('e6', createEdge('e6', func.semanticId, req.semanticId, 'satisfy'));
    graphState.edges.set('e7', createEdge('e7', sys.semanticId, mod.semanticId, 'compose'));
    graphState.edges.set('e8', createEdge('e8', mod.semanticId, func.semanticId, 'allocate'));
    graphState.edges.set('e9', createEdge('e9', sys.semanticId, schema.semanticId, 'compose'));

    // Note: TEST not included as it uses 'verify' edge (not a nesting edge)

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    // All node types should be present (except TEST which needs verify edge)
    expect(occurrenceMap.byNode.has(sys.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(uc.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(actor.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(fchain.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(func.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(flow.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(req.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(mod.semanticId)).toBe(true);
    expect(occurrenceMap.byNode.has(schema.semanticId)).toBe(true);

    // FUNC should appear twice (via compose and allocate)
    expect(occurrenceMap.byNode.get(func.semanticId)!).toHaveLength(2);
  });

  it('correctly identifies primary occurrence in complex graph', () => {
    // Create graph where a function is used in 3 different contexts
    const sys = createNode('sys-1', 'SYS', 'System');
    const modA = createNode('mod-a', 'MOD', 'ModuleA');
    const modB = createNode('mod-b', 'MOD', 'ModuleB');
    const modC = createNode('mod-c', 'MOD', 'ModuleC');
    const sharedFunc = createNode('shared', 'FUNC', 'SharedFunction');

    [sys, modA, modB, modC, sharedFunc].forEach((node) =>
      graphState.nodes.set(node.semanticId, node)
    );

    graphState.edges.set('e1', createEdge('e1', sys.semanticId, modA.semanticId, 'compose'));
    graphState.edges.set('e2', createEdge('e2', sys.semanticId, modB.semanticId, 'compose'));
    graphState.edges.set('e3', createEdge('e3', sys.semanticId, modC.semanticId, 'compose'));
    graphState.edges.set('e4', createEdge('e4', modA.semanticId, sharedFunc.semanticId, 'allocate'));
    graphState.edges.set('e5', createEdge('e5', modB.semanticId, sharedFunc.semanticId, 'allocate'));
    graphState.edges.set('e6', createEdge('e6', modC.semanticId, sharedFunc.semanticId, 'allocate'));

    const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
    const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

    const sharedOccurrences = occurrenceMap.byNode.get(sharedFunc.semanticId)!;
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
    uuid: id,
    semanticId: id,
    type: type as any,
    name: name,
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  type: string
): Edge {
  return {
    uuid: id,
    semanticId: id,
    sourceId,
    targetId,
    type: type as any,
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
  };
}
