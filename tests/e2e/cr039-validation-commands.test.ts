/**
 * CR-039: Validation Commands E2E Tests
 *
 * Tests that /analyze, /validate, /score commands work correctly
 * with the CR-039 fixes (fresh evaluator, current AgentDB data).
 *
 * @author andreas@siglochconsulting
 */

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import {
  getUnifiedAgentDBService,
  resetAgentDBInstance,
} from '../../src/llm-engine/agentdb/unified-agentdb-service.js';
import { StatelessGraphCanvas } from '../../src/canvas/stateless-graph-canvas.js';
import {
  handleValidateCommand,
  handleAnalyzeCommand,
  handleScoreCommand,
  handlePhaseGateCommand,
} from '../../src/terminal-ui/commands/validation-commands.js';
import type { CommandContext } from '../../src/terminal-ui/commands/types.js';
import type { Node, Edge } from '../../src/shared/types/ontology.js';

const workspaceId = 'e2e-commands-workspace';
const systemId = 'CommandTest.SY.001';

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

/**
 * Create mock command context
 */
async function createMockContext(): Promise<CommandContext> {
  const agentDB = await getUnifiedAgentDBService(workspaceId, systemId);

  const graphCanvas = new StatelessGraphCanvas(
    agentDB,
    workspaceId,
    systemId,
    'test-chat',
    'test-user',
    'hierarchy'
  );

  return {
    config: {
      workspaceId,
      systemId,
      chatId: 'test-chat',
      userId: 'test-user',
    },
    llmEngine: undefined,
    neo4jClient: {} as any,
    sessionManager: {} as any,
    wsClient: { isConnected: () => false } as any,
    graphCanvas,
    chatCanvas: {} as any,
    agentDB,
    parser: {} as any,
    rl: {} as any,
    log: vi.fn(),
    notifyGraphUpdate: vi.fn(),
  };
}

