/**
 * Unified AgentDB Service Unit Tests
 *
 * Tests the unified data layer API including:
 * - Graph Store CRUD delegation
 * - Version-aware response caching
 * - Cache invalidation on graph changes
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnifiedAgentDBService } from '../../../src/llm-engine/agentdb/unified-agentdb-service.js';
import type { Node, Edge } from '../../../src/shared/types/ontology.js';

// Mock the backend factory
vi.mock('../../../src/llm-engine/agentdb/backend-factory.js', () => ({
  createBackend: vi.fn().mockResolvedValue({
    initialize: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    cacheResponse: vi.fn().mockResolvedValue(undefined),
    storeEpisode: vi.fn().mockResolvedValue(undefined),
    retrieveEpisodes: vi.fn().mockResolvedValue([]),
    getMetrics: vi.fn().mockResolvedValue({
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      episodesStored: 0,
      tokensSaved: 0,
      costSavings: 0,
    }),
    cleanup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('UnifiedAgentDBService', () => {
  let service: UnifiedAgentDBService;
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

  const createTestEdge = (uuid: string, sourceId: string, targetId: string): Edge => ({
    uuid,
    type: 'io',
    sourceId,
    targetId,
    workspaceId,
    systemId,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  });

  beforeEach(async () => {
    service = new UnifiedAgentDBService();
    await service.initialize(workspaceId, systemId);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(service.isInitialized()).toBe(true);
    });

    it('should throw when accessing methods before initialization', async () => {
      const uninitializedService = new UnifiedAgentDBService();
      expect(() => uninitializedService.getNode('Test.FN.001')).toThrow(
        /not initialized/
      );
    });

    it('should not re-initialize if already initialized', async () => {
      const version1 = service.getGraphVersion();
      await service.initialize(workspaceId, systemId);
      const version2 = service.getGraphVersion();
      expect(version1).toBe(version2);
    });
  });

  describe('Graph Store Delegation', () => {
    it('should add and get nodes', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');

      service.setNode(node);

      const retrieved = service.getNode('ValidateOrder.FN.001');
      expect(retrieved).toEqual(expect.objectContaining({
        semanticId: 'ValidateOrder.FN.001',
        name: 'ValidateOrder',
      }));
    });

    it('should delete nodes', () => {
      const node = createTestNode('ValidateOrder.FN.001', 'ValidateOrder');
      service.setNode(node);

      const deleted = service.deleteNode('ValidateOrder.FN.001');

      expect(deleted).toBe(true);
      expect(service.getNode('ValidateOrder.FN.001')).toBeNull();
    });

    it('should filter nodes', () => {
      service.setNode(createTestNode('Func1.FN.001', 'Func1'));
      service.setNode(createTestNode('Func2.FN.002', 'Func2'));
      service.setNode({ ...createTestNode('Schema1.SC.001', 'Schema1'), type: 'SCHEMA' as const });

      const funcs = service.getNodes({ type: 'FUNC' });
      expect(funcs).toHaveLength(2);
    });

    it('should add and get edges', () => {
      service.setNode(createTestNode('Source.FN.001', 'Source'));
      service.setNode(createTestNode('Target.FN.002', 'Target'));

      const edge = createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002');
      service.setEdge(edge);

      expect(service.getEdge('edge-001')).toEqual(expect.objectContaining({
        uuid: 'edge-001',
        sourceId: 'Source.FN.001',
        targetId: 'Target.FN.002',
      }));
    });

    it('should get edge by composite key', () => {
      service.setNode(createTestNode('Source.FN.001', 'Source'));
      service.setNode(createTestNode('Target.FN.002', 'Target'));

      const edge = createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002');
      service.setEdge(edge);

      const found = service.getEdgeByKey('Source.FN.001', 'io', 'Target.FN.002');
      expect(found?.uuid).toBe('edge-001');
    });

    it('should export graph state', () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      service.setNode(createTestNode('Node2.FN.002', 'Node2'));
      service.setEdge(createTestEdge('edge-001', 'Node1.FN.001', 'Node2.FN.002'));

      const state = service.toGraphState();

      expect(state.nodes.size).toBe(2);
      expect(state.edges.size).toBe(1);
      expect(state.workspaceId).toBe(workspaceId);
      expect(state.systemId).toBe(systemId);
    });

    it('should load graph state', () => {
      const state = {
        workspaceId: 'new-ws',
        systemId: 'NewSys.SY.001',
        nodes: new Map([
          ['N1.FN.001', createTestNode('N1.FN.001', 'N1')],
        ]),
        edges: new Map(),
        ports: new Map(),
        version: 10,
        lastSavedVersion: 10,
        lastModified: new Date(),
      };

      service.loadFromState(state);

      expect(service.getNode('N1.FN.001')).toBeTruthy();
      expect(service.getGraphVersion()).toBe(10);
    });

    it('should get graph statistics', () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      service.setNode(createTestNode('Node2.FN.002', 'Node2'));
      service.setEdge(createTestEdge('edge-001', 'Node1.FN.001', 'Node2.FN.002'));

      const stats = service.getGraphStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.version).toBe(3);
    });
  });

  describe('Version-Aware Caching', () => {
    it('should cache response with graph version', async () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      const version = service.getGraphVersion();

      await service.cacheResponse('test query', version, 'test response', null);

      const cached = await service.checkCache('test query', version);
      expect(cached).toEqual({
        response: 'test response',
        operations: null,
      });
    });

    it('should return null for different graph version', async () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      const version1 = service.getGraphVersion();

      await service.cacheResponse('test query', version1, 'test response', null);

      // Modify graph to increment version
      service.setNode(createTestNode('Node2.FN.002', 'Node2'));
      const version2 = service.getGraphVersion();

      const cached = await service.checkCache('test query', version2);
      expect(cached).toBeNull();
    });

    it('should invalidate cache on graph change', async () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      const version1 = service.getGraphVersion();

      await service.cacheResponse('test query', version1, 'test response', null);

      // Modify graph
      service.setNode(createTestNode('Node2.FN.002', 'Node2'));

      // Old version cache should be invalidated
      const cached = await service.checkCache('test query', version1);
      expect(cached).toBeNull();
    });
  });

  describe('Graph Change Events', () => {
    it('should emit graphChange events', () => {
      const callback = vi.fn();
      service.on('graphChange', callback);

      service.setNode(createTestNode('Node1.FN.001', 'Node1'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_add',
          id: 'Node1.FN.001',
        })
      );
    });

    it('should allow subscribing via onGraphChange', () => {
      const callback = vi.fn();
      const unsubscribe = service.onGraphChange(callback);

      service.setNode(createTestNode('Node1.FN.001', 'Node1'));

      expect(callback).toHaveBeenCalled();

      unsubscribe();
      service.setNode(createTestNode('Node2.FN.002', 'Node2'));

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Episodic Memory', () => {
    it('should store episodes', async () => {
      await service.storeEpisode('agent-1', 'test task', true, { result: 'success' });
      // No error means success - backend is mocked
    });

    it('should load agent context', async () => {
      const episodes = await service.loadAgentContext('agent-1', 'test task', 5);
      expect(episodes).toEqual([]);
    });
  });

  describe('Metrics', () => {
    it('should return metrics', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('cacheMisses');
      expect(metrics).toHaveProperty('cacheHitRate');
    });
  });

  describe('Lifecycle', () => {
    it('should cleanup without error', async () => {
      await service.cleanup();
      // No error means success
    });

    it('should shutdown and clear state', async () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));

      await service.shutdown();

      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('clearForSystemLoad', () => {
    it('should clear graph data', () => {
      // Add some data
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      service.setNode(createTestNode('Node2.FN.002', 'Node2'));
      service.setEdge(createTestEdge('edge-001', 'Node1.FN.001', 'Node2.FN.002'));

      expect(service.getGraphStats().nodeCount).toBe(2);
      expect(service.getGraphStats().edgeCount).toBe(1);

      // Clear for system load
      service.clearForSystemLoad();

      // Graph should be empty
      expect(service.getGraphStats().nodeCount).toBe(0);
      expect(service.getGraphStats().edgeCount).toBe(0);
    });

    it('should clear response cache', async () => {
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      const version = service.getGraphVersion();

      // Cache a response
      await service.cacheResponse('test query', version, 'test response', null);

      // Verify cache exists
      let cached = await service.checkCache('test query', version);
      expect(cached).not.toBeNull();

      // Clear for system load
      service.clearForSystemLoad();

      // Cache should be cleared (even with same version, data was cleared)
      cached = await service.checkCache('test query', version);
      expect(cached).toBeNull();
    });

    it('should clear embeddings', () => {
      // Add a node
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));

      // Manually load an embedding
      service.loadEmbeddings([{
        nodeId: 'Node1.FN.001',
        nodeType: 'FUNC',
        textContent: 'Test content',
        embedding: [0.1, 0.2, 0.3],
        model: 'test-model',
        createdAt: Date.now(),
      }]);

      // Verify embedding exists
      expect(service.getCachedEmbedding('Node1.FN.001')).not.toBeNull();

      // Clear for system load
      service.clearForSystemLoad();

      // Embedding should be cleared
      expect(service.getCachedEmbedding('Node1.FN.001')).toBeNull();
    });

    it('should allow reloading after clear', () => {
      // Add initial data
      service.setNode(createTestNode('Node1.FN.001', 'Node1'));
      expect(service.getGraphStats().nodeCount).toBe(1);

      // Clear
      service.clearForSystemLoad();
      expect(service.getGraphStats().nodeCount).toBe(0);

      // Reload with new data
      const newNodes = [
        createTestNode('NewNode1.FN.001', 'NewNode1'),
        createTestNode('NewNode2.FN.002', 'NewNode2'),
        createTestNode('NewNode3.FN.003', 'NewNode3'),
      ];
      service.loadFromState({ nodes: newNodes, edges: [] });

      expect(service.getGraphStats().nodeCount).toBe(3);
      expect(service.getNode('NewNode1.FN.001')).not.toBeNull();
    });
  });
});
