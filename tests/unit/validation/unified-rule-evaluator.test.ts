/**
 * Unified Rule Evaluator Unit Tests (CR-032)
 *
 * Tests validation against AgentDB data using actual rule IDs
 * from ontology-rules.json
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnifiedRuleEvaluator } from '../../../src/llm-engine/validation/unified-rule-evaluator.js';
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

describe('UnifiedRuleEvaluator', () => {
  let agentDB: UnifiedAgentDBService;
  let evaluator: UnifiedRuleEvaluator;
  const workspaceId = 'test-workspace';
  const systemId = 'TestSystem.SY.001';

  const createTestNode = (
    semanticId: string,
    name: string,
    type: string = 'FUNC',
    descr: string = 'Test description'
  ): Node => ({
    uuid: semanticId,
    semanticId,
    type: type as Node['type'],
    name,
    descr,
    workspaceId,
    systemId,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  });

  const createTestEdge = (
    uuid: string,
    sourceId: string,
    targetId: string,
    type: string = 'io'
  ): Edge => ({
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

  beforeEach(async () => {
    agentDB = new UnifiedAgentDBService();
    await agentDB.initialize(workspaceId, systemId);
    evaluator = new UnifiedRuleEvaluator(agentDB);
  });

  afterEach(async () => {
    await agentDB.shutdown();
  });

  describe('evaluate()', () => {
    it('should return validation result structure', async () => {
      agentDB.setNode(createTestNode('ValidNode.FN.001', 'ValidNode'));

      const result = await evaluator.evaluate('draft');

      expect(result).toHaveProperty('phase', 'draft');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('hardRulesPassed');
      expect(result).toHaveProperty('totalViolations');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('rewardScore');
      expect(result).toHaveProperty('phaseGateReady');
    });

    it('should detect nodes without required properties', async () => {
      // Node with empty name/descr violates required_properties rule
      const node = createTestNode('NoName.FN.001', '', 'FUNC', '');
      agentDB.setNode(node);

      const result = await evaluator.evaluate('draft');

      // Should find required_properties violation (hard rule from ontology-rules.json)
      const violation = result.violations.find(v =>
        v.ruleId === 'required_properties' && v.semanticId === 'NoName.FN.001'
      );
      expect(violation).toBeDefined();
      expect(violation?.isHard).toBe(true);
    });

    it('should not flag SYS nodes as orphans in isolation check', async () => {
      // SYS nodes can be standalone - only phase4 has isolation rule
      agentDB.setNode(createTestNode('System.SY.001', 'System', 'SYS'));

      const result = await evaluator.evaluate('draft');

      // Should not have isolation violation for SYS node
      const orphanViolation = result.violations.find(v =>
        v.semanticId === 'System.SY.001' && v.ruleId === 'isolation'
      );
      expect(orphanViolation).toBeUndefined();
    });

    it('should detect self-referencing edges (no_self_loops)', async () => {
      agentDB.setNode(createTestNode('SelfRef.FN.001', 'SelfRef'));
      agentDB.setEdge(createTestEdge('edge-self', 'SelfRef.FN.001', 'SelfRef.FN.001'));

      const result = await evaluator.evaluate('draft');

      const selfLoopViolation = result.violations.find(v =>
        v.ruleId === 'no_self_loops'
      );
      expect(selfLoopViolation).toBeDefined();
    });

    it('should pass for valid graph with connections', async () => {
      // Create a valid graph with distinct functions
      agentDB.setNode(createTestNode('System.SY.001', 'System', 'SYS', 'Main system container'));
      agentDB.setNode(createTestNode('ValidateOrder.FN.001', 'ValidateOrder', 'FUNC', 'Validates incoming orders for correctness'));
      agentDB.setNode(createTestNode('ProcessPayment.FN.002', 'ProcessPayment', 'FUNC', 'Processes payment transactions via gateway'));
      agentDB.setEdge(createTestEdge('edge-1', 'System.SY.001', 'ValidateOrder.FN.001', 'compose'));
      agentDB.setEdge(createTestEdge('edge-2', 'ValidateOrder.FN.001', 'ProcessPayment.FN.002', 'io'));

      const result = await evaluator.evaluate('draft');

      // Should have no hard rule failures for well-formed graph
      expect(result.hardRulesPassed).toBe(true);
      expect(result.rewardScore).toBeGreaterThan(0);
    });
  });

  describe('reward score', () => {
    it('should return 0 for hard rule failures', async () => {
      // Create node with empty required properties (hard rule violation)
      const node = createTestNode('NoName.FN.001', '', 'FUNC', '');
      agentDB.setNode(node);

      const result = await evaluator.evaluate('draft');

      // Hard rule failure means score = 0
      expect(result.rewardScore).toBe(0);
    });

    it('should return high score for clean graph', async () => {
      // Create clean graph
      agentDB.setNode(createTestNode('System.SY.001', 'System', 'SYS'));
      agentDB.setNode(createTestNode('Clean.FN.001', 'Clean', 'FUNC'));
      agentDB.setEdge(createTestEdge('edge-1', 'System.SY.001', 'Clean.FN.001', 'compose'));

      const result = await evaluator.evaluate('draft');

      expect(result.rewardScore).toBeGreaterThan(0.5);
    });
  });

  describe('checkPhaseGate()', () => {
    it('should return ready status for good graph', async () => {
      agentDB.setNode(createTestNode('System.SY.001', 'System', 'SYS'));
      agentDB.setNode(createTestNode('Good.FN.001', 'Good', 'FUNC'));
      agentDB.setEdge(createTestEdge('edge-1', 'System.SY.001', 'Good.FN.001', 'compose'));

      const status = await evaluator.checkPhaseGate('draft');

      expect(status).toHaveProperty('ready');
      expect(status).toHaveProperty('blockers');
      expect(status).toHaveProperty('score');
    });

    it('should list blockers for failing graph', async () => {
      // Create node with missing required properties (hard rule violation)
      const node = createTestNode('Bad.FN.001', '', 'FUNC', '');
      agentDB.setNode(node);

      const status = await evaluator.checkPhaseGate('draft');

      // Should have blockers for hard rule failure
      expect(status.blockers.length).toBeGreaterThan(0);
      expect(status.ready).toBe(false);
    });
  });

  describe('getGraphStats()', () => {
    it('should return graph statistics', () => {
      agentDB.setNode(createTestNode('Node1.FN.001', 'Node1'));
      agentDB.setNode(createTestNode('Node2.FN.002', 'Node2'));
      agentDB.setEdge(createTestEdge('edge-1', 'Node1.FN.001', 'Node2.FN.002'));

      const stats = evaluator.getGraphStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.version).toBe(3);
    });
  });

  describe('data consistency with AgentDB', () => {
    it('should see same data as AgentDB', async () => {
      agentDB.setNode(createTestNode('Shared.FN.001', 'Shared'));

      expect(evaluator.getGraphStats().nodeCount).toBe(1);
    });

    it('should see updates to AgentDB', async () => {
      agentDB.setNode(createTestNode('Update.FN.001', 'Update'));

      let stats = evaluator.getGraphStats();
      expect(stats.nodeCount).toBe(1);

      agentDB.setNode(createTestNode('Update.FN.002', 'Update2'));

      stats = evaluator.getGraphStats();
      expect(stats.nodeCount).toBe(2);
    });

    it('should not see deleted data', async () => {
      agentDB.setNode(createTestNode('ToDelete.FN.001', 'ToDelete'));
      agentDB.deleteNode('ToDelete.FN.001');

      const stats = evaluator.getGraphStats();
      expect(stats.nodeCount).toBe(0);
    });
  });
});
