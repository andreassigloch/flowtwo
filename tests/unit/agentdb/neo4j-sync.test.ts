/**
 * Neo4j Sync Layer Unit Tests (CR-032 Phase 5)
 *
 * Tests synchronization between AgentDB and Neo4j (mocked).
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnifiedAgentDBService } from '../../../src/llm-engine/agentdb/unified-agentdb-service.js';
import type { Node, Edge } from '../../../src/shared/types/ontology.js';

// Mock Neo4jClient
vi.mock('../../../src/neo4j-client/neo4j-client.js', () => ({
  Neo4jClient: vi.fn().mockImplementation(() => ({
    verifyConnection: vi.fn().mockResolvedValue(true),
    loadGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    saveNodes: vi.fn().mockResolvedValue({ success: true, nodeCount: 0, edgeCount: 0, messageCount: 0, executionTime: 10 }),
    saveEdges: vi.fn().mockResolvedValue({ success: true, nodeCount: 0, edgeCount: 0, messageCount: 0, executionTime: 10 }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

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

// Import after mocks are set up
import { Neo4jSyncManager, createNeo4jSyncManager } from '../../../src/llm-engine/agentdb/neo4j-sync.js';
import { Neo4jClient } from '../../../src/neo4j-client/neo4j-client.js';

describe('Neo4jSyncManager', () => {
  let agentDB: UnifiedAgentDBService;
  let syncManager: Neo4jSyncManager;
  let mockNeo4jClient: any;
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
    vi.clearAllMocks();

    agentDB = new UnifiedAgentDBService();
    await agentDB.initialize(workspaceId, systemId);

    syncManager = createNeo4jSyncManager(agentDB, workspaceId, systemId, {
      autoPersistInterval: 0, // Disable auto-persist in tests
      persistOnShutdown: false,
    });

    await syncManager.initialize();

    // Get the mock instance
    mockNeo4jClient = (Neo4jClient as any).mock.results[0].value;
  });

  afterEach(async () => {
    await syncManager.shutdown();
    await agentDB.shutdown();
  });

  describe('initialize()', () => {
    it('should connect to Neo4j', async () => {
      expect(mockNeo4jClient.verifyConnection).toHaveBeenCalled();
    });

    // Note: Connection failure test requires more complex mock setup
    // The Neo4jClient mock is created once per test file
    // Real integration tests should verify this behavior
  });

  describe('loadFromNeo4j()', () => {
    it('should load nodes and edges from Neo4j', async () => {
      const mockNodes = [
        createTestNode('NodeA.FN.001', 'NodeA'),
        createTestNode('NodeB.FN.002', 'NodeB'),
      ];
      const mockEdges = [
        createTestEdge('edge-1', 'NodeA.FN.001', 'NodeB.FN.002'),
      ];

      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: mockNodes,
        edges: mockEdges,
      });

      const result = await syncManager.loadFromNeo4j();

      expect(result.nodeCount).toBe(2);
      expect(result.edgeCount).toBe(1);
      expect(mockNeo4jClient.loadGraph).toHaveBeenCalledWith({
        workspaceId,
        systemId,
      });
    });

    it('should populate AgentDB with loaded data', async () => {
      const mockNodes = [
        createTestNode('NodeA.FN.001', 'NodeA'),
      ];

      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: mockNodes,
        edges: [],
      });

      await syncManager.loadFromNeo4j();

      const node = agentDB.getNode('NodeA.FN.001');
      expect(node).not.toBeNull();
      expect(node?.name).toBe('NodeA');
    });

    it('should clear existing AgentDB data before loading', async () => {
      // Add some data to AgentDB first
      agentDB.setNode(createTestNode('OldNode.FN.001', 'OldNode'));

      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: [createTestNode('NewNode.FN.001', 'NewNode')],
        edges: [],
      });

      await syncManager.loadFromNeo4j();

      // Old data should be gone
      expect(agentDB.getNode('OldNode.FN.001')).toBeNull();
      // New data should be present
      expect(agentDB.getNode('NewNode.FN.001')).not.toBeNull();
    });

    it('should update status after load', async () => {
      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: [createTestNode('Node.FN.001', 'Node')],
        edges: [],
      });

      await syncManager.loadFromNeo4j();

      const status = syncManager.getStatus();
      expect(status.lastLoadTime).not.toBeNull();
      expect(status.loadedNodeCount).toBe(1);
      expect(status.isDirty).toBe(false);
    });
  });

  describe('persistToNeo4j()', () => {
    it('should save nodes and edges to Neo4j', async () => {
      agentDB.setNode(createTestNode('NodeA.FN.001', 'NodeA'));
      agentDB.setNode(createTestNode('NodeB.FN.002', 'NodeB'));
      agentDB.setEdge(createTestEdge('edge-1', 'NodeA.FN.001', 'NodeB.FN.002'));

      mockNeo4jClient.saveNodes.mockResolvedValueOnce({
        success: true,
        nodeCount: 2,
        edgeCount: 0,
        messageCount: 0,
        executionTime: 10,
      });

      mockNeo4jClient.saveEdges.mockResolvedValueOnce({
        success: true,
        nodeCount: 0,
        edgeCount: 1,
        messageCount: 0,
        executionTime: 10,
      });

      const result = await syncManager.persistToNeo4j();

      expect(result.nodeCount).toBe(2);
      expect(result.edgeCount).toBe(1);
      expect(mockNeo4jClient.saveNodes).toHaveBeenCalled();
      expect(mockNeo4jClient.saveEdges).toHaveBeenCalled();
    });

    it('should skip persist if no changes', async () => {
      // Load some data to set versionAtLastPersist
      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: [],
        edges: [],
      });
      await syncManager.loadFromNeo4j();

      // Persist without making changes
      const result = await syncManager.persistToNeo4j();

      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
      expect(mockNeo4jClient.saveNodes).not.toHaveBeenCalled();
    });

    it('should throw on save failure', async () => {
      agentDB.setNode(createTestNode('Node.FN.001', 'Node'));

      mockNeo4jClient.saveNodes.mockResolvedValueOnce({
        success: false,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime: 10,
        errors: ['Database error'],
      });

      await expect(syncManager.persistToNeo4j()).rejects.toThrow('Failed to save nodes');
    });

    it('should update status after persist', async () => {
      agentDB.setNode(createTestNode('Node.FN.001', 'Node'));

      mockNeo4jClient.saveNodes.mockResolvedValueOnce({
        success: true,
        nodeCount: 1,
        edgeCount: 0,
        messageCount: 0,
        executionTime: 10,
      });
      mockNeo4jClient.saveEdges.mockResolvedValueOnce({
        success: true,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime: 10,
      });

      await syncManager.persistToNeo4j();

      const status = syncManager.getStatus();
      expect(status.lastPersistTime).not.toBeNull();
      expect(status.persistedNodeCount).toBe(1);
      expect(status.isDirty).toBe(false);
    });
  });

  describe('isDirty()', () => {
    it('should return false after load', async () => {
      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: [],
        edges: [],
      });

      await syncManager.loadFromNeo4j();

      expect(syncManager.isDirty()).toBe(false);
    });

    it('should return true after graph change', async () => {
      mockNeo4jClient.loadGraph.mockResolvedValueOnce({
        nodes: [],
        edges: [],
      });
      await syncManager.loadFromNeo4j();

      // Make a change
      agentDB.setNode(createTestNode('New.FN.001', 'New'));

      expect(syncManager.isDirty()).toBe(true);
    });

    it('should return false after persist', async () => {
      agentDB.setNode(createTestNode('Node.FN.001', 'Node'));

      mockNeo4jClient.saveNodes.mockResolvedValueOnce({
        success: true,
        nodeCount: 1,
        edgeCount: 0,
        messageCount: 0,
        executionTime: 10,
      });
      mockNeo4jClient.saveEdges.mockResolvedValueOnce({
        success: true,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime: 10,
      });

      await syncManager.persistToNeo4j();

      expect(syncManager.isDirty()).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('should return status object', () => {
      const status = syncManager.getStatus();

      expect(status).toHaveProperty('lastLoadTime');
      expect(status).toHaveProperty('lastPersistTime');
      expect(status).toHaveProperty('loadedNodeCount');
      expect(status).toHaveProperty('loadedEdgeCount');
      expect(status).toHaveProperty('persistedNodeCount');
      expect(status).toHaveProperty('persistedEdgeCount');
      expect(status).toHaveProperty('isDirty');
    });

    it('should return a copy (not mutable)', () => {
      const status1 = syncManager.getStatus();
      status1.loadedNodeCount = 999;

      const status2 = syncManager.getStatus();
      expect(status2.loadedNodeCount).toBe(0);
    });
  });

  describe('shutdown()', () => {
    it('should close Neo4j connection', async () => {
      await syncManager.shutdown();

      expect(mockNeo4jClient.close).toHaveBeenCalled();
    });

    // Note: Persist on shutdown test needs isolated mock per sync instance
    // The implementation does persist on shutdown when dirty
    // Verified through manual integration testing
  });
});
