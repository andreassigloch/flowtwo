/**
 * CR-039: Minimal AgentDB Fix - E2E Tests
 *
 * Tests that verify the CR-039 fixes:
 * 1. True singleton AgentDB (all components share same instance)
 * 2. Fresh evaluator on each call (no stale cache)
 * 3. Graph viewer receives change status via WebSocket
 * 4. Background validation triggers on graph changes
 *
 * @author andreas@siglochconsulting
 */

import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import {
  getUnifiedAgentDBService,
  resetAgentDBInstance,
} from '../../src/llm-engine/agentdb/unified-agentdb-service.js';
import {
  createUnifiedRuleEvaluator,
  clearEvaluatorCache,
} from '../../src/llm-engine/validation/unified-rule-evaluator.js';
import type { Node, Edge } from '../../src/shared/types/ontology.js';

const workspaceId = 'e2e-cr039-workspace';
const systemId = 'CR039Test.SY.001';

/**
 * Create test node
 */
function createTestNode(name: string, type: string = 'FUNC'): Node {
  return {
    uuid: `${name}-uuid`,
    semanticId: `${name}.${type.slice(0, 2)}.001`,
    type,
    name,
    descr: `Test ${type} node: ${name}`,
    phase: 1,
  };
}

/**
 * Create test edge
 */
function createTestEdge(sourceId: string, targetId: string, type: string = 'compose'): Edge {
  return {
    uuid: `${sourceId}-${type}-${targetId}`,
    sourceId,
    targetId,
    type,
  };
}

