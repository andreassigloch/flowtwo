/**
 * Stateless Graph Canvas Unit Tests (CR-032)
 *
 * Tests the stateless canvas that delegates to UnifiedAgentDBService.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatelessGraphCanvas } from '../../../src/canvas/stateless-graph-canvas.js';
import { UnifiedAgentDBService } from '../../../src/llm-engine/agentdb/unified-agentdb-service.js';
import type { Node, Edge } from '../../../src/shared/types/ontology.js';
import type { FormatEDiff } from '../../../src/shared/types/canvas.js';

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

describe('StatelessGraphCanvas', () => {
  let canvas: StatelessGraphCanvas;
  let agentDB: UnifiedAgentDBService;
  const workspaceId = 'test-workspace';
  const systemId = 'TestSystem.SY.001';
  const chatId = 'test-chat';
  const userId = 'test-user';

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
    createdBy: userId,
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
    createdBy: userId,
  });

  beforeEach(async () => {
    agentDB = new UnifiedAgentDBService();
    await agentDB.initialize(workspaceId, systemId);
    canvas = new StatelessGraphCanvas(agentDB, workspaceId, systemId, chatId, userId);
  });

  afterEach(async () => {
    await agentDB.shutdown();
  });

  describe('Read Operations', () => {
    it('should get state from AgentDB', () => {
      agentDB.setNode(createTestNode('Node1.FN.001', 'Node1'));

      const state = canvas.getState();

      expect(state.nodes.size).toBe(1);
      expect(state.currentView).toBe('hierarchy');
    });

    it('should get node from AgentDB', () => {
      agentDB.setNode(createTestNode('Node1.FN.001', 'Node1'));

      const node = canvas.getNode('Node1.FN.001');

      expect(node?.name).toBe('Node1');
    });

    it('should return undefined for non-existent node', () => {
      const node = canvas.getNode('NonExistent.FN.001');
      expect(node).toBeUndefined();
    });

    it('should get all nodes from AgentDB', () => {
      agentDB.setNode(createTestNode('Node1.FN.001', 'Node1'));
      agentDB.setNode(createTestNode('Node2.FN.002', 'Node2'));

      const nodes = canvas.getAllNodes();

      expect(nodes).toHaveLength(2);
    });

    it('should get edge from AgentDB', () => {
      agentDB.setNode(createTestNode('Source.FN.001', 'Source'));
      agentDB.setNode(createTestNode('Target.FN.002', 'Target'));
      agentDB.setEdge(createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'));

      const edge = canvas.getEdge('Source.FN.001-io-Target.FN.002');

      expect(edge?.uuid).toBe('edge-001');
    });

    it('should get all edges from AgentDB', () => {
      agentDB.setNode(createTestNode('Source.FN.001', 'Source'));
      agentDB.setNode(createTestNode('Target.FN.002', 'Target'));
      agentDB.setEdge(createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'));

      const edges = canvas.getAllEdges();

      expect(edges).toHaveLength(1);
    });

    it('should get node edges', () => {
      agentDB.setNode(createTestNode('Node1.FN.001', 'Node1'));
      agentDB.setNode(createTestNode('Node2.FN.002', 'Node2'));
      agentDB.setNode(createTestNode('Node3.FN.003', 'Node3'));
      agentDB.setEdge(createTestEdge('edge-001', 'Node1.FN.001', 'Node2.FN.002'));
      agentDB.setEdge(createTestEdge('edge-002', 'Node2.FN.002', 'Node3.FN.003'));

      const outEdges = canvas.getNodeEdges('Node1.FN.001', 'out');
      expect(outEdges).toHaveLength(1);

      const inEdges = canvas.getNodeEdges('Node2.FN.002', 'in');
      expect(inEdges).toHaveLength(1);

      const allEdges = canvas.getNodeEdges('Node2.FN.002');
      expect(allEdges).toHaveLength(2);
    });

    it('should get version from AgentDB', () => {
      agentDB.setNode(createTestNode('Node1.FN.001', 'Node1'));

      expect(canvas.getVersion()).toBe(1);

      agentDB.setNode(createTestNode('Node2.FN.002', 'Node2'));

      expect(canvas.getVersion()).toBe(2);
    });
  });

  describe('View State', () => {
    it('should manage current view locally', () => {
      expect(canvas.getCurrentView()).toBe('hierarchy');

      canvas.setCurrentView('data-flow');

      expect(canvas.getCurrentView()).toBe('data-flow');
    });

    it('should manage focus locally', () => {
      expect(canvas.getFocus()).toBeUndefined();

      canvas.setFocus('Node1.FN.001');

      expect(canvas.getFocus()).toBe('Node1.FN.001');
    });

    it('should manage zoom locally', () => {
      expect(canvas.getZoom()).toBe(1.0);

      canvas.setZoom(1.5);

      expect(canvas.getZoom()).toBe(1.5);
    });

    it('should emit events on view changes', () => {
      const viewCallback = vi.fn();
      const focusCallback = vi.fn();
      const zoomCallback = vi.fn();

      canvas.on('viewChange', viewCallback);
      canvas.on('focusChange', focusCallback);
      canvas.on('zoomChange', zoomCallback);

      canvas.setCurrentView('data-flow');
      canvas.setFocus('Node1.FN.001');
      canvas.setZoom(2.0);

      expect(viewCallback).toHaveBeenCalledWith({ view: 'data-flow' });
      expect(focusCallback).toHaveBeenCalledWith({ semanticId: 'Node1.FN.001' });
      expect(zoomCallback).toHaveBeenCalledWith({ zoom: 2.0 });
    });
  });

  describe('Write Operations via Diff', () => {
    it('should apply add_node operation', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v0',
        operations: [
          {
            type: 'add_node',
            semanticId: 'NewNode.FN.001',
            node: createTestNode('NewNode.FN.001', 'NewNode'),
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(result.affectedIds).toContain('NewNode.FN.001');
      expect(canvas.getNode('NewNode.FN.001')).toBeTruthy();
    });

    it('should apply remove_node operation', async () => {
      agentDB.setNode(createTestNode('ToRemove.FN.001', 'ToRemove'));

      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'remove_node',
            semanticId: 'ToRemove.FN.001',
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(canvas.getNode('ToRemove.FN.001')).toBeUndefined();
    });

    it('should apply update_node operation', async () => {
      agentDB.setNode(createTestNode('ToUpdate.FN.001', 'ToUpdate'));

      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'update_node',
            semanticId: 'ToUpdate.FN.001',
            updates: { descr: 'Updated description' },
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(canvas.getNode('ToUpdate.FN.001')?.descr).toBe('Updated description');
    });

    it('should apply add_edge operation', async () => {
      agentDB.setNode(createTestNode('Source.FN.001', 'Source'));
      agentDB.setNode(createTestNode('Target.FN.002', 'Target'));

      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v2',
        operations: [
          {
            type: 'add_edge',
            semanticId: 'edge-001',
            edge: createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'),
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(canvas.getAllEdges()).toHaveLength(1);
    });

    it('should apply remove_edge operation', async () => {
      agentDB.setNode(createTestNode('Source.FN.001', 'Source'));
      agentDB.setNode(createTestNode('Target.FN.002', 'Target'));
      agentDB.setEdge(createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'));

      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v3',
        operations: [
          {
            type: 'remove_edge',
            semanticId: 'edge-001',
            edge: createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'),
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(canvas.getAllEdges()).toHaveLength(0);
    });

    it('should handle duplicate node error', async () => {
      agentDB.setNode(createTestNode('Existing.FN.001', 'Existing'));

      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'Existing.FN.001',
            node: { ...createTestNode('Existing.FN.001', 'DifferentName'), uuid: 'different-uuid' },
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Duplicate node');
    });

    it('should emit diffApplied event', async () => {
      const callback = vi.fn();
      canvas.on('diffApplied', callback);

      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v0',
        operations: [
          {
            type: 'add_node',
            semanticId: 'NewNode.FN.001',
            node: createTestNode('NewNode.FN.001', 'NewNode'),
          },
        ],
      };

      await canvas.applyDiff(diff);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          diff,
          affectedIds: ['NewNode.FN.001'],
        })
      );
    });
  });

  describe('Direct Write Operations', () => {
    it('should set node directly', () => {
      canvas.setNode(createTestNode('Direct.FN.001', 'Direct'));

      expect(canvas.getNode('Direct.FN.001')).toBeTruthy();
    });

    it('should set node with upsert', () => {
      canvas.setNode(createTestNode('Upsert.FN.001', 'Original'));
      canvas.setNode(
        { ...createTestNode('Upsert.FN.001', 'Updated'), uuid: 'different-uuid' },
        { upsert: true }
      );

      expect(canvas.getNode('Upsert.FN.001')?.uuid).toBe('different-uuid');
    });

    it('should delete node directly', () => {
      canvas.setNode(createTestNode('ToDelete.FN.001', 'ToDelete'));

      const deleted = canvas.deleteNode('ToDelete.FN.001');

      expect(deleted).toBe(true);
      expect(canvas.getNode('ToDelete.FN.001')).toBeUndefined();
    });

    it('should set edge directly', () => {
      canvas.setNode(createTestNode('Source.FN.001', 'Source'));
      canvas.setNode(createTestNode('Target.FN.002', 'Target'));

      canvas.setEdge(createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'));

      expect(canvas.getAllEdges()).toHaveLength(1);
    });

    it('should delete edge directly', () => {
      canvas.setNode(createTestNode('Source.FN.001', 'Source'));
      canvas.setNode(createTestNode('Target.FN.002', 'Target'));
      canvas.setEdge(createTestEdge('edge-001', 'Source.FN.001', 'Target.FN.002'));

      const deleted = canvas.deleteEdge('edge-001');

      expect(deleted).toBe(true);
      expect(canvas.getAllEdges()).toHaveLength(0);
    });
  });

  describe('Persistence Compatibility', () => {
    it('should return success for persistToNeo4j (stub)', async () => {
      const result = await canvas.persistToNeo4j();

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should return empty dirty set', () => {
      canvas.setNode(createTestNode('Node1.FN.001', 'Node1'));

      const dirty = canvas.getDirtyIds();

      expect(dirty.size).toBe(0);
    });
  });

  describe('Bulk Operations', () => {
    it('should load from state', () => {
      const state = {
        workspaceId,
        systemId,
        nodes: new Map([
          ['Bulk1.FN.001', createTestNode('Bulk1.FN.001', 'Bulk1')],
          ['Bulk2.FN.002', createTestNode('Bulk2.FN.002', 'Bulk2')],
        ]),
        edges: new Map(),
        ports: new Map(),
        version: 5,
        lastSavedVersion: 5,
        lastModified: new Date(),
      };

      canvas.loadFromState(state);

      expect(canvas.getAllNodes()).toHaveLength(2);
      expect(canvas.getVersion()).toBe(5);
    });

    it('should clear graph', () => {
      canvas.setNode(createTestNode('ToClear.FN.001', 'ToClear'));

      canvas.clear();

      expect(canvas.getAllNodes()).toHaveLength(0);
    });
  });

  describe('Metadata', () => {
    it('should return workspace ID', () => {
      expect(canvas.getWorkspaceId()).toBe(workspaceId);
    });

    it('should return system ID', () => {
      expect(canvas.getSystemId()).toBe(systemId);
    });

    it('should return chat ID', () => {
      expect(canvas.getChatId()).toBe(chatId);
    });

    it('should return user ID', () => {
      expect(canvas.getUserId()).toBe(userId);
    });
  });

  describe('Graph Change Events', () => {
    it('should emit graphChange events from AgentDB', () => {
      const callback = vi.fn();
      canvas.on('graphChange', callback);

      canvas.setNode(createTestNode('EventNode.FN.001', 'EventNode'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_add',
          id: 'EventNode.FN.001',
        })
      );
    });
  });
});