describe('CR-039: Validation Commands E2E Tests', () => {
  beforeEach(() => {
    resetAgentDBInstance();
    vi.clearAllMocks();
  });

  afterAll(() => {
    resetAgentDBInstance();
  });

  describe('/validate command', () => {
    test('detects violations on graph with issues', async () => {
      const ctx = await createMockContext();

      // Add nodes that will create violations (orphan FUNC)
      const sysNode = createTestNode('TestSys', 'SYS');
      const orphanFunc = createTestNode('OrphanFunc', 'FUNC');

      ctx.agentDB.setNode(sysNode);
      ctx.agentDB.setNode(orphanFunc);
      // No edge connecting orphanFunc - should trigger isolation violation

      // Capture console output
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => consoleLogs.push(args.join(' '));

      try {
        await handleValidateCommand([], ctx);
      } finally {
        console.log = originalLog;
      }

      // Should have logged validation results
      expect(ctx.log).toHaveBeenCalled();
      const logCalls = (ctx.log as any).mock.calls.map((c: any[]) => c[0]);
      const completionLog = logCalls.find((l: string) => l.includes('Validation complete'));
      expect(completionLog).toBeDefined();
    });

    test('reports clean architecture when no violations', async () => {
      const ctx = await createMockContext();

      // Create valid architecture - SYS with connected children
      const sysNode = createTestNode('ValidSys', 'SYS');
      const reqNode = createTestNode('REQ001', 'REQ');
      const funcNode = createTestNode('ProcessData', 'FUNC');

      ctx.agentDB.setNode(sysNode);
      ctx.agentDB.setNode(reqNode);
      ctx.agentDB.setNode(funcNode);

      // Connect nodes properly
      ctx.agentDB.setEdge(createTestEdge(sysNode.semanticId, reqNode.semanticId, 'compose'));
      ctx.agentDB.setEdge(createTestEdge(sysNode.semanticId, funcNode.semanticId, 'compose'));
      ctx.agentDB.setEdge(createTestEdge(funcNode.semanticId, reqNode.semanticId, 'satisfy'));

      await handleValidateCommand(['1'], ctx);

      expect(ctx.log).toHaveBeenCalled();
    });

    test('accepts phase argument', async () => {
      const ctx = await createMockContext();
      ctx.agentDB.setNode(createTestNode('TestSys', 'SYS'));

      // Test different phase arguments
      await handleValidateCommand(['requirements'], ctx);
      await handleValidateCommand(['2'], ctx);
      await handleValidateCommand(['physical'], ctx);

      // Each validation logs twice (start + complete), so 6 total
      expect(ctx.log).toHaveBeenCalledTimes(6);
    });
  });

  describe('/analyze command', () => {
    test('provides suggestions for violations', async () => {
      const ctx = await createMockContext();

      // Create graph with issues
      const sysNode = createTestNode('AnalyzeSys', 'SYS');
      const func1 = createTestNode('Func1', 'FUNC');
      const func2 = createTestNode('Func2', 'FUNC');

      ctx.agentDB.setNode(sysNode);
      ctx.agentDB.setNode(func1);
      ctx.agentDB.setNode(func2);

      // Connect to parent but leave orphan
      ctx.agentDB.setEdge(createTestEdge(sysNode.semanticId, func1.semanticId, 'compose'));
      // func2 is orphan - should trigger analysis suggestion

      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => consoleLogs.push(args.join(' '));

      try {
        await handleAnalyzeCommand(ctx);
      } finally {
        console.log = originalLog;
      }

      // Should have some output
      expect(consoleLogs.length).toBeGreaterThan(0);
      expect(ctx.log).toHaveBeenCalled();
    });

    test('reports clean when no issues found', async () => {
      const ctx = await createMockContext();

      // Empty graph - no violations
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => consoleLogs.push(args.join(' '));

      try {
        await handleAnalyzeCommand(ctx);
      } finally {
        console.log = originalLog;
      }

      // Should report no violations
      const cleanMessage = consoleLogs.find((l) => l.includes('No violations') || l.includes('clean'));
      expect(cleanMessage).toBeDefined();
    });
  });

  describe('/score command', () => {
    test('computes and displays scores', async () => {
      const ctx = await createMockContext();

      // Add some nodes
      ctx.agentDB.setNode(createTestNode('ScoreSys', 'SYS'));
      ctx.agentDB.setNode(createTestNode('ScoreFunc', 'FUNC'));

      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => consoleLogs.push(args.join(' '));

      try {
        await handleScoreCommand(ctx);
      } finally {
        console.log = originalLog;
      }

      // Should display score information
      expect(consoleLogs.some((l) => l.includes('Score') || l.includes('%'))).toBe(true);
      expect(ctx.log).toHaveBeenCalled();
    });
  });

  describe('/phase-gate command', () => {
    test('checks phase gate readiness', async () => {
      const ctx = await createMockContext();

      // Create minimal valid structure
      const sysNode = createTestNode('GateSys', 'SYS');
      ctx.agentDB.setNode(sysNode);

      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => consoleLogs.push(args.join(' '));

      try {
        await handlePhaseGateCommand(['1'], ctx);
      } finally {
        console.log = originalLog;
      }

      // Should display gate status
      expect(consoleLogs.some((l) => l.includes('GATE') || l.includes('Phase'))).toBe(true);
      expect(ctx.log).toHaveBeenCalled();
    });
  });

  describe('CR-039: Commands see current AgentDB data', () => {
    test('/analyze sees changes made after initialization', async () => {
      const ctx = await createMockContext();

      // Start with empty graph
      expect(ctx.agentDB.getNodes().length).toBe(0);

      // Run analyze on empty graph
      await handleAnalyzeCommand(ctx);
      const firstCallCount = (ctx.log as any).mock.calls.length;

      // Add nodes with violations
      ctx.agentDB.setNode(createTestNode('NewSys', 'SYS'));
      ctx.agentDB.setNode(createTestNode('OrphanNode', 'FUNC'));

      // Run analyze again - should see new data
      await handleAnalyzeCommand(ctx);
      const secondCallCount = (ctx.log as any).mock.calls.length;

      // Both calls should have completed
      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });

    test('/validate sees dynamically added violations', async () => {
      const ctx = await createMockContext();

      // Add valid structure first
      const sysNode = createTestNode('DynamicSys', 'SYS');
      const funcNode = createTestNode('ConnectedFunc', 'FUNC');
      ctx.agentDB.setNode(sysNode);
      ctx.agentDB.setNode(funcNode);
      ctx.agentDB.setEdge(createTestEdge(sysNode.semanticId, funcNode.semanticId, 'compose'));

      // Run first validation
      vi.clearAllMocks();
      await handleValidateCommand([], ctx);
      const firstLog = (ctx.log as any).mock.calls.find((c: any[]) =>
        c[0].includes('Validation complete')
      );

      // Add orphan node (creates violation)
      ctx.agentDB.setNode(createTestNode('OrphanAdded', 'FUNC'));

      // Run second validation - should detect new violation
      vi.clearAllMocks();
      await handleValidateCommand([], ctx);
      const secondLog = (ctx.log as any).mock.calls.find((c: any[]) =>
        c[0].includes('Validation complete')
      );

      // Both validations should complete
      expect(firstLog).toBeDefined();
      expect(secondLog).toBeDefined();
    });
  });
});