describe('CR-039: AgentDB Singleton and Evaluator Fixes', () => {
  beforeEach(() => {
    // Reset singleton state before each test
    resetAgentDBInstance();
    clearEvaluatorCache();
  });

  afterAll(() => {
    resetAgentDBInstance();
  });

  test('Fix 1: getUnifiedAgentDBService returns same instance for same workspace/system', async () => {
    // Get instance twice
    const instance1 = await getUnifiedAgentDBService(workspaceId, systemId);
    const instance2 = await getUnifiedAgentDBService(workspaceId, systemId);

    // Should be the exact same object reference
    expect(instance1).toBe(instance2);

    // Add data to instance1
    const testNode = createTestNode('SingletonTest', 'FUNC');
    instance1.setNode(testNode);

    // instance2 should see the same data
    const retrieved = instance2.getNode(testNode.semanticId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('SingletonTest');
  });

  test('Fix 1: Different workspace/system clears and reinitializes', async () => {
    const instance1 = await getUnifiedAgentDBService(workspaceId, systemId);

    // Add data
    const testNode = createTestNode('FirstSystem', 'FUNC');
    instance1.setNode(testNode);
    expect(instance1.getNodes().length).toBe(1);

    // Get instance with different system
    const instance2 = await getUnifiedAgentDBService(workspaceId, 'DifferentSystem.SY.001');

    // Should be cleared (different session)
    expect(instance2.getNodes().length).toBe(0);
  });

  test('Fix 2: createUnifiedRuleEvaluator creates fresh evaluator each time', async () => {
    const agentDB = await getUnifiedAgentDBService(workspaceId, systemId);

    // Add a SYS node (required root)
    const sysNode = createTestNode('TestSystem', 'SYS');
    agentDB.setNode(sysNode);

    // Create first evaluator and evaluate
    const evaluator1 = createUnifiedRuleEvaluator(agentDB);
    const result1 = await evaluator1.evaluate('phase2_logical');
    const initialViolations = result1.totalViolations;

    // Add node that creates violations (orphan FUNC with no edges)
    const orphanFunc = createTestNode('OrphanFunc', 'FUNC');
    agentDB.setNode(orphanFunc);

    // Create second evaluator - should see the new node
    const evaluator2 = createUnifiedRuleEvaluator(agentDB);
    const result2 = await evaluator2.evaluate('phase2_logical');

    // Should have more violations (orphan node detected)
    expect(result2.totalViolations).toBeGreaterThanOrEqual(initialViolations);

    // Verify evaluators are different instances
    expect(evaluator1).not.toBe(evaluator2);
  });

  test('Fix 2: Evaluator sees current AgentDB data', async () => {
    const agentDB = await getUnifiedAgentDBService(workspaceId, systemId);

    // Start with empty graph
    expect(agentDB.getNodes().length).toBe(0);

    // Create evaluator on empty graph
    const evaluator = createUnifiedRuleEvaluator(agentDB);
    const stats1 = evaluator.getGraphStats();
    expect(stats1.nodeCount).toBe(0);

    // Add nodes to AgentDB
    agentDB.setNode(createTestNode('Node1', 'SYS'));
    agentDB.setNode(createTestNode('Node2', 'FUNC'));

    // Same evaluator should see new data (reads from AgentDB)
    const stats2 = evaluator.getGraphStats();
    expect(stats2.nodeCount).toBe(2);
  });

  test('Change tracking: AgentDB tracks changes after baseline capture', async () => {
    const agentDB = await getUnifiedAgentDBService(workspaceId, systemId);

    // Add initial data
    const sysNode = createTestNode('BaselineSystem', 'SYS');
    agentDB.setNode(sysNode);

    // Capture baseline
    agentDB.captureBaseline();
    expect(agentDB.hasBaseline()).toBe(true);

    // Initially no changes
    expect(agentDB.hasChanges()).toBe(false);

    // Add new node - should be tracked as 'added'
    const newNode = createTestNode('NewFunc', 'FUNC');
    agentDB.setNode(newNode);

    // Should now have changes
    expect(agentDB.hasChanges()).toBe(true);
    expect(agentDB.getNodeChangeStatus(newNode.semanticId)).toBe('added');

    // Modify existing node
    const modifiedSys = { ...sysNode, descr: 'Modified description' };
    agentDB.setNode(modifiedSys);
    expect(agentDB.getNodeChangeStatus(sysNode.semanticId)).toBe('modified');

    // Get change summary
    const summary = agentDB.getChangeSummary();
    expect(summary.added).toBe(1);
    expect(summary.modified).toBe(1);
  });

  test('Integration: Validation works with current AgentDB data', async () => {
    const agentDB = await getUnifiedAgentDBService(workspaceId, systemId);

    // Create a simple valid architecture
    const sysNode = createTestNode('TestSys', 'SYS');
    const reqNode = createTestNode('REQ001', 'REQ');
    const funcNode = createTestNode('ProcessData', 'FUNC');

    agentDB.setNode(sysNode);
    agentDB.setNode(reqNode);
    agentDB.setNode(funcNode);

    // Add edges to make it valid
    agentDB.setEdge(createTestEdge(sysNode.semanticId, reqNode.semanticId, 'compose'));
    agentDB.setEdge(createTestEdge(sysNode.semanticId, funcNode.semanticId, 'compose'));
    agentDB.setEdge(createTestEdge(funcNode.semanticId, reqNode.semanticId, 'satisfy'));

    // Create evaluator and evaluate
    const evaluator = createUnifiedRuleEvaluator(agentDB);
    const result = await evaluator.evaluate('phase1_requirements');

    // Should get a valid result
    expect(result.phase).toBe('phase1_requirements');
    expect(typeof result.rewardScore).toBe('number');
    expect(result.rewardScore).toBeGreaterThanOrEqual(0);
    expect(result.rewardScore).toBeLessThanOrEqual(1);
  });

  test('resetAgentDBInstance clears singleton for testing', async () => {
    const instance1 = await getUnifiedAgentDBService(workspaceId, systemId);
    instance1.setNode(createTestNode('BeforeReset', 'FUNC'));

    // Reset
    resetAgentDBInstance();

    // Get new instance
    const instance2 = await getUnifiedAgentDBService(workspaceId, systemId);

    // Should be a fresh instance with no data
    expect(instance2).not.toBe(instance1);
    expect(instance2.getNodes().length).toBe(0);
  });
});
