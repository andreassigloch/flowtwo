/**
 * Graph Engine - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate Graph Engine orchestration
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import { GraphEngine } from '../../../src/graph-engine/graph-engine.js';
import { GraphState, Node, Edge } from '../../../src/shared/types/ontology.js';

describe('GraphEngine', () => {
  describe('computeLayout', () => {
    it('should compute hierarchy layout', async () => {
      const graph = createHierarchyGraph();
      const engine = new GraphEngine();

      const result = await engine.computeLayout(graph, 'hierarchy');

      // Should have positions for all nodes
      expect(result.positions.size).toBe(4);
      expect(result.positions.has('System.SY.001')).toBe(true);
      expect(result.positions.has('UseCase.UC.001')).toBe(true);
      expect(result.positions.has('Chain.FC.001')).toBe(true);
      expect(result.positions.has('Function.FN.001')).toBe(true);

      // Should have bounds
      expect(result.bounds).toBeDefined();
      expect(result.bounds.width).toBeGreaterThanOrEqual(0);
      expect(result.bounds.height).toBeGreaterThan(0);

      // Algorithm should be reingold-tilford
      expect(result.algorithm).toBe('reingold-tilford');
    });

    it('should throw error for unknown view type', async () => {
      const graph = createHierarchyGraph();
      const engine = new GraphEngine();

      await expect(
        engine.computeLayout(graph, 'invalid-view' as any)
      ).rejects.toThrow('View configuration not found');
    });
  });

  describe('view configuration management', () => {
    it('should return view config for valid view type', () => {
      const engine = new GraphEngine();
      const config = engine.getViewConfig('hierarchy');

      expect(config).toBeDefined();
      expect(config!.viewId).toBe('hierarchy');
      expect(config!.layoutConfig.algorithm).toBe('reingold-tilford');
    });

    it('should return all view configs', () => {
      const engine = new GraphEngine();
      const configs = engine.getAllViewConfigs();

      expect(configs.length).toBe(5); // hierarchy, functional-flow, requirements, allocation, use-case
      expect(configs.map((c) => c.viewId)).toContain('hierarchy');
      expect(configs.map((c) => c.viewId)).toContain('functional-flow');
    });

    it('should allow custom view config', async () => {
      const engine = new GraphEngine();
      const customConfig = {
        ...engine.getViewConfig('hierarchy')!,
        layoutConfig: {
          ...engine.getViewConfig('hierarchy')!.layoutConfig,
          parameters: {
            ...engine.getViewConfig('hierarchy')!.layoutConfig.parameters,
            nodeSpacing: 200, // Custom spacing
          },
        },
      };

      engine.setViewConfig('hierarchy', customConfig);

      const result = await engine.computeLayout(createHierarchyGraph(), 'hierarchy');

      // Layout should use custom config
      expect(result.positions.size).toBeGreaterThan(0);
    });
  });
});

// ========== TEST HELPERS ==========

function createHierarchyGraph(): GraphState {
  const nodes: Node[] = [
    createNode('System.SY.001', 'SYS', 'System'),
    createNode('UseCase.UC.001', 'UC', 'UseCase'),
    createNode('Chain.FC.001', 'FCHAIN', 'Chain'),
    createNode('Function.FN.001', 'FUNC', 'Function'),
  ];

  const edges: Edge[] = [
    createEdge('System.SY.001', 'UseCase.UC.001', 'compose'),
    createEdge('UseCase.UC.001', 'Chain.FC.001', 'compose'),
    createEdge('Chain.FC.001', 'Function.FN.001', 'compose'),
  ];

  return createGraph(nodes, edges);
}

function _createFunctionalFlowGraph(): GraphState {
  const nodes: Node[] = [
    createNode('ProcessData.FN.001', 'FUNC', 'ProcessData'),
    createNode('InputData.FL.001', 'FLOW', 'InputData'),
    createNode('OutputData.FL.002', 'FLOW', 'OutputData'),
  ];

  const edges: Edge[] = [
    createEdge('InputData.FL.001', 'ProcessData.FN.001', 'io'),
    createEdge('ProcessData.FN.001', 'OutputData.FL.002', 'io'),
  ];

  return createGraph(nodes, edges);
}

function createNode(
  semanticId: string,
  type: string,
  name: string
): Node {
  return {
    uuid: `uuid-${semanticId}`,
    semanticId,
    type: type as any,
    name,
    description: 'Test node',
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createEdge(
  sourceId: string,
  targetId: string,
  type: string = 'compose'
): Edge {
  return {
    uuid: `uuid-${sourceId}-${targetId}`,
    type: type as any,
    sourceId,
    targetId,
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createGraph(nodes: Node[], edges: Edge[]): GraphState {
  return {
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    nodes: new Map(nodes.map((n) => [n.semanticId, n])),
    edges: new Map(edges.map((e, idx) => [`edge-${idx}`, e])),
    ports: new Map(),
    version: 1,
    lastSavedVersion: 1,
    lastModified: new Date(),
  };
}
