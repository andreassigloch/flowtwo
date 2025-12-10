/**
 * E2E Tests for /analyze and /optimize Commands (CR-038)
 *
 * Tests that validation commands work correctly with loaded graph data.
 * Uses eval/testdata/ sample files to verify:
 * - /analyze detects violations in loaded graphs
 * - /optimize works with current data
 * - Data persists after system ID auto-detection
 *
 * @author andreas@siglochconsulting
 */

import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getUnifiedAgentDBService, resetAgentDBInstance, shutdownAllServices } from '../../src/llm-engine/agentdb/unified-agentdb-service.js';
import { createUnifiedRuleEvaluator } from '../../src/llm-engine/validation/index.js';
import { importSystem } from '../../src/shared/parsers/import-export.js';
import { StatelessGraphCanvas } from '../../src/canvas/stateless-graph-canvas.js';
import type { UnifiedAgentDBService } from '../../src/llm-engine/agentdb/unified-agentdb-service.js';
import type { PhaseId } from '../../src/llm-engine/validation/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to test data files
const TESTDATA_DIR = path.resolve(__dirname, '../../eval/testdata');
const TEST_FILES = {
  cleanSystem: path.join(TESTDATA_DIR, 'clean-system.txt'),
  combinedViolations: path.join(TESTDATA_DIR, 'combined-violations.txt'),
  orphanNodes: path.join(TESTDATA_DIR, 'orphan-nodes.txt'),
  missingTraceability: path.join(TESTDATA_DIR, 'missing-traceability.txt'),
};

// Test workspace/system IDs
const TEST_WORKSPACE = 'e2e-validation-workspace';

