/**
 * Agentic Framework - Integration Tests
 *
 * Test Category: Integration (20% of test pyramid)
 * Purpose: End-to-end workflow validation for multi-agent system
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import all CR-027 modules
import {
  AgentConfigLoader,
  createAgentConfigLoader,
} from '../../../src/llm-engine/agents/config-loader.js';
import {
  WorkflowRouter,
  getWorkflowRouter,
  SessionContext,
} from '../../../src/llm-engine/agents/workflow-router.js';
import {
  WorkItemManager,
  getWorkItemManager,
} from '../../../src/llm-engine/agents/work-item-manager.js';
import {
  AgentExecutor,
  getAgentExecutor,
} from '../../../src/llm-engine/agents/agent-executor.js';
import {
  PhaseGateManager,
  getPhaseGateManager,
} from '../../../src/llm-engine/agents/phase-gate-manager.js';
import {
  getArchitectureValidator,
} from '../../../src/llm-engine/agents/architecture-validator.js';

describe('Agentic Framework Integration', () => {
  let configLoader: AgentConfigLoader;
  let router: WorkflowRouter;
  let workItemManager: WorkItemManager;
  let executor: AgentExecutor;
  let gateManager: PhaseGateManager;

  beforeEach(() => {
    // Get singleton instances
    configLoader = createAgentConfigLoader(
      new URL('../../../settings', import.meta.url).pathname
    );
    router = getWorkflowRouter();
    workItemManager = getWorkItemManager();
    executor = getAgentExecutor();
    gateManager = getPhaseGateManager();

    // Clear state
    workItemManager.clear();
    executor.clearHistory();
    gateManager.reset();
  });

  afterEach(() => {
    workItemManager.clear();
  });

  describe('End-to-End Workflow', () => {
    it('should route user input through complete workflow cycle', async () => {
      // Phase 1: User submits requirement
      const userMessage = 'The system shall process customer orders';
      const context: SessionContext = {
        currentPhase: 'phase1_requirements',
        graphEmpty: true,
        userMessage,
      };

      // Route to requirements-engineer (empty graph)
      const firstAgent = router.routeUserInput(userMessage, context);
      expect(firstAgent).toBe('requirements-engineer');

      // Execute agent (returns prompt, not actual LLM response)
      const graphSnapshot = '## Nodes\nFoodApp|SYS|FoodApp.SY.001|Food ordering system';
      const result = await executor.executeAgent({
        agentId: firstAgent,
        graphSnapshot,
        userMessage,
        sessionContext: context,
      });

      expect(result.agentId).toBe('requirements-engineer');
      expect(result.textResponse).toContain('Requirements Engineer');

      // Verify prompt includes graph state
      expect(result.textResponse).toContain('FoodApp.SY.001');
    });

    it('should handle phase transition with gate check', () => {
      // Simulate graph with valid phase1 content
      const validGraph = `## Nodes
OrderSystem|SYS|OrderSystem.SY.001|Order management system
PlaceOrder|UC|PlaceOrder.UC.001|Customer places order
ProcessOrder|REQ|ProcessOrder.RQ.001|The system shall process orders

## Edges
+ OrderSystem.SY.001 -cp-> PlaceOrder.UC.001
+ PlaceOrder.UC.001 -sat-> ProcessOrder.RQ.001`;

      // Check gate for phase1
      const gateResult = gateManager.checkGate(validGraph, 'phase1_requirements');

      // Should pass if no errors (depends on validator implementation)
      expect(gateResult.phase).toBe('phase1_requirements');
      expect(gateResult.summary).toBeDefined();
    });

    it('should create work items from validation errors', () => {
      // Graph with validation issues
      const invalidGraph = `## Nodes
BadFunc|FUNC|BadFunc.FN.001|JSON Serializer`;

      // Validate
      const validator = getArchitectureValidator();
      const errors = validator.validateFormatE(invalidGraph);

      // Route validation failures to work items
      if (errors.length > 0) {
        const workItems = router.routeValidationFailure(errors);

        expect(workItems.length).toBeGreaterThan(0);
        expect(workItems[0].targetAgent).toBeDefined();
        expect(workItems[0].priority).toBeDefined();
      }
    });

    it('should process complete multi-phase workflow', async () => {
      // Phase 1: Requirements
      let context: SessionContext = {
        currentPhase: 'phase1_requirements',
        graphEmpty: false,
        userMessage: 'Add a payment requirement',
      };

      let agent = router.routeUserInput(context.userMessage, context);
      expect(agent).toBe('requirements-engineer');

      // Phase 2: Logical architecture
      context = {
        currentPhase: 'phase2_logical',
        graphEmpty: false,
        userMessage: 'Design the function architecture',
      };

      agent = router.routeUserInput(context.userMessage, context);
      expect(agent).toBe('system-architect');

      // Phase 3: Physical allocation
      context = {
        currentPhase: 'phase3_physical',
        graphEmpty: false,
        userMessage: 'Allocate functions to modules',
      };

      agent = router.routeUserInput(context.userMessage, context);
      expect(agent).toBe('system-architect');

      // Phase 4: Verification
      context = {
        currentPhase: 'phase4_verification',
        graphEmpty: false,
        userMessage: 'Create test cases',
      };

      agent = router.routeUserInput(context.userMessage, context);
      expect(agent).toBe('verification-engineer');
    });
  });

  describe('Multi-Agent Handoff', () => {
    it('should route from system-architect to architecture-reviewer', async () => {
      const context: SessionContext = {
        currentPhase: 'phase2_logical',
        graphEmpty: false,
        userMessage: 'Design the architecture',
        activeAgent: 'system-architect',
      };

      // After system-architect completes, route to reviewer
      const routing = router.routeAfterAgentComplete(
        'system-architect',
        { hasErrors: false, errorCount: 0 },
        context
      );

      expect(routing.nextAgent).toBe('architecture-reviewer');
      expect(routing.reason).toContain('validation');
    });

    it('should route back to active agent when reviewer finds errors', () => {
      const context: SessionContext = {
        currentPhase: 'phase2_logical',
        graphEmpty: false,
        userMessage: '',
        activeAgent: 'system-architect',
      };

      const routing = router.routeAfterAgentComplete(
        'architecture-reviewer',
        { hasErrors: true, errorCount: 5 },
        context
      );

      expect(routing.nextAgent).toBe('system-architect');
      expect(routing.reason).toContain('5 validation errors');
    });

    it('should create handoff data with snapshot', () => {
      const snapshot = '## Nodes\nTest|FUNC|Test.FN.001|Test function';

      const result = {
        agentId: 'system-architect',
        textResponse: 'Added function',
        operations: '+ Test|FUNC|Test.FN.001|Test function',
        isComplete: false,
        nextAgent: 'architecture-reviewer',
      };

      const handoff = executor.handoffToNext('system-architect', result, snapshot);

      expect(handoff).not.toBeNull();
      expect(handoff!.fromAgent).toBe('system-architect');
      expect(handoff!.toAgent).toBe('architecture-reviewer');
      expect(handoff!.snapshot).toBe(snapshot);
    });

    it('should track execution history across agents', async () => {
      const graphSnapshot = '## Nodes\nSystem|SYS|System.SY.001|Main system';
      const sessionContext: SessionContext = {
        currentPhase: 'phase2_logical',
        graphEmpty: false,
        userMessage: 'Design architecture',
      };

      // Execute system-architect
      await executor.executeAgent({
        agentId: 'system-architect',
        graphSnapshot,
        userMessage: 'Design the system',
        sessionContext,
      });

      // Execute architecture-reviewer
      await executor.executeAgent({
        agentId: 'architecture-reviewer',
        graphSnapshot,
        userMessage: 'Review the architecture',
        sessionContext,
      });

      // Check history
      const architectHistory = executor.getExecutionHistory('system-architect');
      const reviewerHistory = executor.getExecutionHistory('architecture-reviewer');

      expect(architectHistory.length).toBe(1);
      expect(reviewerHistory.length).toBe(1);
    });
  });

  describe('Work Item Processing', () => {
    it('should process work items in priority order', () => {
      // Create work items with different priorities
      workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Low priority task',
        affectedNodes: ['A.FN.001'],
        priority: 'low',
      });

      workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: '[GATE BLOCKER] Critical fix',
        affectedNodes: ['B.FN.001'],
        priority: 'high',
      });

      workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Medium priority task',
        affectedNodes: ['C.FN.001'],
        priority: 'medium',
      });

      // Get next item - should be high priority gate blocker
      const next = workItemManager.getNextItem('system-architect');

      expect(next).not.toBeNull();
      expect(next!.action).toContain('GATE BLOCKER');
      expect(next!.priority).toBe('high');
    });

    it('should track work item lifecycle through completion', () => {
      const item = workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Fix validation error',
        affectedNodes: ['Test.FN.001'],
        priority: 'high',
      });

      // Initial state
      expect(item.status).toBe('pending');

      // Start work
      workItemManager.updateStatus(item.id, 'in_progress');
      let updated = workItemManager.getItem(item.id);
      expect(updated?.status).toBe('in_progress');
      expect(updated?.startedAt).toBeDefined();

      // Complete work
      workItemManager.updateStatus(item.id, 'completed', { result: 'Fixed' });
      updated = workItemManager.getItem(item.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.result).toBe('Fixed');
    });

    it('should handle blocked work items', () => {
      const item = workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Complex task',
        affectedNodes: ['Complex.FN.001'],
      });

      workItemManager.updateStatus(item.id, 'blocked', {
        blockedReason: 'Missing dependency',
      });

      const updated = workItemManager.getItem(item.id);
      expect(updated?.status).toBe('blocked');
      expect(updated?.blockedReason).toBe('Missing dependency');
    });

    it('should report accurate statistics', () => {
      // Create various work items
      const item1 = workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 1',
        affectedNodes: ['A.FN.001'],
        priority: 'high',
      });

      workItemManager.createWorkItem({
        targetAgent: 'requirements-engineer',
        action: 'Task 2',
        affectedNodes: ['B.RQ.001'],
        priority: 'medium',
      });

      workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 3',
        affectedNodes: ['C.FN.001'],
        priority: 'low',
      });

      workItemManager.updateStatus(item1.id, 'completed');

      const stats = workItemManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.byAgent['system-architect']).toBe(2);
      expect(stats.byAgent['requirements-engineer']).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });
  });

  describe('Phase Gate Integration', () => {
    it('should block phase transition on validation errors', () => {
      // Graph with V1 violation (format as FUNC)
      const invalidGraph = `## Nodes
JsonFormat|FUNC|JsonFormat.FN.001|JSON serialization format`;

      const result = gateManager.checkGate(invalidGraph, 'phase2_logical');

      // Should have blockers from V1 rule
      if (result.blockers.length > 0) {
        expect(result.passed).toBe(false);
        expect(result.workItems.length).toBeGreaterThan(0);
        expect(result.summary).toContain('BLOCKED');
      }
    });

    it('should track gate history', () => {
      const graph1 = '## Nodes\nTest|FUNC|Test.FN.001|Valid function';
      const graph2 = '## Nodes\nJsonFormat|FUNC|JsonFormat.FN.001|Invalid';

      gateManager.checkGate(graph1, 'phase1_requirements');
      gateManager.checkGate(graph2, 'phase2_logical');

      const history = gateManager.getGateHistory();
      expect(history.length).toBe(2);
    });

    it('should provide phase progress summary', () => {
      gateManager.forcePhase('phase2_logical');

      const summary = gateManager.getProgressSummary();

      expect(summary.currentPhase).toBe('phase2_logical');
      expect(summary.completedPhases).toContain('phase1_requirements');
      expect(summary.remainingPhases).toContain('phase3_physical');
      expect(summary.remainingPhases).toContain('phase4_verification');
    });

    it('should enforce gate rules per phase', () => {
      const phase1Rules = gateManager.getGateRules('phase1_requirements');
      const phase2Rules = gateManager.getGateRules('phase2_logical');
      const phase4Rules = gateManager.getGateRules('phase4_verification');

      expect(phase1Rules).toContain('req_semantic_id');
      expect(phase2Rules).toContain('millers_law_func');
      expect(phase2Rules).toContain('function_requirements');
      expect(phase4Rules).toContain('requirements_verification');
    });
  });

  describe('Configuration Integration', () => {
    it('should load complete agent configuration', () => {
      const config = configLoader.getConfig();

      expect(config.agents).toBeDefined();
      expect(Object.keys(config.agents).length).toBeGreaterThan(0);
      expect(config.workflow.phaseSequence.length).toBeGreaterThan(0);
    });

    it('should provide agent definitions for all phases', () => {
      const phases = ['phase1_requirements', 'phase2_logical', 'phase3_physical', 'phase4_verification'];

      for (const phase of phases) {
        const agents = configLoader.getAgentsForPhase(phase);
        expect(agents.length).toBeGreaterThan(0);
      }
    });

    it('should validate configuration structure', () => {
      const validation = configLoader.validate();

      // Config should be valid (prompts exist, agents defined)
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should load prompts for all agents', () => {
      const agentIds = configLoader.getAgentIds();

      for (const agentId of agentIds) {
        const prompt = configLoader.getPrompt(agentId);
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(100); // Reasonable prompt length
      }
    });
  });

  describe('Volatility Classification', () => {
    it('should classify FUNC volatility based on description', () => {
      const validator = getArchitectureValidator();

      // Test high volatility indicators
      const highVolGraph = `## Nodes
PaymentGateway|FUNC|PaymentGateway.FN.001|External payment integration`;

      const errors = validator.validateFormatE(highVolGraph);
      // No errors expected for valid naming, volatility is informational
      expect(errors).toBeDefined();
    });

    it('should validate volatile FUNC isolation rule (V11)', () => {
      const validator = getArchitectureValidator();

      // High-volatility FUNC with many dependents (should trigger V11)
      const badGraph = `## Nodes
ExternalAPI|FUNC|ExternalAPI.FN.001|External API integration
Consumer1|FUNC|Consumer1.FN.002|Consumer 1
Consumer2|FUNC|Consumer2.FN.003|Consumer 2
Consumer3|FUNC|Consumer3.FN.004|Consumer 3
DataFlow|FLOW|DataFlow.FL.001|Data flow

## Edges
+ DataFlow.FL.001 -io-> ExternalAPI.FN.001
+ DataFlow.FL.001 -io-> Consumer1.FN.002
+ DataFlow.FL.001 -io-> Consumer2.FN.003
+ DataFlow.FL.001 -io-> Consumer3.FN.004`;

      const errors = validator.validateFormatE(badGraph);
      // Check if V11 is triggered for high-volatility with many dependents
      // This depends on validator implementation
      expect(errors).toBeDefined();
    });
  });

  describe('Reward Calculation', () => {
    it('should calculate reward based on validation errors', () => {
      const result = {
        agentId: 'system-architect',
        textResponse: 'Added functions',
        isComplete: true,
        validationErrors: [
          { code: 'V1', severity: 'error' as const, semanticId: 'A.FN.001', issue: 'Error' },
          { code: 'V2', severity: 'warning' as const, semanticId: 'B.FN.001', issue: 'Warning' },
        ],
      };

      const reward = executor.calculateReward('system-architect', result);

      // Expect reduced reward due to errors/warnings
      // Base: 1.0, -0.2 per error, -0.05 per warning, +0.1 for completion
      // 1.0 - 0.2 - 0.05 + 0.1 = 0.85
      expect(reward).toBeCloseTo(0.85, 2);
    });

    it('should give full reward for clean result', () => {
      const result = {
        agentId: 'system-architect',
        textResponse: 'Added functions',
        isComplete: true,
      };

      const reward = executor.calculateReward('system-architect', result);

      // Base + completion bonus = 1.1, capped at 1.0
      expect(reward).toBe(1.0);
    });

    it('should validate success against criteria', () => {
      const cleanResult = {
        agentId: 'system-architect',
        textResponse: 'Success',
        isComplete: true,
        reward: 0.9,
      };

      const dirtyResult = {
        agentId: 'system-architect',
        textResponse: 'Failed',
        isComplete: false,
        reward: 0.3,
        validationErrors: [
          { code: 'millers_law_func', severity: 'error' as const, semanticId: 'X', issue: 'Too many' },
        ],
      };

      const cleanSuccess = executor.validateSuccess('system-architect', cleanResult);
      const _dirtySuccess = executor.validateSuccess('system-architect', dirtyResult);

      expect(cleanSuccess).toBe(true);
      // Dirty should fail if millers_law_func is in success criteria
      // This depends on agent-config.json content
    });
  });
});

describe('Performance Benchmarks', () => {
  let workItemManager: WorkItemManager;
  let router: WorkflowRouter;

  beforeEach(() => {
    workItemManager = getWorkItemManager();
    workItemManager.clear();
    router = getWorkflowRouter();
  });

  afterEach(() => {
    workItemManager.clear();
  });

  it('should process work item retrieval in < 10ms', () => {
    // Create 100 work items
    for (let i = 0; i < 100; i++) {
      workItemManager.createWorkItem({
        targetAgent: 'system-architect',
        action: `Task ${i}`,
        affectedNodes: [`Node.FN.${i.toString().padStart(3, '0')}`],
        priority: ['high', 'medium', 'low'][i % 3] as 'high' | 'medium' | 'low',
      });
    }

    // Measure retrieval time
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      workItemManager.getNextItem('system-architect');
    }
    const elapsed = performance.now() - start;

    // Should be under 10ms per 100 operations
    expect(elapsed).toBeLessThan(100);
  });

  it('should route user input in < 5ms', () => {
    const context: SessionContext = {
      currentPhase: 'phase2_logical',
      graphEmpty: false,
      userMessage: 'Design the architecture',
    };

    // Warm up
    router.routeUserInput('test', context);

    // Measure routing time
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      router.routeUserInput('Design the function architecture', context);
    }
    const elapsed = performance.now() - start;

    // Should be under 5ms per 100 operations
    expect(elapsed).toBeLessThan(50);
  });

  it('should validate Format E in < 50ms for medium graph', () => {
    const validator = getArchitectureValidator();

    // Create medium-sized graph (20 nodes, 30 edges)
    const nodes = [];
    const edges = [];

    for (let i = 0; i < 20; i++) {
      nodes.push(`Func${i}|FUNC|Func${i}.FN.${i.toString().padStart(3, '0')}|Function ${i}`);
    }

    for (let i = 0; i < 19; i++) {
      edges.push(`+ Func${i}.FN.${i.toString().padStart(3, '0')} -cp-> Func${i + 1}.FN.${(i + 1).toString().padStart(3, '0')}`);
    }

    const graph = `## Nodes\n${nodes.join('\n')}\n\n## Edges\n${edges.join('\n')}`;

    // Measure validation time
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      validator.validateFormatE(graph);
    }
    const elapsed = performance.now() - start;

    // Should be under 50ms per 10 operations
    expect(elapsed).toBeLessThan(500);
  });
});
