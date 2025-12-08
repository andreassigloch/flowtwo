/**
 * Reflexion Memory Unit Tests (CR-032 Phase 6)
 *
 * Tests episodic memory with validation integration.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReflexionMemory, createReflexionMemory, type EpisodeContext } from '../../../src/llm-engine/agentdb/reflexion-memory.js';
import { UnifiedAgentDBService } from '../../../src/llm-engine/agentdb/unified-agentdb-service.js';
import { UnifiedRuleEvaluator } from '../../../src/llm-engine/validation/unified-rule-evaluator.js';
import type { ValidationResult, RuleViolation } from '../../../src/llm-engine/validation/types.js';
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

describe('ReflexionMemory', () => {
  let agentDB: UnifiedAgentDBService;
  let evaluator: UnifiedRuleEvaluator;
  let reflexion: ReflexionMemory;
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
    reflexion = createReflexionMemory(agentDB, evaluator);
  });

  afterEach(async () => {
    await agentDB.shutdown();
  });

  describe('generateCritique()', () => {
    it('should return no violations message for clean validation', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: true,
        totalViolations: 0,
        errorCount: 0,
        warningCount: 0,
        violations: [],
        rewardScore: 1.0,
        phaseGateReady: true,
      };

      const critique = reflexion.generateCritique(validation);

      expect(critique).toBe('No violations detected.');
    });

    it('should format errors with suggestions', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: false,
        totalViolations: 1,
        errorCount: 1,
        warningCount: 0,
        violations: [
          {
            ruleId: 'required_properties',
            ruleName: 'Required Properties',
            semanticId: 'BadNode.FN.001',
            severity: 'error',
            reason: 'Missing name property',
            suggestion: 'Add a descriptive name',
            isHard: true,
          },
        ],
        rewardScore: 0,
        phaseGateReady: false,
      };

      const critique = reflexion.generateCritique(validation);

      expect(critique).toContain('Errors:');
      expect(critique).toContain('Required Properties');
      expect(critique).toContain('Missing name property');
      expect(critique).toContain('Fix: Add a descriptive name');
    });

    it('should format warnings separately from errors', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: true,
        totalViolations: 2,
        errorCount: 1,
        warningCount: 1,
        violations: [
          {
            ruleId: 'required_properties',
            ruleName: 'Required Properties',
            semanticId: 'Node1.FN.001',
            severity: 'error',
            reason: 'Missing description',
            isHard: true,
          },
          {
            ruleId: 'naming',
            ruleName: 'Naming Convention',
            semanticId: 'Node2.FN.002',
            severity: 'warning',
            reason: 'Name should be more descriptive',
            isHard: false,
          },
        ],
        rewardScore: 0.5,
        phaseGateReady: false,
      };

      const critique = reflexion.generateCritique(validation);

      expect(critique).toContain('Errors:');
      expect(critique).toContain('Warnings:');
      expect(critique).toContain('Required Properties');
      expect(critique).toContain('Naming Convention');
    });

    it('should truncate long critique with remaining count', () => {
      const violations: RuleViolation[] = [];
      for (let i = 0; i < 10; i++) {
        violations.push({
          ruleId: `rule_${i}`,
          ruleName: `Rule ${i}`,
          semanticId: `Node.FN.${String(i).padStart(3, '0')}`,
          severity: 'error',
          reason: `Error ${i}`,
          isHard: true,
        });
      }

      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: false,
        totalViolations: 10,
        errorCount: 10,
        warningCount: 0,
        violations,
        rewardScore: 0,
        phaseGateReady: false,
      };

      const critique = reflexion.generateCritique(validation);

      // Should show truncation message (maxCritiqueViolations is 5)
      expect(critique).toContain('... and 5 more');
    });
  });

  describe('storeEpisodeWithValidation()', () => {
    it('should store episode with validation score', async () => {
      // Set up a valid graph
      agentDB.setNode(createTestNode('System.SY.001', 'System', 'SYS'));
      agentDB.setNode(createTestNode('ValidFunc.FN.001', 'ValidFunc', 'FUNC'));
      agentDB.setEdge(createTestEdge('edge-1', 'System.SY.001', 'ValidFunc.FN.001', 'compose'));

      const episode = await reflexion.storeEpisodeWithValidation(
        'test-agent',
        'Create valid function',
        'CREATE(:FUNC{name:"ValidFunc"})',
        'all'
      );

      expect(episode).toHaveProperty('agentId', 'test-agent');
      expect(episode).toHaveProperty('task', 'Create valid function');
      expect(episode).toHaveProperty('validationScore');
      expect(episode).toHaveProperty('phase', 'all');
      expect(episode.reward).toBe(episode.validationScore);
    });

    it('should mark success based on threshold', async () => {
      // Set up a valid graph (high score)
      agentDB.setNode(createTestNode('System.SY.001', 'System', 'SYS', 'Main system'));
      agentDB.setNode(createTestNode('GoodFunc.FN.001', 'GoodFunc', 'FUNC', 'A well-defined function'));
      agentDB.setEdge(createTestEdge('edge-1', 'System.SY.001', 'GoodFunc.FN.001', 'compose'));

      const episode = await reflexion.storeEpisodeWithValidation(
        'test-agent',
        'Create function',
        'CREATE(:FUNC)',
        'all'
      );

      // Should be successful if score >= 0.7 (threshold)
      if (episode.validationScore >= 0.7) {
        expect(episode.success).toBe(true);
      } else {
        expect(episode.success).toBe(false);
      }
    });

    it('should include violations in episode', async () => {
      // Create node with missing properties (will cause violations)
      agentDB.setNode(createTestNode('BadNode.FN.001', '', 'FUNC', ''));

      const episode = await reflexion.storeEpisodeWithValidation(
        'test-agent',
        'Create bad node',
        'CREATE(:FUNC)',
        'all'
      );

      // Should have violations array
      expect(episode.violations).toBeDefined();
      expect(Array.isArray(episode.violations)).toBe(true);
    });
  });

  describe('loadEpisodeContext()', () => {
    it('should return empty context when no episodes', async () => {
      const context = await reflexion.loadEpisodeContext('test-agent');

      expect(context.lessonsLearned).toBe('');
      expect(context.successfulPatterns).toBe('');
      expect(context.episodeCount).toBe(0);
    });

    it('should return context structure', async () => {
      const context = await reflexion.loadEpisodeContext('test-agent', 'some task', 5);

      expect(context).toHaveProperty('lessonsLearned');
      expect(context).toHaveProperty('successfulPatterns');
      expect(context).toHaveProperty('episodeCount');
    });
  });

  describe('formatContextForPrompt()', () => {
    it('should format lessons learned', () => {
      const context: EpisodeContext = {
        lessonsLearned: 'Task: "Create node"\nIssue: Missing properties',
        successfulPatterns: '',
        episodeCount: 1,
      };

      const formatted = reflexion.formatContextForPrompt(context);

      expect(formatted).toContain('Learn from previous issues:');
      expect(formatted).toContain('Missing properties');
    });

    it('should format successful patterns', () => {
      const context: EpisodeContext = {
        lessonsLearned: '',
        successfulPatterns: 'Task: "Create function" (score: 0.95)',
        episodeCount: 1,
      };

      const formatted = reflexion.formatContextForPrompt(context);

      expect(formatted).toContain('Successful patterns:');
      expect(formatted).toContain('score: 0.95');
    });

    it('should format both lessons and patterns', () => {
      const context: EpisodeContext = {
        lessonsLearned: 'Task: "Bad task"\nIssue: Error',
        successfulPatterns: 'Task: "Good task" (score: 0.90)',
        episodeCount: 2,
      };

      const formatted = reflexion.formatContextForPrompt(context);

      expect(formatted).toContain('Learn from previous issues:');
      expect(formatted).toContain('Successful patterns:');
    });

    it('should return empty string for empty context', () => {
      const context: EpisodeContext = {
        lessonsLearned: '',
        successfulPatterns: '',
        episodeCount: 0,
      };

      const formatted = reflexion.formatContextForPrompt(context);

      expect(formatted).toBe('');
    });
  });

  describe('getAgentEffectiveness()', () => {
    it('should return zero metrics for agent with no episodes', async () => {
      const effectiveness = await reflexion.getAgentEffectiveness('unknown-agent');

      expect(effectiveness.agentId).toBe('unknown-agent');
      expect(effectiveness.totalEpisodes).toBe(0);
      expect(effectiveness.successfulEpisodes).toBe(0);
      expect(effectiveness.averageReward).toBe(0);
      expect(effectiveness.recentTrend).toBe('stable');
      expect(effectiveness.commonViolations).toHaveLength(0);
    });

    it('should return effectiveness structure', async () => {
      const effectiveness = await reflexion.getAgentEffectiveness('test-agent');

      expect(effectiveness).toHaveProperty('agentId');
      expect(effectiveness).toHaveProperty('totalEpisodes');
      expect(effectiveness).toHaveProperty('successfulEpisodes');
      expect(effectiveness).toHaveProperty('averageReward');
      expect(effectiveness).toHaveProperty('recentTrend');
      expect(effectiveness).toHaveProperty('commonViolations');
    });
  });

  describe('generateReviewQuestions()', () => {
    it('should generate questions for required_properties violation', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: false,
        totalViolations: 1,
        errorCount: 1,
        warningCount: 0,
        violations: [
          {
            ruleId: 'required_properties',
            ruleName: 'Required Properties',
            semanticId: 'BadNode.FN.001',
            severity: 'error',
            reason: 'Missing properties',
            isHard: true,
          },
        ],
        rewardScore: 0,
        phaseGateReady: false,
      };

      const questions = reflexion.generateReviewQuestions(validation);

      expect(questions).toHaveLength(1);
      expect(questions[0]).toContain('BadNode.FN.001');
      expect(questions[0]).toContain('missing required properties');
    });

    it('should generate questions for isolation violation', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: true,
        totalViolations: 1,
        errorCount: 0,
        warningCount: 1,
        violations: [
          {
            ruleId: 'isolation',
            ruleName: 'Isolation Check',
            semanticId: 'OrphanNode.FN.001',
            severity: 'warning',
            reason: 'Node has no connections',
            isHard: false,
          },
        ],
        rewardScore: 0.8,
        phaseGateReady: true,
      };

      const questions = reflexion.generateReviewQuestions(validation);

      expect(questions).toHaveLength(1);
      expect(questions[0]).toContain('OrphanNode.FN.001');
      expect(questions[0]).toContain('no connections');
    });

    it('should generate questions for function_requirements violation', () => {
      const validation: ValidationResult = {
        phase: 'phase3',
        timestamp: Date.now(),
        hardRulesPassed: true,
        totalViolations: 1,
        errorCount: 0,
        warningCount: 1,
        violations: [
          {
            ruleId: 'function_requirements',
            ruleName: 'Function Requirements',
            semanticId: 'UnmappedFunc.FN.001',
            severity: 'warning',
            reason: 'Function does not satisfy any requirement',
            isHard: false,
          },
        ],
        rewardScore: 0.7,
        phaseGateReady: true,
      };

      const questions = reflexion.generateReviewQuestions(validation);

      expect(questions).toHaveLength(1);
      expect(questions[0]).toContain('UnmappedFunc.FN.001');
      expect(questions[0]).toContain('REQ');
    });

    it('should limit to 3 questions', () => {
      const violations: RuleViolation[] = [];
      for (let i = 0; i < 5; i++) {
        violations.push({
          ruleId: 'required_properties',
          ruleName: 'Required Properties',
          semanticId: `Node.FN.${String(i).padStart(3, '0')}`,
          severity: 'error',
          reason: `Error ${i}`,
          isHard: true,
        });
      }

      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: false,
        totalViolations: 5,
        errorCount: 5,
        warningCount: 0,
        violations,
        rewardScore: 0,
        phaseGateReady: false,
      };

      const questions = reflexion.generateReviewQuestions(validation);

      expect(questions.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for no violations', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: true,
        totalViolations: 0,
        errorCount: 0,
        warningCount: 0,
        violations: [],
        rewardScore: 1.0,
        phaseGateReady: true,
      };

      const questions = reflexion.generateReviewQuestions(validation);

      expect(questions).toHaveLength(0);
    });

    it('should generate fallback question for unknown rule', () => {
      const validation: ValidationResult = {
        phase: 'all',
        timestamp: Date.now(),
        hardRulesPassed: false,
        totalViolations: 1,
        errorCount: 1,
        warningCount: 0,
        violations: [
          {
            ruleId: 'unknown_rule',
            ruleName: 'Unknown Rule',
            semanticId: 'Node.FN.001',
            severity: 'error',
            reason: 'Some issue',
            isHard: true,
          },
        ],
        rewardScore: 0,
        phaseGateReady: false,
      };

      const questions = reflexion.generateReviewQuestions(validation);

      expect(questions).toHaveLength(1);
      expect(questions[0]).toContain('Unknown Rule');
      expect(questions[0]).toContain('Node.FN.001');
    });
  });

  describe('createReflexionMemory()', () => {
    it('should create instance with dependencies', () => {
      const instance = createReflexionMemory(agentDB, evaluator);

      expect(instance).toBeInstanceOf(ReflexionMemory);
    });
  });
});