describe('Validation Commands E2E (CR-038)', () => {
  let agentDB: UnifiedAgentDBService;

  beforeEach(async () => {
    // Reset singleton between tests to ensure clean state
    resetAgentDBInstance();
  });

  afterEach(async () => {
    // Clean shutdown after each test
    await shutdownAllServices();
  });

  describe('/analyze command - Clean System', () => {
    test('reports no violations for clean architecture (score ~95-100%)', async () => {
      // Load clean system
      const graphState = await importSystem(TEST_FILES.cleanSystem);
      // Don't assert exact counts - just verify we got data
      expect(graphState.nodes.size).toBeGreaterThan(10);
      expect(graphState.edges.size).toBeGreaterThan(10);

      // Initialize AgentDB with correct systemId
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // Verify data loaded
      const stats = agentDB.getGraphStats();
      expect(stats.nodeCount).toBe(graphState.nodes.size);
      expect(stats.edgeCount).toBe(graphState.edges.size);

      // Run validation (what /analyze does)
      const evaluator = createUnifiedRuleEvaluator(agentDB);
      const result = await evaluator.evaluate('phase2_logical' as PhaseId);

      // Clean system should have minimal or no violations
      expect(result.totalViolations).toBeLessThanOrEqual(3);
      expect(result.rewardScore).toBeGreaterThan(0.85); // >= 85%
      expect(result.phaseGateReady).toBe(true);
    });
  });

  describe('/analyze command - Combined Violations', () => {
    test('detects multiple architecture violations (score ~40%)', async () => {
      // Load system with multiple violations
      const graphState = await importSystem(TEST_FILES.combinedViolations);
      expect(graphState.nodes.size).toBeGreaterThan(15);
      expect(graphState.edges.size).toBeGreaterThan(10);

      // Initialize AgentDB
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // Run validation
      const evaluator = createUnifiedRuleEvaluator(agentDB);
      const result = await evaluator.evaluate('phase2_logical' as PhaseId);

      // Should detect violations
      expect(result.totalViolations).toBeGreaterThan(0);
      expect(result.rewardScore).toBeLessThan(0.85); // < 85% (expected ~40%)

      // Check specific violation types detected
      const violationTypes = new Set(result.violations.map(v => v.ruleId));
      // Should find orphan REQ or missing satisfy edges
      expect(violationTypes.size).toBeGreaterThan(0);
    });
  });

  describe('/analyze command - Orphan Nodes', () => {
    test('detects orphan nodes (score ~50%)', async () => {
      // Load orphan nodes system
      const graphState = await importSystem(TEST_FILES.orphanNodes);
      expect(graphState.nodes.size).toBeGreaterThanOrEqual(10);
      expect(graphState.edges.size).toBeGreaterThanOrEqual(5);

      // Initialize AgentDB
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // Run validation
      const evaluator = createUnifiedRuleEvaluator(agentDB);
      const result = await evaluator.evaluate('phase2_logical' as PhaseId);

      // Should detect orphan violations
      expect(result.totalViolations).toBeGreaterThan(0);
      expect(result.rewardScore).toBeLessThan(0.75); // < 75% (expected ~50%)

      // Verify violations include orphan-related issues
      const violationNodeIds = result.violations.map(v => v.semanticId);
      // Should have flagged some orphan nodes
      expect(violationNodeIds.length).toBeGreaterThan(0);
    });
  });

  describe('/analyze command - Missing Traceability', () => {
    test('detects traceability gaps (score ~65%)', async () => {
      // Load traceability gaps system
      const graphState = await importSystem(TEST_FILES.missingTraceability);
      expect(graphState.nodes.size).toBeGreaterThanOrEqual(10);
      expect(graphState.edges.size).toBeGreaterThanOrEqual(8);

      // Initialize AgentDB
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // Run validation
      const evaluator = createUnifiedRuleEvaluator(agentDB);
      const result = await evaluator.evaluate('phase2_logical' as PhaseId);

      // Should detect traceability violations
      expect(result.totalViolations).toBeGreaterThan(0);
      expect(result.rewardScore).toBeLessThan(0.85); // < 85% (expected ~65%)
    });
  });

  describe('/optimize command - Data Visibility', () => {
    test('graphCanvas.getState() returns loaded nodes', async () => {
      // Load clean system
      const graphState = await importSystem(TEST_FILES.cleanSystem);

      // Initialize AgentDB
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // Create GraphCanvas (what /optimize uses)
      const graphCanvas = new StatelessGraphCanvas(
        agentDB,
        TEST_WORKSPACE,
        graphState.systemId,
        'test-chat',
        'test-user'
      );

      // Get state (this is what /optimize does)
      const currentState = graphCanvas.getState();

      // Verify nodes are visible via graphCanvas
      expect(currentState.nodes.size).toBe(graphState.nodes.size);
      expect(currentState.edges.size).toBe(graphState.edges.size);

      // Verify Array.from works (as used in /optimize)
      const nodesArray = Array.from(currentState.nodes.values());
      expect(nodesArray.length).toBe(graphState.nodes.size);
    });

    test('optimizer receives correct node count for multi-violation system', async () => {
      // Load system with violations
      const graphState = await importSystem(TEST_FILES.combinedViolations);

      // Initialize AgentDB
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // Create GraphCanvas
      const graphCanvas = new StatelessGraphCanvas(
        agentDB,
        TEST_WORKSPACE,
        graphState.systemId,
        'test-chat',
        'test-user'
      );

      // Get state
      const currentState = graphCanvas.getState();

      // Build arch object as /optimize does
      const arch = {
        id: graphState.systemId,
        nodes: Array.from(currentState.nodes.values()).map(n => ({
          id: n.uuid,
          type: n.type,
          label: n.name || n.uuid,
        })),
        edges: Array.from(currentState.edges.values()).map(e => ({
          id: e.uuid,
          source: e.sourceId,
          target: e.targetId,
          type: e.type,
        })),
      };

      // Verify optimizer would receive correct data
      expect(arch.nodes.length).toBe(graphState.nodes.size);
      expect(arch.edges.length).toBe(graphState.edges.size);
      expect(arch.nodes.length).toBeGreaterThan(0); // NOT "No nodes in graph"
    });
  });

  describe('CR-038 Fix: System ID Auto-Detection', () => {
    test('data persists after systemId transition from new-system', async () => {
      // Start with 'new-system' (simulating fresh session)
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, 'new-system');

      // Load data into 'new-system' AgentDB
      const graphState = await importSystem(TEST_FILES.cleanSystem);
      const expectedNodeCount = graphState.nodes.size;

      // Manually set nodes as if LLM created them
      for (const [, node] of graphState.nodes) {
        agentDB.setNode({ ...node, systemId: 'new-system' }, { upsert: true });
      }
      for (const [, edge] of graphState.edges) {
        agentDB.setEdge({ ...edge, systemId: 'new-system' }, { upsert: true });
      }

      // Verify data exists
      let stats = agentDB.getGraphStats();
      expect(stats.nodeCount).toBe(expectedNodeCount);

      // Now simulate auto-detection: get AgentDB with detected systemId
      // CR-038 Fix: This should NOT clear the data
      const detectedSystemId = 'DetectedSystem.SY.001';
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, detectedSystemId);

      // Data should still exist (CR-038 fix)
      stats = agentDB.getGraphStats();
      expect(stats.nodeCount).toBe(expectedNodeCount);
      expect(stats.edgeCount).toBe(graphState.edges.size);

      // Validation should work
      const evaluator = createUnifiedRuleEvaluator(agentDB);
      const result = await evaluator.evaluate('phase2_logical' as PhaseId);
      expect(result.rewardScore).toBeGreaterThan(0.85);
    });

    test('data is cleared for normal system switch (not from new-system)', async () => {
      // Start with a real system
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, 'SystemA.SY.001');

      // Load data
      const graphState = await importSystem(TEST_FILES.cleanSystem);
      agentDB.loadFromState(graphState);

      // Verify data exists
      let stats = agentDB.getGraphStats();
      expect(stats.nodeCount).toBeGreaterThan(0);

      // Switch to different system (normal /load scenario)
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, 'SystemB.SY.002');

      // Data should be cleared (normal system switch behavior)
      stats = agentDB.getGraphStats();
      expect(stats.nodeCount).toBe(0);
    });
  });

  describe('Integration: /analyze + /optimize consistency', () => {
    test('both commands see same data after import', async () => {
      // Load system
      const graphState = await importSystem(TEST_FILES.cleanSystem);

      // Initialize AgentDB
      agentDB = await getUnifiedAgentDBService(TEST_WORKSPACE, graphState.systemId);
      agentDB.loadFromState(graphState);

      // What /analyze uses
      const analyzeNodes = agentDB.getNodes();

      // What /optimize uses (via graphCanvas)
      const graphCanvas = new StatelessGraphCanvas(
        agentDB,
        TEST_WORKSPACE,
        graphState.systemId,
        'test-chat',
        'test-user'
      );
      const optimizeState = graphCanvas.getState();
      const optimizeNodes = Array.from(optimizeState.nodes.values());

      // Both should see same number of nodes
      expect(analyzeNodes.length).toBe(graphState.nodes.size);
      expect(optimizeNodes.length).toBe(graphState.nodes.size);

      // Both should reference same data
      expect(analyzeNodes[0].semanticId).toBe(optimizeNodes[0].semanticId);
    });
  });
});
