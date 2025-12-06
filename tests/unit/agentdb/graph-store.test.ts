/**
 * Graph Store Unit Tests
 *
 * Tests CRUD operations, uniqueness constraints, and change notifications.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphStore } from '../../../src/llm-engine/agentdb/graph-store.js';
import {
  DuplicateSemanticIdError,
  DuplicateEdgeError,
  NodeNotFoundError,
} from '../../../src/llm-engine/agentdb/errors.js';
import type { Node, Edge } from '../../../src/shared/types/ontology.js';

describe('GraphStore', () => {
  let store: GraphStore;
  const workspaceId = 'test-workspace';
  const systemId = 'TestSystem.SY.001';

  const createTestNode = (semanticId: string, name: string): Node => ({
    uuid: semanticId,
    semanticId,
    type: 'FUNC',
    name,
    descr: `Description for ${name}`,
    workspaceId,
    systemId,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  });

  const createTestEdge = (uuid: string, sourceId: string, targetId: string, type = 'io'): Edge => ({
    uuid,
    type: type as Edge['type'],
    sourceId,
    targetId,
    workspaceId,
    systemId,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  });

  beforeEach(() => {
    store = new GraphStore(workspaceId, systemId);
  });

  describe('Node Operations', () => {
    it('should add a node', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');

      store.setNode(node);

      expect(store.getNode('ValidateOrder.FN.001')).toEqual(
        expect.objectContaining({
          semanticId: 'ValidateOrder.FN.001',
          name: 'ValidateOrder',
        })
      );
      expect(store.getNodeCount()).toBe(1);
      expect(store.getVersion()).toBe(1);
    });

    it('should update an existing node with same uuid', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      store.setNode(node);

      const updatedNode = { ...node, descr: 'Updated description' };
      store.setNode(updatedNode);

      expect(store.getNode('ValidateOrder.FN.001')?.descr).toBe('Updated description');
      expect(store.getNodeCount()).toBe(1);
      expect(store.getVersion()).toBe(2);
    });

    it('should throw DuplicateSemanticIdError for duplicate semanticId with different uuid', () => {
      const node1 = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      const node2 = { ...createTestNode('ValidateOrder.FN.001', 'ValidateOrder'), uuid: 'different-uuid' };

      store.setNode(node1);

      expect(() => store.setNode(node2)).toThrow(DuplicateSemanticIdError);
      expect(() => store.setNode(node2)).toThrow(
        /Duplicate semanticId 'ValidateOrder.FN.001'.*existing uuid='ValidateOrder.FN.001'.*new uuid='different-uuid'/
      );
    });

    it('should allow upsert for duplicate semanticId', () => {
      const node1 = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      const node2 = { ...createTestNode('ValidateOrder.FN.001', 'ValidateOrderUpdated'), uuid: 'different-uuid' };

      store.setNode(node1);
      store.setNode(node2, { upsert: true });

      expect(store.getNode('ValidateOrder.FN.001')?.uuid).toBe('different-uuid');
      expect(store.getNode('ValidateOrder.FN.001')?.name).toBe('ValidateOrderUpdated');
      expect(store.getNodeCount()).toBe(1);
    });

    it('should delete a node', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      store.setNode(node);

      const deleted = store.deleteNode('ValidateOrder.FN.001');

      expect(deleted).toBe(true);
      expect(store.getNode('ValidateOrder.FN.001')).toBeNull();
      expect(store.getNodeCount()).toBe(0);
    });

    it('should return false when deleting non-existent node', () => {
      const deleted = store.deleteNode('NonExistent.FN.001');
      expect(deleted).toBe(false);
    });

    it('should delete connected edges when deleting a node', () => {
      const node1 = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      const node2 = createTestNode('ProcessPayment.FN.002', 'ProcessPayment');
      store.setNode(node1);
      store.setNode(node2);

      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002');
      store.setEdge(edge);

      store.deleteNode('ValidateOrder.FN.001');

      expect(store.getEdgeCount()).toBe(0);
    });

    it('should filter nodes by type', () => {
      const func1 = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      const func2 = createTestNode('ProcessPayment.FN.002', 'ProcessPayment');
      const schema = { ...createTestNode('OrderData.SC.001', 'OrderData'), type: 'SCHEMA' as const };

      store.setNode(func1);
      store.setNode(func2);
      store.setNode(schema);

      const funcs = store.getNodes({ type: 'FUNC' });
      expect(funcs).toHaveLength(2);

      const schemas = store.getNodes({ type: 'SCHEMA' });
      expect(schemas).toHaveLength(1);
    });

    it('should filter nodes by multiple types', () => {
      const func = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      const schema = { ...createTestNode('OrderData.SC.001', 'OrderData'), type: 'SCHEMA' as const };
      const uc = { ...createTestNode('PlaceOrder.UC.001', 'PlaceOrder'), type: 'UC' as const };

      store.setNode(func);
      store.setNode(schema);
      store.setNode(uc);

      const filtered = store.getNodes({ type: ['FUNC', 'SCHEMA'] });
      expect(filtered).toHaveLength(2);
    });

    it('should filter nodes by semanticId prefix', () => {
      const order1 = createTestNode('Order.FN.001', 'Order');
      const order2 = createTestNode('OrderValidate.FN.002', 'OrderValidate');
      const payment = createTestNode('Payment.FN.003', 'Payment');

      store.setNode(order1);
      store.setNode(order2);
      store.setNode(payment);

      const orderNodes = store.getNodes({ semanticIdPrefix: 'Order' });
      expect(orderNodes).toHaveLength(2);
    });
  });

  describe('Edge Operations', () => {
    beforeEach(() => {
      store.setNode(createTestNode('ValidateOrder.FN.001', 'ValidateOrder'));
      store.setNode(createTestNode('ProcessPayment.FN.002', 'ProcessPayment'));
      store.setNode(createTestNode('SendConfirmation.FN.003', 'SendConfirmation'));
    });

    it('should add an edge', () => {
      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002');

      store.setEdge(edge);

      expect(store.getEdge('edge-001')).toEqual(
        expect.objectContaining({
          uuid: 'edge-001',
          sourceId: 'ValidateOrder.FN.001',
          targetId: 'ProcessPayment.FN.002',
        })
      );
      expect(store.getEdgeCount()).toBe(1);
    });

    it('should throw NodeNotFoundError when source node does not exist', () => {
      const edge = createTestEdge('edge-001', 'NonExistent.FN.001', 'ProcessPayment.FN.002');

      expect(() => store.setEdge(edge)).toThrow(NodeNotFoundError);
      expect(() => store.setEdge(edge)).toThrow(/NonExistent.FN.001.*edge source/);
    });

    it('should throw NodeNotFoundError when target node does not exist', () => {
      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'NonExistent.FN.002');

      expect(() => store.setEdge(edge)).toThrow(NodeNotFoundError);
      expect(() => store.setEdge(edge)).toThrow(/NonExistent.FN.002.*edge target/);
    });

    it('should throw DuplicateEdgeError for duplicate edge with different uuid', () => {
      const edge1 = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io');
      const edge2 = createTestEdge('edge-002', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io');

      store.setEdge(edge1);

      expect(() => store.setEdge(edge2)).toThrow(DuplicateEdgeError);
      expect(() => store.setEdge(edge2)).toThrow(
        /Duplicate edge.*ValidateOrder.FN.001.*-io->.*ProcessPayment.FN.002/
      );
    });

    it('should allow upsert for duplicate edge', () => {
      const edge1 = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io');
      const edge2 = { ...createTestEdge('edge-002', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io'), label: 'updated' };

      store.setEdge(edge1);
      store.setEdge(edge2, { upsert: true });

      // The new edge should replace the old one
      expect(store.getEdge('edge-001')).toBeNull(); // Old edge removed
      expect(store.getEdge('edge-002')?.label).toBe('updated'); // New edge present
      expect(store.getEdgeCount()).toBe(1);
    });

    it('should allow multiple edges between same nodes with different types', () => {
      const edge1 = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io');
      const edge2 = createTestEdge('edge-002', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'compose');

      store.setEdge(edge1);
      store.setEdge(edge2);

      expect(store.getEdgeCount()).toBe(2);
      expect(store.getEdge('edge-001')?.type).toBe('io');
      expect(store.getEdge('edge-002')?.type).toBe('compose');
    });

    it('should get edge by composite key', () => {
      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io');
      store.setEdge(edge);

      const found = store.getEdgeByKey('ValidateOrder.FN.001', 'io', 'ProcessPayment.FN.002');
      expect(found?.uuid).toBe('edge-001');
    });

    it('should delete edge by uuid', () => {
      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002');
      store.setEdge(edge);

      const deleted = store.deleteEdge('edge-001');

      expect(deleted).toBe(true);
      expect(store.getEdge('edge-001')).toBeNull();
      expect(store.getEdgeByKey('ValidateOrder.FN.001', 'io', 'ProcessPayment.FN.002')).toBeNull();
    });

    it('should delete edge by composite key', () => {
      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io');
      store.setEdge(edge);

      const deleted = store.deleteEdgeByKey('ValidateOrder.FN.001', 'io', 'ProcessPayment.FN.002');

      expect(deleted).toBe(true);
      expect(store.getEdge('edge-001')).toBeNull();
    });

    it('should filter edges by type', () => {
      store.setEdge(createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io'));
      store.setEdge(createTestEdge('edge-002', 'ValidateOrder.FN.001', 'SendConfirmation.FN.003', 'compose'));

      const ioEdges = store.getEdges({ type: 'io' });
      expect(ioEdges).toHaveLength(1);

      const composeEdges = store.getEdges({ type: 'compose' });
      expect(composeEdges).toHaveLength(1);
    });

    it('should get edges for a specific node', () => {
      store.setEdge(createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io'));
      store.setEdge(createTestEdge('edge-002', 'ProcessPayment.FN.002', 'SendConfirmation.FN.003', 'io'));

      const outEdges = store.getNodeEdges('ValidateOrder.FN.001', 'out');
      expect(outEdges).toHaveLength(1);

      const inEdges = store.getNodeEdges('ProcessPayment.FN.002', 'in');
      expect(inEdges).toHaveLength(1);

      const allEdges = store.getNodeEdges('ProcessPayment.FN.002');
      expect(allEdges).toHaveLength(2);
    });
  });

  describe('Change Notifications', () => {
    it('should emit change event on node add', () => {
      const callback = vi.fn();
      store.onGraphChange(callback);

      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      store.setNode(node);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_add',
          id: 'ValidateOrder.FN.001',
          version: 1,
        })
      );
    });

    it('should emit change event on node update', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      store.setNode(node);

      const callback = vi.fn();
      store.onGraphChange(callback);

      store.setNode({ ...node, descr: 'Updated' });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_update',
          id: 'ValidateOrder.FN.001',
          version: 2,
        })
      );
    });

    it('should emit change event on node delete', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      store.setNode(node);

      const callback = vi.fn();
      store.onGraphChange(callback);

      store.deleteNode('ValidateOrder.FN.001');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_delete',
          id: 'ValidateOrder.FN.001',
        })
      );
    });

    it('should emit change event on edge add', () => {
      store.setNode(createTestNode('ValidateOrder.FN.001', 'ValidateOrder'));
      store.setNode(createTestNode('ProcessPayment.FN.002', 'ProcessPayment'));

      const callback = vi.fn();
      store.onGraphChange(callback);

      const edge = createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002');
      store.setEdge(edge);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'edge_add',
          id: 'edge-001',
        })
      );
    });

    it('should unsubscribe from change events', () => {
      const callback = vi.fn();
      const unsubscribe = store.onGraphChange(callback);

      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      store.setNode(node);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      store.setNode({ ...node, descr: 'Updated' });
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not incremented
    });
  });

  describe('Bulk Operations', () => {
    it('should load from GraphState', () => {
      const state = {
        workspaceId: 'new-workspace',
        systemId: 'NewSystem.SY.001',
        nodes: new Map([
          ['Node1.FN.001', createTestNode('Node1.FN.001', 'Node1')],
          ['Node2.FN.002', createTestNode('Node2.FN.002', 'Node2')],
        ]),
        edges: new Map([
          ['edge-001', createTestEdge('edge-001', 'Node1.FN.001', 'Node2.FN.002')],
        ]),
        ports: new Map(),
        version: 5,
        lastSavedVersion: 5,
        lastModified: new Date(),
      };

      store.loadFromState(state);

      expect(store.getNodeCount()).toBe(2);
      expect(store.getEdgeCount()).toBe(1);
      expect(store.getVersion()).toBe(5);
      expect(store.getWorkspaceId()).toBe('new-workspace');
      expect(store.getSystemId()).toBe('NewSystem.SY.001');
    });

    it('should export to GraphState', () => {
      store.setNode(createTestNode('ValidateOrder.FN.001', 'ValidateOrder'));
      store.setNode(createTestNode('ProcessPayment.FN.002', 'ProcessPayment'));
      store.setEdge(createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002'));

      const state = store.toGraphState();

      expect(state.nodes.size).toBe(2);
      expect(state.edges.size).toBe(1);
      expect(state.workspaceId).toBe(workspaceId);
      expect(state.systemId).toBe(systemId);
    });

    it('should clear all data', () => {
      store.setNode(createTestNode('ValidateOrder.FN.001', 'ValidateOrder'));
      store.setNode(createTestNode('ProcessPayment.FN.002', 'ProcessPayment'));
      store.setEdge(createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002'));

      store.clear();

      expect(store.getNodeCount()).toBe(0);
      expect(store.getEdgeCount()).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      store.setNode(createTestNode('ValidateOrder.FN.001', 'ValidateOrder'));
      store.setNode(createTestNode('ProcessPayment.FN.002', 'ProcessPayment'));
      store.setEdge(createTestEdge('edge-001', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002'));

      const stats = store.getStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.version).toBe(3); // 2 nodes + 1 edge = 3 version increments
    });
  });
});
