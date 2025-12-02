/**
 * Graph Canvas - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate Graph Canvas state management
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GraphCanvas } from '../../../src/canvas/graph-canvas.js';
import { Node, Edge } from '../../../src/shared/types/ontology.js';
import { FormatEDiff } from '../../../src/shared/types/canvas.js';
import { MockNeo4jClient } from '../../setup.js';

describe('GraphCanvas', () => {
  let canvas: GraphCanvas;

  beforeEach(() => {
    canvas = new GraphCanvas('test-ws', 'TestSystem.SY.001', 'chat-001', 'user-001');
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const state = canvas.getState();

      expect(state.nodes.size).toBe(0);
      expect(state.edges.size).toBe(0);
      expect(state.currentView).toBe('hierarchy');
      expect(state.version).toBe(1);
    });

    it('should set correct workspace and system IDs', () => {
      const state = canvas.getState();

      expect(state.workspaceId).toBe('test-ws');
      expect(state.systemId).toBe('TestSystem.SY.001');
    });
  });

  describe('node operations', () => {
    it('should add node via diff', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'NewNode.FN.001',
            node: {
              uuid: 'uuid-1',
              semanticId: 'NewNode.FN.001',
              type: 'FUNC',
              name: 'NewNode',
              description: 'Test node',
              workspaceId: 'test-ws',
              systemId: 'TestSystem.SY.001',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'user-001',
            },
          },
        ],
      };

      await canvas.applyDiff(diff);

      const state = canvas.getState();
      expect(state.nodes.size).toBe(1);
      expect(state.nodes.has('NewNode.FN.001')).toBe(true);
      expect(state.version).toBe(2); // Incremented from 1
    });

    it('should remove node via diff', async () => {
      // First add a node
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Node.FN.001',
            node: createTestNode('Node.FN.001'),
          },
        ],
      });

      // Then remove it
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v2',
        operations: [
          {
            type: 'remove_node',
            semanticId: 'Node.FN.001',
          },
        ],
      });

      const state = canvas.getState();
      expect(state.nodes.size).toBe(0);
      expect(state.nodes.has('Node.FN.001')).toBe(false);
    });

    it('should update node via diff', async () => {
      // Add node
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Node.FN.001',
            node: createTestNode('Node.FN.001', 'Original description'),
          },
        ],
      });

      // Update it
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v2',
        operations: [
          {
            type: 'update_node',
            semanticId: 'Node.FN.001',
            updates: {
              description: 'Updated description',
            },
          },
        ],
      });

      const node = canvas.getNode('Node.FN.001');
      expect(node?.description).toBe('Updated description');
    });

    it('should track dirty nodes after add', async () => {
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Node.FN.001',
            node: createTestNode('Node.FN.001'),
          },
        ],
      });

      const dirtyIds = canvas.getDirtyIds();
      expect(dirtyIds.has('Node.FN.001')).toBe(true);
    });
  });

  describe('edge operations', () => {
    beforeEach(async () => {
      // Add two nodes for edge testing
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'NodeA.SY.001',
            node: createTestNode('NodeA.SY.001', 'Node A', 'SYS'),
          },
          {
            type: 'add_node',
            semanticId: 'NodeB.UC.001',
            node: createTestNode('NodeB.UC.001', 'Node B', 'UC'),
          },
        ],
      });
    });

    it('should add edge via diff', async () => {
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v2',
        operations: [
          {
            type: 'add_edge',
            semanticId: 'NodeA.SY.001-compose-NodeB.UC.001',
            edge: createTestEdge('NodeA.SY.001', 'NodeB.UC.001', 'compose'),
          },
        ],
      });

      const state = canvas.getState();
      expect(state.edges.size).toBe(1);
      expect(state.edges.has('NodeA.SY.001-compose-NodeB.UC.001')).toBe(true);
    });

    it('should remove edge via diff', async () => {
      // Add edge
      const edge = createTestEdge('NodeA.SY.001', 'NodeB.UC.001', 'compose');
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v2',
        operations: [
          {
            type: 'add_edge',
            semanticId: 'NodeA.SY.001-compose-NodeB.UC.001',
            edge,
          },
        ],
      });

      // Remove edge
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v3',
        operations: [
          {
            type: 'remove_edge',
            semanticId: 'NodeA.SY.001-compose-NodeB.UC.001',
            edge,
          },
        ],
      });

      const state = canvas.getState();
      expect(state.edges.size).toBe(0);
    });

    it('should track dirty edges after add', async () => {
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v2',
        operations: [
          {
            type: 'add_edge',
            semanticId: 'NodeA.SY.001-compose-NodeB.UC.001',
            edge: createTestEdge('NodeA.SY.001', 'NodeB.UC.001', 'compose'),
          },
        ],
      });

      const dirtyIds = canvas.getDirtyIds();
      expect(dirtyIds.has('NodeA.SY.001-compose-NodeB.UC.001')).toBe(true);
    });
  });

  describe('getNodeEdges', () => {
    beforeEach(async () => {
      // Create graph: A -> B -> C
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'A.SY.001',
            node: createTestNode('A.SY.001', 'A', 'SYS'),
          },
          {
            type: 'add_node',
            semanticId: 'B.UC.001',
            node: createTestNode('B.UC.001', 'B', 'UC'),
          },
          {
            type: 'add_node',
            semanticId: 'C.FN.001',
            node: createTestNode('C.FN.001', 'C', 'FUNC'),
          },
          {
            type: 'add_edge',
            semanticId: 'A.SY.001-compose-B.UC.001',
            edge: createTestEdge('A.SY.001', 'B.UC.001', 'compose'),
          },
          {
            type: 'add_edge',
            semanticId: 'B.UC.001-compose-C.FN.001',
            edge: createTestEdge('B.UC.001', 'C.FN.001', 'compose'),
          },
        ],
      });
    });

    it('should get all edges for node', () => {
      const edges = canvas.getNodeEdges('B.UC.001');
      expect(edges.length).toBe(2); // One in, one out
    });

    it('should get outgoing edges only', () => {
      const edges = canvas.getNodeEdges('B.UC.001', 'out');
      expect(edges.length).toBe(1);
      expect(edges[0].targetId).toBe('C.FN.001');
    });

    it('should get incoming edges only', () => {
      const edges = canvas.getNodeEdges('B.UC.001', 'in');
      expect(edges.length).toBe(1);
      expect(edges[0].sourceId).toBe('A.SY.001');
    });
  });

  describe('view management', () => {
    it('should switch current view', () => {
      canvas.setCurrentView('functional-flow');
      const state = canvas.getState();
      expect(state.currentView).toBe('functional-flow');
    });

    it('should set focus node', () => {
      canvas.setFocus('TestNode.FN.001');
      const state = canvas.getState();
      expect(state.focus).toBe('TestNode.FN.001');
    });

    it('should set zoom level', () => {
      canvas.setZoom(1.5);
      const state = canvas.getState();
      expect(state.zoom).toBe(1.5);
    });
  });

  describe('validation', () => {
    it('should validate semantic ID format', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'InvalidID', // Missing type and counter
            node: {
              ...createTestNode('InvalidID'),
              semanticId: 'InvalidID',
            },
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes('Invalid semantic ID'))).toBe(true);
    });

    it('should warn about missing source node in edge', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_edge',
            semanticId: 'Missing.SY.001-compose-AlsoMissing.UC.001',
            edge: createTestEdge('Missing.SY.001', 'AlsoMissing.UC.001', 'compose'),
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(result.warnings?.some((w) => w.includes('Source node not found'))).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should serialize dirty state as diff', async () => {
      await canvas.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Node.FN.001',
            node: createTestNode('Node.FN.001'),
          },
        ],
      });

      const diff = canvas['serializeDirtyAsDiff']();

      expect(diff).toContain('<operations>');
      expect(diff).toContain('Node.FN.001');
      expect(diff).toContain('TestSystem.SY.001@v2'); // Version incremented
    });

    it('should clear dirty tracking after persist', async () => {
      // Create canvas with mock Neo4jClient
      const mockNeo4j = new MockNeo4jClient();
      const canvasWithNeo4j = new GraphCanvas(
        'test-ws',
        'TestSystem.SY.001',
        'chat-001',
        'user-001',
        'hierarchy',
        mockNeo4j as any
      );

      await canvasWithNeo4j.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Node.FN.001',
            node: createTestNode('Node.FN.001'),
          },
        ],
      });

      const dirtyBefore = canvasWithNeo4j.getDirtyIds();
      expect(dirtyBefore.size).toBeGreaterThan(0);

      await canvasWithNeo4j.persistToNeo4j();

      const dirtyAfter = canvasWithNeo4j.getDirtyIds();
      expect(dirtyAfter.size).toBe(0);
      expect(mockNeo4j.savedNodes.length).toBe(1);
    });

    it('should persist both nodes and edges', async () => {
      // Create canvas with mock Neo4jClient
      const mockNeo4j = new MockNeo4jClient();
      const canvasWithNeo4j = new GraphCanvas(
        'test-ws',
        'TestSystem.SY.001',
        'chat-001',
        'user-001',
        'hierarchy',
        mockNeo4j as any
      );

      // Add nodes and an edge
      await canvasWithNeo4j.applyDiff({
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Parent.SY.001',
            node: createTestNode('Parent.SY.001', 'Parent', 'SYS'),
          },
          {
            type: 'add_node',
            semanticId: 'Child.MOD.001',
            node: createTestNode('Child.MOD.001', 'Child', 'MOD'),
          },
          {
            type: 'add_edge',
            semanticId: 'Parent.SY.001-compose-Child.MOD.001',
            edge: createTestEdge('Parent.SY.001', 'Child.MOD.001', 'compose'),
          },
        ],
      });

      // Verify dirty tracking includes edge (using composite key)
      const dirtyIds = canvasWithNeo4j.getDirtyIds();
      expect(dirtyIds.has('Parent.SY.001')).toBe(true);
      expect(dirtyIds.has('Child.MOD.001')).toBe(true);
      expect(dirtyIds.has('Parent.SY.001-compose-Child.MOD.001')).toBe(true);

      // Persist
      await canvasWithNeo4j.persistToNeo4j();

      // Verify both nodes AND edges were saved
      expect(mockNeo4j.savedNodes.length).toBe(2);
      expect(mockNeo4j.savedEdges.length).toBe(1);

      // Verify dirty tracking is cleared
      expect(canvasWithNeo4j.getDirtyIds().size).toBe(0);
    });
  });
});

// ========== TEST HELPERS ==========

function createTestNode(
  semanticId: string,
  description: string = 'Test node',
  type: string = 'FUNC'
): Node {
  return {
    uuid: `uuid-${semanticId}`,
    semanticId,
    type: type as any,
    name: semanticId.split('.')[0],
    description,
    workspaceId: 'test-ws',
    systemId: 'TestSystem.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createTestEdge(
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
    systemId: 'TestSystem.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}
